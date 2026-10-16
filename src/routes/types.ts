import type { Dispatch } from 'react'
import type { AppState } from '../state/store.ts'
import type { AppAction } from '../state/reducer.ts'
import type { HealthResult } from '../engine/healthScore.ts'

/** What every route component receives. Routes own their cards; App owns the
 *  day clock, persistence and reward reactions. */
export interface RouteProps {
  state: AppState
  dispatch: Dispatch<AppAction>
  /** The day clock's local day — the one every write in a render stamps. */
  today: string
  health: HealthResult
}
