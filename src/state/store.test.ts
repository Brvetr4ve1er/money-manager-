import { describe, it, expect } from 'vitest'
import { defaultState, sanitizeState, todayISO } from './store.ts'

describe('todayISO', () => {
  it('uses the local calendar day, not UTC', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})

describe('sanitizeState', () => {
  it('returns defaults for non-object payloads', () => {
    expect(sanitizeState(null)).toEqual(defaultState())
    expect(sanitizeState('corrupt')).toEqual(defaultState())
    expect(sanitizeState(42)).toEqual(defaultState())
  })

  it('fills missing fields from defaults instead of crashing later', () => {
    const state = sanitizeState({ muted: true })
    expect(state.muted).toBe(true)
    expect(state.xp).toEqual(defaultState().xp)
    expect(state.transactions).toEqual([])
    expect(state.quests.length).toBeGreaterThan(0)
  })

  it('drops malformed transactions but keeps valid ones', () => {
    const good = { id: 'a', amountDA: 1200, category: 'Food', date: '2026-08-01' }
    const state = sanitizeState({
      transactions: [good, { id: 'b' }, 'junk', { id: 'c', amountDA: NaN, category: 'Fun', date: 'x' }],
    })
    expect(state.transactions).toEqual([good])
  })

  it('rejects a malformed xp shape', () => {
    const state = sanitizeState({ xp: { level: 'high', xpIntoLevel: 3 } })
    expect(state.xp).toEqual(defaultState().xp)
  })

  it('rejects an unknown stage and non-numeric prevHealthScore', () => {
    const state = sanitizeState({ stage: 'volcano', prevHealthScore: 'fifty' })
    expect(state.stage).toBeNull()
    expect(state.prevHealthScore).toBeNull()
  })

  it('keeps a valid persisted snapshot', () => {
    const state = sanitizeState({
      prevHealthScore: 61.2,
      stage: 'bonfire',
      healthDate: '2026-07-31',
    })
    expect(state.prevHealthScore).toBe(61.2)
    expect(state.stage).toBe('bonfire')
    expect(state.healthDate).toBe('2026-07-31')
  })

  it('replaces a quest list with any malformed entry', () => {
    const state = sanitizeState({
      quests: [{ id: 'log', text: 'Log', xpAction: 'hack', done: false }],
    })
    expect(state.quests).toEqual(defaultState().quests)
  })
})
