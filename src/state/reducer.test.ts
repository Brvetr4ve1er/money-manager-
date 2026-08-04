import { describe, it, expect } from 'vitest'
import { appReducer } from './reducer.ts'
import { XP_REWARDS } from '../engine/xp.ts'
import {
  defaultState,
  NOTE_MAX_LEN,
  sanitizeState,
  type Decision,
  type Transaction,
} from './store.ts'

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
  it('pays exactly the same XP with a note as without one (two-track rule)', () => {
    // Trust Rule 1, at the grant. Paying extra for a note would turn the
    // memory field into an engagement lever; withholding the +5 until one is
    // typed would tax the app's core action. Both directions are asserted, on
    // the counter AND on the grant amount, because either could drift alone.
    const bare = appReducer(defaultState(), { type: 'LOG_TX', tx: tx({ id: 'a' }) })
    const noted = appReducer(defaultState(), {
      type: 'LOG_TX',
      tx: tx({ id: 'a', note: 'bread from the corner shop' }),
    })
    expect(noted.xp.totalXp).toBe(bare.xp.totalXp)
    expect(noted.xp.totalXp).toBe(5)
    expect(noted.xpLog).toEqual(bare.xpLog)
    expect(noted.xpLog[0].amount).toBe(5)
    // …and the note itself is on the row, unchanged.
    expect(noted.transactions[0].note).toBe('bread from the corner shop')
    expect(bare.transactions[0].note).toBeUndefined()
  })

  it('caps and trims the note on the way in, so the row on screen is the row that reloads', () => {
    // The reducer re-applies the sanitizer for the same reason PROFILE_SET
    // does: without it a 50,000-char paste would render on the row now and
    // silently shrink at next load — and the write that stored it could take
    // the whole origin quota with it.
    const next = appReducer(defaultState(), {
      type: 'LOG_TX',
      tx: tx({ note: `  ${'x'.repeat(50_000)}  ` }),
    })
    expect(next.transactions[0].note).toBe('x'.repeat(NOTE_MAX_LEN))
    // A whitespace-only note is no note at all — never a blank second line.
    const blank = appReducer(defaultState(), { type: 'LOG_TX', tx: tx({ note: '   ' }) })
    expect(blank.transactions[0].note).toBeUndefined()
    expect(blank.xp.totalXp).toBe(5)
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

  it('caps on GRANTS, not rows — undoing a paid resist frees its slot again', () => {
    // The reducer and xpFromLog are two implementations of one rule, and they
    // had drifted: this counted resist ROWS, the authoritative fold counts
    // resist GRANTS. UNDO_TX removes the row AND the grant, so after undoing a
    // paid resist the row count was still 2 while only 1 grant had been paid —
    // and the next resist was refused a grant the cap still allowed. Failing
    // safe is not the same as agreeing, and only the fold's version survives a
    // cross-tab merge.
    let s = defaultState()
    for (let i = 0; i < 3; i++) {
      s = appReducer(s, {
        type: 'LOG_TX',
        tx: tx({ id: `r${i}`, amountDA: 0, resistedImpulse: true }),
      })
    }
    // r0 and r1 paid; r2 was over the cap.
    expect(s.xp.totalXp).toBe(100)
    s = appReducer(s, { type: 'UNDO_TX', id: 'r0' })
    expect(s.xp.totalXp).toBe(50)
    // One grant paid today, so the day still has a slot. The old row-count
    // rule saw two rows here and paid nothing.
    s = appReducer(s, {
      type: 'LOG_TX',
      tx: tx({ id: 'r3', amountDA: 0, resistedImpulse: true }),
    })
    expect(s.xp.totalXp).toBe(100)
    expect(s.xpLog.filter((g) => g.action === 'resistImpulse')).toHaveLength(2)
    // …and the cap still binds: a fourth resist logs its row and pays nothing.
    s = appReducer(s, {
      type: 'LOG_TX',
      tx: tx({ id: 'r4', amountDA: 0, resistedImpulse: true }),
    })
    expect(s.xp.totalXp).toBe(100)
    expect(s.transactions).toHaveLength(4)
  })

  it('scopes the grant cap to the day, not to the whole log', () => {
    // The guard against "count the evidence" quietly becoming "count all the
    // evidence": yesterday's grants must not spend today's slots.
    let s = defaultState()
    for (const [i, date] of ['2026-08-01', '2026-08-01', '2026-08-02'].entries()) {
      s = appReducer(s, {
        type: 'LOG_TX',
        tx: tx({ id: `r${i}`, amountDA: 0, resistedImpulse: true, date }),
      })
    }
    expect(s.xp.totalXp).toBe(150)
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

/**
 * RUN_SIM / CLOSE_DECISION — the decision record's transitions.
 *
 * The two-track rule (§12.1) is the whole point of this block: recording what
 * the simulator said, and what the user did about it, must move the XP counter
 * by EXACTLY what the equivalent ordinary action already pays, and must never
 * reach a health input. Both are asserted rather than promised.
 */
describe('the decision record', () => {
  const decision = (over: Partial<Decision> = {}): Decision => ({
    id: 'd1',
    date: '2026-08-04',
    amountDA: 5_000,
    line: 'Buy path ends lower. About 6 points below waiting.',
    // Explicit: Decision.demo is required, and the fixture defaults to the
    // demo basis because that is what an un-set-up app actually runs on.
    demo: true,
    outcome: 'open',
    ...over,
  })
  const withDecision = (over: Partial<Decision> = {}) => ({
    ...defaultState(),
    decisions: [decision(over)],
  })

  it('persists a run — the simulator stops throwing its output away', () => {
    const next = appReducer(defaultState(), { type: 'RUN_SIM', decision: decision() })
    expect(next.decisions).toEqual([decision()])
  })

  it('pays no XP for a run: the sim quest is still the only vehicle', () => {
    const next = appReducer(defaultState(), { type: 'RUN_SIM', decision: decision() })
    expect(next.xp.totalXp).toBe(0)
    expect(next.xpLog).toEqual([])
    // …and the quest still pays exactly once, through its own guarded path.
    const paid = appReducer(next, { type: 'COMPLETE_QUEST', id: 'sim' })
    expect(paid.xp.totalXp).toBe(XP_REWARDS.runSimulation)
    expect(appReducer(paid, { type: 'COMPLETE_QUEST', id: 'sim' }).xp.totalXp).toBe(
      XP_REWARDS.runSimulation,
    )
  })

  it('re-validates the decision on the way in, like PROFILE_SET does', () => {
    // The amount comes from a free-text field and the line from describeResult:
    // anything the sanitizer would reject at next load must not render now.
    const bad = appReducer(defaultState(), {
      type: 'RUN_SIM',
      decision: decision({ amountDA: Number.POSITIVE_INFINITY }),
    })
    expect(bad.decisions).toEqual([])
  })

  it('ignores a repeat of an id it already holds', () => {
    const once = appReducer(defaultState(), { type: 'RUN_SIM', decision: decision() })
    const twice = appReducer(once, { type: 'RUN_SIM', decision: decision({ amountDA: 99 }) })
    expect(twice).toBe(once)
  })

  it('records an outcome once, and pays nothing for it', () => {
    const state = withDecision()
    const closed = appReducer(state, {
      type: 'CLOSE_DECISION',
      id: 'd1',
      outcome: 'waited',
      date: '2026-08-06',
    })
    expect(closed.decisions[0].outcome).toBe('waited')
    expect(closed.decisions[0].outcomeDate).toBe('2026-08-06')
    // §12.1: no XP, no grant, no health snapshot, no transaction.
    expect(closed.xp).toEqual(state.xp)
    expect(closed.xpLog).toEqual([])
    expect(closed.transactions).toEqual([])
    expect(closed.prevHealthScore).toBe(state.prevHealthScore)
  })

  it('refuses to re-answer a decision that is already closed', () => {
    const closed = appReducer(withDecision(), {
      type: 'CLOSE_DECISION',
      id: 'd1',
      outcome: 'bought',
      date: '2026-08-06',
    })
    // A double tap, a StrictMode double-dispatch, or a stale peer answer: all
    // no-ops after the first, like COMPLETE_QUEST's atomic guard.
    const again = appReducer(closed, {
      type: 'CLOSE_DECISION',
      id: 'd1',
      outcome: 'waited',
      date: '2026-08-07',
    })
    expect(again).toBe(closed)
    expect(appReducer(closed, {
      type: 'CLOSE_DECISION',
      id: 'missing',
      outcome: 'waited',
      date: '2026-08-07',
    })).toBe(closed)
  })

  it('never rewrites the line — a later profile edit cannot change history', () => {
    // §12.5. The record shows what the app said THEN; recomputing it against
    // today's numbers would silently rewrite the past every time My numbers is
    // edited, which is the one thing a record may not do.
    const before = withDecision()
    const after = appReducer(before, {
      type: 'PROFILE_SET',
      profile: {
        monthlyIncome: 250_000,
        monthlyEssentials: 10_000,
        efBalance: null,
        debt: null,
        goal: null,
        savedDate: '2026-08-09',
      },
    })
    expect(after.profile).not.toBeNull()
    expect(after.decisions[0].line).toBe(before.decisions[0].line)
    expect(after.decisions).toEqual(before.decisions)
  })

  it('links the row a decision produced, and pays it exactly the normal rate', () => {
    const state = withDecision()
    const linked = appReducer(state, {
      type: 'LOG_TX',
      tx: tx({ id: 'bought-1', amountDA: 5_000, date: '2026-08-06' }),
      decisionId: 'd1',
    })
    expect(linked.decisions[0].txId).toBe('bought-1')
    // The link stamps an id and nothing else: same +5, same grant, as the
    // identical log with no decision behind it.
    const unlinked = appReducer(state, {
      type: 'LOG_TX',
      tx: tx({ id: 'bought-1', amountDA: 5_000, date: '2026-08-06' }),
    })
    expect(linked.xp).toEqual(unlinked.xp)
    expect(linked.xpLog).toEqual(unlinked.xpLog)
  })

  it('links the first row only — a later log is a different purchase', () => {
    const first = appReducer(withDecision(), {
      type: 'LOG_TX',
      tx: tx({ id: 'a' }),
      decisionId: 'd1',
    })
    const second = appReducer(first, {
      type: 'LOG_TX',
      tx: tx({ id: 'b' }),
      decisionId: 'd1',
    })
    expect(second.decisions[0].txId).toBe('a')
  })

  it('drops the link when the row is undone, and keeps the answer', () => {
    const linked = appReducer(withDecision({ outcome: 'bought', outcomeDate: '2026-08-06' }), {
      type: 'LOG_TX',
      tx: tx({ id: 'a' }),
      decisionId: 'd1',
    })
    const undone = appReducer(linked, { type: 'UNDO_TX', id: 'a' })
    // A record citing a transaction the ledger no longer holds is a dangling
    // claim — but undoing a mis-typed amount is not a retraction of what the
    // user said they did.
    expect(undone.decisions[0].txId).toBeUndefined()
    expect(undone.decisions[0].outcome).toBe('bought')
    expect(undone.transactions).toEqual([])
  })

  it('keeps one canonical key order however a decision grew its fields', () => {
    // mergeStates compares whole states as JSON STRINGS. A row that gained
    // txId before outcomeDate would never string-equal the same row loaded from
    // disk, and the merge fixpoint would never settle.
    const viaClose = appReducer(
      appReducer(withDecision(), {
        type: 'LOG_TX',
        tx: tx({ id: 'a' }),
        decisionId: 'd1',
      }),
      { type: 'CLOSE_DECISION', id: 'd1', outcome: 'resisted', date: '2026-08-06' },
    )
    const viaLog = appReducer(
      appReducer(withDecision(), {
        type: 'CLOSE_DECISION',
        id: 'd1',
        outcome: 'resisted',
        date: '2026-08-06',
      }),
      { type: 'LOG_TX', tx: tx({ id: 'a' }), decisionId: 'd1' },
    )
    expect(JSON.stringify(viaClose.decisions)).toBe(JSON.stringify(viaLog.decisions))
    expect(JSON.stringify(sanitizeState(viaClose).decisions)).toBe(
      JSON.stringify(viaClose.decisions),
    )
  })
})
