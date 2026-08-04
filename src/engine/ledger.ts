/**
 * Day grouping for the ledger.
 *
 * The app could state a Health Score to one decimal but could not answer "what
 * did I spend yesterday" — no transaction date rendered anywhere, no per-day
 * total on any surface. This is that derivation, and it is pure: every field it
 * reads (`date`, `amountDA`, `resistedImpulse`) is already validated by the
 * store, so nothing here changes the schema or persists anything new.
 *
 * It lives in engine/ rather than inside the component because the ordering
 * rules ARE the mechanic — future-dated rows, "Today" resolved against a passed
 * day instead of a fresh clock, resists counting zero — and a mechanic that
 * only exists inside JSX cannot be tested without a DOM.
 */

import type { Transaction } from '../state/store.ts'

export interface LedgerDay {
  /** Local day key (YYYY-MM-DD) every row in this group carries. */
  date: string
  /** Today / Yesterday / weekday + date. Relative to the PASSED `today`. */
  label: string
  /** Money that left, this day. Resists moved none and add 0 (see below). */
  spentDA: number
  /** Rows in the order they arrived — newest first (see mergeStates). */
  rows: Transaction[]
}

/** 1970-01-01 — UTC day 0 — was a Thursday, so the table starts there. */
const WEEKDAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] as const

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Days since the epoch for a local day key. UTC arithmetic on the PARTS, never
 * a local Date subtraction: across a DST boundary two local midnights are 23 or
 * 25 hours apart, and a /86_400_000 division of that difference floors to the
 * wrong day — which would label yesterday "Today" twice a year. Same helper,
 * same reason, as profile.ts's dayIndex; duplicated rather than cross-imported
 * so a presentation derivation does not pull the health engine in behind it.
 */
function dayIndex(dayISO: string): number {
  const [y, m, d] = dayISO.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/**
 * Heading for one day, computed from the `today` the caller believes it is —
 * never a fresh wall-clock read. Every date in a render must come from the one
 * day source (useHealthDay's `today`), or a list rendered at 00:00:01 labels
 * the day the rest of the app is still logging into as "Yesterday".
 *
 * A future-dated key (device clock skew, a hand-edited payload) is deliberately
 * NOT given a relative name: only the past two days get words, everything else
 * — ahead or behind — gets its stamp, so a skewed row can never wear "Today".
 * The year is printed only when it is not the current one: a date already says
 * which year it is by being in the list at all, until it doesn't.
 */
export function dayLabel(date: string, today: string): string {
  const delta = dayIndex(today) - dayIndex(date)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Yesterday'
  const [y, m, d] = date.split('-').map(Number)
  const stamp = `${WEEKDAYS[((dayIndex(date) % 7) + 7) % 7]} ${d} ${MONTHS[m - 1]}`
  return y === Number(today.slice(0, 4)) ? stamp : `${stamp} ${y}`
}

/**
 * Group transactions into days, newest day first.
 *
 * Row order INSIDE a day is the input order, untouched: LOG_TX prepends and
 * mergeStates sorts date-desc — between them the incoming list is already
 * newest-first, and ids are random, so there is nothing to re-sort by that
 * would not be a guess.
 *
 * Day order is NOT taken on trust, because a hand-edited payload can put any
 * key at the head of the array. Days at or before `today` sort descending;
 * days AFTER `today` sort after all of them. The row is still rendered — the
 * user's own data is never hidden — but a device with a skewed clock cannot
 * pin a row above every real day forever. Same both-ends bound
 * deriveHealthInputs puts on its windows, for the same reason.
 */
export function groupTransactionsByDay(
  transactions: Transaction[],
  today: string,
): LedgerDay[] {
  // Map of ARRAYS, one entry per row: two identical purchases on one day are
  // two facts about that day, and a keyed-by-value structure would silently
  // collapse them into one.
  const byDay = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const rows = byDay.get(t.date)
    if (rows) rows.push(t)
    else byDay.set(t.date, [t])
  }
  const days: LedgerDay[] = [...byDay.entries()].map(([date, rows]) => ({
    date,
    label: dayLabel(date, today),
    // Resists add 0. A resist is money that did NOT leave, so counting its
    // typed amount here would report a day's spending as the sum of what was
    // spent and what was avoided — the day total is money, and Trust Rule 1
    // keeps the self-reported resist story in the month "kept" line instead.
    spentDA: rows.reduce((sum, t) => (t.resistedImpulse ? sum : sum + t.amountDA), 0),
    rows,
  }))
  return days.sort((a, b) => {
    const aAhead = a.date > today
    const bAhead = b.date > today
    if (aAhead !== bAhead) return aAhead ? 1 : -1
    return a.date > b.date ? -1 : 1
  })
}
