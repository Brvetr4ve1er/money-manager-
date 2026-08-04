/**
 * Pure AppState transitions, consumed via useReducer in App. Living outside
 * the component makes the guarded behaviors — quest double-grant protection,
 * the day-rollover health snapshot — unit-testable instead of only existing
 * inside effect closures. Reducers must stay pure: StrictMode double-invokes
 * them in dev, and sounds/toasts fire from effects that watch the results.
 */

import { grantXp, RESIST_XP_DAILY_CAP, XP_REWARDS, xpStateFromTotal } from '../engine/xp.ts'
import { bossGrantId } from '../engine/boss.ts'
import { ACHIEVEMENT_IDS } from '../engine/achievements.ts'
import type { Stage } from '../engine/healthScore.ts'
import { LESSON_IDS } from '../content/lessons.ts'
import {
  canonicalDecisions,
  mergeStates,
  rollQuests,
  sanitizeDecision,
  sanitizeProfile,
  withSanitizedNote,
  type AppState,
  type CheckBackAnswer,
  type Decision,
  type DecisionOutcome,
  type ProfileData,
  type Transaction,
} from './store.ts'

export type AppAction =
  /** `decisionId` links the row to the decision that predicted it — see
   *  LOG_TX. Optional and usually absent: an ordinary log has no decision. */
  | { type: 'LOG_TX'; tx: Transaction; decisionId?: string }
  | { type: 'UNDO_TX'; id: string }
  | { type: 'COMPLETE_QUEST'; id: string }
  | { type: 'READ_LESSON'; id: string; date: string }
  | { type: 'ROLL_DAY'; today: string; healthScore: number; healthStage: Stage }
  | { type: 'BOSS_VICTORY'; weekStart: string; date: string }
  | { type: 'UNLOCK_ACHIEVEMENTS'; ids: string[]; date: string }
  | { type: 'HYDRATE'; incoming: AppState }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'PROFILE_SET'; profile: ProfileData }
  | { type: 'RUN_SIM'; decision: Decision }
  | {
      type: 'CLOSE_DECISION'
      id: string
      outcome: Exclude<DecisionOutcome, 'open'>
      date: string
    }
  | { type: 'ANSWER_CHECK_BACK'; id: string; answer: CheckBackAnswer; date: string }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOG_TX': {
      // Resist XP caps per day: the button is an unverifiable self-report
      // that also feeds the IC health component, so an uncapped grant would
      // pay the user to game the score. The entry itself always logs.
      //
      // COUNTS THE EVIDENCE, NOT THE ROWS. xpFromLog — the authoritative fold,
      // and the only one that survives a cross-tab merge — caps on resist
      // GRANTS. Counting resist ROWS here was a second implementation of one
      // rule, and the two drifted on undo: log r0 (grant), r1 (grant), r2 (no
      // grant), then UNDO r0 removes the row AND grant tx:r0, leaving 2 rows
      // but 1 paid grant. The next resist saw 2 rows and refused a grant the
      // cap still allowed. Reading state.xpLog makes the reducer and the fold
      // run the identical rule; App's "(XP capped today)" label reads it too.
      const resisted = action.tx.resistedImpulse === true
      const resistGrantsToday = resisted
        ? state.xpLog.filter(
            (g) => g.action === 'resistImpulse' && g.date === action.tx.date,
          ).length
        : 0
      const grantsXp = !resisted || resistGrantsToday < RESIST_XP_DAILY_CAP
      const xpAction = resisted ? 'resistImpulse' : 'logExpense'
      // Decision link. The row is the money event a decision predicted, so the
      // record can point at it instead of asserting it happened. Written once
      // and never overwritten: a decision already holding a txId has its money
      // event, and a later log is a different purchase.
      //
      // IT PAYS NOTHING AND CHANGES NO GRANT (§12.1): the branches above are
      // computed from the transaction alone, and this only stamps an id onto a
      // row of the record. A linked log earns exactly what the same log earns
      // unlinked.
      const decisions =
        action.decisionId !== undefined &&
        state.decisions.some((d) => d.id === action.decisionId && d.txId === undefined)
          ? state.decisions.map((d) =>
              // Rebuilt through the sanitizer, not spread in place: it is the
              // one canonical key-order builder for a decision, and mergeStates
              // compares whole states as JSON STRINGS — a row that grew its
              // fields in a different order would never string-equal the same
              // row loaded from disk, and the merge fixpoint would never settle.
              d.id === action.decisionId
                ? (sanitizeDecision({ ...d, txId: action.tx.id }) ?? d)
                : d,
            )
          : state.decisions
      return {
        ...state,
        decisions,
        // Note sanitised on the way in, for the same reason PROFILE_SET
        // re-validates a form-checked profile: the string comes from a
        // free-text field, and a note that only the sanitizer would reject
        // would render on the row now and silently vanish at next load. What
        // is on screen must be what reloads. It never affects the grant below
        // — see the XP note in LogCard.
        transactions: [withSanitizedNote(action.tx), ...state.transactions],
        xp: grantsXp ? grantXp(state.xp, xpAction).next : state.xp,
        // Every grant also lands in the append-only grant log. The tx-derived
        // id is deterministic: two tabs merging the same purchase dedupe to
        // one grant, while grants the peer never saw survive the union — a
        // bare counter would race and drop one (see mergeStates).
        xpLog: grantsXp
          ? [
              ...state.xpLog,
              {
                id: `tx:${action.tx.id}`,
                action: xpAction,
                amount: XP_REWARDS[xpAction],
                date: action.tx.date,
              },
            ]
          : state.xpLog,
      }
    }
    case 'UNDO_TX': {
      // Mis-tap grace: LogCard offers a short-lived Undo after every log. The
      // XP grant leaves WITH the transaction — its deterministic `tx:{id}`
      // grant id makes the removal exact — so log→undo cycles farm nothing,
      // and the counter is rebuilt from the reduced total so it still matches
      // the grant evidence (sanitizeState reconciles the two at every load).
      // A resist past the daily cap granted nothing, so only the row leaves.
      // Multi-tab: a peer still holding the tx re-adds it via the union merge;
      // a second undo works the same way. Quest flags and badges earned off
      // the logged state stay — neither is money data, and badges pay no XP.
      if (!state.transactions.some((t) => t.id === action.id)) return state
      const grantId = `tx:${action.id}`
      const grant = state.xpLog.find((g) => g.id === grantId)
      return {
        ...state,
        // The row is gone, so the decision's pointer to it is gone with it —
        // a record citing a transaction the ledger no longer holds is a
        // dangling claim. The OUTCOME stays: the user said what they did, and
        // undoing a mis-typed amount is not a retraction of that.
        decisions: state.decisions.some((d) => d.txId === action.id)
          ? state.decisions.map((d) => {
              if (d.txId !== action.id) return d
              const next = { ...d }
              delete next.txId
              return next
            })
          : state.decisions,
        transactions: state.transactions.filter((t) => t.id !== action.id),
        xp: grant ? xpStateFromTotal(Math.max(0, state.xp.totalXp - grant.amount)) : state.xp,
        xpLog: grant ? state.xpLog.filter((g) => g.id !== grantId) : state.xpLog,
      }
    }
    case 'COMPLETE_QUEST': {
      // Quest flag and XP grant happen in one atomic transition: a second
      // dispatch before re-render sees done === true and is a no-op, so rapid
      // double clicks can never double-grant XP.
      const quest = state.quests.find((q) => q.id === action.id)
      if (!quest || quest.done) return state
      const quests = state.quests.map((q) => (q.id === action.id ? { ...q, done: true } : q))
      return {
        ...state,
        quests,
        xp: grantXp(state.xp, quest.xpAction).next,
        // Grant id is deterministic per (quest, day): two tabs completing the
        // same quest on the same day merge to a single grant — matching the
        // done-flag union in mergeStates, which likewise pays once.
        xpLog: [
          ...state.xpLog,
          {
            id: `quest:${quest.id}:${state.questsDate}`,
            action: quest.xpAction,
            amount: XP_REWARDS[quest.xpAction],
            date: state.questsDate,
          },
        ],
      }
    }
    case 'READ_LESSON': {
      // Codex collection only — deliberately NO XP here. The daily readLesson
      // grant travels through COMPLETE_QUEST('lesson') (App dispatches both on
      // "Got it"), reusing its atomic double-grant guard and per-(quest, day)
      // grant id; a second grant here would pay twice for one tap. Ids outside
      // the canonical roster never persist (the sanitizer would drop them and
      // the codex count would lie until then). Re-reading a lesson after the
      // roster wraps keeps the ORIGINAL first-read date — lessonForDay's
      // no-repeat rule keys off it (see LessonSeen in the store).
      if (!LESSON_IDS.has(action.id)) return state
      if (state.lessonsSeen.some((e) => e.id === action.id)) return state
      const lessonsSeen = [...state.lessonsSeen, { id: action.id, date: action.date }].sort(
        (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      return { ...state, lessonsSeen }
    }
    case 'ROLL_DAY': {
      // Persist a once-per-day health snapshot so asymmetric smoothing and
      // stage hysteresis actually compound day over day. Keyed on healthDate:
      // snapshotting per render would re-apply smooth() many times within a
      // single day. Quests roll here too. Returns the same object when
      // nothing needs to change so dispatching is render-free on no-op days.
      if (state.healthDate === action.today && state.questsDate === action.today) return state
      const rolled = rollQuests(state, action.today)
      return state.healthDate === action.today
        ? rolled
        : {
            ...rolled,
            prevHealthScore: action.healthScore,
            stage: action.healthStage,
            healthDate: action.today,
          }
    }
    case 'BOSS_VICTORY': {
      // Weekly boss win (computed by the boss engine, dispatched from
      // useBossBattle). The xpLog is the once-per-week persistence: the
      // deterministic per-week grant id makes this a pure state check, so a
      // StrictMode double-dispatch, a re-fired mount effect on reload, or two
      // tabs claiming the same week (grant logs union by id in mergeStates)
      // all pay exactly once. No new state field — the evidence log carries it.
      const id = bossGrantId(action.weekStart)
      if (state.xpLog.some((g) => g.id === id)) return state
      return {
        ...state,
        xp: grantXp(state.xp, 'weeklyBoss').next,
        xpLog: [
          ...state.xpLog,
          { id, action: 'weeklyBoss', amount: XP_REWARDS.weeklyBoss, date: action.date },
        ],
      }
    }
    case 'UNLOCK_ACHIEVEMENTS': {
      // Badges pay NO XP — the toast/sparkle and the permanent shelf row are
      // the whole reward (see the achievements engine), so there is no grant
      // to guard. Already-earned ids drop out here, making a StrictMode
      // double-dispatch or a re-fired mount effect a no-op after the first;
      // ids outside the roster never persist (the sanitizer would drop them
      // and the badge would flicker back to locked at next load).
      const fresh = action.ids.filter(
        (id) => ACHIEVEMENT_IDS.has(id) && !state.achievements.some((a) => a.id === id),
      )
      if (fresh.length === 0) return state
      const achievements = [
        ...state.achievements,
        ...fresh.map((id) => ({ id, date: action.date })),
      ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      return { ...state, achievements }
    }
    case 'HYDRATE':
      // Another tab wrote the store key. Merge instead of replace: replacing
      // would drop this tab's unsaved-in-peer transactions, and ignoring the
      // write means the next save here clobbers the peer's (see mergeStates).
      return mergeStates(state, action.incoming)
    case 'TOGGLE_MUTE':
      return { ...state, muted: !state.muted }
    case 'PROFILE_SET': {
      // Re-validated even though the setup form validates first: the payload
      // originates from free-text fields, and a smuggled NaN/negative would
      // persist, fail sanitizeState at next load, and silently revert the
      // user to the demo profile. sanitizeProfile also rebuilds the object in
      // canonical key order — mergeStates compares profiles as JSON strings.
      const profile = sanitizeProfile(action.profile)
      return profile === null ? state : { ...state, profile }
    }
    case 'RUN_SIM': {
      // The simulator's output stops being a render-local string. Re-validated
      // on the way in for the same reason PROFILE_SET is: the line comes from
      // describeResult and the amount from a free-text field, and anything the
      // sanitizer would reject at next load must not render now — what is on
      // screen has to be what reloads.
      //
      // NO XP HERE (§12.1). The daily runSimulation grant travels through
      // COMPLETE_QUEST('sim') exactly as it did before this record existed, so
      // recording a decision pays nothing extra and a run pays once.
      const decision = sanitizeDecision(action.decision)
      if (decision === null) return state
      if (state.decisions.some((d) => d.id === decision.id)) return state
      return { ...state, decisions: canonicalDecisions([decision, ...state.decisions]) }
    }
    case 'CLOSE_DECISION': {
      // What happened, recorded once. Only an OPEN decision closes: a second
      // dispatch before re-render (double tap, StrictMode) sees a closed row
      // and is a no-op, and a peer tab's answer is never overwritten by a
      // stale one — the same atomic guard COMPLETE_QUEST uses.
      //
      // NO XP, NO HEALTH INPUT (§12.1). Nothing here touches xp, xpLog,
      // prevHealthScore or transactions. The resist branch's money event is an
      // ORDINARY LOG_TX dispatched beside this one, so it earns through the
      // capped path every other resist earns through and feeds Impulse Control
      // as itself, not as a decision.
      const target = state.decisions.find((d) => d.id === action.id)
      if (!target || target.outcome !== 'open') return state
      return {
        ...state,
        decisions: state.decisions.map((d) =>
          // Canonical rebuild, same reason as LOG_TX's link above.
          d.id === action.id
            ? (sanitizeDecision({ ...d, outcome: action.outcome, outcomeDate: action.date }) ?? d)
            : d,
        ),
      }
    }
    case 'ANSWER_CHECK_BACK': {
      // THE CHECK-BACK, ANSWERED ONCE. Only a BOUGHT row that has not been
      // answered accepts one: a second dispatch before re-render (double tap,
      // StrictMode) sees a filled `checkBack` and is a no-op, and a peer tab's
      // answer is never overwritten by a stale one — the same atomic guard
      // CLOSE_DECISION and COMPLETE_QUEST use.
      //
      // NO XP, NO HEALTH INPUT, NO TALLY (§12.1). Nothing here touches xp,
      // xpLog, transactions, prevHealthScore, stage or quests, and there is no
      // counter anywhere that this increments. Answering is the whole event:
      // the record files what the user said and stops (§7.1).
      //
      // AND NOTHING ELSE ON THE ROW MOVES (§12.5). The rebuild spreads the
      // EXISTING row and adds two keys, so `line`, `demo`, `amountDA`,
      // `outcome`, `outcomeDate` and `txId` come through byte-identical —
      // an answer answers the record, it does not edit it. Canonical rebuild
      // through the sanitizer for the same reason as LOG_TX's link: it is the
      // one key-order builder for a decision, and mergeStates compares whole
      // states as JSON strings.
      const target = state.decisions.find((d) => d.id === action.id)
      if (!target || target.outcome !== 'bought' || target.checkBack !== undefined) return state
      return {
        ...state,
        decisions: state.decisions.map((d) =>
          d.id === action.id
            ? (sanitizeDecision({
                ...d,
                checkBack: action.answer,
                checkBackDate: action.date,
              }) ?? d)
            : d,
        ),
      }
    }
  }
}
