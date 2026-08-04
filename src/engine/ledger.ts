/**
 * Day grouping for the ledger, and the month-so-far derivation under it.
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
 * Whole local days from `fromISO` to `toISO`, negative when `toISO` is earlier.
 *
 * Exported so the check-back's scheduled line ("Check back in 6 days.") can
 * count them without minting a fifth copy of the DST-safe day arithmetic
 * documented at dayIndex above — that comment names the exact bug an hour-based
 * subtraction produces twice a year, and a second implementation is a second
 * chance for someone to write the naive one.
 */
export function daysBetween(fromISO: string, toISO: string): number {
  return dayIndex(toISO) - dayIndex(fromISO)
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
    // keeps the self-reported resist story in the month "resisted" line instead
    // (see ArchiveCard.tsx — "kept" was retired because it asserts an outcome about
    // money the user only says they did not spend).
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

/** One calendar day of the month, whether or not anything happened on it. */
export interface MonthDay {
  /** Local day key (YYYY-MM-DD). */
  date: string
  /** 1-based day of the month. */
  day: number
  /** Money that left on this day. Resists add 0 — same rule as LedgerDay. */
  spentDA: number
  /**
   * Why this day is blank, when it is — and it is the one thing this
   * derivation exists to get right.
   *
   *   'recorded'  — inside the window Ember holds records for. A 0 here is a
   *                 real zero: the day happened and nothing was logged.
   *   'no-record' — before the first row Ember has. NOT a zero-spend day:
   *                 on install day the month is half over and eleven empty
   *                 cells would otherwise read as "you spent nothing for
   *                 eleven days", which is a lie about the user (Trust
   *                 Rule 5's honest cold start).
   *   'ahead'     — after `today`. Hasn't happened.
   */
  state: 'recorded' | 'no-record' | 'ahead'
}

export interface MonthSoFar {
  /** YYYY-MM of the PASSED `today`. */
  month: string
  /** 1-based day of the month `today` falls on. */
  dayOfMonth: number
  /** 28 / 29 / 30 / 31 — the real length of this month. */
  daysInMonth: number
  daysLeft: number
  /** Month-to-date spend: days 1..today, resists excluded. */
  spentDA: number
  /** Every calendar day of the month, in date order. Always daysInMonth long. */
  days: MonthDay[]
  /** Earliest day Ember holds any record of, at or before `today`. */
  firstRecord: string | null
  /** The tallest day in `days` — the scale a strip drawn from this must use. */
  maxDayDA: number
}

/**
 * The month so far: where you are in it, what it has cost, and its shape.
 *
 * Pure, and derived from the same rows the ledger prints — the per-day totals
 * here and groupTransactionsByDay's are the same rule (resists add 0), because
 * one derivation appearing twice on one page with two answers is worse than
 * not shipping the second surface at all.
 *
 * What this deliberately does NOT compute, and must never grow: an average, a
 * run-rate, a projection, or any comparison to `UserProfile.budgeted`. A
 * month-to-date total is exact from day one; a projection off twelve days is
 * the unearned confidence Trust Rule 5 forbids, and a budget line would put a
 * verdict on a card of measured facts (Trust Rules 3 and 6). It takes only
 * transactions and a day — it cannot reach the profile even if a later edit
 * wanted to.
 */
export function monthToDate(transactions: Transaction[], today: string): MonthSoFar {
  const month = today.slice(0, 7)
  const [y, m] = month.split('-').map(Number)
  const dayOfMonth = Number(today.slice(8, 10))
  // Day 0 of the NEXT month is the last day of this one, in UTC parts — the
  // same reason dayIndex above never touches a local Date: a local
  // `new Date(y, m, 0)` is built in the viewer's zone and a DST-boundary month
  // can hand back the wrong day, which would mislabel the strip's own length.
  // This is also what gets 29 in a leap February for free, with no table.
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()

  // One pass for both facts: the per-day totals inside this month, and the
  // first day Ember holds ANY record of — which is a whole-ledger question,
  // not a this-month one. A user who logged in July and nothing in August has
  // August days ON RECORD at 0; a user installing today does not.
  const spentByDay = new Map<string, number>()
  let firstRecord: string | null = null
  for (const t of transactions) {
    // Bounded at `today` for the same reason deriveHealthInputs bounds its
    // windows at both ends: a future-dated row (clock skew, hand-edited
    // payload) must not be able to claim a record window the app never had.
    if (t.date <= today && (firstRecord === null || t.date < firstRecord)) firstRecord = t.date
    if (t.date.slice(0, 7) !== month) continue
    const prev = spentByDay.get(t.date) ?? 0
    // Resists add 0. Money that did not leave is not spend — the same rule,
    // written once per surface, never a different one here.
    spentByDay.set(t.date, t.resistedImpulse ? prev : prev + t.amountDA)
  }

  const days: MonthDay[] = []
  let spentDA = 0
  let maxDayDA = 0
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    const dayDA = spentByDay.get(date) ?? 0
    const state: MonthDay['state'] =
      date > today
        ? 'ahead'
        : firstRecord === null || date < firstRecord
          ? 'no-record'
          : 'recorded'
    // "So far" means so far. A future-dated row still renders on its own day
    // (the user's data is never hidden) but it may not inflate the figure the
    // card states as month-to-date.
    if (state !== 'ahead') spentDA += dayDA
    // The scale spans EVERY day drawn, ahead ones included: a bar scaled off a
    // maximum that excluded it would have to clip, and a clipped bar reports a
    // day as smaller than it was.
    if (dayDA > maxDayDA) maxDayDA = dayDA
    days.push({ date, day: d, spentDA: dayDA, state })
  }

  return {
    month,
    dayOfMonth,
    daysInMonth,
    daysLeft: daysInMonth - dayOfMonth,
    spentDA,
    days,
    firstRecord,
    maxDayDA,
  }
}
