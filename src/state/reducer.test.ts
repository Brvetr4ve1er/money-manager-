import { describe, it, expect } from 'vitest'
import { appReducer } from './reducer.ts'
import { defaultState, type Transaction } from './store.ts'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  amountDA: 1_200,
  category: 'Food',
  date: '2026-08-01',
  ...over,
})

describe('LOG_TX', () => {
  it('prepends the transaction and grants logExpense XP', () => {
    const next = appReducer(defaultState(), { type: 'LOG_TX', tx: tx() })
    expect(next.transactions).toHaveLength(1)
    expect(next.xp.totalXp).toBe(5)
  })
  it('grants resistImpulse XP for a resisted entry', () => {
    const next = appReducer(defaultState(), {
      type: 'LOG_TX',
      tx: tx({ amountDA: 0, resistedImpulse: true }),
    })
    expect(next.xp.totalXp).toBe(50)
  })
})

describe('COMPLETE_QUEST', () => {
  it('marks the quest done and grants its XP atomically', () => {
    const s = defaultState()
    const next = appReducer(s, { type: 'COMPLETE_QUEST', id: 'log' })
    expect(next.quests.find((q) => q.id === 'log')!.done).toBe(true)
    expect(next.xp.totalXp).toBe(5)
  })
  it('is a no-op on an already-done quest — rapid double dispatch cannot double-grant', () => {
    const s = defaultState()
    const once = appReducer(s, { type: 'COMPLETE_QUEST', id: 'log' })
    const twice = appReducer(once, { type: 'COMPLETE_QUEST', id: 'log' })
    expect(twice).toBe(once)
    expect(twice.xp.totalXp).toBe(5)
  })
  it('ignores an unknown quest id', () => {
    const s = defaultState()
    expect(appReducer(s, { type: 'COMPLETE_QUEST', id: 'nope' })).toBe(s)
  })
})

describe('ROLL_DAY', () => {
  it('returns the same state when both dates already match (render-free no-op)', () => {
    const s = { ...defaultState(), healthDate: '2026-08-01', questsDate: '2026-08-01' }
    expect(
      appReducer(s, { type: 'ROLL_DAY', today: '2026-08-01', healthScore: 61, healthStage: 'hearth' }),
    ).toBe(s)
  })
  it('snapshots health once per day and rolls quests on a new day', () => {
    const s = {
      ...defaultState(),
      healthDate: '2026-07-31',
      questsDate: '2026-07-31',
      quests: defaultState().quests.map((q) => ({ ...q, done: true })),
    }
    const next = appReducer(s, {
      type: 'ROLL_DAY',
      today: '2026-08-01',
      healthScore: 58.5,
      healthStage: 'hearth',
    })
    expect(next.healthDate).toBe('2026-08-01')
    expect(next.prevHealthScore).toBe(58.5)
    expect(next.stage).toBe('hearth')
    expect(next.questsDate).toBe('2026-08-01')
    expect(next.quests.every((q) => !q.done)).toBe(true)
  })
  it('rolls quests without re-snapshotting when only the quest day is stale', () => {
    const s = { ...defaultState(), healthDate: '2026-08-01', questsDate: '2026-07-31', prevHealthScore: 40 }
    const next = appReducer(s, {
      type: 'ROLL_DAY',
      today: '2026-08-01',
      healthScore: 99,
      healthStage: 'beacon',
    })
    expect(next.prevHealthScore).toBe(40) // snapshot untouched within the day
    expect(next.questsDate).toBe('2026-08-01')
  })
})

describe('TOGGLE_MUTE', () => {
  it('flips the muted flag', () => {
    const s = defaultState()
    expect(appReducer(s, { type: 'TOGGLE_MUTE' }).muted).toBe(true)
  })
})
