/**
 * Pure AppState transitions, consumed via useReducer in App. Living outside
 * the component makes the guarded behaviors — quest double-grant protection,
 * the day-rollover health snapshot — unit-testable instead of only existing
 * inside effect closures. Reducers must stay pure: StrictMode double-invokes
 * them in dev, and sounds/toasts fire from effects that watch the results.
 */

import { grantXp, RESIST_XP_DAILY_CAP, XP_REWARDS } from '../engine/xp.ts'
import type { Stage } from '../engine/healthScore.ts'
import { LESSON_IDS } from '../content/lessons.ts'
import {
  mergeStates,
  rollQuests,
  sanitizeProfile,
  type AppState,
  type ProfileData,
  type Transaction,
} from './store.ts'

export type AppAction =
  | { type: 'LOG_TX'; tx: Transaction }
  | { type: 'COMPLETE_QUEST'; id: string }
  | { type: 'READ_LESSON'; id: string; date: string }
  | { type: 'ROLL_DAY'; today: string; healthScore: number; healthStage: Stage }
  | { type: 'HYDRATE'; incoming: AppState }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'PROFILE_SET'; profile: ProfileData }

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
  }
}
