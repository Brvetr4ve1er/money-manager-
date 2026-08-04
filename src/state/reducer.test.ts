import { describe, it, expect } from 'vitest'
import { appReducer } from './reducer.ts'
import { XP_REWARDS, xpFromLog } from '../engine/xp.ts'
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

  it('takes off what the FOLD paid, not the grant’s face value, after a merge', () => {
    // THE ONLY WAY AN OVER-CAP GRANT REACHES THE LOG IS A MERGE. Inside one
    // tab LOG_TX refuses to write the third resist grant at all, so the log
    // never holds more than the cap. Two tabs that never saw each other each
    // write two, and the union holds four while xpFromLog — the authority —
    // pays for two.
    // Subtracting grant.amount there took 50 XP off a counter that had never
    // been paid it: the visible total dropped below the evidence, saveState
    // persisted the smaller number, and sanitizeState put it back at the next
    // load. A counter that falls and silently jumps back is the one thing the
    // two-track rule's engagement side must never do (store.ts, the xpLog cap
    // note).
    const resist = (id: string) => tx({ id, amountDA: 0, resistedImpulse: true, date: '2026-08-04' })
    let a = defaultState()
    let b = defaultState()
    for (const id of ['r0', 'r1']) a = appReducer(a, { type: 'LOG_TX', tx: resist(id) })
    for (const id of ['r2', 'r3']) b = appReducer(b, { type: 'LOG_TX', tx: resist(id) })
    const merged = appReducer(a, { type: 'HYDRATE', incoming: b })
    expect(merged.xpLog.filter((g) => g.action === 'resistImpulse')).toHaveLength(4)
    expect(merged.xp.totalXp).toBe(100)

    // Undo any one of the four. Three grants remain, the cap still pays two,
    // so the counter does not move.
    for (const id of ['r0', 'r1', 'r2', 'r3']) {
      const undone = appReducer(merged, { type: 'UNDO_TX', id })
      expect(undone.transactions).toHaveLength(3)
      expect(undone.xpLog.filter((g) => g.action === 'resistImpulse')).toHaveLength(3)
      expect(undone.xp.totalXp).toBe(100)
      // The counter and the evidence agree, so a reload changes nothing —
      // which is the property that was actually broken.
      expect(xpFromLog(undone.xpLog).totalXp).toBe(100)
      expect(sanitizeState(JSON.parse(JSON.stringify(undone))).xp.totalXp).toBe(100)
    }

    // …and once the log is back under the cap the subtraction is ordinary
    // again: two grants left, undo one, 50 XP leaves.
    let down = appReducer(merged, { type: 'UNDO_TX', id: 'r0' })
    down = appReducer(down, { type: 'UNDO_TX', id: 'r1' })
    expect(down.xp.totalXp).toBe(100)
    down = appReducer(down, { type: 'UNDO_TX', id: 'r2' })
    expect(down.xp.totalXp).toBe(50)
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

describe('READ_LESSON', () => {
  it('collects the lesson AND pays the day’s grant in one transition', () => {
    const next = appReducer(defaultState(), {
      type: 'READ_LESSON',
      id: 'budget-sketch',
      date: '2026-08-01',
    })
    expect(next.lessonsSeen).toEqual([{ id: 'budget-sketch', date: '2026-08-01' }])
    // The grant used to travel through COMPLETE_QUEST('lesson'); the quest list
    // is deleted (see XpStrip) and the daily XP is paid here, on a
    // deterministic per-day id — the pattern BOSS_VICTORY already used.
    expect(next.xp.totalXp).toBe(15)
    expect(next.xpLog).toEqual([
      { id: 'lesson:2026-08-01', action: 'readLesson', amount: 15, date: '2026-08-01' },
    ])
  })

  it('pays readLesson at most once per local day, on the grant id not a counter', () => {
    const s = appReducer(defaultState(), {
      type: 'READ_LESSON',
      id: 'budget-sketch',
      date: '2026-08-01',
    })
    // Same lesson, same day: the whole transition is a no-op (double tap,
    // StrictMode double-invoke, a re-fired mount effect after reload).
    expect(appReducer(s, { type: 'READ_LESSON', id: 'budget-sketch', date: '2026-08-01' })).toBe(s)
    // A DIFFERENT lesson on the same day still pays nothing: the cap is on the
    // DAY, exactly as the quest's per-(quest, day) grant id was.
    const second = appReducer(s, { type: 'READ_LESSON', id: 'track-first', date: '2026-08-01' })
    expect(second.lessonsSeen).toHaveLength(2)
    expect(second.xp.totalXp).toBe(15)
    expect(second.xpLog.map((g) => g.id)).toEqual(['lesson:2026-08-01'])
    // Tomorrow is a fresh id, so tomorrow pays.
    const tomorrow = appReducer(second, {
      type: 'READ_LESSON',
      id: 'invisible-category',
      date: '2026-08-02',
    })
    expect(tomorrow.xp.totalXp).toBe(30)
    expect(tomorrow.xpLog.map((g) => g.id)).toEqual(['lesson:2026-08-01', 'lesson:2026-08-02'])
  })

  it('still pays the day’s grant for a lesson already in the codex (the roster wraps)', () => {
    // lessonForDay serves an already-collected lesson once all 30 are seen; the
    // read is still a read, and the day's grant is still unpaid. Collection and
    // payment are two guards, not one.
    const s = appReducer(defaultState(), {
      type: 'READ_LESSON',
      id: 'budget-sketch',
      date: '2026-08-01',
    })
    const later = appReducer(s, { type: 'READ_LESSON', id: 'budget-sketch', date: '2026-09-01' })
    expect(later.xp.totalXp).toBe(30)
    expect(later.xpLog.map((g) => g.id)).toEqual(['lesson:2026-08-01', 'lesson:2026-09-01'])
    // …and the codex keeps the FIRST read date, which is what lessonForDay's
    // no-repeat rotation keys off.
    expect(later.lessonsSeen).toEqual([{ id: 'budget-sketch', date: '2026-08-01' }])
  })

  it('honours the PREVIOUS build’s grant id, so the upgrade day pays once', () => {
    // The quest deletion renamed the daily grant ids without a migration:
    // a payload written by the old build carries `quest:lesson:<day>`, and
    // sanitizeState preserves those grants on purpose. A guard that only knew
    // `lesson:<day>` did not see yesterday's payment, so the upgrade day paid
    // twice — 30 XP for one read, with both grants sitting in the log.
    const loaded = sanitizeState({
      ...defaultState(),
      xp: { level: 1, xpIntoLevel: 30, totalXp: 30 },
      xpLog: [
        { id: 'quest:lesson:2026-08-04', action: 'readLesson', amount: 15, date: '2026-08-04' },
        { id: 'quest:sim:2026-08-04', action: 'runSimulation', amount: 15, date: '2026-08-04' },
      ],
    })
    expect(loaded.xp.totalXp).toBe(30)
    const read = appReducer(loaded, {
      type: 'READ_LESSON',
      id: 'budget-sketch',
      date: '2026-08-04',
    })
    expect(read.xp.totalXp).toBe(30)
    expect(read.xpLog.map((g) => g.id)).toEqual([
      'quest:lesson:2026-08-04',
      'quest:sim:2026-08-04',
    ])
    // …and the lesson still lands in the codex: collection and payment are two
    // guards, and only the payment one is migrated.
    expect(read.lessonsSeen).toEqual([{ id: 'budget-sketch', date: '2026-08-04' }])
    // The next day is a fresh id under the NEW scheme and pays normally.
    const tomorrow = appReducer(read, {
      type: 'READ_LESSON',
      id: 'track-first',
      date: '2026-08-05',
    })
    expect(tomorrow.xp.totalXp).toBe(45)
    expect(tomorrow.xpLog.some((g) => g.id === 'lesson:2026-08-05')).toBe(true)
  })

  it('keeps the original first-read date on a repeat read (rotation keys off it)', () => {
    const s = appReducer(defaultState(), {
      type: 'READ_LESSON',
      id: 'budget-sketch',
      date: '2026-08-01',
    })
    const again = appReducer(s, { type: 'READ_LESSON', id: 'budget-sketch', date: '2026-08-02' })
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
})

describe('ROLL_DAY', () => {
  it('returns the same state when the snapshot day already matches (render-free no-op)', () => {
    const s = { ...defaultState(), healthDate: '2026-08-01' }
    expect(
      appReducer(s, { type: 'ROLL_DAY', today: '2026-08-01', healthScore: 61, healthStage: 'hearth' }),
    ).toBe(s)
  })
  it('snapshots health once on a new day', () => {
    const s = { ...defaultState(), healthDate: '2026-07-31' }
    const next = appReducer(s, {
      type: 'ROLL_DAY',
      today: '2026-08-01',
      healthScore: 58.5,
      healthStage: 'hearth',
    })
    expect(next.healthDate).toBe('2026-08-01')
    expect(next.prevHealthScore).toBe(58.5)
    expect(next.stage).toBe('hearth')
  })
  it('rolls no engagement state — the day key is in the grant ids, not in a list', () => {
    // ROLL_DAY used to reset the daily quest list as well, which is why it fired
    // on two dates. The grants that outlived the quests (`lesson:<day>`,
    // `sim:<day>`) carry the day IN the id, so midnight needs no sweep: the
    // rollover cannot re-open or re-pay anything, and a stale snapshot day is
    // the only thing left for this action to fix.
    const s = { ...defaultState(), healthDate: '2026-08-01', prevHealthScore: 40 }
    s.xpLog = [{ id: 'lesson:2026-08-01', action: 'readLesson', amount: 15, date: '2026-08-01' }]
    const next = appReducer(s, {
      type: 'ROLL_DAY',
      today: '2026-08-01',
      healthScore: 99,
      healthStage: 'beacon',
    })
    expect(next).toBe(s)
    expect(next.prevHealthScore).toBe(40) // snapshot untouched within the day
    expect(next.xpLog).toHaveLength(1)
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

  it('pays runSimulation once per local day, on the grant id', () => {
    const next = appReducer(defaultState(), { type: 'RUN_SIM', decision: decision() })
    // The grant used to travel through COMPLETE_QUEST('sim'); the quest is
    // deleted (see XpStrip) and the run pays for itself, on the deterministic
    // per-day id a peer tab's merge dedupes against.
    expect(next.xp.totalXp).toBe(XP_REWARDS.runSimulation)
    expect(next.xpLog).toEqual([
      {
        id: 'sim:2026-08-04',
        action: 'runSimulation',
        amount: XP_REWARDS.runSimulation,
        date: '2026-08-04',
      },
    ])
  })

  it('RECORDS the second run of a day and pays nothing for it', () => {
    // The record is data; only the grant is capped. Refusing to file the second
    // run would be the engagement track deciding what the money record is
    // allowed to remember.
    const once = appReducer(defaultState(), { type: 'RUN_SIM', decision: decision() })
    const twice = appReducer(once, {
      type: 'RUN_SIM',
      decision: decision({ id: 'd2', amountDA: 9_000 }),
    })
    expect(twice.decisions.map((d) => d.id)).toEqual(['d2', 'd1'])
    expect(twice.xp.totalXp).toBe(XP_REWARDS.runSimulation)
    expect(twice.xpLog.map((g) => g.id)).toEqual(['sim:2026-08-04'])
    // Tomorrow is a fresh id, so tomorrow pays.
    const tomorrow = appReducer(twice, {
      type: 'RUN_SIM',
      decision: decision({ id: 'd3', date: '2026-08-05' }),
    })
    expect(tomorrow.xp.totalXp).toBe(XP_REWARDS.runSimulation * 2)
    expect(tomorrow.xpLog.map((g) => g.id)).toEqual(['sim:2026-08-04', 'sim:2026-08-05'])
  })

  it('honours the PREVIOUS build’s sim grant id too', () => {
    // Same migration as READ_LESSON's: `quest:sim:<day>` was the id the deleted
    // quest minted, sanitizeState keeps those grants, so the upgrade day would
    // otherwise pay the simulator twice. The RECORD still files — only the
    // grant is capped.
    const loaded = sanitizeState({
      ...defaultState(),
      xp: { level: 1, xpIntoLevel: 15, totalXp: 15 },
      xpLog: [
        { id: 'quest:sim:2026-08-04', action: 'runSimulation', amount: 15, date: '2026-08-04' },
      ],
    })
    const next = appReducer(loaded, { type: 'RUN_SIM', decision: decision() })
    expect(next.decisions.map((d) => d.id)).toEqual(['d1'])
    expect(next.xp.totalXp).toBe(15)
    expect(next.xpLog.map((g) => g.id)).toEqual(['quest:sim:2026-08-04'])
  })

  it('re-validates the decision on the way in, like PROFILE_SET does', () => {
    // The amount comes from a free-text field and the line from describeResult:
    // anything the sanitizer would reject at next load must not render now.
    const bad = appReducer(defaultState(), {
      type: 'RUN_SIM',
      decision: decision({ amountDA: Number.POSITIVE_INFINITY }),
    })
    expect(bad.decisions).toEqual([])
    // …and a rejected run pays nothing: the grant rides on a decision that
    // survived the sanitizer, never on the dispatch.
    expect(bad.xpLog).toEqual([])
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

  // ── ANSWER_CHECK_BACK ───────────────────────────────────────────────────

  const boughtState = (over: Partial<Decision> = {}) =>
    withDecision({ outcome: 'bought', outcomeDate: '2026-08-04', txId: 't1', ...over })

  it('files a check-back answer and pays absolutely nothing for it', () => {
    const state = boughtState()
    const next = appReducer(state, {
      type: 'ANSWER_CHECK_BACK',
      id: 'd1',
      answer: 'using',
      date: '2026-08-18',
    })
    expect(next.decisions[0].checkBack).toBe('using')
    expect(next.decisions[0].checkBackDate).toBe('2026-08-18')
    // §12.1, and it is stricter than CLOSE_DECISION's: a decision at least
    // produces a money row on one of its three branches. A check-back produces
    // NOTHING — every other field of the state is byte-identical.
    const { decisions: _a, ...restBefore } = state
    const { decisions: _b, ...restAfter } = next
    expect(JSON.stringify(restAfter)).toBe(JSON.stringify(restBefore))
  })

  it('answers once — a second dispatch is a no-op, like every other guard here', () => {
    const answered = appReducer(boughtState(), {
      type: 'ANSWER_CHECK_BACK',
      id: 'd1',
      answer: 'stopped',
      date: '2026-08-18',
    })
    // Double tap, StrictMode double-invoke, or a stale peer answer arriving
    // after this tab already filed one.
    const again = appReducer(answered, {
      type: 'ANSWER_CHECK_BACK',
      id: 'd1',
      answer: 'using',
      date: '2026-08-19',
    })
    expect(again).toBe(answered)
    expect(
      appReducer(answered, {
        type: 'ANSWER_CHECK_BACK',
        id: 'missing',
        answer: 'using',
        date: '2026-08-19',
      }),
    ).toBe(answered)
  })

  it('refuses to answer a row the app never asked about', () => {
    // Only a bought row is ever asked (checkBackDueOn), so a dispatch against
    // any other outcome is not a user action this build can produce.
    for (const outcome of ['open', 'waited', 'resisted'] as const) {
      const state = withDecision({
        outcome,
        outcomeDate: outcome === 'open' ? undefined : '2026-08-04',
      })
      expect(
        appReducer(state, {
          type: 'ANSWER_CHECK_BACK',
          id: 'd1',
          answer: 'using',
          date: '2026-08-18',
        }),
      ).toBe(state)
    }
  })

  it('freezes the whole record row while answering it (§12.5)', () => {
    const state = boughtState({ demo: false })
    const before = state.decisions[0]
    const after = appReducer(state, {
      type: 'ANSWER_CHECK_BACK',
      id: 'd1',
      answer: 'unused',
      date: '2026-08-18',
    }).decisions[0]
    for (const key of ['line', 'demo', 'amountDA', 'outcome', 'outcomeDate', 'txId', 'date'] as const) {
      expect(`${key}: ${JSON.stringify(after[key])}`).toBe(`${key}: ${JSON.stringify(before[key])}`)
    }
    // …and the row still round-trips through the sanitizer without moving a
    // key, so the merge fixpoint still settles.
    const next = appReducer(state, {
      type: 'ANSWER_CHECK_BACK',
      id: 'd1',
      answer: 'unused',
      date: '2026-08-18',
    })
    expect(JSON.stringify(sanitizeState(next).decisions)).toBe(JSON.stringify(next.decisions))
  })
})
