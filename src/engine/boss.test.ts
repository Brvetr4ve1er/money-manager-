import { describe, it, expect } from 'vitest'
import {
  addDaysISO,
  bossBattle,
  bossGrantId,
  completedWeekVictory,
  impulseSpendInWeek,
  weekStartISO,
} from './boss.ts'
import type { Transaction } from '../state/store.ts'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: Math.random().toString(36).slice(2),
  amountDA: 1_000,
  category: 'Fun',
  date: '2026-08-12',
  ...over,
})

describe('weekStartISO (Mon–Sun local weeks)', () => {
  it('maps every day of a week to its Monday', () => {
    expect(weekStartISO('2026-08-10')).toBe('2026-08-10') // Monday → itself
    expect(weekStartISO('2026-08-12')).toBe('2026-08-10') // Wednesday
    expect(weekStartISO('2026-08-15')).toBe('2026-08-10') // Saturday
    expect(weekStartISO('2026-08-16')).toBe('2026-08-10') // Sunday closes the week
  })
  it('crosses month boundaries', () => {
    expect(weekStartISO('2026-08-02')).toBe('2026-07-27') // Sunday, week began in July
  })
  it('crosses year boundaries', () => {
    expect(weekStartISO('2026-01-01')).toBe('2025-12-29') // Thursday, week began in 2025
  })
})

describe('addDaysISO', () => {
  it('steps across month and year boundaries in both directions', () => {
    expect(addDaysISO('2026-08-10', -7)).toBe('2026-08-03')
    expect(addDaysISO('2026-07-27', 7)).toBe('2026-08-03')
    expect(addDaysISO('2025-12-29', 7)).toBe('2026-01-05')
  })
})

describe('impulseSpendInWeek', () => {
  it('sums only rows inside the Mon–Sun window (Monday and Sunday inclusive)', () => {
    const txs = [
      tx({ amountDA: 100, date: '2026-08-09' }), // Sunday before — out
      tx({ amountDA: 200, date: '2026-08-10' }), // Monday — in
      tx({ amountDA: 300, date: '2026-08-16' }), // Sunday — in
      tx({ amountDA: 400, date: '2026-08-17' }), // next Monday — out
    ]
    expect(impulseSpendInWeek(txs, '2026-08-10')).toBe(500)
  })
  it('excludes essential categories — planned spending never feeds the monster', () => {
    const txs = [
      tx({ amountDA: 900, category: 'Food' }),
      tx({ amountDA: 900, category: 'Bills' }),
      tx({ amountDA: 900, category: 'Health' }),
      tx({ amountDA: 250, category: 'Transport' }),
      tx({ amountDA: 350, category: 'Other' }),
    ]
    expect(impulseSpendInWeek(txs, '2026-08-10')).toBe(600)
  })
  it('counts an explicitly flagged impulse buy even in an essential category', () => {
    const txs = [tx({ amountDA: 700, category: 'Food', impulseFlagged: true })]
    expect(impulseSpendInWeek(txs, '2026-08-10')).toBe(700)
  })
  it('never counts resisted rows — nothing was spent, whatever the flags say', () => {
    const txs = [
      tx({ amountDA: 800, resistedImpulse: true }),
      tx({ amountDA: 800, resistedImpulse: true, impulseFlagged: true }),
    ]
    expect(impulseSpendInWeek(txs, '2026-08-10')).toBe(0)
  })
})

describe('bossBattle', () => {
  it('sizes up honestly with no data at all — no fake opponent number', () => {
    expect(bossBattle([], '2026-08-12')).toEqual({ kind: 'sizing-up', weekStart: '2026-08-10' })
  })
  it('sizes up when all logged data is inside the current week (no last week yet)', () => {
    const txs = [tx({ date: '2026-08-11' })]
    expect(bossBattle(txs, '2026-08-12').kind).toBe('sizing-up')
  })
  it('sizes up when last week holds no logged rows — an unlogged week is unknown, not zero', () => {
    const txs = [tx({ date: '2026-07-30' })] // two weeks back only
    expect(bossBattle(txs, '2026-08-12').kind).toBe('sizing-up')
  })
  it('starts the battle once last week holds logged data, with both totals', () => {
    const txs = [
      tx({ amountDA: 6_000, date: '2026-08-05' }), // last week
      tx({ amountDA: 1_500, date: '2026-08-11' }), // this week
      tx({ amountDA: 900, category: 'Food', date: '2026-08-12' }), // essential — excluded
    ]
    expect(bossBattle(txs, '2026-08-12')).toEqual({
      kind: 'battle',
      weekStart: '2026-08-10',
      prevWeekStart: '2026-08-03',
      thisWeekSpend: 1_500,
      lastWeekSpend: 6_000,
    })
  })
  it('a resist row alone proves last week was logged (battle with a 0 DA opponent)', () => {
    const txs = [tx({ amountDA: 0, resistedImpulse: true, date: '2026-08-05' })]
    const battle = bossBattle(txs, '2026-08-12')
    expect(battle.kind).toBe('battle')
    expect(battle.kind === 'battle' && battle.lastWeekSpend).toBe(0)
  })
})

describe('completedWeekVictory', () => {
  const win = [
    tx({ amountDA: 6_000, date: '2026-07-29' }), // week before: Jul 27 – Aug 2
    tx({ amountDA: 4_000, date: '2026-08-05' }), // completed week: Aug 3 – 9
  ]
  it('detects a won week any day of the following week', () => {
    const expected = { weekStart: '2026-08-03', spend: 4_000, targetSpend: 6_000 }
    expect(completedWeekVictory(win, '2026-08-10')).toEqual(expected) // Monday
    expect(completedWeekVictory(win, '2026-08-16')).toEqual(expected) // Sunday
  })
  it('requires strictly less spend — a tie is not a win', () => {
    const txs = [
      tx({ amountDA: 5_000, date: '2026-07-29' }),
      tx({ amountDA: 5_000, date: '2026-08-05' }),
    ]
    expect(completedWeekVictory(txs, '2026-08-12')).toBeNull()
  })
  it('is null when the completed week spent more', () => {
    const txs = [
      tx({ amountDA: 3_000, date: '2026-07-29' }),
      tx({ amountDA: 5_000, date: '2026-08-05' }),
    ]
    expect(completedWeekVictory(txs, '2026-08-12')).toBeNull()
  })
  it('never rewards an absent week — zero spend without logged rows is not a win', () => {
    const txs = [tx({ amountDA: 6_000, date: '2026-07-29' })] // nothing in Aug 3–9
    expect(completedWeekVictory(txs, '2026-08-12')).toBeNull()
  })
  it('is null when the opponent week had no logged data (no real target number)', () => {
    const txs = [tx({ amountDA: 4_000, date: '2026-08-05' })] // nothing in Jul 27 – Aug 2
    expect(completedWeekVictory(txs, '2026-08-12')).toBeNull()
  })
  it('lapses unclaimed wins — only the most recently completed week is evaluated', () => {
    // Won Aug 3–9 but next opened the app on Aug 18: the completed week is now
    // Aug 10–16, which holds no rows, so nothing is claimable (and nothing is
    // lost — non-punitive by construction).
    expect(completedWeekVictory(win, '2026-08-18')).toBeNull()
  })
  it('essential-category rows count as showing up but not as spend', () => {
    const txs = [
      tx({ amountDA: 6_000, date: '2026-07-29' }),
      tx({ amountDA: 9_000, category: 'Food', date: '2026-08-05' }), // logged, excluded
    ]
    expect(completedWeekVictory(txs, '2026-08-12')).toEqual({
      weekStart: '2026-08-03',
      spend: 0,
      targetSpend: 6_000,
    })
  })
})

describe('bossGrantId', () => {
  it('is deterministic per week — the once-per-week dedupe key', () => {
    expect(bossGrantId('2026-08-03')).toBe('boss:2026-08-03')
  })
})

/**
 * ONE PASS, AND THE SAME ANSWER.
 *
 * useBossBattle recomputes both derivations on every transactions change, so
 * every logged purchase paid for them. They used to walk the whole ledger seven
 * times between them — a `hasLogInWeek` guard plus an `impulseSpendInWeek` per
 * week, each a separate traversal, two of them allocating a throwaway array the
 * length of the record to sum at most seven days of it. tallyWeeks does both
 * questions for both weeks in one walk.
 *
 * The pass count is asserted mechanically rather than timed: every array method
 * that traverses is trapped on the way out, so a future edit that reaches for a
 * second `.filter()` fails here instead of quietly costing a scan.
 */
describe('the boss engine walks the ledger once per derivation', () => {
  const TRAVERSALS = ['filter', 'some', 'reduce', 'map', 'forEach', 'find', 'slice']

  /** Counts whole-ledger traversals: `for…of` takes Symbol.iterator, and every
      array method that walks is named above. */
  function counted(rows: Transaction[]): { rows: Transaction[]; passes: () => number } {
    let n = 0
    const proxy = new Proxy(rows, {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator || (typeof prop === 'string' && TRAVERSALS.includes(prop))) {
          n += 1
        }
        return Reflect.get(target, prop, receiver)
      },
    })
    return { rows: proxy, passes: () => n }
  }

  const ledger = [
    tx({ amountDA: 5_000, date: '2026-07-29' }),
    tx({ amountDA: 1_000, category: 'Food', date: '2026-07-30' }),
    tx({ amountDA: 3_000, date: '2026-08-05' }),
    tx({ amountDA: 2_000, date: '2026-08-06', resistedImpulse: true }),
    tx({ amountDA: 900, category: 'Bills', date: '2026-08-07', impulseFlagged: true }),
    tx({ amountDA: 700, date: '2026-08-12' }),
  ]

  it('reads the whole record exactly once for the card', () => {
    const c = counted(ledger)
    expect(bossBattle(c.rows, '2026-08-12')).toEqual(bossBattle(ledger, '2026-08-12'))
    expect(c.passes()).toBe(1)
  })

  it('reads the whole record exactly once for the victory check', () => {
    const c = counted(ledger)
    expect(completedWeekVictory(c.rows, '2026-08-12')).toEqual(
      completedWeekVictory(ledger, '2026-08-12'),
    )
    expect(c.passes()).toBe(1)
  })

  it('still short-circuits to sizing-up on the same evidence, in that one pass', () => {
    // Nothing in Aug 3–9: the opponent number is unknown, so there is no battle.
    const thisWeekOnly = [tx({ amountDA: 4_000, date: '2026-08-12' })]
    const c = counted(thisWeekOnly)
    expect(bossBattle(c.rows, '2026-08-12')).toEqual({
      kind: 'sizing-up',
      weekStart: '2026-08-10',
    })
    expect(c.passes()).toBe(1)
  })

  it('gives the same answers as the per-question form on a randomised record', () => {
    // The tally is a rewrite of four independent window questions into one
    // loop, so the property that matters is that nothing about the ANSWERS
    // moved. Re-derived here from the primitive that did not change.
    const cats = ['Food', 'Transport', 'Fun', 'Bills', 'Health', 'Other']
    let seed = 20260812
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    for (let trial = 0; trial < 40; trial += 1) {
      const rows = Array.from({ length: rand(60) }, () =>
        tx({
          amountDA: 100 + rand(9_000),
          category: cats[rand(cats.length)],
          date: addDaysISO('2026-08-12', -rand(30)),
          resistedImpulse: rand(5) === 0,
          impulseFlagged: rand(4) === 0,
        }),
      )
      const weekStart = weekStartISO('2026-08-12')
      const prevWeekStart = addDaysISO(weekStart, -7)
      const beforeWeekStart = addDaysISO(prevWeekStart, -7)
      const hasLog = (w: string) =>
        rows.some((t) => t.date >= w && t.date < addDaysISO(w, 7))

      const battle = bossBattle(rows, '2026-08-12')
      expect(`${trial}: ${JSON.stringify(battle)}`).toBe(
        `${trial}: ${JSON.stringify(
          hasLog(prevWeekStart)
            ? {
                kind: 'battle',
                weekStart,
                prevWeekStart,
                thisWeekSpend: impulseSpendInWeek(rows, weekStart),
                lastWeekSpend: impulseSpendInWeek(rows, prevWeekStart),
              }
            : { kind: 'sizing-up', weekStart },
        )}`,
      )

      const spend = impulseSpendInWeek(rows, prevWeekStart)
      const target = impulseSpendInWeek(rows, beforeWeekStart)
      const expected =
        hasLog(prevWeekStart) && hasLog(beforeWeekStart) && spend < target
          ? { weekStart: prevWeekStart, spend, targetSpend: target }
          : null
      expect(`${trial}: ${JSON.stringify(completedWeekVictory(rows, '2026-08-12'))}`).toBe(
        `${trial}: ${JSON.stringify(expected)}`,
      )
    }
  })
})
