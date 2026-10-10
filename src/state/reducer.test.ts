import { describe, it, expect } from 'vitest'
import { appReducer } from './reducer.ts'
import { defaultState, defaultSupport, type AppState, type SupportState, type Transaction } from './store.ts'
import { DEFAULT_BRAKE_RULE } from '../engine/needs.ts'
import type { BrakeRule, HeldPurchase } from '../engine/brakes.ts'

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

describe('UNDO_TX', () => {
  it('removes the transaction AND its XP grant — log→undo cycles farm nothing', () => {
    const logged = appReducer(defaultState(), { type: 'LOG_TX', tx: tx() })
    const next = appReducer(logged, { type: 'UNDO_TX', id: 't1' })
    expect(next.transactions).toHaveLength(0)
    expect(next.xp.totalXp).toBe(0)
    expect(next.xpLog).toEqual([])
  })

  it('is a same-reference no-op for an unknown id', () => {
    const logged = appReducer(defaultState(), { type: 'LOG_TX', tx: tx() })
    expect(appReducer(logged, { type: 'UNDO_TX', id: 'nope' })).toBe(logged)
  })

  it('rebuilds the level from the reduced total — an undone level-up collapses', () => {
    let s = defaultState()
    // Two resists = 100 XP = exactly level 2.
    for (const id of ['r0', 'r1']) {
      s = appReducer(s, { type: 'LOG_TX', tx: tx({ id, amountDA: 0, resistedImpulse: true }) })
    }
    expect(s.xp.level).toBe(2)
    const next = appReducer(s, { type: 'UNDO_TX', id: 'r1' })
    expect(next.xp).toEqual({ level: 1, xpIntoLevel: 50, totalXp: 50 })
    expect(next.xpLog).toHaveLength(1)
  })

  it('removes only the row for a capped resist that never granted XP', () => {
    let s = defaultState()
    for (let i = 0; i < 3; i++) {
      s = appReducer(s, {
        type: 'LOG_TX',
        tx: tx({ id: `r${i}`, amountDA: 0, resistedImpulse: true }),
      })
    }
    // r2 was past the daily cap: no grant to remove, XP stays at 2 × 50.
    const next = appReducer(s, { type: 'UNDO_TX', id: 'r2' })
    expect(next.transactions).toHaveLength(2)
    expect(next.xp.totalXp).toBe(100)
    expect(next.xpLog).toHaveLength(2)
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

describe('BOSS_VICTORY', () => {
  const claim = { type: 'BOSS_VICTORY', weekStart: '2026-07-27', date: '2026-08-03' } as const

  it('grants weeklyBoss XP with a deterministic per-week grant id', () => {
    const next = appReducer(defaultState(), claim)
    expect(next.xp.totalXp).toBe(150)
    expect(next.xpLog).toEqual([
      { id: 'boss:2026-07-27', action: 'weeklyBoss', amount: 150, date: '2026-08-03' },
    ])
  })

  it('pays at most once per week — a duplicate claim is a no-op returning the same state', () => {
    const s = appReducer(defaultState(), claim)
    // StrictMode double-dispatch, a re-fired mount effect on reload, or a
    // later day of the same week must all hit the grant-id guard.
    expect(appReducer(s, claim)).toBe(s)
    expect(appReducer(s, { ...claim, date: '2026-08-05' })).toBe(s)
  })

  it('pays again for a different week — one grant per battle, not per lifetime', () => {
    const s = appReducer(defaultState(), claim)
    const next = appReducer(s, { type: 'BOSS_VICTORY', weekStart: '2026-08-03', date: '2026-08-10' })
    expect(next.xp.totalXp).toBe(300)
    expect(next.xpLog).toHaveLength(2)
  })
})

describe('UNLOCK_ACHIEVEMENTS', () => {
  const unlock = (ids: string[], date = '2026-08-01') =>
    ({ type: 'UNLOCK_ACHIEVEMENTS', ids, date }) as const

  it('persists new unlocks with the given date, in canonical id order — and no XP', () => {
    const s = appReducer(defaultState(), unlock(['first-resist', 'first-log']))
    expect(s.achievements).toEqual([
      { id: 'first-log', date: '2026-08-01' },
      { id: 'first-resist', date: '2026-08-01' },
    ])
    // Badges are their own reward: the XP economy must stay untouched.
    expect(s.xp.totalXp).toBe(0)
    expect(s.xpLog).toEqual([])
  })

  it('drops ids outside the canonical roster — the sanitizer would evict them at next load', () => {
    const s = appReducer(defaultState(), unlock(['nope', 'first-log']))
    expect(s.achievements).toEqual([{ id: 'first-log', date: '2026-08-01' }])
  })

  it('is a same-reference no-op when every id is already earned (StrictMode double-dispatch)', () => {
    const s = appReducer(defaultState(), unlock(['first-log']))
    expect(appReducer(s, unlock(['first-log'], '2026-08-05'))).toBe(s)
  })

  it('keeps the original earn date when a later dispatch repeats an earned id', () => {
    const s = appReducer(defaultState(), unlock(['first-log']))
    const next = appReducer(s, unlock(['first-log', 'ten-logs'], '2026-08-09'))
    expect(next.achievements).toEqual([
      { id: 'first-log', date: '2026-08-01' },
      { id: 'ten-logs', date: '2026-08-09' },
    ])
  })
})

/* ----------------------------- support modes ----------------------------- */

const NOW = '2026-08-10T12:00:00.000Z'
const HOUR = 3_600_000
const plusHours = (iso: string, h: number) => new Date(Date.parse(iso) + h * HOUR).toISOString()

const withSupport = (over: Partial<SupportState> = {}): AppState => ({
  ...defaultState(),
  support: { ...defaultSupport(), ...over },
})

const rule = (over: Partial<BrakeRule> = {}): BrakeRule => ({
  thresholdDA: 5_000,
  categories: ['Fun'],
  delayHours: 24,
  ...over,
})

const held = (over: Partial<HeldPurchase> = {}): HeldPurchase => ({
  id: 'h1',
  amountDA: 6_000,
  category: 'Fun',
  impulseFlagged: false,
  heldAt: NOW,
  releaseAt: plusHours(NOW, 24),
  ...over,
})

describe('NEEDS_SET', () => {
  it('composes the starting brake rule only when none exists', () => {
    const next = appReducer(withSupport(), { type: 'NEEDS_SET', needs: ['brakes'], nowISO: NOW })
    expect(next.support.needs).toEqual(['brakes'])
    expect(next.support.brakes).toEqual(DEFAULT_BRAKE_RULE)
    expect(next.support.pendingBrakes).toBeNull()
  })
  it('keeps an existing rule when brakes is picked again', () => {
    const existing = rule({ thresholdDA: 2_000 })
    const next = appReducer(withSupport({ brakes: existing }), {
      type: 'NEEDS_SET',
      needs: ['brakes'],
      nowISO: NOW,
    })
    expect(next.support.brakes).toBe(existing)
    expect(next.support.pendingBrakes).toBeNull()
  })
  it('does not remove existing brakes when brakes is un-picked', () => {
    const existing = rule()
    const pending = { rule: null, effectiveAt: plusHours(NOW, 48) }
    const next = appReducer(withSupport({ needs: ['brakes'], brakes: existing, pendingBrakes: pending }), {
      type: 'NEEDS_SET',
      needs: ['calm'],
      nowISO: NOW,
    })
    expect(next.support.needs).toEqual(['calm'])
    expect(next.support.brakes).toBe(existing)
    expect(next.support.pendingBrakes).toBe(pending)
  })
  it('calm sets the calm flag and mutes sound', () => {
    const next = appReducer(withSupport(), { type: 'NEEDS_SET', needs: ['calm'], nowISO: NOW })
    expect(next.support.calm).toBe(true)
    expect(next.muted).toBe(true)
  })
  it('low-energy sets the flag and un-picking never clears a flag already on', () => {
    const on = appReducer(withSupport(), { type: 'NEEDS_SET', needs: ['low-energy'], nowISO: NOW })
    expect(on.support.lowEnergy).toBe(true)
    const off = appReducer(on, { type: 'NEEDS_SET', needs: [], nowISO: NOW })
    expect(off.support.lowEnergy).toBe(true)
  })
  it('dedupes and sorts the picked needs and stamps savedAt', () => {
    const next = appReducer(withSupport(), {
      type: 'NEEDS_SET',
      needs: ['second-pair', 'brakes', 'second-pair'],
      nowISO: NOW,
    })
    expect(next.support.needs).toEqual(['brakes', 'second-pair'])
    expect(next.support.savedAt).toBe(NOW)
  })
})

describe('BRAKES_REQUEST', () => {
  it('applies a tightening immediately and stamps savedAt', () => {
    const s = withSupport({ brakes: rule({ thresholdDA: 5_000 }) })
    const next = appReducer(s, { type: 'BRAKES_REQUEST', rule: rule({ thresholdDA: 2_000 }), nowISO: NOW })
    expect(next.support.brakes).toEqual(rule({ thresholdDA: 2_000 }))
    expect(next.support.pendingBrakes).toBeNull()
    expect(next.support.savedAt).toBe(NOW)
  })
  it('schedules a loosening 48h out and keeps the current rule', () => {
    const current = rule({ thresholdDA: 2_000 })
    const next = appReducer(withSupport({ brakes: current }), {
      type: 'BRAKES_REQUEST',
      rule: rule({ thresholdDA: 9_000 }),
      nowISO: NOW,
    })
    expect(next.support.brakes).toBe(current)
    expect(next.support.pendingBrakes).toEqual({
      rule: rule({ thresholdDA: 9_000 }),
      effectiveAt: plusHours(NOW, 48),
    })
  })
  it('schedules removal (null) behind the lock', () => {
    const current = rule()
    const next = appReducer(withSupport({ brakes: current }), { type: 'BRAKES_REQUEST', rule: null, nowISO: NOW })
    expect(next.support.brakes).toBe(current)
    expect(next.support.pendingBrakes).toEqual({ rule: null, effectiveAt: plusHours(NOW, 48) })
  })
})

describe('BRAKES_TICK', () => {
  const current = rule({ thresholdDA: 2_000 })
  const pending = { rule: rule({ thresholdDA: 9_000 }), effectiveAt: plusHours(NOW, 48) }

  it('is a same-reference no-op before effectiveAt and when nothing is pending', () => {
    const s = withSupport({ brakes: current, pendingBrakes: pending, savedAt: NOW })
    expect(appReducer(s, { type: 'BRAKES_TICK', nowISO: plusHours(NOW, 47) })).toBe(s)
    const none = withSupport({ brakes: current })
    expect(appReducer(none, { type: 'BRAKES_TICK', nowISO: plusHours(NOW, 1000) })).toBe(none)
  })
  it('promotes the pending rule after effectiveAt and stamps savedAt', () => {
    const s = withSupport({ brakes: current, pendingBrakes: pending, savedAt: NOW })
    const at = plusHours(NOW, 49)
    const next = appReducer(s, { type: 'BRAKES_TICK', nowISO: at })
    expect(next.support.brakes).toEqual(rule({ thresholdDA: 9_000 }))
    expect(next.support.pendingBrakes).toBeNull()
    expect(next.support.savedAt).toBe(at)
  })
})

describe('HOLD_TX', () => {
  it('queues the held purchase', () => {
    const next = appReducer(withSupport(), { type: 'HOLD_TX', held: held() })
    expect(next.support.held).toEqual([held()])
    expect(next.transactions).toEqual([])
    expect(next.xp.totalXp).toBe(0)
  })
  it('dedupes by id — a double dispatch is a same-reference no-op', () => {
    const s = appReducer(withSupport(), { type: 'HOLD_TX', held: held() })
    expect(appReducer(s, { type: 'HOLD_TX', held: held({ amountDA: 1 }) })).toBe(s)
    expect(s.support.held).toHaveLength(1)
  })
})

describe('RELEASE_HELD', () => {
  it('removes the row from held and logs a transaction with the SAME id, paying +5 XP', () => {
    const s = withSupport({ held: [held({ impulseFlagged: true }), held({ id: 'h2' })] })
    const next = appReducer(s, { type: 'RELEASE_HELD', id: 'h1', date: '2026-08-11' })
    expect(next.support.held.map((h) => h.id)).toEqual(['h2'])
    expect(next.transactions).toEqual([
      {
        id: 'h1',
        amountDA: 6_000,
        category: 'Fun',
        date: '2026-08-11',
        resistedImpulse: false,
        impulseFlagged: true,
      },
    ])
    expect(next.xp.totalXp).toBe(5)
    expect(next.xpLog).toEqual([{ id: 'tx:h1', action: 'logExpense', amount: 5, date: '2026-08-11' }])
  })
  it('is a same-reference no-op for an unknown id', () => {
    const s = withSupport({ held: [held()] })
    expect(appReducer(s, { type: 'RELEASE_HELD', id: 'nope', date: '2026-08-11' })).toBe(s)
  })
})

describe('LET_GO_HELD', () => {
  it('drops the row without logging anything or touching XP', () => {
    const s = withSupport({ held: [held(), held({ id: 'h2' })] })
    const next = appReducer(s, { type: 'LET_GO_HELD', id: 'h1' })
    expect(next.support.held.map((h) => h.id)).toEqual(['h2'])
    expect(next.transactions).toEqual([])
    expect(next.xp.totalXp).toBe(0)
    expect(next.xpLog).toEqual([])
  })
  it('is a same-reference no-op for an unknown id', () => {
    const s = withSupport({ held: [held()] })
    expect(appReducer(s, { type: 'LET_GO_HELD', id: 'nope' })).toBe(s)
  })
})

describe('LOW_ENERGY_SET', () => {
  it('flips the flag and stamps savedAt', () => {
    const next = appReducer(withSupport(), { type: 'LOW_ENERGY_SET', on: true, nowISO: NOW })
    expect(next.support.lowEnergy).toBe(true)
    expect(next.support.savedAt).toBe(NOW)
    const back = appReducer(next, { type: 'LOW_ENERGY_SET', on: false, nowISO: plusHours(NOW, 1) })
    expect(back.support.lowEnergy).toBe(false)
    expect(back.support.savedAt).toBe(plusHours(NOW, 1))
  })
  it('is a same-reference no-op when unchanged', () => {
    const s = withSupport({ lowEnergy: true })
    expect(appReducer(s, { type: 'LOW_ENERGY_SET', on: true, nowISO: NOW })).toBe(s)
    const off = withSupport()
    expect(appReducer(off, { type: 'LOW_ENERGY_SET', on: false, nowISO: NOW })).toBe(off)
  })
})

describe('CALM_SET', () => {
  it('turning calm on also mutes and stamps savedAt', () => {
    const next = appReducer(withSupport(), { type: 'CALM_SET', on: true, nowISO: NOW })
    expect(next.support.calm).toBe(true)
    expect(next.muted).toBe(true)
    expect(next.support.savedAt).toBe(NOW)
  })
  it('turning calm off leaves mute as it was', () => {
    const on = appReducer(withSupport(), { type: 'CALM_SET', on: true, nowISO: NOW })
    const off = appReducer(on, { type: 'CALM_SET', on: false, nowISO: plusHours(NOW, 1) })
    expect(off.support.calm).toBe(false)
    expect(off.muted).toBe(true)
  })
  it('is a same-reference no-op when unchanged', () => {
    const s = withSupport({ calm: true })
    expect(appReducer(s, { type: 'CALM_SET', on: true, nowISO: NOW })).toBe(s)
  })
})

describe('REENTRY_DISMISS', () => {
  it('clears a shown re-entry without stamping savedAt', () => {
    const s = withSupport({ reentry: { since: '2026-08-01', days: 9 }, savedAt: NOW })
    const next = appReducer(s, { type: 'REENTRY_DISMISS' })
    expect(next.support.reentry).toBeNull()
    expect(next.support.savedAt).toBe(NOW)
  })
  it('is a same-reference no-op when there is none', () => {
    const s = withSupport()
    expect(appReducer(s, { type: 'REENTRY_DISMISS' })).toBe(s)
  })
})

describe('TRUSTED_SET', () => {
  const trusted = {
    name: 'Mum',
    options: { totals: true, categories: false, held: true, velocity: true, health: false },
  }
  it('stores the trusted person and stamps savedAt', () => {
    const next = appReducer(withSupport(), { type: 'TRUSTED_SET', trusted, nowISO: NOW })
    expect(next.support.trusted).toEqual(trusted)
    expect(next.support.savedAt).toBe(NOW)
  })
  it('clears it with null', () => {
    const s = appReducer(withSupport(), { type: 'TRUSTED_SET', trusted, nowISO: NOW })
    const next = appReducer(s, { type: 'TRUSTED_SET', trusted: null, nowISO: plusHours(NOW, 1) })
    expect(next.support.trusted).toBeNull()
    expect(next.support.savedAt).toBe(plusHours(NOW, 1))
  })
})

describe('ROLL_DAY (last opened and re-entry)', () => {
  const roll = (s: AppState, today: string) =>
    appReducer(s, { type: 'ROLL_DAY', today, healthScore: 50, healthStage: 'hearth' })
  const stale = (over: Partial<SupportState> = {}): AppState => ({
    ...withSupport(over),
    healthDate: '2026-07-01',
    questsDate: '2026-07-01',
  })

  it('sets support.lastOpened to today', () => {
    const next = roll(stale({ lastOpened: '2026-08-09' }), '2026-08-10')
    expect(next.support.lastOpened).toBe('2026-08-10')
  })
  it('sets a re-entry when the last open was 5 or more days ago', () => {
    const next = roll(stale({ lastOpened: '2026-08-05' }), '2026-08-10')
    expect(next.support.reentry).toEqual({ since: '2026-08-05', days: 5 })
    expect(next.support.lastOpened).toBe('2026-08-10')
  })
  it('leaves reentry null for a 2-day gap', () => {
    const next = roll(stale({ lastOpened: '2026-08-08' }), '2026-08-10')
    expect(next.support.reentry).toBeNull()
    expect(next.support.lastOpened).toBe('2026-08-10')
  })
  it('does not overwrite an existing re-entry', () => {
    const existing = { since: '2026-07-20', days: 15 }
    const next = roll(stale({ lastOpened: '2026-08-04', reentry: existing }), '2026-08-10')
    expect(next.support.reentry).toBe(existing)
    expect(next.support.lastOpened).toBe('2026-08-10')
  })
  it('never flags a re-entry on a fresh state (never opened)', () => {
    const next = roll(stale({ lastOpened: '' }), '2026-08-10')
    expect(next.support.reentry).toBeNull()
    expect(next.support.lastOpened).toBe('2026-08-10')
  })
  it('does not stamp savedAt — opening the app is not a settings edit', () => {
    const next = roll(stale({ lastOpened: '2026-08-01', savedAt: NOW }), '2026-08-10')
    expect(next.support.savedAt).toBe(NOW)
  })
})
