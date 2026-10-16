/**
 * "Dim the house" — the low-energy mode and the guilt-free return.
 *
 * Coming back after days away is where most money apps lose people: a wall
 * of "you missed" and a backlog to fill. Ember does the opposite: nothing is
 * broken, nothing needs back-filling, and one rough number is enough. Pure
 * date arithmetic over local day keys; the reducer owns the state.
 */

import type { Transaction } from '../state/store.ts'

/** Days away before the return is treated as a re-entry, not a gap. */
export const REENTRY_AFTER_DAYS = 5

export interface Reentry {
  /** Local day the app was last opened before the gap. */
  since: string
  /** Whole days between then and the return. */
  days: number
}

export { daysBetween } from './dates.ts'
import { daysBetween } from './dates.ts'

/** A re-entry when the gap since the last open reaches the threshold; null otherwise. */
export function reentryFor(lastOpened: string, today: string): Reentry | null {
  if (lastOpened === '') return null
  const days = daysBetween(lastOpened, today)
  return days >= REENTRY_AFTER_DAYS ? { since: lastOpened, days } : null
}

/** The catch-up row's category — a real roster category so chips/score treat it normally. */
export const CATCH_UP_CATEGORY = 'Other'
export const CATCH_UP_NOTE = 'rough catch-up for days away'

/**
 * One lump row standing in for a stretch of unlogged days. Dated today, not
 * spread backwards: spreading would fabricate per-day precision the user
 * never gave, and the health engine's windows only need the total.
 */
export function catchUpTransaction(id: string, amountDA: number, today: string): Transaction {
  return { id, amountDA, category: CATCH_UP_CATEGORY, note: CATCH_UP_NOTE, date: today }
}

export const REENTRY_COPY = {
  title: 'Welcome back.',
  body: 'Nothing is broken. You do not have to fill in the days you were away.',
  prompt: 'If you like, give one rough number for what you spent while away — or skip it.',
  skip: 'Skip, start from today',
} as const
