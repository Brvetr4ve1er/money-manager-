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
