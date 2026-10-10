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
  applyPending,
  requestRuleChange,
  type BrakeRule,
  type HeldPurchase,
} from '../engine/brakes.ts'
import { reentryFor } from '../engine/calm.ts'
import { composeDefaults, type NeedId } from '../engine/needs.ts'
import {
  mergeStates,
  rollQuests,
  sanitizeProfile,
  type AppState,
  type ProfileData,
  type SupportState,
  type Transaction,
} from './store.ts'

export type AppAction =
  | { type: 'LOG_TX'; tx: Transaction }
  | { type: 'UNDO_TX'; id: string }
  | { type: 'COMPLETE_QUEST'; id: string }
  | { type: 'READ_LESSON'; id: string; date: string }
  | { type: 'ROLL_DAY'; today: string; healthScore: number; healthStage: Stage }
  | { type: 'BOSS_VICTORY'; weekStart: string; date: string }
  | { type: 'UNLOCK_ACHIEVEMENTS'; ids: string[]; date: string }
  | { type: 'HYDRATE'; incoming: AppState }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'PROFILE_SET'; profile: ProfileData }
  /** Needs picker saved: composes the mode defaults (brakes, low energy, calm). */
  | { type: 'NEEDS_SET'; needs: NeedId[]; nowISO: string }
  /** Brake rule edit: tightening lands now, loosening waits behind the edit lock. */
  | { type: 'BRAKES_REQUEST'; rule: BrakeRule | null; nowISO: string }
  /** Clock tick: promotes a pending rule whose time has come. No-op otherwise. */
  | { type: 'BRAKES_TICK'; nowISO: string }
  /** A purchase the brakes caught — queued, not logged. */
  | { type: 'HOLD_TX'; held: HeldPurchase }
  /** The wait is over and the user still wants it: logs it like any purchase. */
  | { type: 'RELEASE_HELD'; id: string; date: string }
  /** The user let a held purchase go. Nothing is logged; nothing is punished. */
  | { type: 'LET_GO_HELD'; id: string }
  | { type: 'LOW_ENERGY_SET'; on: boolean; nowISO: string }
  | { type: 'CALM_SET'; on: boolean; nowISO: string }
  | { type: 'REENTRY_DISMISS' }
  | { type: 'TRUSTED_SET'; trusted: SupportState['trusted']; nowISO: string }

/** Settings edits stamp savedAt so mergeStates can keep the newest block whole. */
function withSupport(state: AppState, patch: Partial<SupportState>, nowISO?: string): AppState {
  return {
    ...state,
    support: { ...state.support, ...patch, ...(nowISO !== undefined ? { savedAt: nowISO } : {}) },
  }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOG_TX': {
      // Resist XP caps per day: the button is an unverifiable self-report
      // that also feeds the IC health component, so an uncapped grant would
      // pay the user to game the score. The entry itself always logs.
      const resisted = action.tx.resistedImpulse === true
      const resistGrantsToday = resisted
        ? state.transactions.filter(
            (t) => t.resistedImpulse && t.date === action.tx.date,
          ).length
        : 0
      const grantsXp = !resisted || resistGrantsToday < RESIST_XP_DAILY_CAP
      const xpAction = resisted ? 'resistImpulse' : 'logExpense'
      return {
        ...state,
        transactions: [action.tx, ...state.transactions],
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
      const snapped =
        state.healthDate === action.today
          ? rolled
          : {
              ...rolled,
              prevHealthScore: action.healthScore,
              stage: action.healthStage,
              healthDate: action.today,
            }
      // The day clock is also the "last opened" record: a gap of
      // REENTRY_AFTER_DAYS or more flags the guilt-free return (see calm.ts).
      // An already-shown re-entry is never overwritten by a later day roll in
      // the same visit — the user dismisses it, nothing else clears it.
      if (state.support.lastOpened === action.today) return snapped
      const reentry = state.support.reentry ?? reentryFor(state.support.lastOpened, action.today)
      return withSupport(snapped, { lastOpened: action.today, reentry })
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
    case 'NEEDS_SET': {
      // Defaults compose ON TOP of what the user already set, never beneath:
      // picking "brakes" with a rule already in place keeps the existing rule
      // (tightening-only via requestRuleChange), and un-picking it does not
      // silently remove brakes — removing is its own, edit-locked, action.
      const needs = [...new Set(action.needs)].sort()
      const d = composeDefaults(needs)
      const nowMs = Date.parse(action.nowISO)
      const brakes =
        d.brakes !== null && state.support.brakes === null
          ? requestRuleChange(null, d.brakes, nowMs)
          : { brakes: state.support.brakes, pending: state.support.pendingBrakes }
      return {
        ...withSupport(
          state,
          {
            needs,
            brakes: brakes.brakes,
            pendingBrakes: brakes.pending,
            lowEnergy: state.support.lowEnergy || d.lowEnergy,
            calm: state.support.calm || d.calm,
          },
          action.nowISO,
        ),
        // Calm means sound off; the mute merge is OR-safe like this one.
        muted: state.muted || d.calm,
      }
    }
    case 'BRAKES_REQUEST': {
      const { brakes, pending } = requestRuleChange(
        state.support.brakes,
        action.rule,
        Date.parse(action.nowISO),
      )
      return withSupport(state, { brakes, pendingBrakes: pending }, action.nowISO)
    }
    case 'BRAKES_TICK': {
      const { brakes, pending } = applyPending(
        state.support.brakes,
        state.support.pendingBrakes,
        Date.parse(action.nowISO),
      )
      if (pending === state.support.pendingBrakes) return state
      // A promoted rule is a settings change: stamp it so a peer tab that
      // ticks later (or never) adopts the promotion instead of its stale copy.
      return withSupport(state, { brakes, pendingBrakes: pending }, action.nowISO)
    }
    case 'HOLD_TX': {
      if (state.support.held.some((h) => h.id === action.held.id)) return state
      return withSupport(state, { held: [...state.support.held, action.held] })
    }
    case 'RELEASE_HELD': {
      const held = state.support.held.find((h) => h.id === action.id)
      if (!held) return state
      // Same path as any purchase: LOG_TX pays the ordinary +5 and keeps the
      // held id as the transaction id, so Undo (UNDO_TX) works unchanged.
      const tx: Transaction = {
        id: held.id,
        amountDA: held.amountDA,
        category: held.category,
        date: action.date,
        resistedImpulse: false,
        impulseFlagged: held.impulseFlagged,
      }
      const without = withSupport(state, { held: state.support.held.filter((h) => h.id !== action.id) })
      return appReducer(without, { type: 'LOG_TX', tx })
    }
    case 'LET_GO_HELD': {
      if (!state.support.held.some((h) => h.id === action.id)) return state
      return withSupport(state, { held: state.support.held.filter((h) => h.id !== action.id) })
    }
    case 'LOW_ENERGY_SET':
      if (state.support.lowEnergy === action.on) return state
      return withSupport(state, { lowEnergy: action.on }, action.nowISO)
    case 'CALM_SET':
      if (state.support.calm === action.on) return state
      return { ...withSupport(state, { calm: action.on }, action.nowISO), muted: state.muted || action.on }
    case 'REENTRY_DISMISS':
      if (state.support.reentry === null) return state
      return withSupport(state, { reentry: null })
    case 'TRUSTED_SET':
      return withSupport(state, { trusted: action.trusted }, action.nowISO)
  }
}
