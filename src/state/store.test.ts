import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  defaultState,
  mergeStates,
  newId,
  sanitizeState,
  todayISO,
  rollQuests,
  type AppState,
  type Transaction,
} from './store.ts'
import { MAX_TOTAL_XP, xpStateFromTotal } from '../engine/xp.ts'

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
    const state = sanitizeState({ healthDate: 'never', questsDate: '2026-08-01T00:00:00Z' })
    expect(state.healthDate).toBe('')
    expect(state.questsDate).toBe(defaultState().questsDate)
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
    // Pre-log legacy states (no grant evidence): the counter max still floors
    // the merge, so upgrading never loses XP.
    const local = base({ xp: { level: 2, xpIntoLevel: 10, totalXp: 110 } })
    const incoming = base({ xp: { level: 1, xpIntoLevel: 90, totalXp: 90 } })
    expect(mergeStates(local, incoming).xp).toEqual(local.xp)
    expect(mergeStates(incoming, local).xp).toEqual(local.xp)
  })

  it('keeps BOTH tabs’ XP grants when the tabs diverged — evidence unions, counters race', () => {
    // A frozen background tab missed a storage event, then the user acted in
    // it: A logged a purchase (+5) while B completed the review quest (+10).
    // max(totalXp) alone would silently drop the +5 forever, even though the
    // merged transactions and quest flags keep both pieces of evidence.
    const local = base({
      transactions: [mkTx('a')],
      xp: { level: 1, xpIntoLevel: 5, totalXp: 5 },
      xpLog: [{ id: 'tx:a', action: 'logExpense', amount: 5, date: '2026-08-01' }],
    })
    const incoming = base({
      quests: defaultState().quests.map((q) => ({ ...q, done: q.id === 'review' })),
      xp: { level: 1, xpIntoLevel: 10, totalXp: 10 },
      xpLog: [{ id: 'quest:review:2026-08-01', action: 'reviewRecent', amount: 10, date: '2026-08-01' }],
    })
    expect(mergeStates(local, incoming).xp.totalXp).toBe(15)
    expect(mergeStates(incoming, local).xp.totalXp).toBe(15)
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
      xpLog: [{ id: 'quest:review:2026-08-01', action: 'reviewRecent', amount: 10, date: '2026-08-01' }],
      prevHealthScore: 44,
      stage: 'hearth',
      healthDate: '2026-08-01',
      muted: false,
    })
    expect(mergeStates(a, b)).toEqual(mergeStates(b, a))
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
