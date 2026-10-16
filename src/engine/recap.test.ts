import { describe, it, expect } from 'vitest'
import { activeMonths, ceremonyDue, daysLeftInMonth, monthRecap, previousMonth } from './recap.ts'
import { defaultState, type AppState, type Transaction } from '../state/store.ts'

const tx = (id: string, date: string, amountDA: number, over: Partial<Transaction> = {}): Transaction => ({
  id,
  amountDA,
  category: 'Food',
  date,
  ...over,
})
const withState = (over: Partial<AppState>): AppState => ({ ...defaultState(), ...over })

describe('monthRecap', () => {
  it('sums spend, top categories and change vs the month before', () => {
    const s = withState({
      transactions: [
        tx('a', '2026-09-03', 1000),
        tx('b', '2026-10-02', 600, { category: 'Fun' }),
        tx('c', '2026-10-05', 300),
        tx('d', '2026-10-05', 100, { category: 'Transport' }),
        tx('r', '2026-10-06', 2000, { resistedImpulse: true }),
      ],
    })
    const r = monthRecap(s, '2026-10')
    expect(r.spentDA).toBe(1000)
    expect(r.logs).toBe(3)
    expect(r.topCategories.map((c) => c.category)).toEqual(['Fun', 'Food', 'Transport'])
    expect(r.deltaDA).toBe(0)
    expect(r.keptDA).toBe(2000)
    expect(r.resists).toBe(1)
    expect(r.loggedDays).toBe(3)
    expect(r.highlights).toContain('2,000 DA kept, not spent.')
  })

  it('counts paid bills, jar savings and jars that crossed their target that month', () => {
    const now = '2026-10-01T00:00:00.000Z'
    const s = withState({
      money: {
        ...defaultState().money,
        payments: [
          { id: 'p', obligationId: 'o', due: '2026-10-05', paidOn: '2026-10-05', amount: 1, currency: 'DA', txId: 't', void: false, updatedAt: now },
          { id: 'v', obligationId: 'o', due: '2026-11-05', paidOn: '2026-10-06', amount: 1, currency: 'DA', txId: 't2', void: true, updatedAt: now },
        ],
        jars: [{ id: 'j', name: 'Eid', emoji: '🌙', target: 5000, targetDate: null, locked: false, archived: false, updatedAt: now }],
        jarMoves: [
          { id: 'm1', jarId: 'j', amount: 3000, date: '2026-09-20', kind: 'topup' },
          { id: 'm2', jarId: 'j', amount: 2500, date: '2026-10-10', kind: 'payday' },
          { id: 'm3', jarId: 'j', amount: 400, date: '2026-10-11', kind: 'cover' },
        ],
      },
    })
    const r = monthRecap(s, '2026-10')
    expect(r.billsPaid).toBe(1)
    expect(r.savedToJarsDA).toBe(2500)
    expect(r.jarsReached).toBe(1)
  })

  it('a quiet month still gets a kind line, and no delta without a previous month', () => {
    const r = monthRecap(defaultState(), '2026-10')
    expect(r.highlights).toEqual(['A quiet month. Quiet months count too.'])
    expect(r.deltaDA).toBeNull()
  })
})

describe('ceremony timing and helpers', () => {
  it('offers last month only in the first week, and only if it had activity', () => {
    const s = withState({ transactions: [tx('a', '2026-09-28', 100)] })
    expect(ceremonyDue(s, '2026-10-03')).toBe('2026-09')
    expect(ceremonyDue(s, '2026-10-08')).toBeNull()
    expect(ceremonyDue(defaultState(), '2026-10-03')).toBeNull()
  })
  it('lists active months newest first, always including this month', () => {
    const s = withState({ transactions: [tx('a', '2026-08-01', 1), tx('b', '2026-09-01', 1)] })
    expect(activeMonths(s, '2026-10-15')).toEqual(['2026-10', '2026-09', '2026-08'])
  })
  it('handles month and year boundaries', () => {
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(daysLeftInMonth('2026-02-27')).toBe(2)
  })
})
