/**
 * THE ROWS BEHIND THE LANDING SURFACE'S PRODUCT SHOT.
 *
 * The landing renders the app's own <Ledger> with these rows rather than a
 * picture of it (see Landing.tsx). That is the whole point: the shot is
 * produced by the shipped component and the shipped grouping engine, so it
 * cannot drift from the product the way an exported PNG does. What lives here
 * is only the sample DATA — no layout, no copy, no derivation the app does not
 * already do.
 *
 * WHY A FUNCTION OF `today`, NOT A FROZEN LIST.
 * The day headings resolve against the day the page is opened (ledger.ts's
 * dayLabel). Hard-coded dates would render "Sat 4 Aug" forever and the shot
 * would stop demonstrating the relative labels, which are the feature. Dates
 * are offsets here and are resolved at render.
 *
 * WHY THE RESIST SITS ON DAY 0.
 * Ledger's month chip filters the CURRENT calendar month. A resist parked on
 * "yesterday" would drop out of the shot on the 1st of every month, taking the
 * resisted chip with it — the one row that shows money NOT leaving would be
 * missing from the shot twelve days a year.
 *
 * HONESTY (Trust Rule 5). These are sample rows, the caption beside them says
 * so in those words, and nothing derived from them is a reading of anybody:
 * there is no score, no stage and no projection anywhere in Ledger's output.
 * Root.test asserts both halves of that.
 */

import type { Transaction } from '../state/store.ts'

/** Distinct days the sample covers — the shot's whole window (Ledger shows 3
    days before it grows an expand control, and a control inside an
    aria-hidden shot would be a focus trap with no accessible name). */
export const SAMPLE_LEDGER_DAYS = 3

interface SampleRow {
  /** Whole days back from the day the page is opened. */
  daysAgo: number
  amountDA: number
  /** Must be one of LogCard's real categories — sampleLedger.test asserts it. */
  category: string
  resistedImpulse?: boolean
}

/**
 * Newest first, matching what the store hands the component: LOG_TX prepends
 * and mergeStates sorts date-desc, and Ledger renders a day's rows in the
 * order it receives them.
 *
 * Amounts are ordinary Algerian ones — a bus fare, a lunch, a monthly bill —
 * because a shot full of round showroom numbers is a mockup wearing the
 * product's clothes.
 */
const ROWS: SampleRow[] = [
  // A resist on the same day as real spending: the day heading totals 1,050,
  // NOT 4,550. Money that did not move adds nothing to the day (ledger.ts) and
  // lands in the month's resisted chip instead — the two-track rule, visible in one
  // shot without a word of explanation.
  { daysAgo: 0, amountDA: 3500, category: 'Fun', resistedImpulse: true },
  { daysAgo: 0, amountDA: 850, category: 'Food' },
  { daysAgo: 0, amountDA: 200, category: 'Transport' },
  { daysAgo: 1, amountDA: 2400, category: 'Bills' },
  { daysAgo: 1, amountDA: 320, category: 'Food' },
  { daysAgo: 2, amountDA: 1150, category: 'Food' },
  { daysAgo: 2, amountDA: 200, category: 'Transport' },
]

/**
 * Shift a local day key back by whole days.
 *
 * The LOCAL Date constructor, deliberately: it normalises the calendar
 * (month and year underflow) and never touches a duration, so it is DST-safe
 * for this direction. ledger.ts's dayIndex does UTC arithmetic for the opposite
 * reason — it measures a DIFFERENCE between two local midnights, which is 23 or
 * 25 hours apart twice a year. Same care, opposite tool.
 */
function shiftDay(dayISO: string, daysBack: number): string {
  const [y, m, d] = dayISO.split('-').map(Number)
  const at = new Date(y, m - 1, d - daysBack)
  const mm = String(at.getMonth() + 1).padStart(2, '0')
  const dd = String(at.getDate()).padStart(2, '0')
  return `${at.getFullYear()}-${mm}-${dd}`
}

/** The sample ledger as the component consumes it, dated against `today`. */
export function sampleLedgerRows(today: string): Transaction[] {
  return ROWS.map((r, i) => ({
    // Stable and human-readable: these are React keys on a list that never
    // changes, and a random id would mint a new one on every render.
    id: `sample-${String(i + 1).padStart(2, '0')}`,
    amountDA: r.amountDA,
    category: r.category,
    date: shiftDay(today, r.daysAgo),
    ...(r.resistedImpulse ? { resistedImpulse: true } : {}),
  }))
}
