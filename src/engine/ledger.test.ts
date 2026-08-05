import { describe, it, expect, vi } from 'vitest'
import {
  WEEK_DAYS,
  WEEK_REPEAT_LIMIT,
  dayLabel,
  groupTransactionsByDay,
  ledgerWindow,
  monthToDate,
  weekToDate,
} from './ledger.ts'
import { addDaysISO, type Transaction } from '../state/store.ts'

const tx = (over: Partial<Transaction> & { id: string; date: string }): Transaction => ({
  amountDA: 100,
  category: 'Food',
  ...over,
})

describe('dayLabel', () => {
  it('names only the two days a user has words for', () => {
    expect(dayLabel('2026-08-04', '2026-08-04')).toBe('Today')
    expect(dayLabel('2026-08-03', '2026-08-04')).toBe('Yesterday')
    expect(dayLabel('2026-08-02', '2026-08-04')).toBe('Sun 2 Aug')
  })

  it('resolves the relative names against the PASSED day, never a fresh clock', () => {
    // The same date is Today, Yesterday or a stamp depending only on the
    // argument — the midnight/DST bug class the whole codebase guards.
    expect(dayLabel('2026-08-03', '2026-08-03')).toBe('Today')
    expect(dayLabel('2026-08-03', '2026-08-04')).toBe('Yesterday')
    expect(dayLabel('2026-08-03', '2026-08-05')).toBe('Mon 3 Aug')
  })

  it('never gives a future-dated day a relative name', () => {
    // Clock skew / hand-edited payload. Tomorrow is not "Today", and there is
    // no "Tomorrow" word to reach for either.
    expect(dayLabel('2026-08-05', '2026-08-04')).toBe('Wed 5 Aug')
    expect(dayLabel('2027-01-01', '2026-08-04')).toBe('Fri 1 Jan 2027')
  })

  it('prints the year only when it is not the current one', () => {
    expect(dayLabel('2026-01-01', '2026-08-04')).toBe('Thu 1 Jan')
    expect(dayLabel('2025-12-31', '2026-08-04')).toBe('Wed 31 Dec 2025')
  })

  it('reads the weekday correctly across a DST boundary', () => {
    // Local-Date subtraction across a spring-forward gets 23h between two
    // midnights and floors to the wrong day. Europe/Algiers has no DST, but
    // the app must survive being opened anywhere.
    expect(dayLabel('2026-03-29', '2026-03-30')).toBe('Yesterday')
    expect(dayLabel('2026-03-28', '2026-03-30')).toBe('Sat 28 Mar')
    expect(dayLabel('2026-10-25', '2026-10-26')).toBe('Yesterday')
  })
})

describe('groupTransactionsByDay', () => {
  it('groups rows under their own day, days newest first', () => {
    const days = groupTransactionsByDay(
      [
        tx({ id: 'c', date: '2026-08-04', amountDA: 300 }),
        tx({ id: 'b', date: '2026-08-03', amountDA: 200 }),
        tx({ id: 'a', date: '2026-08-01', amountDA: 100 }),
      ],
      '2026-08-04',
    )
    expect(days.map((d) => d.date)).toEqual(['2026-08-04', '2026-08-03', '2026-08-01'])
    expect(days.map((d) => d.label)).toEqual(['Today', 'Yesterday', 'Sat 1 Aug'])
  })

  it('sorts days even when the incoming array is out of order', () => {
    // A hand-edited payload can put any key at the head; day order is derived,
    // never taken on trust from the array.
    const days = groupTransactionsByDay(
      [
        tx({ id: 'a', date: '2026-07-30' }),
        tx({ id: 'b', date: '2026-08-04' }),
        tx({ id: 'c', date: '2026-08-02' }),
      ],
      '2026-08-04',
    )
    expect(days.map((d) => d.date)).toEqual(['2026-08-04', '2026-08-02', '2026-07-30'])
  })

  it('keeps the incoming row order inside a day — newest first, as it arrives', () => {
    const days = groupTransactionsByDay(
      [
        tx({ id: 'newest', date: '2026-08-04' }),
        tx({ id: 'middle', date: '2026-08-04' }),
        tx({ id: 'oldest', date: '2026-08-04' }),
      ],
      '2026-08-04',
    )
    expect(days[0].rows.map((r) => r.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('sums purchases only — a resist lists under its day and adds 0', () => {
    const days = groupTransactionsByDay(
      [
        tx({ id: 'r', date: '2026-08-04', amountDA: 900, resistedImpulse: true }),
        tx({ id: 'p', date: '2026-08-04', amountDA: 250 }),
      ],
      '2026-08-04',
    )
    expect(days).toHaveLength(1)
    expect(days[0].rows).toHaveLength(2)
    // 250, not 1,150: a resist is money that did NOT leave.
    expect(days[0].spentDA).toBe(250)
  })

  it('reports 0 for a day of resists rather than dropping the day', () => {
    const days = groupTransactionsByDay(
      [tx({ id: 'r', date: '2026-08-04', amountDA: 400, resistedImpulse: true })],
      '2026-08-04',
    )
    expect(days).toHaveLength(1)
    expect(days[0].spentDA).toBe(0)
  })

  it('counts a yielded impulse like any other purchase — honesty is never taxed', () => {
    const days = groupTransactionsByDay(
      [tx({ id: 'i', date: '2026-08-04', amountDA: 300, impulseFlagged: true })],
      '2026-08-04',
    )
    expect(days[0].spentDA).toBe(300)
  })

  it('keeps two identical rows on one day as two rows that both count', () => {
    // A Map/Set keyed by anything but the row itself would collapse these.
    const days = groupTransactionsByDay(
      [
        tx({ id: 'x1', date: '2026-08-04', amountDA: 150, category: 'Food' }),
        tx({ id: 'x2', date: '2026-08-04', amountDA: 150, category: 'Food' }),
      ],
      '2026-08-04',
    )
    expect(days[0].rows).toHaveLength(2)
    expect(days[0].spentDA).toBe(300)
  })

  it('sorts a future-dated day below every real day instead of pinning it on top', () => {
    const days = groupTransactionsByDay(
      [
        tx({ id: 'skew', date: '2026-09-01' }),
        tx({ id: 'today', date: '2026-08-04' }),
        tx({ id: 'old', date: '2026-08-01' }),
      ],
      '2026-08-04',
    )
    // Still rendered — the user's own data is never hidden — but it cannot
    // outrank a real day, and it never wears "Today".
    expect(days.map((d) => d.date)).toEqual(['2026-08-04', '2026-08-01', '2026-09-01'])
    expect(days[0].label).toBe('Today')
    expect(days[2].label).toBe('Tue 1 Sep')
  })

  it('orders several future days among themselves, still below the real ones', () => {
    const days = groupTransactionsByDay(
      [
        tx({ id: 'f1', date: '2026-08-06' }),
        tx({ id: 'f2', date: '2026-12-25' }),
        tx({ id: 'now', date: '2026-08-04' }),
      ],
      '2026-08-04',
    )
    expect(days.map((d) => d.date)).toEqual(['2026-08-04', '2026-12-25', '2026-08-06'])
  })

  it('returns nothing at all for an empty log — never an empty scaffold', () => {
    expect(groupTransactionsByDay([], '2026-08-04')).toEqual([])
  })

  it('does not mutate or reorder the transactions it was handed', () => {
    const input = [
      tx({ id: 'a', date: '2026-07-30' }),
      tx({ id: 'b', date: '2026-08-04' }),
    ]
    const snapshot = JSON.stringify(input)
    groupTransactionsByDay(input, '2026-08-04')
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

describe('monthToDate', () => {
  const state = (m: ReturnType<typeof monthToDate>, day: number) =>
    m.days[day - 1].state
  const spend = (m: ReturnType<typeof monthToDate>, day: number) =>
    m.days[day - 1].spentDA

  it('sums this calendar month only, up to and including the passed day', () => {
    const m = monthToDate(
      [
        tx({ id: 'a', date: '2026-08-01', amountDA: 400 }),
        tx({ id: 'b', date: '2026-08-04', amountDA: 250 }),
        // Last month. Same ledger, different month — never in this figure.
        tx({ id: 'c', date: '2026-07-31', amountDA: 9_000 }),
      ],
      '2026-08-04',
    )
    expect(m.month).toBe('2026-08')
    expect(m.spentDA).toBe(650)
    expect(spend(m, 1)).toBe(400)
    expect(spend(m, 4)).toBe(250)
    expect(spend(m, 2)).toBe(0)
  })

  it('counts a resist as 0 — money that did not leave is not spend', () => {
    const m = monthToDate(
      [
        tx({ id: 'r', date: '2026-08-04', amountDA: 900, resistedImpulse: true }),
        tx({ id: 'p', date: '2026-08-04', amountDA: 250 }),
      ],
      '2026-08-04',
    )
    // 250, not 1,150 — the same rule groupTransactionsByDay applies.
    expect(m.spentDA).toBe(250)
    expect(spend(m, 4)).toBe(250)
  })

  it('counts a yielded impulse like any other purchase', () => {
    const m = monthToDate(
      [tx({ id: 'i', date: '2026-08-02', amountDA: 300, impulseFlagged: true })],
      '2026-08-04',
    )
    expect(m.spentDA).toBe(300)
  })

  it('never lets a future-dated row inflate the so-far figure', () => {
    // Clock skew or a hand-edited payload. The row still lands on its own day
    // — the user's data is never hidden — but "so far" means so far.
    const m = monthToDate(
      [
        tx({ id: 'now', date: '2026-08-04', amountDA: 250 }),
        tx({ id: 'skew', date: '2026-08-20', amountDA: 99_000 }),
      ],
      '2026-08-04',
    )
    expect(m.spentDA).toBe(250)
    expect(spend(m, 20)).toBe(99_000)
    expect(state(m, 20)).toBe('ahead')
  })

  it('gives the month its real length — 28, 29, 30 or 31 cells', () => {
    const len = (today: string) => monthToDate([], today).days.length
    expect(len('2026-08-04')).toBe(31)
    expect(len('2026-04-10')).toBe(30)
    expect(len('2026-02-10')).toBe(28)
    // Leap February, from the calendar itself — no hard-coded table to rot.
    expect(len('2024-02-10')).toBe(29)
    expect(len('2100-02-10')).toBe(28) // century, not a leap year
    // …and the cells are the real days, in order.
    const feb = monthToDate([], '2024-02-10')
    expect(feb.days[0].date).toBe('2024-02-01')
    expect(feb.days[28].date).toBe('2024-02-29')
    expect(feb.days.map((d) => d.day)).toEqual(feb.days.map((_, i) => i + 1))
  })

  it('reads the day index off the PASSED day, never a fresh clock', () => {
    // The whole midnight/DST bug class the codebase guards: the same ledger
    // reports a different position in the month purely from the argument.
    expect(monthToDate([], '2026-08-04').dayOfMonth).toBe(4)
    expect(monthToDate([], '2026-08-04').daysLeft).toBe(27)
    expect(monthToDate([], '2026-08-31').dayOfMonth).toBe(31)
    expect(monthToDate([], '2026-08-31').daysLeft).toBe(0)
  })

  it('counts the days of a month that contains a DST boundary', () => {
    // Local Date arithmetic across a spring-forward loses an hour and can
    // floor a month to 30 days. Europe/Algiers has no DST; the app must
    // survive being opened anywhere.
    expect(monthToDate([], '2026-03-30').daysInMonth).toBe(31)
    expect(monthToDate([], '2026-03-30').dayOfMonth).toBe(30)
    expect(monthToDate([], '2026-10-26').daysInMonth).toBe(31)
    expect(monthToDate([], '2026-11-01').daysInMonth).toBe(30)
  })

  it('marks days before the first record as no-record, not as zero-spend days', () => {
    // The cold start, and the one thing this derivation exists to get right:
    // installing on the 12th must not report eleven days of spending nothing.
    const m = monthToDate([tx({ id: 'a', date: '2026-08-12', amountDA: 500 })], '2026-08-14')
    expect(state(m, 1)).toBe('no-record')
    expect(state(m, 11)).toBe('no-record')
    expect(state(m, 12)).toBe('recorded')
    // Day 13 logged nothing and IS a zero — the app was here for it. That is
    // a different fact from day 11, and the two must never share a state.
    expect(state(m, 13)).toBe('recorded')
    expect(spend(m, 13)).toBe(0)
    expect(spend(m, 11)).toBe(0)
    expect(state(m, 13)).not.toBe(state(m, 11))
    expect(state(m, 15)).toBe('ahead')
    expect(m.firstRecord).toBe('2026-08-12')
  })

  it('treats a month with no records at all as blank, never as a month of zeros', () => {
    const m = monthToDate([], '2026-08-04')
    expect(m.firstRecord).toBeNull()
    expect(m.spentDA).toBe(0)
    expect(m.days.filter((d) => d.state === 'no-record')).toHaveLength(4)
    expect(m.days.filter((d) => d.state === 'ahead')).toHaveLength(27)
    expect(m.days.some((d) => d.state === 'recorded')).toBe(false)
  })

  it('puts a month on record from an EARLIER month’s rows — a quiet month is real zeros', () => {
    // A user who logged in July and nothing in August has August days on
    // record at 0. The record window is a whole-ledger question, not a
    // this-month one, and reporting those days as "no record" would erase a
    // month the user genuinely spent nothing in.
    const m = monthToDate([tx({ id: 'jul', date: '2026-07-02' })], '2026-08-04')
    expect(m.firstRecord).toBe('2026-07-02')
    expect(state(m, 1)).toBe('recorded')
    expect(state(m, 4)).toBe('recorded')
    expect(m.spentDA).toBe(0)
  })

  it('never lets a future-dated row open a record window the app never had', () => {
    // Bounded at `today` on both ends, exactly like deriveHealthInputs.
    const m = monthToDate([tx({ id: 'skew', date: '2026-08-20' })], '2026-08-04')
    expect(m.firstRecord).toBeNull()
    expect(state(m, 1)).toBe('no-record')
    // …and a resist counts as a record: the app WAS here that day.
    const r = monthToDate(
      [tx({ id: 'r', date: '2026-08-02', amountDA: 700, resistedImpulse: true })],
      '2026-08-04',
    )
    expect(r.firstRecord).toBe('2026-08-02')
    expect(state(r, 3)).toBe('recorded')
    expect(r.spentDA).toBe(0)
  })

  it('agrees with groupTransactionsByDay on every day it shares with it', () => {
    // One derivation, two surfaces. The strip and the ledger headings print
    // the same rows; a page that answers "what did Tuesday cost" twice must
    // never answer it differently.
    const rows = [
      tx({ id: 'a', date: '2026-08-01', amountDA: 400 }),
      tx({ id: 'b', date: '2026-08-01', amountDA: 150 }),
      tx({ id: 'c', date: '2026-08-03', amountDA: 900, resistedImpulse: true }),
      tx({ id: 'd', date: '2026-08-03', amountDA: 60, impulseFlagged: true }),
      tx({ id: 'e', date: '2026-08-04', amountDA: 250 }),
      tx({ id: 'f', date: '2026-08-20', amountDA: 1_000 }),
    ]
    const m = monthToDate(rows, '2026-08-04')
    for (const day of groupTransactionsByDay(rows, '2026-08-04')) {
      expect(spend(m, Number(day.date.slice(8, 10)))).toBe(day.spentDA)
    }
    // …and the month figure is the sum of the day figures up to today.
    expect(m.spentDA).toBe(550 + 60 + 250)
  })

  it('scales off the tallest day drawn, so no bar has to be clipped', () => {
    const m = monthToDate(
      [
        tx({ id: 'a', date: '2026-08-01', amountDA: 400 }),
        tx({ id: 'b', date: '2026-08-03', amountDA: 1_200 }),
      ],
      '2026-08-04',
    )
    expect(m.maxDayDA).toBe(1_200)
    // A future-dated row is drawn, so it is in the scale — a maximum that
    // excluded it would force its own bar past 100%.
    const skewed = monthToDate([tx({ id: 's', date: '2026-08-20', amountDA: 9_000 })], '2026-08-04')
    expect(skewed.maxDayDA).toBe(9_000)
    expect(monthToDate([], '2026-08-04').maxDayDA).toBe(0)
  })

  it('does not mutate or reorder the transactions it was handed', () => {
    const input = [
      tx({ id: 'a', date: '2026-08-04' }),
      tx({ id: 'b', date: '2026-08-01' }),
    ]
    const snapshot = JSON.stringify(input)
    monthToDate(input, '2026-08-04')
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

/**
 * THE WINDOW, AND THE WORK IT DOES NOT DO.
 *
 * ArchiveCard renders WINDOW_DAYS (3) day groups at rest, and the derivation
 * behind them runs on every logged purchase. Materialising the whole record to
 * show three days of it made that per-log work proportional to the user's
 * history — see ledgerWindow's own note for the measurement. These cases pin
 * both halves: the window must be the SAME days the unbounded form produces,
 * and it must not build the ones it does not return.
 */
describe('ledgerWindow', () => {
  const spread = (days: number, perDay = 3): Transaction[] =>
    Array.from({ length: days * perDay }, (_, i) =>
      tx({
        id: `t${i}`,
        date: `2026-0${1 + Math.floor(Math.floor(i / perDay) / 28)}-${String(
          (Math.floor(i / perDay) % 28) + 1,
        ).padStart(2, '0')}`,
        amountDA: 100 + i,
      }),
    )

  it('returns exactly the head of the unbounded grouping, day for day', () => {
    const rows = spread(40)
    const whole = groupTransactionsByDay(rows, '2026-02-20')
    for (const limit of [0, 1, 3, 7, 39, 40, 41, Number.POSITIVE_INFINITY]) {
      const w = ledgerWindow(rows, '2026-02-20', limit)
      expect(`${limit}: ${JSON.stringify(w.days)}`).toBe(
        `${limit}: ${JSON.stringify(whole.slice(0, limit))}`,
      )
    }
  })

  it('counts every day the record holds, whatever the window shows', () => {
    const rows = spread(40)
    // The number the archive discloses ("Showing 3 of 40 days.") and the number
    // its expand label promises. It may never be read off days.length — that is
    // the one the window deliberately caps.
    for (const limit of [0, 1, 3, 40, Number.POSITIVE_INFINITY]) {
      expect(ledgerWindow(rows, '2026-02-20', limit).totalDays).toBe(40)
    }
  })

  it('defaults to the whole record, so groupTransactionsByDay is unchanged', () => {
    const rows = spread(12)
    expect(ledgerWindow(rows, '2026-02-20').days).toEqual(
      groupTransactionsByDay(rows, '2026-02-20'),
    )
  })

  it('does no per-day work for a day it does not return', () => {
    // The point of the whole change, asserted mechanically rather than timed: a
    // day that is outside the window must never have its rows summed. A getter
    // on `amountDA` records every read, and the only reader is the spentDA fold
    // (the grouping pass touches `date` alone).
    const read = new Set<string>()
    const rows: Transaction[] = ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04'].map(
      (date, i) => {
        const row = tx({ id: `t${i}`, date }) as Transaction & { amountDA: number }
        let amount = 100 + i
        Object.defineProperty(row, 'amountDA', {
          get: () => {
            read.add(date)
            return amount
          },
          set: (v: number) => {
            amount = v
          },
          enumerable: true,
          configurable: true,
        })
        return row
      },
    )
    const w = ledgerWindow(rows, '2026-02-04', 2)
    expect(w.days.map((d) => d.date)).toEqual(['2026-02-04', '2026-02-03'])
    expect([...read].sort()).toEqual(['2026-02-03', '2026-02-04'])
  })

  it('orders a skewed future day after every real one, windowed or not', () => {
    // Same both-ends bound the unbounded form applies — a device with a fast
    // clock must not be able to pin a row into the first window forever.
    const rows = [
      tx({ id: 'ahead', date: '2026-12-25' }),
      tx({ id: 'now', date: '2026-08-04' }),
      tx({ id: 'old', date: '2026-08-01' }),
    ]
    const w = ledgerWindow(rows, '2026-08-04', 2)
    expect(w.days.map((d) => d.date)).toEqual(['2026-08-04', '2026-08-01'])
    expect(w.totalDays).toBe(3)
  })

  it('leaves the caller’s array untouched at every window size', () => {
    const rows = spread(6)
    const snapshot = JSON.stringify(rows)
    ledgerWindow(rows, '2026-01-06', 2)
    ledgerWindow(rows, '2026-01-06')
    expect(JSON.stringify(rows)).toBe(snapshot)
  })
})

describe('weekToDate', () => {
  // Wed 5 Aug 2026 is the frozen "today" for this block; the window is the
  // seven days 30 Jul .. 5 Aug inclusive.
  const TODAY = '2026-08-05'

  it('counts the days it has rows on — a count, never a run (Trust Rules 3 and 6)', () => {
    // THE ASSERTION THAT KEEPS THIS FROM BEING A STREAK. Two logged days with
    // five empty ones between them are two logged days. Nothing resets,
    // nothing breaks, and the gap is not an event the derivation can see.
    const gapped = weekToDate(
      [tx({ id: 'a', date: '2026-07-30' }), tx({ id: 'b', date: TODAY })],
      TODAY,
    )
    const consecutive = weekToDate(
      [tx({ id: 'a', date: '2026-08-04' }), tx({ id: 'b', date: TODAY })],
      TODAY,
    )
    expect(gapped.daysLogged).toBe(2)
    expect(consecutive.daysLogged).toBe(2)
    // …and the two windows are indistinguishable on every other figure too, so
    // no caller can reconstruct a run from what it is handed.
    expect(gapped.spentDA).toBe(consecutive.spentDA)
    expect(Object.keys(gapped).sort()).toEqual(
      ['daysLogged', 'repeats', 'resistedDA', 'spentDA'],
    )
  })

  it('counts one day once, however many rows land on it', () => {
    const w = weekToDate(
      [
        tx({ id: 'a', date: TODAY, amountDA: 100 }),
        tx({ id: 'b', date: TODAY, amountDA: 250 }),
        tx({ id: 'c', date: TODAY, amountDA: 400 }),
      ],
      TODAY,
    )
    expect(w.daysLogged).toBe(1)
    expect(w.spentDA).toBe(750)
  })

  it('bounds the window at BOTH ends', () => {
    // Seven days ending today, inclusive. A future-dated row (clock skew, a
    // hand-edited payload) must not be able to sit in the window forever, and
    // the eighth day back is out — the same discipline deriveHealthInputs and
    // monthToDate apply to theirs.
    const rows = [
      tx({ id: 'ahead', date: '2026-08-06', amountDA: 9_000 }),
      tx({ id: 'edge', date: '2026-07-30', amountDA: 500 }),
      tx({ id: 'stale', date: '2026-07-29', amountDA: 9_000 }),
    ]
    const w = weekToDate(rows, TODAY)
    expect(w.daysLogged).toBe(1)
    expect(w.spentDA).toBe(500)
  })

  it('keeps resists out of spend, out of the repeats, and in their own total', () => {
    const w = weekToDate(
      [
        tx({ id: 'a', date: TODAY, category: 'Food', amountDA: 300 }),
        tx({ id: 'b', date: TODAY, category: 'Food', amountDA: 200 }),
        tx({ id: 'r1', date: TODAY, category: 'Food', amountDA: 4_000, resistedImpulse: true }),
        tx({ id: 'r2', date: TODAY, category: 'Food', amountDA: 1_000, resistedImpulse: true }),
      ],
      TODAY,
    )
    // Money that did not leave is not spend, and a category's total is money
    // that left. Folding the resists in would report Food as costing 5,500.
    expect(w.spentDA).toBe(500)
    expect(w.resistedDA).toBe(5_000)
    expect(w.repeats).toEqual([{ category: 'Food', rows: 2, totalDA: 500 }])
  })

  it('lets a resist with no typed amount count as a row and contribute nothing', () => {
    // Matches resistedThisMonthDA exactly: the row is a resist for XP and for
    // Impulse Control, it just carries no dinars.
    const w = weekToDate(
      [tx({ id: 'r', date: TODAY, amountDA: 0, resistedImpulse: true })],
      TODAY,
    )
    expect(w.daysLogged).toBe(1)
    expect(w.resistedDA).toBe(0)
    expect(w.spentDA).toBe(0)
    expect(w.repeats).toEqual([])
  })

  it('reports a repeat as a SUM of its rows, and nothing else', () => {
    const w = weekToDate(
      [
        tx({ id: 'a', date: TODAY, category: 'Food', amountDA: 480 }),
        tx({ id: 'b', date: '2026-08-04', category: 'Food', amountDA: 520 }),
        tx({ id: 'c', date: '2026-08-03', category: 'Food', amountDA: 920 }),
      ],
      TODAY,
    )
    // 480 + 520 + 920 — not a mean (640), not a per-day rate, not a projection.
    expect(w.repeats).toEqual([{ category: 'Food', rows: 3, totalDA: 1_920 }])
  })

  it('names nothing that happened once', () => {
    const w = weekToDate(
      [
        tx({ id: 'a', date: TODAY, category: 'Food', amountDA: 100 }),
        tx({ id: 'b', date: TODAY, category: 'Transport', amountDA: 6_000 }),
      ],
      TODAY,
    )
    // A 6,000 DA one-off is bigger than the 100 DA row beside it and is still
    // not a repeat: the block is about what happened more than once, and
    // "biggest" is a verdict this derivation does not compute.
    expect(w.repeats).toEqual([])
  })

  it('orders repeats by total, then rows, then name — deterministically', () => {
    const rows = [
      tx({ id: 'f1', date: TODAY, category: 'Food', amountDA: 500 }),
      tx({ id: 'f2', date: TODAY, category: 'Food', amountDA: 500 }),
      tx({ id: 't1', date: TODAY, category: 'Transport', amountDA: 900 }),
      tx({ id: 't2', date: TODAY, category: 'Transport', amountDA: 900 }),
      // Same total as Food, fewer rows — the tiebreak's first step.
      tx({ id: 'c1', date: TODAY, category: 'Cafe', amountDA: 600 }),
      tx({ id: 'c2', date: TODAY, category: 'Cafe', amountDA: 400 }),
    ]
    expect(weekToDate(rows, TODAY).repeats.map((r) => r.category)).toEqual([
      'Transport',
      'Cafe',
      'Food',
    ])
    // The same answer from a reordered input: a fact that reorders under the
    // reader because a Map's insertion order changed is a bug.
    expect(weekToDate([...rows].reverse(), TODAY).repeats.map((r) => r.category)).toEqual([
      'Transport',
      'Cafe',
      'Food',
    ])
  })

  it('caps the repeats at the limit the surface can print', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].flatMap((c, i) => [
      tx({ id: `${c}1`, date: TODAY, category: c, amountDA: (i + 1) * 100 }),
      tx({ id: `${c}2`, date: TODAY, category: c, amountDA: (i + 1) * 100 }),
    ])
    expect(weekToDate(rows, TODAY).repeats).toHaveLength(WEEK_REPEAT_LIMIT)
    expect(weekToDate(rows, TODAY).repeats.map((r) => r.category)).toEqual(['E', 'D', 'C'])
    // The limit is a parameter, so a wider surface never needs a second
    // derivation with a different rule inside it.
    expect(weekToDate(rows, TODAY, 5)).toHaveProperty('repeats.length', 5)
  })

  it('is empty when the week is, and says so with zeroes rather than absences', () => {
    // The SHAPE is constant — a caller can always read four fields — and the
    // surface is what decides that zero prints as a sentence, not a numeral.
    expect(weekToDate([], TODAY)).toEqual({
      daysLogged: 0,
      spentDA: 0,
      resistedDA: 0,
      repeats: [],
    })
  })

  it('takes transactions and a day, and nothing else (Trust Rule 1)', () => {
    // Structural, like the health engine's own two-track assertion: there is no
    // parameter an XP total, a level, an achievement or a budget could arrive
    // through, so engagement cannot reach this derivation by any later edit
    // that does not change its signature. Two required arguments — Function
    // .length stops at the first default, and the third is the print limit.
    expect(weekToDate.length).toBe(2)
    // The result carries no engagement field either, so nothing can leak out
    // of it into a surface that renders it whole.
    const shape = weekToDate([tx({ id: 'a', date: TODAY })], TODAY)
    expect(JSON.stringify(shape)).not.toMatch(/xp|level|streak|achievement|badge/i)
  })

  it('leaves the caller’s array untouched', () => {
    const rows = [
      tx({ id: 'a', date: TODAY, category: 'Food' }),
      tx({ id: 'b', date: '2026-08-04', category: 'Food' }),
    ]
    const snapshot = JSON.stringify(rows)
    weekToDate(rows, TODAY)
    expect(JSON.stringify(rows)).toBe(snapshot)
  })

  it('reads seven days, and says which seven in a constant', () => {
    // The window's length is a named constant because the card prints it
    // ("Last 7 days") — a surface that types its own 7 is a surface that keeps
    // saying 7 after the window changes.
    expect(WEEK_DAYS).toBe(7)
    // One row on each of 27 Jul .. 5 Aug — ten consecutive days. Exactly
    // WEEK_DAYS of them (30 Jul .. 5 Aug) are inside the window.
    const dates = [
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
    ]
    const spread = dates.map((date, i) => tx({ id: `d${i}`, date, amountDA: 100 }))
    expect(weekToDate(spread, TODAY).daysLogged).toBe(WEEK_DAYS)
    expect(weekToDate(spread, TODAY).spentDA).toBe(WEEK_DAYS * 100)
  })

  /**
   * CONSTRAINT: the cost is the WINDOW's, not the RECORD's.
   *
   * This derivation re-runs on every logged purchase over every row the user
   * has ever entered, for a block that shows seven days. It used to decide
   * membership with `daysBetween(t.date, today)` — two `dayIndex` calls per
   * row, each one a `Date.UTC` — which made it the most expensive derivation in
   * a logged purchase at every size measured: 4.236 ms over 5,000 rows against
   * 0.424 ms for the five other whole-ledger derivations in the same render
   * COMBINED (see the note above weekToDate for the full table and the tree).
   *
   * A timing assertion would be flaky, so the invariant is asserted by COUNTING
   * THE WORK instead: `dayIndex` is the only thing in this module that calls
   * `Date.UTC`, so the call count is a direct measure of how much day
   * arithmetic the scan performed. Under the old form it was 2 per row and grew
   * without bound; under the string window it is a constant, and the constant
   * being IDENTICAL for 12 rows and 5,000 is the property — not the constant's
   * value, which is an implementation detail the test deliberately does not pin.
   */
  it('costs the same over 5,000 rows as over twelve — the window bounds the scan', () => {
    const twelve = Array.from({ length: 12 }, (_, i) =>
      tx({ id: `s${i}`, date: `2026-08-0${(i % 5) + 1}`, amountDA: 100 }),
    )
    // 5,000 rows over 625 days, only the newest seven of which are in range —
    // the shape the archive's own window measurement uses.
    const many = Array.from({ length: 5000 }, (_, i) =>
      tx({
        id: `m${i}`,
        date: addDaysISO(TODAY, -Math.floor(i / 8)),
        amountDA: 100,
        category: i % 2 === 0 ? 'Food' : 'Transport',
      }),
    )
    const spy = vi.spyOn(Date, 'UTC')
    weekToDate(twelve, TODAY)
    const small = spy.mock.calls.length
    spy.mockClear()
    weekToDate(many, TODAY)
    const large = spy.mock.calls.length
    spy.mockRestore()
    expect(large).toBe(small)

    // …and the answer is still the right one, which is the half a cost test
    // must never be allowed to drop: 8 rows a day over the seven days in range.
    const w = weekToDate(many, TODAY)
    expect(w.daysLogged).toBe(WEEK_DAYS)
    expect(w.spentDA).toBe(WEEK_DAYS * 8 * 100)
    expect(w.repeats.map((r) => r.rows)).toEqual([28, 28])
  })

  it('excludes a row outside the window whatever its distance', () => {
    // The bound is lexicographic now rather than arithmetic, so the two edges
    // that have to keep holding are the ones where string order and calendar
    // order could plausibly be argued to disagree: a month rollover backwards
    // (the window opens on 30 Jul for a 5 Aug today) and a year rollover
    // forwards. Both are exact for validated day keys, and this pins it.
    const rows = [
      tx({ id: 'in-oldest', date: '2026-07-30', amountDA: 1 }),
      tx({ id: 'out-by-one', date: '2026-07-29', amountDA: 1000 }),
      tx({ id: 'out-last-year', date: '2025-12-31', amountDA: 1000 }),
      tx({ id: 'in-today', date: TODAY, amountDA: 2 }),
      tx({ id: 'out-tomorrow', date: '2026-08-06', amountDA: 1000 }),
      tx({ id: 'out-next-year', date: '2027-01-01', amountDA: 1000 }),
    ]
    const w = weekToDate(rows, TODAY)
    expect(w.daysLogged).toBe(2)
    expect(w.spentDA).toBe(3)
  })
})
