/**
 * Weekly boss derivation + victory claiming, extracted from App like
 * useHealthDay: the claim-once invariants live behind one module boundary.
 * The battle itself is pure derivation (engine/boss.ts); the only state
 * transition is the BOSS_VICTORY dispatch, whose reducer guard makes every
 * re-fire (StrictMode, reload, peer-merge re-render) a no-op after the first.
 */

import { useEffect, useMemo, type Dispatch } from 'react'
import {
  addDaysISO,
  bossBattle,
  bossGrantId,
  completedWeekVictory,
  weekStartISO,
  type BossBattle,
} from '../engine/boss.ts'
import type { AppState } from '../state/store.ts'
import type { AppAction } from '../state/reducer.ts'

export function useBossBattle(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  today: string,
): { battle: BossBattle; wonLastWeek: boolean } {
  const battle = useMemo(() => bossBattle(state.transactions, today), [state.transactions, today])
  const victory = useMemo(
    () => completedWeekVictory(state.transactions, today),
    [state.transactions, today],
  )

  // Claim a won week the first time the app opens inside the following week.
  // Deliberately keyed on the victory's week (not xpLog): once granted, the
  // xpLog change re-renders but the victory value is unchanged, so the effect
  // never re-fires — and when it does fire again (reload), the reducer's
  // grant-id check makes the duplicate dispatch a no-op. The toast + fanfare
  // react to the resulting xpLog grant in useRewards, never fire from here.
  const victoryWeek = victory?.weekStart ?? null
  useEffect(() => {
    if (victoryWeek === null) return
    dispatch({ type: 'BOSS_VICTORY', weekStart: victoryWeek, date: today })
  }, [victoryWeek, today, dispatch])

  // Persistent won-last-week marker for the card — the fanfare's visible
  // counterpart that outlives the toast, same family as .quest-alldone.
  const wonLastWeek = state.xpLog.some(
    (g) => g.id === bossGrantId(addDaysISO(weekStartISO(today), -7)),
  )

  return { battle, wonLastWeek }
}
