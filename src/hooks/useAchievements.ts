/**
 * Achievement unlocking, extracted from App like useBossBattle: the badge
 * check is pure derivation (engine/achievements.ts) and the only state
 * transition is UNLOCK_ACHIEVEMENTS, whose reducer filter makes every re-fire
 * (StrictMode, reload, peer-merge re-render) a no-op after the first. The
 * toast + sparkle react to the persisted unlock in useRewards, never here.
 */

import { useEffect, useMemo, type Dispatch } from 'react'
import { newlyEarnedIds } from '../engine/achievements.ts'
import type { AppState } from '../state/store.ts'
import type { AppAction } from '../state/reducer.ts'

export function useAchievements(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  today: string,
): void {
  // Joined to one string so the effect keys on CONTENT: once the dispatch
  // lands, the re-render computes an empty list (the ids moved into
  // state.achievements) and the effect settles instead of looping.
  const earnedKey = useMemo(() => newlyEarnedIds(state).join(','), [state])
  useEffect(() => {
    if (earnedKey === '') return
    dispatch({ type: 'UNLOCK_ACHIEVEMENTS', ids: earnedKey.split(','), date: today })
  }, [earnedKey, today, dispatch])
}
