/**
 * Pure AppState transitions, consumed via useReducer in App. Living outside
 * the component makes the guarded behaviors — quest double-grant protection,
 * the day-rollover health snapshot — unit-testable instead of only existing
 * inside effect closures. Reducers must stay pure: StrictMode double-invokes
 * them in dev, and sounds/toasts fire from effects that watch the results.
 */

import { grantXp } from '../engine/xp.ts'
import type { Stage } from '../engine/healthScore.ts'
import { rollQuests, type AppState, type Transaction } from './store.ts'

export type AppAction =
  | { type: 'LOG_TX'; tx: Transaction }
  | { type: 'COMPLETE_QUEST'; id: string }
  | { type: 'ROLL_DAY'; today: string; healthScore: number; healthStage: Stage }
  | { type: 'TOGGLE_MUTE' }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOG_TX': {
      const xpAction = action.tx.resistedImpulse ? 'resistImpulse' : 'logExpense'
      return {
        ...state,
        transactions: [action.tx, ...state.transactions],
        xp: grantXp(state.xp, xpAction).next,
      }
    }
    case 'COMPLETE_QUEST': {
      // Quest flag and XP grant happen in one atomic transition: a second
      // dispatch before re-render sees done === true and is a no-op, so rapid
      // double clicks can never double-grant XP.
      const quest = state.quests.find((q) => q.id === action.id)
      if (!quest || quest.done) return state
      const quests = state.quests.map((q) => (q.id === action.id ? { ...q, done: true } : q))
      return { ...state, quests, xp: grantXp(state.xp, quest.xpAction).next }
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
    case 'TOGGLE_MUTE':
      return { ...state, muted: !state.muted }
  }
}
