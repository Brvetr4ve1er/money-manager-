import { describe, it, expect } from 'vitest'
import { dayLabel, groupTransactionsByDay } from './ledger.ts'
import type { Transaction } from '../state/store.ts'

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
