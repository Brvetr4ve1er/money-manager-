import { describe, it, expect } from 'vitest'
import {
  defaultState,
  sanitizeState,
  todayISO,
  daysAgoISO,
  rollQuests,
} from './store.ts'

describe('todayISO', () => {
  it('uses the local calendar day, not UTC', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})

describe('daysAgoISO', () => {
  it('matches todayISO at zero days', () => {
    expect(daysAgoISO(0)).toBe(todayISO())
  })
  it('sorts strictly before today (usable as a window cutoff)', () => {
    expect(daysAgoISO(30) < todayISO()).toBe(true)
  })
})

describe('rollQuests', () => {
  it('returns the same state object when the quest day matches', () => {
    const s = defaultState()
    expect(rollQuests(s, s.questsDate)).toBe(s)
  })
  it('resets quests when the day changed (tab open past midnight)', () => {
    const s = defaultState()
    s.questsDate = '2026-07-31'
    s.quests = s.quests.map((q) => ({ ...q, done: true }))
    const rolled = rollQuests(s, '2026-08-01')
    expect(rolled.questsDate).toBe('2026-08-01')
    expect(rolled.quests.every((q) => !q.done)).toBe(true)
    // Everything else is untouched.
    expect(rolled.xp).toBe(s.xp)
    expect(rolled.transactions).toBe(s.transactions)
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

  it('clamps a negative xpIntoLevel to 0', () => {
    const state = sanitizeState({ xp: { level: 2, xpIntoLevel: -50, totalXp: 100 } })
    expect(state.xp).toEqual({ level: 2, xpIntoLevel: 0, totalXp: 100 })
  })

  it('clamps an oversized xpIntoLevel below the level requirement', () => {
    const state = sanitizeState({ xp: { level: 3, xpIntoLevel: 1e9, totalXp: 400 } })
    // xpForLevel(3) = 200, so the bar can never render permanently full.
    expect(state.xp.xpIntoLevel).toBe(199)
    expect(state.xp.level).toBe(3)
  })

  it('floors a fractional level and clamps negative totalXp', () => {
    const state = sanitizeState({ xp: { level: 1.5, xpIntoLevel: 10, totalXp: -5 } })
    expect(state.xp).toEqual({ level: 1, xpIntoLevel: 10, totalXp: 0 })
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
