/**
 * Pure helpers for the Jars room: presets, amount parsing, the move pairs a
 * cover or a payday run writes, and the soft fill level an open-ended jar
 * shows. Kept out of the components so every rule is unit-testable and the
 * ids the reducer dedupes on are built in exactly one place.
 */

import type { Charm, Jar, JarMove, MoneyState, PaydaySplitRow } from '../../state/slices/money.ts'
import type { CharmSuggestion, JarView } from '../../engine/money.ts'
import { fmtDA } from '../../engine/money.ts'

export const CHARM_CATEGORIES = ['Food', 'Transport', 'Fun', 'Bills', 'Health', 'Other'] as const
export const ROUNDUP_STEPS = [50, 100, 500] as const

export interface JarPreset {
  key: string
  name: string
  emoji: string
  /** Suggested target in DA; null = open-ended. Always editable. */
  target: number | null
  /** Suggested target day (YYYY-MM-DD), relative to today; null = none. */
  targetDate: (today: string) => string | null
  /** Short reason shown under the chip row once picked. */
  hint: string
}

/** Next 1 September strictly after today — when the school year restarts. */
export function nextRentree(today: string): string {
  const y = Number(today.slice(0, 4))
  const thisYear = `${y}-09-01`
  return thisYear > today ? thisYear : `${y + 1}-09-01`
}

export const JAR_PRESETS: ReadonlyArray<JarPreset> = [
  { key: 'emergency', name: 'Emergency', emoji: '🛟', target: 150_000, targetDate: () => null, hint: 'A soft landing for the surprises. Three months of essentials is a classic aim.' },
  { key: 'eid', name: 'Eid', emoji: '🌙', target: 30_000, targetDate: () => null, hint: 'Clothes, gifts, the sheep share. Pick the date you expect it.' },
  { key: 'ramadan', name: 'Ramadan', emoji: '🏮', target: 25_000, targetDate: () => null, hint: 'The month of bigger tables and evening outings.' },
  { key: 'rentree', name: 'Rentrée', emoji: '🎒', target: 20_000, targetDate: nextRentree, hint: 'Books, bags, fees — ready before September.' },
  { key: 'bills', name: 'Bills', emoji: '🧾', target: 15_000, targetDate: () => null, hint: 'Sonelgaz, water, Idoom — the ones that always come back.' },
  { key: 'device', name: 'Phone/laptop', emoji: '📱', target: 80_000, targetDate: () => null, hint: 'The next device, paid for before you buy it.' },
]

/**
 * A typed DA amount, or null. Accepts "12 000", "12,000" and "12000";
 * rejects zero, negatives, NaN. DA has no subunit in practice: rounds.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s,_]/g, '').replace(/da$/i, '')
  if (cleaned === '' || !/^\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Math.round(Number(cleaned))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function splitTotal(rows: ReadonlyArray<PaydaySplitRow>): number {
  return rows.reduce((s, r) => s + r.amount, 0)
}

/** Split rows that still point at a live jar (archived jars drop out). */
export function liveSplit(money: MoneyState): PaydaySplitRow[] {
  const live = new Set(money.jars.filter((j) => !j.archived).map((j) => j.id))
  return money.settings.split.filter((r) => live.has(r.jarId))
}

/** The two moves of a cover, sharing one deterministic id pair. */
export function coverMoves(pairId: string, fromJarId: string, toJarId: string, amount: number, date: string): JarMove[] {
  return [
    { id: `cover:${pairId}:out`, jarId: fromJarId, amount: -amount, date, kind: 'cover' },
    { id: `cover:${pairId}:in`, jarId: toJarId, amount, date, kind: 'cover' },
  ]
}

/** One payday move per split row, ids `payday:{incomeId}:{jarId}`. */
export function paydayMoves(incomeId: string, rows: ReadonlyArray<PaydaySplitRow>, date: string): JarMove[] {
  return rows
    .filter((r) => r.amount > 0)
    .map((r) => ({ id: `payday:${incomeId}:${r.jarId}`, jarId: r.jarId, amount: r.amount, date, kind: 'payday' as const }))
}

/**
 * How full the clay jar looks, 0–1. Target jars show real progress; an
 * open-ended jar has no "full", so its level rises softly with the balance
 * (half full around 20,000 DA, never quite to the brim). A jar with money in
 * it always shows at least a sliver so the coins are visible.
 */
export function fillLevel(view: Pick<JarView, 'balance' | 'progress'>): number {
  if (view.balance <= 0) return 0
  const raw = view.progress ?? 0.9 * (1 - Math.exp(-view.balance / 28_000))
  return Math.max(0.06, Math.min(1, raw))
}

export interface SuggestionGroup {
  jarId: string
  items: CharmSuggestion[]
  total: number
}

/** Suggestions grouped per jar, in the order jars first appear. */
export function groupSuggestions(list: ReadonlyArray<CharmSuggestion>): SuggestionGroup[] {
  const m = new Map<string, SuggestionGroup>()
  for (const s of list) {
    const g = m.get(s.jarId) ?? { jarId: s.jarId, items: [], total: 0 }
    g.items.push(s)
    g.total += s.amount
    m.set(s.jarId, g)
  }
  return [...m.values()]
}

/** Plain-language rule, the way the user would say it. */
export function charmRule(c: Pick<Charm, 'kind' | 'category' | 'value'>, jar: Pick<Jar, 'name' | 'emoji'> | undefined): string {
  const to = jar ? `${jar.emoji} ${jar.name}` : 'a jar'
  switch (c.kind) {
    case 'roundup':
      return `Round every log up to the nearest ${fmtDA(c.value)} → ${to}`
    case 'category':
      return `Every time I log ${c.category}, put ${fmtDA(c.value)} in ${to}`
    case 'treat-tax':
      return `Treat tax: ${c.value}% of every ${c.category} log → ${to}`
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
