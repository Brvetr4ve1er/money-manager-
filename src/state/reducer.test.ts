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
  it('records each grant in the append-only XP log with a tx-derived id', () => {
    const next = appReducer(defaultState(), { type: 'LOG_TX', tx: tx() })
    expect(next.xpLog).toEqual([
      { id: 'tx:t1', action: 'logExpense', amount: 5, date: '2026-08-01' },
    ])
  })
  it('caps resist XP per day but still logs the entry', () => {
    let s = defaultState()
    for (let i = 0; i < 3; i++) {
      s = appReducer(s, {
        type: 'LOG_TX',
        tx: tx({ id: `r${i}`, amountDA: 0, resistedImpulse: true }),
      })
    }
    // Third press logs the transaction but grants nothing (2 × 50 cap) — and
    // the ungranted press leaves no grant evidence either.
    expect(s.transactions).toHaveLength(3)
    expect(s.xp.totalXp).toBe(100)
    expect(s.xpLog).toHaveLength(2)
    // A new local day resets the cap.
    const nextDay = appReducer(s, {
      type: 'LOG_TX',
      tx: tx({ id: 'r3', amountDA: 0, resistedImpulse: true, date: '2026-08-02' }),
    })
    expect(nextDay.xp.totalXp).toBe(150)
  })
})

describe('COMPLETE_QUEST', () => {
  it('marks the quest done and grants its XP atomically', () => {
    const s = defaultState()
    const next = appReducer(s, { type: 'COMPLETE_QUEST', id: 'log' })
    expect(next.quests.find((q) => q.id === 'log')!.done).toBe(true)
    expect(next.xp.totalXp).toBe(5)
    // The grant id is deterministic per (quest, day), so two tabs completing
    // the same quest on the same day merge to a single grant.
    expect(next.xpLog).toEqual([
      { id: `quest:log:${s.questsDate}`, action: 'logExpense', amount: 5, date: s.questsDate },
    ])
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

describe('READ_LESSON', () => {
  it('collects the lesson into the codex WITHOUT granting XP (the quest pays)', () => {
    const next = appReducer(defaultState(), {
      type: 'READ_LESSON',
      id: 'budget-sketch',
      date: '2026-08-01',
    })
    expect(next.lessonsSeen).toEqual([{ id: 'budget-sketch', date: '2026-08-01' }])
    // No direct grant: the daily readLesson XP travels through
    // COMPLETE_QUEST('lesson') so one tap can never pay twice.
    expect(next.xp.totalXp).toBe(0)
    expect(next.xpLog).toEqual([])
  })

  it('keeps the original first-read date on a repeat read (rotation keys off it)', () => {
    const s = appReducer(defaultState(), {
      type: 'READ_LESSON',
      id: 'budget-sketch',
      date: '2026-08-01',
    })
    const again = appReducer(s, { type: 'READ_LESSON', id: 'budget-sketch', date: '2026-08-02' })
    expect(again).toBe(s)
    expect(again.lessonsSeen).toEqual([{ id: 'budget-sketch', date: '2026-08-01' }])
  })

  it('ignores ids outside the canonical roster — no hand-crafted codex entries', () => {
    const s = defaultState()
    expect(appReducer(s, { type: 'READ_LESSON', id: 'lesson-31', date: '2026-08-01' })).toBe(s)
  })

  it('stores entries in canonical id order for the merge fixpoint', () => {
    let s = defaultState()
    s = appReducer(s, { type: 'READ_LESSON', id: 'track-first', date: '2026-08-01' })
    s = appReducer(s, { type: 'READ_LESSON', id: 'budget-sketch', date: '2026-08-02' })
    expect(s.lessonsSeen.map((e) => e.id)).toEqual(['budget-sketch', 'track-first'])
  })

  it('pays readLesson XP once per day via the verified lesson quest', () => {
    const s = defaultState()
    const once = appReducer(s, { type: 'COMPLETE_QUEST', id: 'lesson' })
    expect(once.xp.totalXp).toBe(15)
    expect(once.xpLog).toEqual([
      { id: `quest:lesson:${s.questsDate}`, action: 'readLesson', amount: 15, date: s.questsDate },
    ])
    // Second dispatch the same day is the standard quest no-op.
    expect(appReducer(once, { type: 'COMPLETE_QUEST', id: 'lesson' })).toBe(once)
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

describe('HYDRATE', () => {
  it('merges a peer tab payload instead of replacing local state', () => {
    const local = appReducer(defaultState(), { type: 'LOG_TX', tx: tx({ id: 'local' }) })
    const incoming = { ...defaultState(), transactions: [tx({ id: 'peer' })] }
    const next = appReducer(local, { type: 'HYDRATE', incoming })
    // Both tabs' transactions survive; local XP (5 from the log) beats the
    // peer's 0.
    expect(next.transactions.map((t) => t.id).sort()).toEqual(['local', 'peer'])
    expect(next.xp.totalXp).toBe(5)
  })
})

describe('PROFILE_SET', () => {
  const profile = {
    monthlyIncome: 75_000,
    monthlyEssentials: 40_000,
    efBalance: 20_000,
    debt: null,
    goal: null,
    savedDate: '2026-08-01',
  }

  it('stores a valid profile', () => {
    const next = appReducer(defaultState(), { type: 'PROFILE_SET', profile })
    expect(next.profile).toEqual(profile)
  })

  it('replaces an existing profile on edit', () => {
    const s = appReducer(defaultState(), { type: 'PROFILE_SET', profile })
    const next = appReducer(s, {
      type: 'PROFILE_SET',
      profile: { ...profile, monthlyIncome: 90_000, savedDate: '2026-08-02' },
    })
    expect(next.profile?.monthlyIncome).toBe(90_000)
  })

  it('rejects a payload with a smuggled non-finite number — state unchanged', () => {
    // The form validates first, but a NaN that slipped through would persist,
    // fail sanitizeState at next load, and silently revert the user to demo.
    const s = defaultState()
    expect(
      appReducer(s, { type: 'PROFILE_SET', profile: { ...profile, monthlyIncome: NaN } }),
    ).toBe(s)
    expect(
      appReducer(s, {
        type: 'PROFILE_SET',
        profile: { ...profile, efBalance: Infinity },
      }),
    ).toBe(s)
  })

  it('rejects an invalid savedDate — merge recency must stay comparable', () => {
    const s = defaultState()
    expect(
      appReducer(s, { type: 'PROFILE_SET', profile: { ...profile, savedDate: '2026-99-99' } }),
    ).toBe(s)
  })
})

describe('TOGGLE_MUTE', () => {
  it('flips the muted flag', () => {
    const s = defaultState()
    expect(appReducer(s, { type: 'TOGGLE_MUTE' }).muted).toBe(true)
  })
})
