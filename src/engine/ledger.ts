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

import { addDaysISO, type Transaction } from '../state/store.ts'

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

/** What the archive asks for: a bounded run of days, plus how many there are. */
export interface LedgerWindow {
  /** Materialised day groups, newest first. At most `limit` of them. */
  days: LedgerDay[]
  /**
   * Days the record holds in total, whatever the window shows. The count is
   * the archive's disclosure ("Showing 3 of 622 days") and its expand label,
   * so it may never be inferred from `days.length` — that is the number the
   * window deliberately caps.
   */
  totalDays: number
}

/**
 * The ledger as the archive renders it: order every day, MATERIALISE only the
 * ones asked for.
 *
 * WHY THE LIMIT IS IN THE ENGINE AND NOT A `.slice()` ON THE CALLER.
 * ArchiveCard shows WINDOW_DAYS (3) at rest and the derivation ran on every
 * logged purchase, so building the whole record to render three days of it was
 * per-log work proportional to the user's history: each day pays a `dayLabel`
 * (two DST-safe day-index computations), a reduce over its rows and an object
 * allocation, and 622 of the 625 were thrown away by the caller's `.slice(3)`.
 *
 * MEASURED, jsdom, one process, this shape against a local reimplementation of
 * the one it replaces, over a synthetic 8-rows-per-day ledger:
 *
 *     500 rows /  63 days   0.174 ms  ->  0.019 ms
 *   2,000 rows / 250 days   0.638 ms  ->  0.066 ms
 *   5,000 rows / 625 days   1.578 ms  ->  0.162 ms
 *
 * At 5,000 rows that took the archive from the most expensive derivation in a
 * logged purchase — more than the health score (0.26 ms), the month strip
 * (0.41) or the persist write (1.6) — to the cheapest of them.
 *
 * Grouping and ORDERING stay whole-ledger: both are needed to know which three
 * days are newest and how many there are. Only the per-day work is bounded.
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
export function ledgerWindow(
  transactions: Transaction[],
  today: string,
  limit: number = Number.POSITIVE_INFINITY,
): LedgerWindow {
  // Map of ARRAYS, one entry per row: two identical purchases on one day are
  // two facts about that day, and a keyed-by-value structure would silently
  // collapse them into one.
  const byDay = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const rows = byDay.get(t.date)
    if (rows) rows.push(t)
    else byDay.set(t.date, [t])
  }
  const dates = [...byDay.keys()].sort((a, b) => {
    const aAhead = a > today
    const bAhead = b > today
    if (aAhead !== bAhead) return aAhead ? 1 : -1
    return a > b ? -1 : 1
  })
  const days: LedgerDay[] = []
  for (const date of dates) {
    if (days.length >= limit) break
    const rows = byDay.get(date) as Transaction[]
    days.push({
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
    })
  }
  return { days, totalDays: dates.length }
}

/**
 * Every day, materialised. The unbounded form of ledgerWindow, kept because the
 * whole record IS what the sample-ledger and month-agreement checks are about —
 * and because a caller that genuinely wants all of it should not have to spell
 * an infinity.
 */
export function groupTransactionsByDay(
  transactions: Transaction[],
  today: string,
): LedgerDay[] {
  return ledgerWindow(transactions, today).days
}

/**
 * The month's resisted total — the sum of what the user says they did not buy.
 *
 * IT LIVES HERE BECAUSE TWO SURFACES STATE IT NOW. ArchiveCard prints it as the
 * record's chip; the landing's hand-off quotes that same line for the sample
 * rows it renders in the shot below (see Landing.tsx). A second copy of a
 * derivation is the copy that rots, and the pitch is the copy with the most to
 * lose by rotting — so the page computes the figure with the card's own
 * function rather than typing a number beside a screenshot of it.
 *
 * NOT A HEALTH INPUT (Trust Rule 1), and that is the reason it is a separate
 * derivation rather than a field of MonthSoFar: `spentDA` is money that moved
 * and feeds the money surfaces; this is a self-reported story about money that
 * did not. They are added up under different rules and must not arrive in one
 * object where a later edit can sum them by accident.
 *
 * `amountDA > 0` because a resist may be logged with no figure at all — the row
 * still counts as a resist for XP and Impulse Control, but it contributes
 * nothing to a total of dinars.
 *
 * The window is the CALENDAR month of `today`, future-dated rows included, and
 * that is deliberately NOT monthToDate's `date <= today` bound: this figure is
 * the user's own tally of their own taps, so a row they stamped tomorrow is
 * still their row. `spentDA` is a claim about a month that has not finished and
 * has to stop at today; this one is not.
 */
export function resistedThisMonthDA(transactions: Transaction[], today: string): number {
  const month = today.slice(0, 7)
  let total = 0
  // A counting loop, not filter().reduce(): the archive re-derives this on every
  // logged purchase and on every toast/XP-chip timer render, and the
  // intermediate array was allocated over the whole ledger to produce one
  // number. Same shape, and same reason, as App's resistXpCapped.
  for (const t of transactions) {
    if (t.resistedImpulse && t.amountDA > 0 && t.date.slice(0, 7) === month) total += t.amountDA
  }
  return total
}

/**
 * The rolling window the week block reads. SEVEN LOCAL DAYS ENDING `today`,
 * INCLUSIVE — not the calendar week. A Monday-anchored week hands a user who
 * installs on Saturday a two-day "week", and a block whose length depends on
 * which day you opened it is a block whose numbers cannot be compared to
 * themselves. The window is always seven days long, whatever day it is.
 */
export const WEEK_DAYS = 7

/** One category the window holds more than one spend row for. */
export interface WeekRepeat {
  /** The category exactly as the row carries it — never re-cased or merged. */
  category: string
  /** How many SPEND rows. Resists are not in here (see weekToDate). */
  rows: number
  /** What those rows came to. A sum. Never an average, never a rate. */
  totalDA: number
}

export interface WeekSoFar {
  /** Days in the window with at least one row on them. A COUNT, never a run. */
  daysLogged: number
  /** Money that left, inside the window. Resists add 0 — the ledger's rule. */
  spentDA: number
  /** The window's resisted total. Separate bucket, separate rule (see below). */
  resistedDA: number
  /**
   * Categories with two or more spend rows, biggest total first, capped at
   * `limit`. Empty when nothing repeated — an empty list is a fact about the
   * window, not a failure to find something.
   */
  repeats: WeekRepeat[]
}

/** How many repeat rows a surface may print. Three is what fits a phone card. */
export const WEEK_REPEAT_LIMIT = 3

/**
 * The last seven days, as the record actually holds them.
 *
 * WHY THIS EXISTS AT ALL. Before setup the Health Score runs on DEMO_PROFILE, so
 * the loudest number on the first screen is about nobody (Trust Rule 5) — the
 * card withholds it now and prints this instead. Every figure here is a sum over
 * rows the user typed, exact from the first row, and none of it is a projection.
 *
 * IT IS NOT A STREAK, AND THAT IS A HARD PROPERTY OF THE SHAPE RATHER THAN OF
 * THE COPY (Trust Rules 3 and 6). `daysLogged` counts days, it does not measure
 * a run: rows on day -6 and day 0 with five empty days between them count two,
 * exactly as two consecutive days do. There is no per-day array to draw a grid
 * from, nothing resets, nothing is lost, and a gap is not an event. ArchiveCard
 * already warns that "a binary grid is a streak calendar in a ledger's coat";
 * this derivation cannot grow one without a caller inventing the days itself.
 *
 * NO ENGAGEMENT INPUT REACHES IT (Trust Rule 1). It takes transactions and a
 * day. It cannot see xp, level, achievements or lessonsSeen even if a later
 * edit wanted it to — the same argument monthToDate makes about the profile.
 *
 * BOUNDED AT BOTH ENDS, like deriveHealthInputs' windows and monthToDate's
 * `date <= today`: a future-dated row (device clock skew, a hand-edited
 * payload) must not be able to sit inside the window forever, and a row older
 * than the window is out of it.
 *
 * CONSTRAINT: THE COST IS THE WINDOW'S, NOT THE RECORD'S — and it was the
 * record's. This function ran on every logged purchase over every row the user
 * has ever entered, and it tested membership with `daysBetween(t.date, today)`:
 * two `dayIndex` calls per row, each a `split`, a `map(Number)` and a
 * `Date.UTC`. Every peer derivation bounds itself with a string compare FIRST
 * (deriveHealthInputs' `date >= cutoff && date <= today`, monthToDate's
 * `date <= today`, resistedThisMonthDA's `slice(0, 7)`); this one did not, and
 * it was the most expensive derivation in a logged purchase at every size
 * measured. MEASURED on THIS tree, jsdom, one process, both arms through the
 * same warmed best-of-5 harness, over a synthetic ledger:
 *
 *                            before    after
 *     500 rows /  63 days    0.428 ms  0.032 ms
 *   5,000 rows / 625 days    4.236 ms  0.041 ms
 *   5,000 rows /  50 days    4.240 ms  0.058 ms
 *
 * The middle row is the whole finding. At 5,000 rows the FIVE other
 * whole-ledger derivations App re-runs in the same render come to 0.424 ms
 * together — ledgerWindow(3) 0.148, monthToDate 0.132, deriveHealthInputs
 * 0.079, historyDays 0.053, resistedThisMonthDA 0.012 — so this one cost TEN
 * TIMES all of them combined, for a block HeroCard only renders while
 * `profile` is null. Note also that the before column barely moves between 625
 * days and 50: the cost tracked the ROW COUNT and ignored the window
 * completely, which is exactly the property being removed.
 *
 * The bound is one `addDaysISO` for the whole call, then a lexicographic
 * compare per row. That is exact rather than an approximation: transaction
 * dates are validated day keys (isValidDayKey in the store), for which string
 * order IS chronological order, and `addDaysISO` is the same DST-safe calendar
 * step `daysBeforeISO` uses in profile.ts — `cutoff <= date <= today` is
 * precisely `0 <= daysBetween(date, today) < WEEK_DAYS`. The hour-based bug
 * dayIndex documents is avoided by not doing the arithmetic at all.
 *
 * WHAT IT MUST NEVER GROW: an average, a per-day rate, a target, a projection,
 * a comparison against UserProfile.budgeted, or a superlative. The repeats are
 * ordered, and ordering is not grading — a surface may print them in order and
 * may not call the first one "biggest".
 */
export function weekToDate(
  transactions: Transaction[],
  today: string,
  limit: number = WEEK_REPEAT_LIMIT,
): WeekSoFar {
  // The window's older edge, computed ONCE. WEEK_DAYS - 1 because both ends are
  // inclusive: today−6 through today is exactly seven calendar days, the same
  // off-by-one deriveHealthInputs spells out at its `daysBeforeISO(today, 29)`.
  const cutoff = addDaysISO(today, -(WEEK_DAYS - 1))
  const days = new Set<string>()
  let spentDA = 0
  let resistedDA = 0
  // Two accumulators per category in one map: a second pass to count rows would
  // walk the ledger twice for a card that re-renders on every reward timer.
  const byCategory = new Map<string, { rows: number; totalDA: number }>()
  for (const t of transactions) {
    // The whole membership test, and no date arithmetic in it — see the note
    // above the function for what this replaced and what it cost.
    if (t.date < cutoff || t.date > today) continue
    // A resist is a row the user filed, so the day counts as a day they logged
    // on — the count is about the record having something on it, not about
    // money having moved.
    days.add(t.date)
    if (t.resistedImpulse) {
      // `amountDA > 0` because a resist may carry no figure at all — the row
      // still counts as a resist, it just contributes no dinars. Same rule, and
      // the same reason, as resistedThisMonthDA.
      if (t.amountDA > 0) resistedDA += t.amountDA
      // …and it goes NO FURTHER. Resists never enter spentDA and never enter a
      // repeat's total: the repeats describe money that left, and folding in
      // money the user says did not leave would report a category as costing
      // the sum of what it cost and what it nearly cost.
      continue
    }
    spentDA += t.amountDA
    const cur = byCategory.get(t.category)
    if (cur) {
      cur.rows += 1
      cur.totalDA += t.amountDA
    } else {
      byCategory.set(t.category, { rows: 1, totalDA: t.amountDA })
    }
  }
  const repeats: WeekRepeat[] = []
  for (const [category, { rows, totalDA }] of byCategory) {
    if (rows >= 2) repeats.push({ category, rows, totalDA })
  }
  // Deterministic all the way down: total, then row count, then the category
  // name. Two categories that tie on both numbers must not swap order between
  // renders because a Map's insertion order changed — the block is a statement
  // of fact and a fact that reorders under the reader is a bug.
  repeats.sort(
    (a, b) =>
      b.totalDA - a.totalDA || b.rows - a.rows || (a.category < b.category ? -1 : 1),
  )
  return { daysLogged: days.size, spentDA, resistedDA, repeats: repeats.slice(0, limit) }
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
