import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  achievementById,
  longestLogStreak,
  newlyEarnedIds,
  unlockedPets,
} from './achievements.ts'
import { xpStateFromTotal } from './xp.ts'
import { defaultState, type AppState, type Transaction } from '../state/store.ts'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `t-${over.date ?? 'x'}-${over.id ?? Math.random()}`,
  amountDA: 500,
  category: 'Food',
  date: '2026-08-01',
  ...over,
})

const withState = (over: Partial<AppState> = {}): AppState => ({ ...defaultState(), ...over })

const earned = (id: string, state: AppState): boolean => achievementById(id)!.earned(state)

describe('longestLogStreak', () => {
  it('is 0 with no transactions', () => {
    expect(longestLogStreak([])).toBe(0)
  })
  it('is 1 for a single logged day', () => {
    expect(longestLogStreak([tx()])).toBe(1)
  })
  it('counts consecutive local dates', () => {
    const txs = ['2026-08-01', '2026-08-02', '2026-08-03'].map((date) => tx({ date }))
    expect(longestLogStreak(txs)).toBe(3)
  })
  it('multiple logs on one day count as one streak day', () => {
    const txs = [tx({ id: 'a' }), tx({ id: 'b' }), tx({ id: 'c', date: '2026-08-02' })]
    expect(longestLogStreak(txs)).toBe(2)
  })
  it('a missed day breaks the run — the longest run wins', () => {
    const txs = ['2026-08-01', '2026-08-02', '2026-08-04', '2026-08-05', '2026-08-06'].map(
      (date) => tx({ date }),
    )
    expect(longestLogStreak(txs)).toBe(3)
  })
  it('crosses month boundaries on real calendar days', () => {
    const txs = ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'].map((date) => tx({ date }))
    expect(longestLogStreak(txs)).toBe(4)
  })
  it('is order-independent — the ledger stores newest-first', () => {
    const txs = ['2026-08-03', '2026-08-01', '2026-08-02'].map((date) => tx({ date }))
    expect(longestLogStreak(txs)).toBe(3)
  })
  it('resisted rows keep the streak alive — showing up is the behavior', () => {
    const txs = [
      tx({ date: '2026-08-01' }),
      tx({ date: '2026-08-02', amountDA: 0, resistedImpulse: true }),
      tx({ date: '2026-08-03' }),
    ]
    expect(longestLogStreak(txs)).toBe(3)
  })
})

describe('unlock predicates', () => {
  it('first-log needs a purchase — a resist alone is not a purchase', () => {
    expect(earned('first-log', withState())).toBe(false)
    const resistOnly = withState({ transactions: [tx({ amountDA: 0, resistedImpulse: true })] })
    expect(earned('first-log', resistOnly)).toBe(false)
    expect(earned('first-log', withState({ transactions: [tx()] }))).toBe(true)
  })
  it('first-resist needs a resisted row', () => {
    expect(earned('first-resist', withState({ transactions: [tx()] }))).toBe(false)
    const s = withState({ transactions: [tx({ amountDA: 0, resistedImpulse: true })] })
    expect(earned('first-resist', s)).toBe(true)
  })
  it('ten-logs counts purchases only, not resists', () => {
    const nine = Array.from({ length: 9 }, (_, i) => tx({ id: `p${i}` }))
    const resist = tx({ id: 'r', amountDA: 0, resistedImpulse: true })
    expect(earned('ten-logs', withState({ transactions: [...nine, resist] }))).toBe(false)
    expect(
      earned('ten-logs', withState({ transactions: [...nine, tx({ id: 'p9' })] })),
    ).toBe(true)
  })
  it('first-sim keys off the runSimulation grant evidence', () => {
    expect(earned('first-sim', withState())).toBe(false)
    const s = withState({
      xpLog: [{ id: 'quest:sim:2026-08-01', action: 'runSimulation', amount: 15, date: '2026-08-01' }],
    })
    expect(earned('first-sim', s)).toBe(true)
  })
  it('streak-7 needs seven consecutive logged days', () => {
    const six = ['01', '02', '03', '04', '05', '06'].map((d) => tx({ date: `2026-08-${d}` }))
    expect(earned('streak-7', withState({ transactions: six }))).toBe(false)
    const seven = [...six, tx({ date: '2026-08-07' })]
    expect(earned('streak-7', withState({ transactions: seven }))).toBe(true)
  })
  it('codex-5 needs five collected lessons', () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, date: '2026-08-01' }))
    expect(earned('codex-5', withState({ lessonsSeen: four }))).toBe(false)
    const five = [...four, { id: 'l4', date: '2026-08-01' }]
    expect(earned('codex-5', withState({ lessonsSeen: five }))).toBe(true)
  })
  it('boss-win keys off the weeklyBoss grant evidence', () => {
    expect(earned('boss-win', withState())).toBe(false)
    const s = withState({
      xpLog: [{ id: 'boss:2026-07-20', action: 'weeklyBoss', amount: 150, date: '2026-07-27' }],
    })
    expect(earned('boss-win', s)).toBe(true)
  })
  it('level badges read the derived level', () => {
    // Levels 1..4 cost 100/150/200/250 XP — 700 total reaches level 5; the
    // next five levels cost 300..500 — 2700 reaches level 10.
    expect(earned('level-5', withState({ xp: xpStateFromTotal(699) }))).toBe(false)
    expect(earned('level-5', withState({ xp: xpStateFromTotal(700) }))).toBe(true)
    expect(earned('level-10', withState({ xp: xpStateFromTotal(2699) }))).toBe(false)
    expect(earned('level-10', withState({ xp: xpStateFromTotal(2700) }))).toBe(true)
  })
})

describe('newlyEarnedIds', () => {
  it('returns nothing on a fresh state', () => {
    expect(newlyEarnedIds(withState())).toEqual([])
  })
  it('excludes badges already persisted as unlocks', () => {
    const s = withState({
      transactions: [tx()],
      achievements: [{ id: 'first-log', date: '2026-08-01' }],
    })
    expect(newlyEarnedIds(s)).toEqual([])
  })
  it('lists every badge whose predicate newly holds', () => {
    const s = withState({
      transactions: [tx(), tx({ id: 'r', amountDA: 0, resistedImpulse: true })],
    })
    expect(newlyEarnedIds(s)).toEqual(['first-log', 'first-resist'])
  })
})

describe('roster and loot', () => {
  it('every achievement has a unique id, a hint, and a pet', () => {
    expect(ACHIEVEMENT_IDS.size).toBe(ACHIEVEMENTS.length)
    for (const a of ACHIEVEMENTS) {
      expect(a.hint.length).toBeGreaterThan(0)
      expect(a.pet.glyph.length).toBeGreaterThan(0)
      expect(a.pet.name.length).toBeGreaterThan(0)
    }
  })
  it('unlockedPets returns companions in roster order, unknown ids ignored', () => {
    const pets = unlockedPets([
      { id: 'first-resist', date: '2026-08-02' },
      { id: 'nope', date: '2026-08-02' },
      { id: 'first-log', date: '2026-08-01' },
    ])
    expect(pets.map((p) => p.glyph)).toEqual(['kit', 'sabr'])
  })
})
