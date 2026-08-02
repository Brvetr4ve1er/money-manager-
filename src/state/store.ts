/**
 * Local-first persistence. Manual logging is the core mechanic, not a
 * fallback — the store is built around fast transaction entry.
 */

import {
  MAX_TOTAL_XP,
  XP_REWARDS,
  xpFromLog,
  xpStateFromTotal,
  type XpAction,
  type XpGrant,
  type XpState,
} from '../engine/xp.ts'
import type { Stage } from '../engine/healthScore.ts'

export interface Transaction {
  id: string
  amountDA: number
  category: string
  note?: string
  /** ISO date string. */
  date: string
  /** True when this entry was flagged as a resisted impulse (no money spent). */
  resistedImpulse?: boolean
  /** True when the user explicitly flagged this purchase as a yielded impulse
   *  (a future "I bought it anyway" flow). Only flagged events may count
   *  against Impulse Control — ordinary planned spending never does. */
  impulseFlagged?: boolean
}

export interface Quest {
  id: string
  text: string
  xpAction: XpAction
  /** True when the app itself verifies completion (e.g. SimCard dispatches on
   *  an actual simulation run). Verified quests render as non-interactive
   *  status rows — a tap must never self-report a quest the code promises is
   *  verified. */
  verified?: boolean
  done: boolean
}

export interface AppState {
  transactions: Transaction[]
  xp: XpState
  /** Append-only XP grant evidence, unioned by id across tabs (see mergeStates). */
  xpLog: XpGrant[]
  prevHealthScore: number | null
  stage: Stage | null
  /** Local day (YYYY-MM-DD) the health snapshot was last persisted; '' = never. */
  healthDate: string
  quests: Quest[]
  questsDate: string
  muted: boolean
}

const KEY = 'ember-state-v1'

export const DEFAULT_QUESTS: Omit<Quest, 'done'>[] = [
  { id: 'log', text: 'Log every purchase today', xpAction: 'logExpense' },
  // Every quest must be an action the app actually supports today — a quest
  // promising nonexistent content (e.g. a daily lesson) pays XP for a claim
  // the user cannot perform. The sim quest even self-verifies: running a
  // simulation completes it (see SimCard's onRun in App) — and because it is
  // verified, QuestCard renders it without a tap-to-complete button.
  { id: 'sim', text: 'Run one decision simulation', xpAction: 'runSimulation', verified: true },
  // The Ledger's "Recent" list is the surface this quest points at. It must
  // not promise a yesterday view (dates, day grouping) the app doesn't have —
  // that would be the same hollow grant as the cut lesson quest. If a
  // date-grouped ledger ships, reword toward "yesterday" and verify it like
  // the sim quest instead of taking the tap on self-report.
  { id: 'review', text: 'Look back over your recent purchases', xpAction: 'reviewRecent' },
]

function localDayISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Local-calendar day key (YYYY-MM-DD). Deliberately NOT toISOString(): the
 * target market is UTC+1, so UTC keys would roll quests at 01:00 local time
 * and stamp late-night purchases with the previous day/month.
 */
export function todayISO(): string {
  return localDayISO(new Date())
}

/**
 * Unique id for transactions. crypto.randomUUID exists only in secure
 * contexts (https/localhost) — on a plain-http deployment (LAN preview, cheap
 * shared hosting) it is undefined, and calling it would throw from the log
 * handlers, silently killing the app's core action. getRandomValues IS
 * available in insecure contexts, so fall back to it: merge/dedupe only needs
 * uniqueness, never the RFC-4122 shape.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return `${Date.now().toString(36)}-${rand[0].toString(36)}-${rand[1].toString(36)}`
}

export function freshQuests(): Quest[] {
  return DEFAULT_QUESTS.map((q) => ({ ...q, done: false }))
}

/**
 * Roll the daily quest list when the stored quest day is not `today`.
 * Used by loadState at mount AND by the day-change effect in App, so a tab
 * left open past midnight rolls quests the same way a reload does. Returns
 * the same object when nothing needs to change.
 */
export function rollQuests(state: AppState, today: string): AppState {
  if (state.questsDate === today) return state
  return { ...state, quests: freshQuests(), questsDate: today }
}

export function defaultState(): AppState {
  return {
    transactions: [],
    xp: { level: 1, xpIntoLevel: 0, totalXp: 0 },
    xpLog: [],
    prevHealthScore: null,
    stage: null,
    healthDate: '',
    quests: freshQuests(),
    questsDate: todayISO(),
    muted: false,
  }
}

const STAGES: ReadonlyArray<Stage> = ['ember', 'hearth', 'bonfire', 'beacon']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isOptionalBoolean(v: unknown): v is boolean | undefined {
  return v === undefined || typeof v === 'boolean'
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Shape AND calendar validity: DAY_KEY_RE alone accepts impossible keys like
 * '2026-99-99' or '2026-02-30', which compare lexicographically ABOVE every
 * real day in their year — a hand-edited payload could pin such a row inside
 * every trailing window and atop the ledger sort forever. Round-tripping
 * through the same local-day formatter the app stamps dates with (Date
 * normalizes overflow: month 99 rolls into the next years) rejects anything
 * the app itself could never have written.
 */
function isValidDayKey(v: string): boolean {
  if (!DAY_KEY_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  return localDayISO(new Date(y, m - 1, d)) === v
}

/** Grant id for XP earned before the grant log existed (older schemas). */
const LEGACY_XP_GRANT_ID = 'legacy-total'

const XP_GRANT_ACTIONS: ReadonlySet<string> = new Set([...Object.keys(XP_REWARDS), 'legacy'])

function isXpGrant(v: unknown): v is XpGrant {
  // The MAX_TOTAL_XP ceiling applies per grant too: xpFromLog sums amounts,
  // and a single hand-edited grant of 1e300 would push the fold's total into
  // the float range where xpStateFromTotal's level loop can no longer
  // terminate without its own clamp. No real grant exceeds the reward table.
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.action === 'string' &&
    XP_GRANT_ACTIONS.has(v.action) &&
    isFiniteNumber(v.amount) &&
    v.amount >= 0 &&
    v.amount <= MAX_TOTAL_XP &&
    typeof v.date === 'string' &&
    (v.date === '' || DAY_KEY_RE.test(v.date))
  )
}

function isTransaction(v: unknown): v is Transaction {
  // Strict on exactly the fields that feed the health score: a negative
  // amount would *reduce* trailing-30d spend (inflating SR/BA), and a truthy
  // non-boolean resistedImpulse (e.g. "no") would count as a resisted impulse
  // in IC while excluding the row from spend. Dates are compared
  // lexicographically against YYYY-MM-DD window cutoffs, so enforce the shape
  // AND calendar validity (see isValidDayKey).
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    isFiniteNumber(v.amountDA) &&
    v.amountDA >= 0 &&
    typeof v.category === 'string' &&
    typeof v.date === 'string' &&
    isValidDayKey(v.date) &&
    (v.note === undefined || typeof v.note === 'string') &&
    isOptionalBoolean(v.resistedImpulse) &&
    isOptionalBoolean(v.impulseFlagged)
  )
}

/**
 * Field-by-field validation of untrusted persisted JSON over defaultState().
 * A corrupted, hand-edited, or older-schema payload must never brick the app:
 * every unrecognized field falls back to its default instead of crashing at
 * first render. Exported for tests.
 */
export function sanitizeState(parsed: unknown): AppState {
  const out = defaultState()
  if (!isRecord(parsed)) return out

  if (Array.isArray(parsed.transactions)) {
    out.transactions = parsed.transactions.filter(isTransaction)
  }
  const xp = parsed.xp
  if (isRecord(xp) && isFiniteNumber(xp.totalXp)) {
    // Only totalXp is user data — level/xpIntoLevel are BY CONSTRUCTION a pure
    // function of it (xpStateFromTotal), so persisted values are never
    // trusted. Clamping them individually would still admit an inconsistent
    // triple like { level: 7, xpIntoLevel: 10, totalXp: 0 }, which renders as
    // "Level 7" with zero evidence until the first cross-tab merge rebuilds
    // from totalXp and the level silently collapses. Deriving here makes load
    // and merge agree on the same derivation. xpStateFromTotal clamps into
    // [0, MAX_TOTAL_XP]: an absurd persisted total (1e300) must derive a
    // bounded level instead of spinning the level loop forever at load.
    out.xp = xpStateFromTotal(xp.totalXp)
  }
  if (Array.isArray(parsed.xpLog)) {
    // Union by id like transactions; a duplicated id keeps the larger amount
    // so applying the same rule in any order (or twice) lands on the same log.
    const byId = new Map<string, XpGrant>()
    for (const g of parsed.xpLog) {
      if (isXpGrant(g)) {
        const prev = byId.get(g.id)
        if (!prev || g.amount > prev.amount) {
          byId.set(g.id, { id: g.id, action: g.action, amount: g.amount, date: g.date })
        }
      }
    }
    out.xpLog = [...byId.values()]
  }
  // Reconcile the counter with the grant evidence. XP earned before the log
  // existed (older schema) has no entries: bank the shortfall as a single
  // mergeable baseline grant, so deriving XP from a merged log can never pay
  // less than the total this payload already showed. If instead the log holds
  // MORE than the counter (corrupt/hand-edited xp field), the evidence wins.
  const logged = xpFromLog(out.xpLog)
  if (logged.totalXp > out.xp.totalXp) {
    out.xp = logged
  } else if (out.xp.totalXp > logged.totalXp) {
    const prior = out.xpLog.find((g) => g.id === LEGACY_XP_GRANT_ID)
    out.xpLog = [
      {
        id: LEGACY_XP_GRANT_ID,
        action: 'legacy',
        amount: (prior?.amount ?? 0) + (out.xp.totalXp - logged.totalXp),
        date: '',
      },
      ...out.xpLog.filter((g) => g.id !== LEGACY_XP_GRANT_ID),
    ]
  }
  if (isFiniteNumber(parsed.prevHealthScore)) {
    // Clamp into the score's [0, 100] range: a hand-edited negative snapshot
    // would smooth() to a negative score and crash stage mapping at first
    // render — the exact permanent brick this sanitizer exists to prevent.
    out.prevHealthScore = Math.min(100, Math.max(0, parsed.prevHealthScore))
  }
  if (STAGES.includes(parsed.stage as Stage)) {
    out.stage = parsed.stage as Stage
  }
  // Day keys must hold the YYYY-MM-DD shape the rest of the app compares
  // lexicographically (same rule as transaction dates): finalizeHealthThrough
  // walks single-day steps from healthDate, and a free-form string here (a
  // hand-edited 'never', an old schema's ISO timestamp) would feed the
  // rollover garbage. Mismatches fall back to the default ('' = never).
  if (typeof parsed.healthDate === 'string' && DAY_KEY_RE.test(parsed.healthDate)) {
    out.healthDate = parsed.healthDate
  }
  if (Array.isArray(parsed.quests)) {
    // Rebuild from the canonical roster: only same-day completion state is
    // user data — text, xpAction, and `verified` are product invariants the
    // roster owns. Trusting the persisted list wholesale would let unknown or
    // duplicate ids (old schemas, hand-edited payloads) render as tappable
    // self-report rows, each an unearned same-day XP grant.
    const doneById = new Map<string, boolean>()
    for (const q of parsed.quests) {
      if (isRecord(q) && typeof q.id === 'string') doneById.set(q.id, q.done === true)
    }
    out.quests = DEFAULT_QUESTS.map((d) => ({ ...d, done: doneById.get(d.id) === true }))
  }
  if (typeof parsed.questsDate === 'string' && DAY_KEY_RE.test(parsed.questsDate)) {
    out.questsDate = parsed.questsDate
  }
  if (typeof parsed.muted === 'boolean') {
    out.muted = parsed.muted
  }
  return out
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const state = sanitizeState(JSON.parse(raw) as unknown)
    return rollQuests(state, todayISO())
  } catch {
    return defaultState()
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — the app keeps working in memory.
  }
}

/**
 * Merge a peer tab's freshly-written state into this tab's in-memory state.
 * Two open tabs (common on mobile browsers that keep background tabs alive)
 * each saveState() on every change; without a merge, whichever tab writes
 * last — even on an automatic midnight quest roll — silently erases the
 * other tab's transactions, the worst possible failure for a local-first app.
 * The merge must be deterministic, idempotent AND commutative — merge(A, B)
 * deep-equals merge(B, A) — so that when writes truly cross (both tabs save
 * before receiving each other's storage event), both converge on one
 * canonical payload and the write ping-pong settles instead of oscillating.
 * When the merge changes nothing, `local` itself is returned, so the HYDRATE
 * reducer path (and React's bail-out) skips the re-render and re-save.
 */
export function mergeStates(local: AppState, incoming: AppState): AppState {
  // Transactions: union by id, in canonical order — date desc (the Ledger's
  // newest-first), id asc within a day. Insertion-ordered output would make
  // crossed writes each adopt the other's differing ordering forever, every
  // save a new JSON string that never reaches a fixpoint.
  const incomingIds = new Set(incoming.transactions.map((t) => t.id))
  const transactions = [
    ...local.transactions.filter((t) => !incomingIds.has(t.id)),
    ...incoming.transactions,
  ].sort((a, b) =>
    a.date !== b.date ? (a.date > b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  // XP: union the grant logs by id and fold. Diverged tabs each hold grants
  // the other missed (A logged a purchase while B finished a quest), and a
  // bare max(totalXp) would silently drop the smaller tab's grant even though
  // the transaction/quest union preserves its evidence. Duplicated ids keep
  // the larger amount (deterministic in any merge order); the fold re-applies
  // the resist daily cap across the union so two tabs can't jointly overpay
  // it. max() with both counters floors the result for pre-log legacy totals.
  const grantById = new Map<string, XpGrant>()
  for (const g of [...local.xpLog, ...incoming.xpLog]) {
    const prev = grantById.get(g.id)
    if (!prev || g.amount > prev.amount) grantById.set(g.id, g)
  }
  const xpLog = [...grantById.values()].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  const xp = xpStateFromTotal(
    Math.max(xpFromLog(xpLog).totalXp, local.xp.totalXp, incoming.xp.totalXp),
  )
  // Health snapshot: the newer healthDate supersedes (day keys compare
  // lexicographically). Same-day ties need a SYMMETRIC rule — "keep local"
  // would leave two crossed writers each adopting the other's snapshot
  // forever: the higher score wins (null loses to any score), and on equal
  // scores the further stage, so both tabs pick the identical trio.
  let snapshot: AppState
  if (local.healthDate !== incoming.healthDate) {
    snapshot = local.healthDate > incoming.healthDate ? local : incoming
  } else {
    const ls = local.prevHealthScore ?? -1
    const is = incoming.prevHealthScore ?? -1
    snapshot =
      ls !== is
        ? ls > is
          ? local
          : incoming
        : STAGES.indexOf(local.stage as Stage) >= STAGES.indexOf(incoming.stage as Stage)
          ? local
          : incoming
  }
  // Quests: same-day lists union their done flags — a quest completed in
  // either tab granted its XP once already, and reviving it as incomplete
  // would offer a second grant. Across days, the newer roster wins.
  let quests = incoming.quests
  let questsDate = incoming.questsDate
  if (local.questsDate === incoming.questsDate) {
    quests = local.quests.map((q) => ({
      ...q,
      done: q.done || incoming.quests.some((i) => i.id === q.id && i.done),
    }))
    questsDate = local.questsDate
  } else if (local.questsDate > incoming.questsDate) {
    quests = local.quests
    questsDate = local.questsDate
  }
  const merged: AppState = {
    transactions,
    xp,
    xpLog,
    prevHealthScore: snapshot.prevHealthScore,
    stage: snapshot.stage,
    healthDate: snapshot.healthDate,
    quests,
    questsDate,
    // Mute merges as OR: muting is the safety direction — a stale unmuted
    // peer write must never switch sound back on against this tab's explicit
    // mute (there is no timestamp to arbitrate recency), and OR is symmetric
    // so crossed writes still converge. The cost — an unmute can be re-muted
    // by a still-muted background tab's next write — errs silent, never loud.
    muted: local.muted || incoming.muted,
  }
  // Fixpoint short-circuit: an unchanged merge returns the SAME reference, so
  // useReducer's HYDRATE hands React an identical state, the re-render bails,
  // and the save effect never echoes an equal payload back into storage.
  return JSON.stringify(merged) === JSON.stringify(local) ? local : merged
}

/**
 * Re-sync when ANOTHER tab writes the store key ('storage' fires only in
 * non-writing tabs, and only when the value actually changed — so writing the
 * merged result back cannot echo forever). The payload is untrusted persisted
 * JSON like any load: sanitize + roll quests before handing it to the reducer.
 */
export function subscribeToPeerWrites(onWrite: (incoming: AppState) => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key !== KEY || e.newValue === null) return
    try {
      onWrite(rollQuests(sanitizeState(JSON.parse(e.newValue) as unknown), todayISO()))
    } catch {
      // Corrupt peer payload — this tab's in-memory state stays authoritative.
    }
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

/** Full export, always available, open format — the data-ownership guarantee. */
export function exportJSON(state: AppState): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), version: 1, ...state },
    null,
    2,
  )
}
