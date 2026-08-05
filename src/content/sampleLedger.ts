/**
 * THE ROWS BEHIND THE LANDING SURFACE'S PRODUCT SHOT.
 *
 * The landing renders the app's own <ArchiveCard> with these rows rather than a
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
 * ArchiveCard's resisted chip filters the CURRENT calendar month. A resist parked on
 * "yesterday" would drop out of the shot on the 1st of every month, taking the
 * resisted chip with it — the one row that shows money NOT leaving would be
 * missing from the shot twelve days a year.
 *
 * WHY ONLY SOME ROWS CARRY A NOTE.
 * The "what was it" field is optional and ArchiveCard renders nothing at all for
 * a row without one — no placeholder, no prompt. Noting every sample row would
 * turn a shot of an optional field into a shot of a required one, and the
 * first thing a new user does is log a row with the note left empty.
 *
 * HONESTY (Trust Rule 5). These are sample rows, the caption beside them says
 * so in those words, and nothing derived from them is a reading of anybody:
 * there is no score, no stage and no projection anywhere in ArchiveCard's output.
 * Root.test asserts both halves of that.
 */

import { addDaysISO, type Transaction } from '../state/store.ts'

/** Distinct days the sample covers — the shot's whole window (ArchiveCard shows 3
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
  /**
   * The row's "what was it" memo, as a user would type it.
   *
   * CONSTRAINT: must survive sanitizeNote unchanged and sit inside
   * NOTE_MAX_LEN — sampleLedger.test asserts both. A sample note the store
   * would trim or truncate is a shot of a row the app cannot actually hold.
   *
   * Deliberately on SOME rows only. The field is optional and the ledger
   * renders no placeholder for an empty one, so a shot where every row
   * carried a note would advertise a required field.
   */
  note?: string
}

/**
 * Newest first, matching what the store hands the component: LOG_TX prepends
 * and mergeStates sorts date-desc, and ArchiveCard renders a day's rows in the
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
  //
  // The resist carries a note for a reason: it is the row whose category has
  // been replaced by the word "Resisted", so it is the one row on the card
  // that would otherwise not say WHAT was not bought. The note is the answer,
  // and it is the same field every other row uses.
  { daysAgo: 0, amountDA: 3500, category: 'Fun', resistedImpulse: true, note: 'second pair of headphones' },
  { daysAgo: 0, amountDA: 850, category: 'Food', note: 'lunch, the place by the office' },
  { daysAgo: 0, amountDA: 200, category: 'Transport' },
  { daysAgo: 1, amountDA: 2400, category: 'Bills', note: 'electricity, two months' },
  { daysAgo: 1, amountDA: 320, category: 'Food' },
  { daysAgo: 2, amountDA: 1150, category: 'Food' },
  { daysAgo: 2, amountDA: 200, category: 'Transport' },
]

/** The sample ledger as the component consumes it, dated against `today`.
    Dates come from store.ts's addDaysISO — the same local-calendar arithmetic
    the app stamps real rows with, so a sample row cannot land on a different
    day from a real one logged at the same moment. */
export function sampleLedgerRows(today: string): Transaction[] {
  return ROWS.map((r, i) => ({
    // Stable and human-readable: these are React keys on a list that never
    // changes, and a random id would mint a new one on every render.
    id: `sample-${String(i + 1).padStart(2, '0')}`,
    amountDA: r.amountDA,
    category: r.category,
    date: addDaysISO(today, -r.daysAgo),
    ...(r.resistedImpulse ? { resistedImpulse: true } : {}),
    // Spread-in rather than `note: r.note`, so a noteless sample row produces
    // a row with NO note key at all — byte-identical to what LOG_TX writes
    // when the field was left empty. A row carrying `note: undefined` would
    // still be a different object shape from the one the app ships.
    ...(r.note !== undefined ? { note: r.note } : {}),
  }))
}
