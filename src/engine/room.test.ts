import { describe, it, expect } from 'vitest'
import { roomPieces, waitingFor } from './room.ts'
import { defaultState, type AppState } from '../state/store.ts'

const iso = (d: number) => new Date(2026, 9, d, 9).toISOString()
const base = (): AppState => {
  const s = defaultState()
  s.money.accounts = [{ id: 'c', name: 'Cash', currency: 'DA', anchorBalance: 50_000, anchorAt: iso(1), archived: false, updatedAt: iso(1) }]
  return s
}

describe('waitingFor', () => {
  it('lists late and due-soon bills gently, and a stale balance', () => {
    const s = base()
    s.money.obligations = [
      { id: 'g', name: 'Gym', amount: 3000, currency: 'DA', kind: 'bill', cadence: 'monthly', firstDue: '2026-10-10', accountId: 'c', installment: null, nextStep: '', archived: false, updatedAt: iso(1) },
      { id: 'n', name: 'Internet', amount: 3000, currency: 'DA', kind: 'bill', cadence: 'monthly', firstDue: '2026-10-17', accountId: 'c', installment: null, nextStep: '', archived: false, updatedAt: iso(1) },
    ]
    const items = waitingFor(s, '2026-10-16', Date.now())
    expect(items.map((i) => i.id)).toEqual(['late:g', 'soon:n', 'confirm:c'])
    expect(items[0].text).toContain('relight')
    expect(items[1].text).toContain('tomorrow')
  })
  it('is empty when nothing needs you', () => {
    const s = base()
    s.money.accounts[0].anchorAt = iso(15)
    expect(waitingFor(s, '2026-10-16', Date.now())).toEqual([])
  })
})

describe('roomPieces', () => {
  it('grows pieces from outcomes, not taps', () => {
    const s = base()
    s.money.jars = [{ id: 'e', name: 'Emergency', emoji: '🛟', target: 10_000, targetDate: null, locked: false, archived: false, updatedAt: iso(1) }]
    s.money.jarMoves = [{ id: 'm', jarId: 'e', amount: 12_000, date: '2026-10-02', kind: 'topup' }]
    s.profile = { monthlyIncome: 60_000, monthlyEssentials: 11_000, efBalance: null, debt: null, goal: null, savedDate: '2026-10-01' }
    const earned = Object.fromEntries(roomPieces(s, '2026-10-16').map((p) => [p.id, p.earned]))
    expect(earned).toMatchObject({ hearth: true, window: true, plant: true, cushion: true, books: false })
    expect(roomPieces(defaultState(), '2026-10-16').every((p) => !p.earned)).toBe(true)
  })
})
