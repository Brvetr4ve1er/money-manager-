/**
 * Day clock + live health derivation + once-per-day rollover, extracted from
 * App so the carefully-ordered snapshot invariants live behind one module
 * boundary instead of loose effects in a growing component.
 */

import { useEffect, useMemo, useState, type Dispatch } from 'react'
import { computeHealthScore, type HealthResult } from '../engine/healthScore.ts'
import {
  deriveHealthInputs,
  finalizeHealthThrough,
  resolveProfile,
  type UserProfile,
} from '../engine/profile.ts'
import { todayISO, type AppState } from '../state/store.ts'
import type { AppAction } from '../state/reducer.ts'

export function useHealthDay(
  state: AppState,
  dispatch: Dispatch<AppAction>,
): { today: string; health: HealthResult; profile: UserProfile; isDemo: boolean } {
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

  // The real profile once setup completed, DEMO_PROFILE (with its disclosed
  // placeholder confidence) until then — one resolution feeding both the live
  // memo and the rollover, so the snapshot can never mix profiles.
  // Returned to App as well as used here. App used to call resolveProfile a
  // SECOND time in its render body for the simulator card: same inputs, same
  // answer, but a fresh object identity on every render — including the two
  // extra renders every XP grant schedules (the +XP chip timer and the toast
  // shift), which re-render the whole card stack. Handing this one down keeps
  // the "simulator and score can never speak from different profiles"
  // invariant structural rather than coincidental, and gives SimCard a stable
  // prop identity.
  const { profile, meta, isDemo } = useMemo(() => resolveProfile(state.profile), [state.profile])

  // Live health: exactly one smoothing step from the persisted snapshot
  // (yesterday's final score) toward today's raw blend.
  const health = useMemo(
    () =>
      computeHealthScore(
        deriveHealthInputs(state.transactions, profile, today, meta),
        state.prevHealthScore,
        state.stage,
      ),
    [state.transactions, profile, meta, state.prevHealthScore, state.stage, today],
  )

  // Day rollover (the once-per-day health snapshot) is a reducer action;
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
    if (state.healthDate === today) return
    const finalized =
      state.healthDate === ''
        ? health // first run: nothing to finalize
        : finalizeHealthThrough(
            state.transactions,
            profile,
            state.healthDate,
            today,
            state.prevHealthScore,
            state.stage,
            meta,
          )
    dispatch({ type: 'ROLL_DAY', today, healthScore: finalized.score, healthStage: finalized.stage })
  }, [state.healthDate, state.transactions, profile, meta, state.prevHealthScore, state.stage, health, today, dispatch])

  return { today, health, profile, isDemo }
}
