import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  addDaysISO,
  CHECK_BACK_ANSWERS,
  CHECK_BACK_DAYS,
  checkBackDueOn,
  checkBackState,
  DECISION_LINE_MAX_LEN,
  DECISION_MAX,
  defaultState,
  exportJSON,
  mergeStates,
  newDecisionId,
  newId,
  NOTE_MAX_LEN,
  sanitizeState,
  todayISO,
  type AppState,
  type Decision,
  type Transaction,
} from './store.ts'
import { MAX_TOTAL_XP, xpFromLog, xpStateFromTotal, type XpGrant } from '../engine/xp.ts'

describe('todayISO', () => {
  it('uses the local calendar day, not UTC', () => {
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(todayISO()).toBe(expected)
  })
})

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses crypto.randomUUID when available', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('still produces unique ids when randomUUID is missing (plain-http contexts)', () => {
    // randomUUID exists only in secure contexts; on plain-http hosting the
    // fallback must keep the core logging action working instead of throwing.
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    })
    const a = newId()
    const b = newId()
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
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
    expect(state.lessonsSeen).toEqual([])
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

  it('drops calendar-impossible dates that pass the shape check', () => {
    // '2026-99-99' matches DAY_KEY_RE but compares lexicographically ABOVE
    // every real day of its year — a hand-edited payload could pin such a row
    // inside every trailing window and atop the ledger sort forever.
    const base = { id: 'a', amountDA: 100, category: 'Food' }
    const state = sanitizeState({
      transactions: [
        { ...base, id: 'b', date: '2026-99-99' },
        { ...base, id: 'c', date: '2026-02-30' },
        { ...base, id: 'd', date: '2026-00-10' },
        { ...base, id: 'e', date: '2024-02-29' }, // a real leap day stays
      ],
    })
    expect(state.transactions.map((t) => t.id)).toEqual(['e'])
  })

  it('memoises day-key validity without ever letting a bad key inherit a good verdict', () => {
    // The check is cached (it runs once per row on a pre-first-paint load), so
    // the verdicts must stay per-key and stable across repeats — a cache keyed
    // loosely, or one that returned the previous answer on a miss, would let
    // '2026-02-30' ride in behind the '2026-02-28' validated just before it.
    const base = { id: 'a', amountDA: 100, category: 'Food' }
    const rows = [
      { ...base, id: 'good1', date: '2026-02-28' },
      { ...base, id: 'bad1', date: '2026-02-30' },
      { ...base, id: 'good2', date: '2026-02-28' },
      { ...base, id: 'bad2', date: '2026-02-30' },
    ]
    for (let i = 0; i < 3; i++) {
      const state = sanitizeState({ transactions: rows })
      expect(state.transactions.map((t) => t.id).sort()).toEqual(['good1', 'good2'])
    }
  })

  it('keeps validating correctly past the day-key cache cap', () => {
    // The cap exists so a hostile payload of all-distinct junk keys cannot
    // grow the map without bound. Past it the check must simply stop being
    // cached — never start guessing. 4096 is the cap; go well beyond it.
    const rows: unknown[] = []
    const day = new Date(2000, 0, 1)
    for (let i = 0; i < 5000; i++) {
      const d = new Date(day.getTime() + i * 86400000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      rows.push({ id: `ok${i}`, amountDA: 1, category: 'Food', date: key })
    }
    rows.push({ id: 'nope', amountDA: 1, category: 'Food', date: '2026-02-30' })
    const state = sanitizeState({ transactions: rows })
    expect(state.transactions).toHaveLength(5000)
    expect(state.transactions.some((t) => t.id === 'nope')).toBe(false)
  })

  it('drops a bad note WITHOUT dropping the row it rode in on', () => {
    // Strengthened from "drops the whole row": the note feeds no engine, so a
    // malformed memo must cost the memo and never the money fact. Losing the
    // row would delete a purchase the user logged because a string next to it
    // was the wrong type.
    const base = { id: 'a', amountDA: 100, category: 'Food', date: '2026-08-01' }
    const state = sanitizeState({
      transactions: [
        { ...base, id: 'b', note: 42 },
        { ...base, id: 'c', note: 'lunch' },
        { ...base, id: 'd', note: { text: 'lunch' } },
        { ...base, id: 'e', note: '   ' },
      ],
    })
    expect(state.transactions.map((t) => t.id)).toEqual(['b', 'c', 'd', 'e'])
    expect(state.transactions.map((t) => t.note)).toEqual([undefined, 'lunch', undefined, undefined])
    // The money facts on the repaired rows are untouched.
    expect(state.transactions[0].amountDA).toBe(100)
    expect(state.transactions[0].date).toBe('2026-08-01')
    // …and the amount is still what gates the row: a bad note is survivable,
    // a bad amount is not.
    expect(
      sanitizeState({ transactions: [{ ...base, amountDA: -5, note: 'lunch' }] }).transactions,
    ).toEqual([])
  })

  it('caps a note at the sanitizer boundary instead of persisting the whole payload', () => {
    // The quota failure this cap exists for: one hand-edited multi-MB memo
    // exhausts the origin budget and every future write fails (saveState
    // returns false — see the persistFailed path). The cap is the boundary
    // rule, not the field's maxLength, because a peer tab's payload and a
    // hand-edited localStorage never pass through the field at all.
    const state = sanitizeState({
      transactions: [
        { id: 'a', amountDA: 100, category: 'Food', date: '2026-08-01', note: 'x'.repeat(50_000) },
      ],
    })
    expect(state.transactions[0].note).toBe('x'.repeat(NOTE_MAX_LEN))
    expect(state.transactions[0].note!.length).toBe(NOTE_MAX_LEN)
  })

  it('cuts the cap where it cannot leave a trailing space to re-trim', () => {
    // Idempotence, at the one input that breaks it: a note whose 80th
    // character is a space would trim SHORTER on a second pass, and the merge
    // fixpoint compares whole states as JSON strings — a state that
    // stringifies differently every time it is sanitized never settles.
    const awkward = `${'y'.repeat(NOTE_MAX_LEN - 1)} tail`
    const once = sanitizeState({
      transactions: [{ id: 'a', amountDA: 1, category: 'Food', date: '2026-08-01', note: awkward }],
    })
    expect(once.transactions[0].note).toBe('y'.repeat(NOTE_MAX_LEN - 1))
    expect(JSON.stringify(sanitizeState(once))).toBe(JSON.stringify(once))
  })

  it('round-trips a note through serialise → sanitize unchanged, and idempotently', () => {
    // The real localStorage half of this round trip lives in persist.test.ts
    // (this file runs on the node environment). What is asserted here is the
    // sanitizer's own contract.
    const s = defaultState()
    s.transactions = [
      { id: 'a', amountDA: 2_000, category: 'Fun', note: 'cinema with M', date: '2026-08-01' },
    ]
    const once = sanitizeState(JSON.parse(JSON.stringify(s)))
    expect(once.transactions[0].note).toBe('cinema with M')
    // Idempotent: sanitizing an already-sanitized note must not change it, or
    // the merge fixpoint (which compares JSON strings) would never settle.
    expect(JSON.stringify(sanitizeState(once))).toBe(JSON.stringify(once))
  })

  it('keeps notes through a cross-tab merge, and settles instead of oscillating', () => {
    // Two tabs, one row each, both with notes. Union by id keeps both notes,
    // and re-merging the result changes nothing — the same fixpoint rule the
    // rest of the merge is held to, now with a free-text field in the row.
    const a = defaultState()
    a.transactions = [
      { id: 'a', amountDA: 100, category: 'Food', note: 'bread', date: '2026-08-01' },
    ]
    const b = defaultState()
    b.transactions = [
      { id: 'b', amountDA: 200, category: 'Fun', note: 'cinema', date: '2026-08-01' },
    ]
    const merged = mergeStates(a, b)
    expect(merged.transactions.map((t) => t.note).sort()).toEqual(['bread', 'cinema'])
    expect(mergeStates(merged, merged)).toBe(merged)
    // Commutative, notes included.
    expect(JSON.stringify(mergeStates(b, a))).toBe(JSON.stringify(merged))
  })

  it('carries notes into the export — the data that leaves with you includes them', () => {
    // Trust Rule 7. The note is the most personal string the app holds; an
    // export that silently omitted it would hand back a partial ledger.
    const s = defaultState()
    s.transactions = [
      { id: 'a', amountDA: 900, category: 'Food', note: 'birthday cake', date: '2026-08-01' },
    ]
    const parsed = JSON.parse(exportJSON(s)) as { transactions: Transaction[] }
    expect(parsed.transactions[0].note).toBe('birthday cake')
  })

  it('preserves row key order through a note repair, so merges still reach a fixpoint', () => {
    // mergeStates compares whole states as JSON strings. If sanitizing a note
    // rebuilt the row in a different key order than the app writes it, an
    // unchanged state would stringify differently after a load and two tabs
    // would re-save each other forever.
    const raw = { id: 'a', amountDA: 100, category: 'Food', note: ' lunch ', date: '2026-08-01' }
    const [row] = sanitizeState({ transactions: [raw] }).transactions
    expect(Object.keys(row)).toEqual(['id', 'amountDA', 'category', 'note', 'date'])
    expect(row.note).toBe('lunch')
  })

  it('rejects a malformed xp shape', () => {
    const state = sanitizeState({ xp: { level: 'high', xpIntoLevel: 3 } })
    expect(state.xp).toEqual(defaultState().xp)
  })

  it('rebuilds a corrupted xpIntoLevel from totalXp', () => {
    const state = sanitizeState({ xp: { level: 2, xpIntoLevel: -50, totalXp: 100 } })
    expect(state.xp).toEqual({ level: 2, xpIntoLevel: 0, totalXp: 100 })
  })

  it('derives level/xpIntoLevel from totalXp — persisted values are never trusted', () => {
    // The triple is by construction a pure function of totalXp; trusting
    // (even clamped) persisted level/xpIntoLevel would admit inconsistent
    // states the first cross-tab merge silently rewrites.
    const state = sanitizeState({ xp: { level: 3, xpIntoLevel: 1e9, totalXp: 400 } })
    expect(state.xp).toEqual(xpStateFromTotal(400))
    expect(state.xp.xpIntoLevel).toBeLessThan(200) // xpForLevel(3)
  })

  it('collapses an inflated level with no backing totalXp instead of rendering it', () => {
    // { level: 7, totalXp: 0 } used to pass both reconciliation branches and
    // show "Level 7" with zero evidence until the first merge dropped it to 1.
    const state = sanitizeState({ xp: { level: 7, xpIntoLevel: 10, totalXp: 0 }, xpLog: [] })
    expect(state.xp).toEqual({ level: 1, xpIntoLevel: 0, totalXp: 0 })
  })

  it('clamps negative totalXp to 0 and rebuilds the triple from it', () => {
    const state = sanitizeState({ xp: { level: 1.5, xpIntoLevel: 10, totalXp: -5 } })
    expect(state.xp).toEqual({ level: 1, xpIntoLevel: 0, totalXp: 0 })
  })

  it('clamps an absurd persisted totalXp instead of freezing the app at load', () => {
    // Regression: totalXp = 1e300 used to hang xpStateFromTotal's level loop
    // forever (float precision absorbs the per-level subtraction), bricking
    // every load AND every peer tab via the storage-event merge path — the
    // exact failure this sanitizer promises to prevent.
    const state = sanitizeState({ xp: { totalXp: 1e300 } })
    expect(state.xp.totalXp).toBe(MAX_TOTAL_XP)
    expect(state.xp).toEqual(xpStateFromTotal(MAX_TOTAL_XP))
  })

  it('drops an XP grant whose amount exceeds the product ceiling', () => {
    // xpFromLog sums grant amounts, so a single hand-edited 1e300 grant would
    // reach the same non-terminating derivation without this gate.
    const good = { id: 'tx:a', action: 'logExpense', amount: 5, date: '2026-08-01' }
    const state = sanitizeState({
      xpLog: [good, { id: 'huge', action: 'legacy', amount: 1e300, date: '' }],
    })
    expect(state.xpLog).toEqual([good])
    expect(state.xp.totalXp).toBe(5)
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

  it('rejects day keys that do not hold the YYYY-MM-DD shape', () => {
    // finalizeHealthThrough walks single-day steps from healthDate — a
    // free-form string ('never', an ISO timestamp) must not reach it.
    expect(sanitizeState({ healthDate: 'never' }).healthDate).toBe('')
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

  it('keeps valid XP grants, drops malformed ones, and dedupes by id', () => {
    const g = { id: 'tx:a', action: 'logExpense', amount: 5, date: '2026-08-01' }
    const state = sanitizeState({
      xpLog: [
        g,
        { ...g, amount: 3 }, // duplicate id — larger amount wins
        { id: 'bad-action', action: 'hack', amount: 5, date: '2026-08-01' },
        { id: 'bad-amount', action: 'logExpense', amount: -5, date: '2026-08-01' },
        { id: 'bad-date', action: 'logExpense', amount: 5, date: 'yesterday' },
        'junk',
      ],
    })
    expect(state.xpLog).toEqual([g])
    expect(state.xp.totalXp).toBe(5) // the log is evidence the counter lost
  })

  it('drops a grant dated on a day that does not exist', () => {
    // The gap was real and it BOUGHT something. isXpGrant validated the date
    // with the shape regex alone while every other date in the sanitizer went
    // through the calendar check — and xpFromLog buckets resist grants BY DATE,
    // so each impossible key minted its own bucket and its own allowance
    // against RESIST_XP_DAILY_CAP. Three grants on 2026-02-30 plus one on
    // 2026-99-99 survived intact and folded to 150 XP.
    const resist = (id: string, date: string) => ({
      id: `tx:${id}`,
      action: 'resistImpulse' as const,
      amount: 50,
      date,
    })
    const state = sanitizeState({
      xpLog: [
        resist('r0', '2026-02-28'),
        resist('r1', '2026-02-30'),
        resist('r2', '2026-02-30'),
        resist('r3', '2026-99-99'),
      ],
    })
    expect(state.xpLog.map((g) => g.id)).toEqual(['tx:r0'])
    // One real day, one day's cap — not four days' worth bought with three
    // dates the calendar does not have.
    expect(state.xp.totalXp).toBe(50)
    // Same rule for the loose day key, for consistency rather than for a live
    // exploit: it is rescued downstream, and it should not need to be.
    expect(sanitizeState({ healthDate: '2026-02-30' }).healthDate).toBe('')
  })

  it('banks a pre-log XP total as a mergeable legacy baseline grant', () => {
    // Older schemas carried only the counter: without a baseline entry, a
    // merge deriving XP from the unioned logs could pay less than the total
    // this payload already showed the user.
    const state = sanitizeState({
      xp: { level: 2, xpIntoLevel: 10, totalXp: 110 },
      xpLog: [{ id: 'tx:a', action: 'logExpense', amount: 5, date: '2026-08-01' }],
    })
    const legacy = state.xpLog.find((gr) => gr.action === 'legacy')
    expect(legacy?.amount).toBe(105)
    expect(state.xp.totalXp).toBe(110)
  })

  it('folds every historical quest grant at its original value (Trust Rule 7)', () => {
    // THE ENGAGEMENT TRACK MAY STOP PAYING AN ACTION; IT MAY NEVER UN-PAY ONE.
    // All four quests that ever shipped — log, lesson, sim and the earlier
    // `review` — minted `quest:<id>:<day>` grants against four XP_REWARDS
    // actions. The quests are deleted. Every one of those actions stays in the
    // table, so isXpGrant still accepts the grants and xpFromLog still folds
    // them; drop any of them and the counter the user was already shown would
    // silently shrink at their next load, with no server and no way back.
    const grants = [
      { id: 'quest:log:2026-08-01', action: 'logExpense', amount: 5, date: '2026-08-01' },
      { id: 'quest:lesson:2026-08-01', action: 'readLesson', amount: 15, date: '2026-08-01' },
      { id: 'quest:sim:2026-08-01', action: 'runSimulation', amount: 15, date: '2026-08-01' },
      { id: 'quest:review:2026-08-01', action: 'reviewRecent', amount: 10, date: '2026-08-01' },
      { id: 'boss:2026-07-27', action: 'weeklyBoss', amount: 150, date: '2026-08-02' },
    ]
    const state = sanitizeState({ xp: { level: 1, xpIntoLevel: 0, totalXp: 0 }, xpLog: grants })
    expect(state.xpLog).toEqual(grants)
    expect(state.xp).toEqual(xpFromLog(grants as XpGrant[]))
    expect(state.xp.totalXp).toBe(195)
    // No legacy top-up is minted either: the fold already equals the counter,
    // so there is nothing to reconcile.
    expect(state.xpLog.some((g) => g.action === 'legacy')).toBe(false)
  })

  it('loads a state written by the quest schema, losing nothing but the quests', () => {
    // THE ONE MIGRATION THIS DELETION HAS. `quests` and `questsDate` were real
    // persisted fields; they are read by nothing now (see XpStrip). This
    // sanitizer builds from defaultState() and copies only keys it recognises,
    // so an old payload still loads — the two dead fields drop out and every
    // transaction, decision, lesson and grant beside them comes through
    // untouched. Asserted rather than assumed: a throw here bricks the app on
    // the one device that has the old shape, and there is no server to fix it.
    const state = sanitizeState({
      quests: [
        { id: 'log', text: 'Log every purchase today', xpAction: 'logExpense', done: true },
        { id: 'bonus', text: 'Free XP', xpAction: 'hack', done: true },
        'junk',
      ],
      questsDate: '2026-99-99',
      transactions: [{ id: 'a', amountDA: 1200, category: 'Food', date: '2026-08-01' }],
      lessonsSeen: [{ id: 'budget-sketch', date: '2026-08-01' }],
      decisions: [
        {
          id: 'd1',
          date: '2026-08-01',
          amountDA: 5_000,
          line: 'Buy path ends lower. About 6 points below waiting.',
          demo: false,
          outcome: 'open',
        },
      ],
      xpLog: [
        { id: 'quest:log:2026-08-01', action: 'logExpense', amount: 5, date: '2026-08-01' },
      ],
    })
    expect(state.transactions).toHaveLength(1)
    expect(state.lessonsSeen).toEqual([{ id: 'budget-sketch', date: '2026-08-01' }])
    expect(state.decisions.map((d) => d.id)).toEqual(['d1'])
    expect(state.xpLog.map((g) => g.id)).toEqual(['quest:log:2026-08-01'])
    expect(state.xp.totalXp).toBe(5)
    // The dead fields do not survive onto the loaded state at all — a key
    // nothing reads is a key that drifts.
    expect('quests' in state).toBe(false)
    expect('questsDate' in state).toBe(false)
    expect(Object.keys(state)).toEqual(Object.keys(defaultState()))
  })

  it('keeps valid codex entries and drops unknown lesson ids and bad dates', () => {
    // An id outside the roster would inflate the codex count past its own
    // denominator; a non-calendar date breaks the lexicographic comparison
    // lessonForDay makes against today.
    const state = sanitizeState({
      lessonsSeen: [
        { id: 'budget-sketch', date: '2026-08-01' },
        { id: 'lesson-31', date: '2026-08-01' },
        { id: 'track-first', date: '2026-99-99' },
        { id: 'pay-yourself-first', date: 'yesterday' },
        'junk',
      ],
    })
    expect(state.lessonsSeen).toEqual([{ id: 'budget-sketch', date: '2026-08-01' }])
  })

  it('dedupes codex entries by id keeping the earliest date, in canonical order', () => {
    // The first-read day drives the no-repeat rotation, so the earlier date
    // must win in any order — and the sorted output is what lets the merge
    // fixpoint compare JSON strings.
    const state = sanitizeState({
      lessonsSeen: [
        { id: 'track-first', date: '2026-08-02' },
        { id: 'budget-sketch', date: '2026-08-03' },
        { id: 'track-first', date: '2026-08-01' },
      ],
    })
    expect(state.lessonsSeen).toEqual([
      { id: 'budget-sketch', date: '2026-08-03' },
      { id: 'track-first', date: '2026-08-01' },
    ])
  })

  it('defaults to a null profile (demo numbers) when the payload has none', () => {
    expect(sanitizeState({ muted: true }).profile).toBeNull()
  })

  it('keeps a valid profile, including blank (null) optional sections', () => {
    const profile = {
      monthlyIncome: 75_000,
      monthlyEssentials: 40_000,
      efBalance: null,
      debt: { balance: 12_000, minimum: 800 },
      goal: { name: 'Laptop', target: 200_000, current: 30_000, monthlyContribution: 8_000 },
      savedDate: '2026-08-01',
    }
    expect(sanitizeState({ profile }).profile).toEqual(profile)
  })

  it('treats missing optional profile sections as not-entered, never zero', () => {
    const state = sanitizeState({
      profile: { monthlyIncome: 75_000, monthlyEssentials: 40_000, savedDate: '2026-08-01' },
    })
    expect(state.profile).toEqual({
      monthlyIncome: 75_000,
      monthlyEssentials: 40_000,
      efBalance: null,
      debt: null,
      goal: null,
      savedDate: '2026-08-01',
    })
  })

  it('drops the whole profile when a required number is non-finite or negative', () => {
    // All-or-nothing: salvaging real income next to a NaN-turned-default
    // essentials would score a mixture the user never stated.
    const base = { monthlyIncome: 75_000, monthlyEssentials: 40_000, savedDate: '2026-08-01' }
    for (const bad of [
      { ...base, monthlyIncome: NaN },
      { ...base, monthlyIncome: Infinity },
      { ...base, monthlyEssentials: -1 },
      { ...base, monthlyIncome: '75000' },
      { ...base, efBalance: -5 },
    ]) {
      expect(sanitizeState({ profile: bad }).profile).toBeNull()
    }
  })

  it('drops the whole profile on a malformed debt or goal group', () => {
    const base = { monthlyIncome: 75_000, monthlyEssentials: 40_000, savedDate: '2026-08-01' }
    expect(
      sanitizeState({ profile: { ...base, debt: { balance: 5_000 } } }).profile,
    ).toBeNull() // minimum missing
    expect(
      sanitizeState({
        profile: { ...base, goal: { name: 7, target: 1_000, current: 0, monthlyContribution: 0 } },
      }).profile,
    ).toBeNull()
  })

  it('drops a profile whose savedDate is not a real calendar day', () => {
    // savedDate arbitrates recency lexicographically in mergeStates: an
    // impossible key like '2026-99-99' would make the profile unbeatable.
    const base = { monthlyIncome: 75_000, monthlyEssentials: 40_000 }
    for (const savedDate of ['2026-99-99', 'yesterday', '2026-08-01T10:00:00Z', undefined]) {
      expect(sanitizeState({ profile: { ...base, savedDate } }).profile).toBeNull()
    }
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
    // Pre-log legacy states (no grant evidence): the counter max still floors
    // the merge, so upgrading never loses XP.
    const local = base({ xp: { level: 2, xpIntoLevel: 10, totalXp: 110 } })
    const incoming = base({ xp: { level: 1, xpIntoLevel: 90, totalXp: 90 } })
    expect(mergeStates(local, incoming).xp).toEqual(local.xp)
    expect(mergeStates(incoming, local).xp).toEqual(local.xp)
  })

  it('keeps BOTH tabs’ XP grants when the tabs diverged — evidence unions, counters race', () => {
    // A frozen background tab missed a storage event, then the user acted in
    // it: A logged a purchase (+5) while B read the lesson (+15).
    // max(totalXp) alone would silently drop the +5 forever, even though the
    // merged transactions and grant log keep both pieces of evidence.
    const local = base({
      transactions: [mkTx('a')],
      xp: { level: 1, xpIntoLevel: 5, totalXp: 5 },
      xpLog: [{ id: 'tx:a', action: 'logExpense', amount: 5, date: '2026-08-01' }],
    })
    const incoming = base({
      lessonsSeen: [{ id: 'budget-sketch', date: '2026-08-01' }],
      xp: { level: 1, xpIntoLevel: 15, totalXp: 15 },
      xpLog: [{ id: 'lesson:2026-08-01', action: 'readLesson', amount: 15, date: '2026-08-01' }],
    })
    expect(mergeStates(local, incoming).xp.totalXp).toBe(20)
    expect(mergeStates(incoming, local).xp.totalXp).toBe(20)
  })

  it('re-applies the resist daily cap across the merged grant union', () => {
    // Each tab granted up to the cap on the same day before merging: the
    // union holds 4 resist grants but must pay only RESIST_XP_DAILY_CAP.
    const grant = (id: string) => ({ id: `tx:${id}`, action: 'resistImpulse' as const, amount: 50, date: '2026-08-01' })
    const local = base({
      transactions: [mkTx('r1', { resistedImpulse: true }), mkTx('r2', { resistedImpulse: true })],
      xp: { level: 2, xpIntoLevel: 0, totalXp: 100 },
      xpLog: [grant('r1'), grant('r2')],
    })
    const incoming = base({
      transactions: [mkTx('r3', { resistedImpulse: true }), mkTx('r4', { resistedImpulse: true })],
      xp: { level: 2, xpIntoLevel: 0, totalXp: 100 },
      xpLog: [grant('r3'), grant('r4')],
    })
    expect(mergeStates(local, incoming).xp.totalXp).toBe(100)
  })

  it('is commutative — crossed writes converge on one canonical payload', () => {
    // Both tabs saved before receiving each other's storage event. Each then
    // merges the other's write: unless merge(A,B) deep-equals merge(B,A),
    // every save produces a different JSON string and the storage-event →
    // HYDRATE → save ping-pong never settles.
    const a = base({
      transactions: [mkTx('x', { date: '2026-07-31' }), mkTx('shared')],
      xp: { level: 1, xpIntoLevel: 5, totalXp: 5 },
      xpLog: [{ id: 'tx:x', action: 'logExpense', amount: 5, date: '2026-07-31' }],
      prevHealthScore: 40,
      stage: 'ember',
      healthDate: '2026-08-01',
      muted: true,
    })
    const b = base({
      transactions: [mkTx('y'), mkTx('shared')],
      xp: { level: 1, xpIntoLevel: 10, totalXp: 10 },
      // reviewRecent, on purpose: the quest that minted this action is deleted,
      // and so is every other quest, but the ACTION stays in XP_REWARDS so
      // historical grants survive the sanitizer (see the note beside it in
      // engine/xp.ts). This is the regression that would catch its removal.
      xpLog: [{ id: 'quest:review:2026-08-01', action: 'reviewRecent', amount: 10, date: '2026-08-01' }],
      prevHealthScore: 44,
      stage: 'hearth',
      healthDate: '2026-08-01',
      muted: false,
    })
    expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
  })

  it('is commutative when two tabs mint the SAME grant id on different days', () => {
    /* THE HOLE THE TEST ABOVE CANNOT SEE: both its fixtures use disjoint grant
       ids, so no id-collision path is ever exercised — and the xpLog fold's
       tie-break was `g.amount > prev.amount`, strictly greater, which keeps
       whichever grant the iteration saw FIRST. That is always `local`, so
       merge(A,B) and merge(B,A) produced different bytes.

       It is reachable, not theoretical. reducer.ts writes the boss grant as
       { id: bossGrantId(weekStart), date: action.date }: the id names the WEEK
       and the date names TODAY. Tab A claims week W on Monday; a frozen
       background tab B that never saw the storage event claims the same week on
       Tuesday. Same id, same 150 XP, different dates.

       XP totals agree either way, so this was never an XP-integrity defect — it
       is a convergence defect, which is worse in a quiet way: both tabs believe
       they have converged, each persists different bytes, and whichever writes
       last decides what the export says about when the week was won. */
    const boss = (date: string) => ({
      id: 'boss:2026-07-27',
      action: 'weeklyBoss' as const,
      amount: 150,
      date,
    })
    const monday = base({
      xp: { level: 2, xpIntoLevel: 0, totalXp: 150 },
      xpLog: [boss('2026-08-03')],
    })
    const tuesday = base({
      xp: { level: 2, xpIntoLevel: 0, totalXp: 150 },
      xpLog: [boss('2026-08-04')],
    })
    expect(mergeStates(monday, tuesday)).toEqual(mergeStates(tuesday, monday))
    // …and the surviving date is the EARLIEST, the convention
    // dedupeEarliestById already sets for {id, date} collections: a claim never
    // drifts to a later day just because it was merged.
    expect(mergeStates(tuesday, monday).xpLog[0].date).toBe('2026-08-03')
    expect(mergeStates(monday, tuesday).xp.totalXp).toBe(150)
  })

  it('breaks a same-day snapshot tie symmetrically — higher score, not "keep local"', () => {
    const low = base({ healthDate: '2026-08-01', prevHealthScore: 40, stage: 'ember' })
    const high = base({ healthDate: '2026-08-01', prevHealthScore: 44, stage: 'hearth' })
    for (const merged of [mergeStates(low, high), mergeStates(high, low)]) {
      expect(merged.prevHealthScore).toBe(44)
      expect(merged.stage).toBe('hearth')
    }
  })

  it('returns the identical local reference when the merge changes nothing', () => {
    // The fixpoint short-circuit: HYDRATE hands React the same state object,
    // the re-render bails, and no echo write lands back in storage.
    const local = base({ transactions: [mkTx('a2'), mkTx('shared')] })
    const incoming = base({ transactions: [mkTx('shared')] })
    const merged = mergeStates(local, incoming)
    expect(mergeStates(merged, incoming)).toBe(merged)
  })

  it('never lets a stale peer write un-mute this tab', () => {
    // Mute merges as OR: sound returning against an explicit mute is the one
    // surprising direction, and there is no timestamp to arbitrate recency.
    expect(mergeStates(base({ muted: true }), base({ muted: false })).muted).toBe(true)
    expect(mergeStates(base({ muted: false }), base({ muted: true })).muted).toBe(true)
  })

  it('pays the day’s lesson and sim grants ONCE across two tabs that each minted them', () => {
    // THE MECHANISM THAT REPLACED THE QUEST DONE-FLAG UNION. Two tabs each
    // read today's lesson and ran a simulation before seeing each other's
    // write; both minted the same deterministic per-day ids. The grant log
    // unions BY ID, so the merge pays 15 + 15 rather than 30 + 30 — the same
    // result the done-flag union produced, with none of the state.
    const grants = [
      { id: 'lesson:2026-08-01', action: 'readLesson' as const, amount: 15, date: '2026-08-01' },
      { id: 'sim:2026-08-01', action: 'runSimulation' as const, amount: 15, date: '2026-08-01' },
    ]
    const local = base({ xp: { level: 1, xpIntoLevel: 30, totalXp: 30 }, xpLog: grants })
    const incoming = base({ xp: { level: 1, xpIntoLevel: 30, totalXp: 30 }, xpLog: grants })
    expect(mergeStates(local, incoming).xpLog.map((g) => g.id)).toEqual([
      'lesson:2026-08-01',
      'sim:2026-08-01',
    ])
    expect(mergeStates(local, incoming).xp.totalXp).toBe(30)
    expect(mergeStates(incoming, local).xp.totalXp).toBe(30)
  })

  it('unions the codex across tabs — a lesson collected in either tab stays collected', () => {
    const local = base({ lessonsSeen: [{ id: 'track-first', date: '2026-08-02' }] })
    const incoming = base({
      lessonsSeen: [
        { id: 'budget-sketch', date: '2026-08-01' },
        // Same lesson recorded on different days in diverged tabs: the
        // earliest first-read date wins in either merge order.
        { id: 'track-first', date: '2026-08-01' },
      ],
    })
    const expected = [
      { id: 'budget-sketch', date: '2026-08-01' },
      { id: 'track-first', date: '2026-08-01' },
    ]
    expect(mergeStates(local, incoming).lessonsSeen).toEqual(expected)
    expect(mergeStates(incoming, local).lessonsSeen).toEqual(expected)
  })

  const mkProfile = (over: Partial<NonNullable<AppState['profile']>> = {}) => ({
    monthlyIncome: 75_000,
    monthlyEssentials: 40_000,
    efBalance: null,
    debt: null,
    goal: null,
    savedDate: '2026-08-01',
    ...over,
  })

  it('a completed setup survives a peer write that still carries null', () => {
    const withProfile = base({ profile: mkProfile() })
    const without = base()
    expect(mergeStates(withProfile, without).profile).toEqual(mkProfile())
    expect(mergeStates(without, withProfile).profile).toEqual(mkProfile())
  })

  it('the newer savedDate wins across profile edits in different tabs', () => {
    const older = base({ profile: mkProfile({ monthlyIncome: 60_000, savedDate: '2026-07-20' }) })
    const newer = base({ profile: mkProfile({ savedDate: '2026-08-01' }) })
    expect(mergeStates(older, newer).profile?.monthlyIncome).toBe(75_000)
    expect(mergeStates(newer, older).profile?.monthlyIncome).toBe(75_000)
  })

  it('same-day profile edits converge on one deterministic winner in both tabs', () => {
    // No recency signal within a day: the tie-break is arbitrary but must be
    // symmetric, or crossed writes swap profiles forever without settling.
    const a = base({ profile: mkProfile({ monthlyIncome: 60_000 }) })
    const b = base({ profile: mkProfile({ monthlyIncome: 75_000 }) })
    const merged = mergeStates(a, b)
    expect(merged).toEqual(mergeStates(b, a))
    expect(mergeStates(merged, b)).toEqual(merged) // idempotent fixpoint
  })

  it('takes the newer health snapshot across a midnight roll', () => {
    // Tab B rolled midnight already; tab A is still on yesterday.
    const local = base({
      healthDate: '2026-07-31',
      prevHealthScore: 40,
      stage: 'ember',
    })
    const incoming = base({
      healthDate: '2026-08-01',
      prevHealthScore: 44,
      stage: 'hearth',
    })
    const merged = mergeStates(local, incoming)
    expect(merged.healthDate).toBe('2026-08-01')
    expect(merged.prevHealthScore).toBe(44)
    expect(merged.stage).toBe('hearth')
  })
})

describe('weekly boss grant persistence', () => {
  it('sanitizeState keeps a weeklyBoss grant and folds its 150 XP into the counter', () => {
    // The xpLog IS the once-per-week persistence for boss victories: a
    // sanitizer that dropped the grant would let a reload re-claim the week.
    const out = sanitizeState({
      xpLog: [{ id: 'boss:2026-07-27', action: 'weeklyBoss', amount: 150, date: '2026-08-03' }],
    })
    expect(out.xpLog).toEqual([
      { id: 'boss:2026-07-27', action: 'weeklyBoss', amount: 150, date: '2026-08-03' },
    ])
    expect(out.xp.totalXp).toBe(150)
  })

  it('two tabs claiming the same week merge to a single grant', () => {
    const grant = { id: 'boss:2026-07-27', action: 'weeklyBoss', amount: 150, date: '2026-08-03' } as const
    const a: AppState = { ...defaultState(), xpLog: [grant], xp: xpStateFromTotal(150) }
    const b: AppState = { ...defaultState(), xpLog: [{ ...grant }], xp: xpStateFromTotal(150) }
    const merged = mergeStates(a, b)
    expect(merged.xpLog).toHaveLength(1)
    expect(merged.xp.totalXp).toBe(150)
  })
})

describe('achievement persistence', () => {
  it('sanitizeState keeps valid unlocks and defaults to none', () => {
    expect(sanitizeState({}).achievements).toEqual([])
    const out = sanitizeState({
      achievements: [{ id: 'first-log', date: '2026-08-01' }],
    })
    expect(out.achievements).toEqual([{ id: 'first-log', date: '2026-08-01' }])
  })

  it('drops unlock ids outside the canonical roster and calendar-invalid dates', () => {
    const out = sanitizeState({
      achievements: [
        { id: 'hand-added', date: '2026-08-01' }, // no roster entry — no shelf inflation
        { id: 'first-resist', date: '2026-99-99' }, // impossible calendar day
        { id: 'first-resist', date: 'yesterday' },
        { id: 'streak-7', date: '2026-08-02' },
      ],
    })
    expect(out.achievements).toEqual([{ id: 'streak-7', date: '2026-08-02' }])
  })

  it('dedupes unlocks by id keeping the earliest date, in canonical order', () => {
    const out = sanitizeState({
      achievements: [
        { id: 'first-resist', date: '2026-08-05' },
        { id: 'first-log', date: '2026-08-03' },
        { id: 'first-resist', date: '2026-08-02' },
      ],
    })
    expect(out.achievements).toEqual([
      { id: 'first-log', date: '2026-08-03' },
      { id: 'first-resist', date: '2026-08-02' },
    ])
  })

  it('merges the badge shelf as a union — earned in either tab stays earned', () => {
    const a: AppState = {
      ...defaultState(),
      achievements: [
        { id: 'first-log', date: '2026-08-01' },
        { id: 'first-resist', date: '2026-08-04' },
      ],
    }
    const b: AppState = {
      ...defaultState(),
      achievements: [
        { id: 'first-resist', date: '2026-08-02' }, // earlier earn wins the date
        { id: 'ten-logs', date: '2026-08-05' },
      ],
    }
    const expected = [
      { id: 'first-log', date: '2026-08-01' },
      { id: 'first-resist', date: '2026-08-02' },
      { id: 'ten-logs', date: '2026-08-05' },
    ]
    expect(mergeStates(a, b).achievements).toEqual(expected)
    expect(mergeStates(b, a).achievements).toEqual(expected)
  })
})

/**
 * THE DECISION RECORD in the store — the layer that makes the simulator stop
 * forgetting. Each case below is a failure mode the surface cannot defend
 * against on its own: a corrupt payload, two tabs answering the same decision,
 * and the export promise (Trust Rule 7) reaching a field that did not exist
 * when that promise was written.
 */
describe('decisions — sanitize, merge, export', () => {
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

  it('round-trips a decision through the sanitizer unchanged', () => {
    const d = decision()
    expect(sanitizeState({ decisions: [d] }).decisions).toEqual([d])
    // Idempotent: the merge fixpoint compares whole states as JSON strings, so
    // a second pass must not produce a different one.
    const once = sanitizeState({ decisions: [d] })
    expect(JSON.stringify(sanitizeState(once))).toBe(JSON.stringify(once))
  })

  it('treats an unmarked decision as placeholder-based, never as personalised', () => {
    // Trust Rule 5. A row with no `demo` field is a row whose basis cannot be
    // verified — written by an older build, hand-edited, merged from a peer.
    // The honest reading of "we cannot tell" is "not the user's numbers", so
    // only an explicit false retires the disclosure.
    const { demo: _drop, ...unmarked } = decision()
    expect(sanitizeState({ decisions: [unmarked] }).decisions[0].demo).toBe(true)
    expect(sanitizeState({ decisions: [decision({ demo: false })] }).decisions[0].demo).toBe(false)
    // Non-booleans are not a licence to claim personalisation either.
    expect(
      sanitizeState({ decisions: [{ ...decision(), demo: 'no' }] }).decisions[0].demo,
    ).toBe(true)
  })

  it('defaults to an empty record, and an empty record is not an error', () => {
    expect(defaultState().decisions).toEqual([])
    expect(sanitizeState({}).decisions).toEqual([])
    expect(sanitizeState({ decisions: 'nope' }).decisions).toEqual([])
  })

  it('drops a malformed decision while the transactions beside it survive', () => {
    // "A bad memo costs the memo, never the row", applied one level up: a
    // decision is an independent record, so one corrupt entry must not take the
    // rest of the record — or the money rows in the same payload — with it.
    const good = decision({ id: 'ok' })
    const tx: Transaction = {
      id: 't1',
      amountDA: 1_200,
      category: 'Food',
      date: '2026-08-04',
    }
    const out = sanitizeState({
      transactions: [tx],
      decisions: [
        { ...decision(), id: 'nan', amountDA: Number.NaN },
        { ...decision(), id: 'inf', amountDA: Number.POSITIVE_INFINITY },
        { ...decision(), id: 'neg', amountDA: -1 },
        // Shape-valid, calendar-impossible — it would sort above every real day
        // in its year forever (the same rule transaction dates are held to).
        { ...decision(), id: 'feb30', date: '2026-02-30' },
        { ...decision(), id: 'verdict', outcome: 'regretted' },
        { ...decision(), id: 'noline', line: 42 },
        { ...decision(), id: 123 },
        { ...decision(), id: '' },
        good,
      ],
    })
    expect(out.decisions).toEqual([good])
    expect(out.transactions).toEqual([tx])
  })

  it('caps a pasted megabyte of a line instead of failing every later write', () => {
    // Same quota argument as NOTE_MAX_LEN: one multi-megabyte string exhausts
    // the origin's ~5MB budget by itself, after which saveState returns false
    // forever and the app runs permanently in its persistFailed state.
    const out = sanitizeState({
      decisions: [decision({ line: 'x'.repeat(4_000_000) })],
    })
    expect(out.decisions[0].line).toHaveLength(DECISION_LINE_MAX_LEN)
    // The row itself survives — the cap costs the tail of the line, not the
    // decision it describes.
    expect(out.decisions[0].amountDA).toBe(5_000)
  })

  it('holds the record to a bounded length, dropping the oldest', () => {
    const many = Array.from({ length: DECISION_MAX + 20 }, (_, i) =>
      decision({
        id: `d${String(i).padStart(3, '0')}`,
        // Two days: the newer day must be the one that survives.
        date: i < 20 ? '2026-08-01' : '2026-08-04',
      }),
    )
    const out = sanitizeState({ decisions: many })
    expect(out.decisions).toHaveLength(DECISION_MAX)
    // Newest day first, and nothing from the older day made the cut.
    expect(out.decisions.every((d) => d.date === '2026-08-04')).toBe(true)
    // The trim is a pure function of the SET, not of arrival order — that is
    // what lets sanitize and merge agree about which rows survive.
    expect(sanitizeState({ decisions: [...many].reverse() }).decisions).toEqual(out.decisions)
  })

  it('repairs an outcomeDate that does not belong to the outcome', () => {
    // An open decision has no outcome day; a stray one would render "Recorded"
    // beside a question the user never answered.
    const out = sanitizeState({
      decisions: [decision({ outcome: 'open', outcomeDate: '2026-08-05' })],
    })
    expect(out.decisions[0].outcomeDate).toBeUndefined()
    expect(out.decisions[0].outcome).toBe('open')
  })

  it('converges when two tabs answer different decisions', () => {
    const a: AppState = {
      ...defaultState(),
      decisions: [decision({ id: 'a', date: '2026-08-04' })],
    }
    const b: AppState = {
      ...defaultState(),
      decisions: [decision({ id: 'b', date: '2026-08-03' })],
    }
    // merge(A,B) deep-equals merge(B,A): crossed writes settle on one payload
    // instead of each tab adopting the other's ordering forever.
    expect(mergeStates(a, b).decisions).toEqual(mergeStates(b, a).decisions)
    expect(mergeStates(a, b).decisions.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('keeps a decision closed in either tab closed', () => {
    const open: AppState = { ...defaultState(), decisions: [decision()] }
    const closed: AppState = {
      ...defaultState(),
      decisions: [decision({ outcome: 'bought', outcomeDate: '2026-08-05', txId: 't9' })],
    }
    // Recording an outcome is a user action the other tab has no evidence
    // against; reviving it as open would ask the same question twice.
    for (const merged of [mergeStates(open, closed), mergeStates(closed, open)]) {
      expect(merged.decisions[0].outcome).toBe('bought')
      expect(merged.decisions[0].txId).toBe('t9')
    }
    expect(mergeStates(open, closed)).toEqual(mergeStates(closed, open))
  })

  it('settles two DIFFERENT answers to one decision on the same string', () => {
    // No recency signal exists (both closed the same day), so the tie-break is
    // arbitrary but SYMMETRIC — what matters is that both tabs land on one
    // payload rather than swapping answers forever.
    const a: AppState = {
      ...defaultState(),
      decisions: [decision({ outcome: 'bought', outcomeDate: '2026-08-05' })],
    }
    const b: AppState = {
      ...defaultState(),
      decisions: [decision({ outcome: 'waited', outcomeDate: '2026-08-05' })],
    }
    expect(JSON.stringify(mergeStates(a, b))).toBe(JSON.stringify(mergeStates(b, a)))
    expect(mergeStates(a, b).decisions).toHaveLength(1)
    // …and re-merging the result changes nothing (the fixpoint).
    const once = mergeStates(a, b)
    expect(mergeStates(once, a)).toEqual(once)
    expect(mergeStates(once, b)).toEqual(once)
  })

  it('mints ids that sort chronologically inside a day', () => {
    // The record renders newest-first and the top row is the one the card
    // treats as the current projection, so ordering inside a day has to be
    // chronological — a bare uuid would put a fresh run second.
    const early = newDecisionId()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.now() + 60_000))
    const late = newDecisionId()
    vi.useRealTimers()
    expect(late > early).toBe(true)
    // Fixed width, so the comparison stays lexicographic rather than numeric.
    expect(early.split('-')[0]).toHaveLength(9)
    expect(late.split('-')[0]).toHaveLength(9)
  })

  it('carries the record into the export — Trust Rule 7 covers it too', () => {
    const state: AppState = {
      ...defaultState(),
      decisions: [decision({ outcome: 'waited', outcomeDate: '2026-08-05' })],
    }
    const parsed = JSON.parse(exportJSON(state)) as { decisions: Decision[] }
    expect(parsed.decisions).toEqual(state.decisions)
    // The frozen projection leaves with it: an export that dropped the line
    // would hand back an amount and a date with no record of what was said.
    expect(parsed.decisions[0].line).toBe(state.decisions[0].line)
  })

  // ── THE CHECK-BACK ──────────────────────────────────────────────────────
  //
  // Fourteen days after a decision closes as "Bought it", the record asks one
  // factual question about the object and files the answer. The storage layer's
  // whole job is that the answer survives a reload and a cross-tab merge
  // WITHOUT disturbing anything else on the row (§12.5) and without ever
  // becoming a number (§12.6).

  const bought = (over: Partial<Decision> = {}): Decision =>
    decision({ outcome: 'bought', outcomeDate: '2026-08-04', txId: 't1', ...over })

  it('schedules a check-back only for a bought row, and only after the horizon', () => {
    const b = bought()
    expect(checkBackDueOn(b)).toBe(addDaysISO('2026-08-04', CHECK_BACK_DAYS))
    // A row closed TODAY renders the scheduled line, never the question — and
    // that boundary is a property of the constant, not of a comparison.
    expect(checkBackState(b, '2026-08-04')).toBe('scheduled')
    expect(checkBackState(b, addDaysISO('2026-08-04', CHECK_BACK_DAYS - 1))).toBe('scheduled')
    expect(checkBackState(b, addDaysISO('2026-08-04', CHECK_BACK_DAYS))).toBe('due')
    // …and stays due afterwards: a user who did not open the app on day 14
    // must not lose the question on day 20.
    expect(checkBackState(b, addDaysISO('2026-08-04', 60))).toBe('due')
    // Nothing else schedules one. "Waited" and "Resisted it" bought no object,
    // and an open row has not said anything happened at all.
    for (const outcome of ['open', 'waited', 'resisted'] as const) {
      const other = decision({ outcome, outcomeDate: outcome === 'open' ? undefined : '2026-08-04' })
      expect(`${outcome}: ${checkBackDueOn(other)}`).toBe(`${outcome}: null`)
      expect(checkBackState(other, '2027-01-01')).toBe('none')
    }
    // A bought row with no outcomeDate has no anchor to count from, so it
    // schedules nothing rather than guessing one.
    const undated = decision({ outcome: 'bought' })
    expect(checkBackDueOn(undated)).toBeNull()
  })

  it('keeps only an enumerated answer, and a bad one costs the answer not the row', () => {
    const answered = bought({ checkBack: 'using', checkBackDate: '2026-08-18' })
    expect(sanitizeState({ decisions: [answered] }).decisions).toEqual([answered])
    // Round-trips to an identical JSON string: the merge fixpoint compares
    // whole states as strings, so a second pass must not reorder the keys.
    const once = sanitizeState({ decisions: [answered] })
    expect(JSON.stringify(sanitizeState(once))).toBe(JSON.stringify(once))
    for (const junk of ['loved it', 'worth it', '', 42, null, { a: 1 }]) {
      const [row] = sanitizeState({
        decisions: [{ ...bought(), checkBack: junk, checkBackDate: '2026-08-18' }],
      }).decisions
      // The row survives with every money fact intact…
      expect(row).toMatchObject({ id: 'd1', amountDA: 5_000, outcome: 'bought', txId: 't1' })
      // …and the answer is simply not there — no default, no guess.
      expect(`${JSON.stringify(junk)}: ${row.checkBack}`).toBe(
        `${JSON.stringify(junk)}: undefined`,
      )
      expect(row.checkBackDate).toBeUndefined()
    }
    // An impossible day key loses the DATE and keeps the answer — same repair
    // rule outcomeDate follows, for the same reason: the user still said it.
    const repaired = sanitizeState({
      decisions: [bought({ checkBack: 'unused', checkBackDate: '2026-02-30' })],
    }).decisions[0]
    expect(repaired.checkBack).toBe('unused')
    expect(repaired.checkBackDate).toBeUndefined()
  })

  it('refuses an answer on a row the app would never have asked about', () => {
    // Only 'bought' rows are ever asked (see checkBackDueOn), so an answer on a
    // waited or resisted row is data this build could not have written. It
    // costs the answer, never the row.
    for (const outcome of ['open', 'waited', 'resisted'] as const) {
      const [row] = sanitizeState({
        decisions: [
          {
            ...decision({ outcome, outcomeDate: outcome === 'open' ? undefined : '2026-08-04' }),
            checkBack: 'using',
          },
        ],
      }).decisions
      expect(`${outcome}: ${row.outcome} ${row.checkBack}`).toBe(`${outcome}: ${outcome} undefined`)
    }
  })

  it('answers survive a merge — answered beats unanswered, in either order', () => {
    // AND THE JSON TIE-BREAK GETS THIS BACKWARDS ON ITS OWN. `checkBack` is the
    // last key in canonical order, so the unanswered row ends `"txId":"t1"}`
    // where the answered one continues `"txId":"t1","checkBack":…` — and '}'
    // (0x7D) sorts above ',' (0x2C). Without the explicit clause in
    // preferDecision, a question the user already answered comes back after
    // every peer write.
    const open = { ...defaultState(), decisions: [bought()] }
    const done = { ...defaultState(), decisions: [bought({ checkBack: 'stopped', checkBackDate: '2026-08-18' })] }
    for (const merged of [mergeStates(open, done), mergeStates(done, open)]) {
      expect(merged.decisions[0].checkBack).toBe('stopped')
      expect(merged.decisions[0].checkBackDate).toBe('2026-08-18')
    }
    // Commutative, and it settles: two DIFFERENT answers carry no recency
    // signal, so the greater JSON string wins — arbitrary but symmetric.
    const a = { ...defaultState(), decisions: [bought({ checkBack: 'using', checkBackDate: '2026-08-18' })] }
    const b = { ...defaultState(), decisions: [bought({ checkBack: 'unused', checkBackDate: '2026-08-19' })] }
    expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
    const settled = mergeStates(a, b)
    expect(mergeStates(settled, b)).toEqual(settled)
    expect(CHECK_BACK_ANSWERS.map((x) => x.answer)).toContain(settled.decisions[0].checkBack)
  })

  it('freezes everything else on the row when the answer lands', () => {
    // §12.5. A check-back ANSWERS the record; it does not edit it.
    const before = bought({ demo: false })
    const after = sanitizeState({
      decisions: [{ ...before, checkBack: 'using', checkBackDate: '2026-08-18' }],
    }).decisions[0]
    const { checkBack: _a, checkBackDate: _d, ...rest } = after
    expect(rest).toEqual(before)
  })

  it('carries the answer into the export — Trust Rule 7 covers it too', () => {
    const state: AppState = {
      ...defaultState(),
      decisions: [bought({ checkBack: 'stopped', checkBackDate: '2026-08-18' })],
    }
    const parsed = JSON.parse(exportJSON(state)) as { decisions: Decision[] }
    expect(parsed.decisions[0].checkBack).toBe('stopped')
    expect(parsed.decisions[0].checkBackDate).toBe('2026-08-18')
  })

  it('states the cap edge it cannot fix, rather than pretending it has none', () => {
    // DECISION_MAX trims from the OLDEST end, which is exactly where the most
    // overdue check-backs live. A user who runs more than DECISION_MAX sims
    // inside the window loses pending questions silently. Asserted so the edge
    // is a known, tested property instead of a surprise — see the note above
    // canonicalDecisions for why it is not "fixed" by exempting these rows.
    const many = Array.from({ length: DECISION_MAX + 5 }, (_, i) =>
      bought({ id: `d${String(i).padStart(3, '0')}`, date: addDaysISO('2026-08-04', i) }),
    )
    const kept = sanitizeState({ decisions: many }).decisions
    expect(kept).toHaveLength(DECISION_MAX)
    // The five oldest — the five nearest their due day — are the ones gone.
    expect(kept.some((d) => d.id === 'd000')).toBe(false)
    expect(kept.some((d) => d.id === `d${String(DECISION_MAX + 4).padStart(3, '0')}`)).toBe(true)
  })
})
