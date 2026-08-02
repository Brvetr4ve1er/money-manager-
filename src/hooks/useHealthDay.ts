/**
 * Day clock + live health derivation + once-per-day rollover, extracted from
 * App so the carefully-ordered snapshot invariants live behind one module
 * boundary instead of loose effects in a growing component.
 */

import { useEffect, useMemo, useState, type Dispatch } from 'react'
import { computeHealthScore, type HealthResult } from '../engine/healthScore.ts'
import { deriveHealthInputs, finalizeHealthThrough, DEMO_PROFILE } from '../engine/profile.ts'
import { todayISO, type AppState } from '../state/store.ts'
import type { AppAction } from '../state/reducer.ts'

export function useHealthDay(
  state: AppState,
  dispatch: Dispatch<AppAction>,
): { today: string; health: HealthResult } {
  // The current local day lives in React state so a tab kept open past
  // midnight re-renders on its own: a timer plus visibility/focus listeners
  // notice the date change, which recomputes health and fires the rollover
  // effect below — instead of waiting for the next transaction edit.
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const sync = () =>
      setToday((prev) => {
        const now = todayISO()
        return prev === now ? prev : now
      })
    const id = window.setInterval(sync, 60_000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  // Live health: exactly one smoothing step from the persisted snapshot
  // (yesterday's final score) toward today's raw blend.
  const health = useMemo(
    () =>
      computeHealthScore(
        deriveHealthInputs(state.transactions, DEMO_PROFILE, today),
        state.prevHealthScore,
        state.stage,
      ),
    [state.transactions, state.prevHealthScore, state.stage, today],
  )

  // Day rollover (quests + once-per-day health snapshot) is a reducer action;
  // the reducer returns the same state on no-op days, so this dispatch is
  // render-free until the day actually changes. The snapshot persisted is the
  // FINAL score of the day before `today`, chained one smooth() step per
  // elapsed calendar day since the stale healthDate (finalizeHealthThrough):
  // a user returning after three weeks gets the same 21-step trajectory as
  // one who opened the app daily — app-open frequency must never move the
  // score. Persisting today's live score instead would apply smooth() twice
  // against the same raw blend (once into the snapshot, once again in the
  // memo above), moving ~75%/28% of the delta per day instead of the
  // documented 50%/15% and promoting stages the persisted state never reached.
  useEffect(() => {
    if (state.healthDate === today && state.questsDate === today) return
    const finalized =
      state.healthDate === '' || state.healthDate === today
        ? health // first run (or quests-only roll): nothing to finalize
        : finalizeHealthThrough(
            state.transactions,
            DEMO_PROFILE,
            state.healthDate,
            today,
            state.prevHealthScore,
            state.stage,
          )
    dispatch({ type: 'ROLL_DAY', today, healthScore: finalized.score, healthStage: finalized.stage })
  }, [state.healthDate, state.questsDate, state.transactions, state.prevHealthScore, state.stage, health, today, dispatch])

  return { today, health }
}
