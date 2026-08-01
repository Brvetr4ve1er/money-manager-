/**
 * Local-first persistence. Manual logging is the core mechanic, not a
 * fallback — the store is built around fast transaction entry.
 */

import { xpForLevel, type XpAction, type XpState } from '../engine/xp.ts'
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

function isTransaction(v: unknown): v is Transaction {
  // Strict on exactly the fields that feed the health score: a negative
  // amount would *reduce* trailing-30d spend (inflating SR/BA), and a truthy
  // non-boolean resistedImpulse (e.g. "no") would count as a resisted impulse
  // in IC while excluding the row from spend. Dates are compared
  // lexicographically against YYYY-MM-DD window cutoffs, so enforce the shape too.
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    isFiniteNumber(v.amountDA) &&
    v.amountDA >= 0 &&
    typeof v.category === 'string' &&
    typeof v.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.date) &&
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
  if (
    isRecord(xp) &&
    isFiniteNumber(xp.level) &&
    xp.level >= 1 &&
    isFiniteNumber(xp.xpIntoLevel) &&
    isFiniteNumber(xp.totalXp)
  ) {
    // Coerce to the XP invariants, not just finite numbers: a hand-edited
    // payload like { level: 1.5, xpIntoLevel: -50 } would otherwise render a
    // broken progress bar and compound through grantXp's while-loop.
    const level = Math.max(1, Math.floor(xp.level))
    out.xp = {
      level,
      xpIntoLevel: Math.min(Math.max(0, xp.xpIntoLevel), xpForLevel(level) - 1),
      totalXp: Math.max(0, xp.totalXp),
    }
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
  if (typeof parsed.healthDate === 'string') {
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
  if (typeof parsed.questsDate === 'string') {
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
 * The merge must be deterministic and idempotent: both tabs converge on the
 * same payload, so the write ping-pong settles instead of oscillating.
 */
export function mergeStates(local: AppState, incoming: AppState): AppState {
  // Transactions: union by id. Anything only in `local` was logged in this
  // tab and never seen by the writer, so it is prepended — matching LOG_TX's
  // newest-first insertion order for the Ledger.
  const incomingIds = new Set(incoming.transactions.map((t) => t.id))
  const transactions = [
    ...local.transactions.filter((t) => !incomingIds.has(t.id)),
    ...incoming.transactions,
  ]
  // XP is a monotone counter: the larger total saw more grants. Summing or
  // averaging would double-pay grants both tabs already recorded.
  const xp = local.xp.totalXp >= incoming.xp.totalXp ? local.xp : incoming.xp
  // Health snapshot: the newer healthDate supersedes (day keys compare
  // lexicographically). Ties keep local — the trios match after a same-day roll.
  const localHealthNewer = local.healthDate >= incoming.healthDate
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
  return {
    transactions,
    xp,
    prevHealthScore: localHealthNewer ? local.prevHealthScore : incoming.prevHealthScore,
    stage: localHealthNewer ? local.stage : incoming.stage,
    healthDate: localHealthNewer ? local.healthDate : incoming.healthDate,
    quests,
    questsDate,
    muted: incoming.muted,
  }
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
