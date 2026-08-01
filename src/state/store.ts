/**
 * Local-first persistence. Manual logging is the core mechanic, not a
 * fallback — the store is built around fast transaction entry.
 */

import type { XpState } from '../engine/xp.ts'
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

/**
 * Local-calendar day key (YYYY-MM-DD). Deliberately NOT toISOString(): the
 * target market is UTC+1, so UTC keys would roll quests at 01:00 local time
 * and stamp late-night purchases with the previous day/month.
 */
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function freshQuests(): Quest[] {
  return DEFAULT_QUESTS.map((q) => ({ ...q, done: false }))
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

function isTransaction(v: unknown): v is Transaction {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    isFiniteNumber(v.amountDA) &&
    typeof v.category === 'string' &&
    typeof v.date === 'string'
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
    out.xp = { level: xp.level, xpIntoLevel: xp.xpIntoLevel, totalXp: xp.totalXp }
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
    // Roll quests daily.
    if (state.questsDate !== todayISO()) {
      state.quests = freshQuests()
      state.questsDate = todayISO()
    }
    return state
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
