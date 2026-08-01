import { describe, it, expect } from 'vitest'
import {
  defaultState,
  mergeStates,
  sanitizeState,
  todayISO,
  rollQuests,
  type AppState,
  type Transaction,
} from './store.ts'

describe('todayISO', () => {
  it('uses the local calendar day, not UTC', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
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

  it('drops negative amounts that would reduce trailing spend and inflate SR/BA', () => {
    const good = { id: 'a', amountDA: 1200, category: 'Food', date: '2026-08-01' }
    const state = sanitizeState({
      transactions: [good, { id: 'b', amountDA: -50_000, category: 'Food', date: '2026-08-01' }],
    })
    expect(state.transactions).toEqual([good])
  })

  it('drops truthy-string impulse flags that would count as resisted in IC', () => {
    const base = { id: 'a', amountDA: 100, category: 'Fun', date: '2026-08-01' }
    const state = sanitizeState({
      transactions: [
        { ...base, id: 'b', resistedImpulse: 'no' },
        { ...base, id: 'c', impulseFlagged: 1 },
        { ...base, id: 'd', resistedImpulse: true, impulseFlagged: false },
      ],
    })
    expect(state.transactions.map((t) => t.id)).toEqual(['d'])
  })

  it('drops dates that cannot be compared against the YYYY-MM-DD cutoffs', () => {
    const base = { id: 'a', amountDA: 100, category: 'Food' }
    const state = sanitizeState({
      transactions: [
        { ...base, id: 'b', date: 'yesterday' },
        { ...base, id: 'c', date: '2026-08-01T10:00:00Z' },
        { ...base, id: 'd', date: '2026-08-01' },
      ],
    })
    expect(state.transactions.map((t) => t.id)).toEqual(['d'])
  })

  it('drops a non-string note but keeps a valid one', () => {
    const base = { id: 'a', amountDA: 100, category: 'Food', date: '2026-08-01' }
    const state = sanitizeState({
      transactions: [
        { ...base, id: 'b', note: 42 },
        { ...base, id: 'c', note: 'lunch' },
      ],
    })
    expect(state.transactions.map((t) => t.id)).toEqual(['c'])
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

  it('clamps an out-of-range prevHealthScore into [0, 100] instead of bricking render', () => {
    // A negative snapshot would smooth() to a negative score and crash stage
    // mapping at first render — permanently, until localStorage is cleared.
    expect(sanitizeState({ prevHealthScore: -500 }).prevHealthScore).toBe(0)
    expect(sanitizeState({ prevHealthScore: 1e6 }).prevHealthScore).toBe(100)
    expect(sanitizeState({ prevHealthScore: 61.2 }).prevHealthScore).toBe(61.2)
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

  it('re-stamps the verified flag from the canonical roster', () => {
    // The flag is a product invariant, not user data: an older persisted list
    // (or a hand-edited one) must not resurrect a tappable sim quest.
    const state = sanitizeState({
      quests: [
        { id: 'sim', text: 'Run one decision simulation', xpAction: 'runSimulation', done: false },
        { id: 'log', text: 'Log every purchase today', xpAction: 'logExpense', verified: true, done: false },
      ],
    })
    expect(state.quests.find((q) => q.id === 'sim')?.verified).toBe(true)
    expect(state.quests.find((q) => q.id === 'log')?.verified).toBeUndefined()
  })

  it('drops quest ids outside the canonical roster — no hand-added XP levers', () => {
    // Unknown ids ('lesson' from an old schema, hand-added 'log2'…'log50')
    // would each render as a tappable self-report row granting XP once — an
    // unbounded same-day XP lever bypassing the roster.
    const state = sanitizeState({
      quests: [
        ...defaultState().quests,
        { id: 'lesson', text: 'Daily lesson', xpAction: 'logExpense', done: false },
        { id: 'log2', text: 'Log again', xpAction: 'logExpense', done: false },
      ],
    })
    expect(state.quests).toEqual(defaultState().quests)
  })

  it('preserves same-day done flags by id while refreshing text from the roster', () => {
    const state = sanitizeState({
      quests: [
        { id: 'log', text: 'Old copy from a previous release', xpAction: 'logExpense', done: true },
        { id: 'sim', text: 'Run one decision simulation', xpAction: 'runSimulation', done: false },
      ],
    })
    const log = state.quests.find((q) => q.id === 'log')!
    expect(log.done).toBe(true)
    expect(log.text).toBe('Log every purchase today') // roster owns the copy
    // Quests absent from the payload (here: 'review') come back undone.
    expect(state.quests.find((q) => q.id === 'review')?.done).toBe(false)
  })
})

describe('mergeStates', () => {
  const mkTx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
    id,
    amountDA: 1_000,
    category: 'Fun',
    date: '2026-08-01',
    ...over,
  })
  const base = (over: Partial<AppState> = {}): AppState => ({
    ...defaultState(),
    questsDate: '2026-08-01',
    ...over,
  })

  it('unions transactions by id so a peer write cannot erase local logs', () => {
    // Tab A logged 'a2' after tab B last loaded; tab B's write lacks it.
    const local = base({ transactions: [mkTx('a2'), mkTx('shared')] })
    const incoming = base({ transactions: [mkTx('b1'), mkTx('shared')] })
    const merged = mergeStates(local, incoming)
    expect(merged.transactions.map((t) => t.id)).toEqual(['a2', 'b1', 'shared'])
  })

  it('is idempotent — the peer merging the merged write reaches a fixpoint', () => {
    const local = base({ transactions: [mkTx('a2'), mkTx('shared')] })
    const incoming = base({ transactions: [mkTx('b1'), mkTx('shared')] })
    const merged = mergeStates(local, incoming)
    // The other tab (whose state content equals `incoming` here… it wrote it)
    // now receives `merged`: the result must be identical, ending the echo.
    expect(mergeStates(incoming, merged)).toEqual(merged)
  })

  it('keeps the larger XP total — a monotone counter is never summed or averaged', () => {
    const local = base({ xp: { level: 2, xpIntoLevel: 10, totalXp: 110 } })
    const incoming = base({ xp: { level: 1, xpIntoLevel: 90, totalXp: 90 } })
    expect(mergeStates(local, incoming).xp).toEqual(local.xp)
    expect(mergeStates(incoming, local).xp).toEqual(local.xp)
  })

  it('unions same-day quest done flags so neither tab can re-grant quest XP', () => {
    const localQuests = defaultState().quests.map((q) => ({ ...q, done: q.id === 'log' }))
    const incomingQuests = defaultState().quests.map((q) => ({ ...q, done: q.id === 'sim' }))
    const merged = mergeStates(base({ quests: localQuests }), base({ quests: incomingQuests }))
    expect(merged.quests.find((q) => q.id === 'log')?.done).toBe(true)
    expect(merged.quests.find((q) => q.id === 'sim')?.done).toBe(true)
    expect(merged.quests.find((q) => q.id === 'review')?.done).toBe(false)
  })

  it('takes the newer quest day and health snapshot across a midnight roll', () => {
    // Tab B rolled midnight already; tab A is still on yesterday.
    const local = base({
      questsDate: '2026-07-31',
      quests: defaultState().quests.map((q) => ({ ...q, done: true })),
      healthDate: '2026-07-31',
      prevHealthScore: 40,
      stage: 'ember',
    })
    const incoming = base({
      questsDate: '2026-08-01',
      healthDate: '2026-08-01',
      prevHealthScore: 44,
      stage: 'hearth',
    })
    const merged = mergeStates(local, incoming)
    expect(merged.questsDate).toBe('2026-08-01')
    expect(merged.quests.every((q) => !q.done)).toBe(true)
    expect(merged.healthDate).toBe('2026-08-01')
    expect(merged.prevHealthScore).toBe(44)
    expect(merged.stage).toBe('hearth')
  })
})
