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
  quests: Quest[
  ]
  questsDate: string
  muted: boolean
}

const KEY = 'ember-state-v1'

export const DEFAULT_QUESTS: Omit<Quest, 'done'>[] = [
  { id: 'log', text: 'Log every purchase today', xpAction: 'logExpense' },
  { id: 'lesson', text: "Read today's 2-minute lesson", xpAction: 'readLesson' },
  { id: 'review', text: 'Review yesterday', xpAction: 'reviewYesterday' },
]

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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
    quests: freshQuests(),
    questsDate: todayISO(),
    muted: false,
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as AppState
    // Roll quests daily.
    if (parsed.questsDate !== todayISO()) {
      parsed.quests = freshQuests()
      parsed.questsDate = todayISO()
    }
    return parsed
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
