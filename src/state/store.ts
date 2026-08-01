/**
 * Local-first persistence. Manual logging is the core mechanic, not a
 * fallback — the store is built around fast transaction entry.
 */

import { xpForLevel, type XpState } from '../engine/xp.ts'
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
  xpAction: 'logExpense' | 'readLesson' | 'reviewYesterday' | 'save' | 'resistImpulse'
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
  { id: 'lesson', text: "Read today's 2-minute lesson", xpAction: 'readLesson' },
  { id: 'review', text: 'Review yesterday', xpAction: 'reviewYesterday' },
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

/** Local-calendar day key `n` days before today (same format as todayISO). */
export function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDayISO(d)
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
const QUEST_ACTIONS: ReadonlyArray<Quest['xpAction']> = [
  'logExpense',
  'readLesson',
  'reviewYesterday',
  'save',
  'resistImpulse',
]

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
  // lexicographically against daysAgoISO cutoffs, so enforce the shape too.
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

function isQuest(v: unknown): v is Quest {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.text === 'string' &&
    QUEST_ACTIONS.includes(v.xpAction as Quest['xpAction']) &&
    typeof v.done === 'boolean'
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
    out.prevHealthScore = parsed.prevHealthScore
  }
  if (STAGES.includes(parsed.stage as Stage)) {
    out.stage = parsed.stage as Stage
  }
  if (typeof parsed.healthDate === 'string') {
    out.healthDate = parsed.healthDate
  }
  if (Array.isArray(parsed.quests) && parsed.quests.every(isQuest)) {
    out.quests = parsed.quests
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

/** Full export, always available, open format — the data-ownership guarantee. */
export function exportJSON(state: AppState): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), version: 1, ...state },
    null,
    2,
  )
}
