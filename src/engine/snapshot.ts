/**
 * Trusted-person snapshot — a plain-text weekly summary the USER builds and
 * sends. Local-first all the way: no accounts, no server, no sharing link;
 * the text is copied or handed to the OS share sheet. Every section is
 * opt-in, so the user decides exactly what a parent, partner or support
 * worker gets to see. Pure: same inputs, same text.
 */

import type { Transaction } from '../state/store.ts'
import type { HeldPurchase, Velocity } from './brakes.ts'
import type { Stage } from './healthScore.ts'
import { addDaysISO } from './boss.ts'

export interface SnapshotOptions {
  /** Total spent this week and the count of logs. */
  totals: boolean
  /** Spend by category. */
  categories: boolean
  /** Purchases currently held by the brakes. */
  held: boolean
  /** The pace signal (faster than usual, etc.). */
  velocity: boolean
  /** Health stage and score. */
  health: boolean
}

export const DEFAULT_SNAPSHOT_OPTIONS: SnapshotOptions = {
  totals: true,
  categories: true,
  held: false,
  velocity: true,
  health: true,
}

export const SNAPSHOT_DAYS = 7

export interface SnapshotInput {
  transactions: Transaction[]
  held: HeldPurchase[]
  velocity: Velocity
  health: { score: number; stage: Stage }
  today: string
  trustedName: string
  /** Shown as the sender; blank is fine. */
  userName?: string
}

const STAGE_LABEL: Record<Stage, string> = {
  ember: 'Ember',
  hearth: 'Hearth-fire',
  bonfire: 'Bonfire',
  beacon: 'Beacon',
}

function velocityLine(v: Velocity): string {
  switch (v.level) {
    case 'usual':
      return 'Pace: about usual.'
    case 'faster':
      return 'Pace: a bit faster than usual this week.'
    case 'much-faster':
      return 'Pace: a lot faster than usual this week.'
    default:
      return 'Pace: not enough history to say yet.'
  }
}

export function buildSnapshot(input: SnapshotInput, options: SnapshotOptions): string {
  const from = addDaysISO(input.today, -(SNAPSHOT_DAYS - 1))
  const week = input.transactions.filter(
    (t) => !t.resistedImpulse && t.date >= from && t.date <= input.today,
  )
  const resisted = input.transactions.filter(
    (t) => t.resistedImpulse && t.date >= from && t.date <= input.today,
  ).length
  const lines: string[] = []
  const to = input.trustedName.trim() === '' ? '' : ` for ${input.trustedName.trim()}`
  lines.push(`Ember weekly snapshot${to} · ${from} → ${input.today}`)
  if (input.userName && input.userName.trim() !== '') lines.push(`From: ${input.userName.trim()}`)
  lines.push('')

  if (options.totals) {
    const total = week.reduce((s, t) => s + t.amountDA, 0)
    lines.push(`Spent: ${total.toLocaleString('en-US')} DA across ${week.length} log${week.length === 1 ? '' : 's'}.`)
    if (resisted > 0) lines.push(`Resisted: ${resisted} impulse${resisted === 1 ? '' : 's'}.`)
  }
  if (options.categories && week.length > 0) {
    const byCat = new Map<string, number>()
    for (const t of week) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amountDA)
    const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    lines.push('By category:')
    for (const [cat, amt] of rows) lines.push(`  ${cat}: ${amt.toLocaleString('en-US')} DA`)
  }
  if (options.held) {
    if (input.held.length === 0) lines.push('Held by the brakes: nothing right now.')
    else {
      lines.push(`Held by the brakes (${input.held.length}):`)
      for (const h of input.held) lines.push(`  ${h.amountDA.toLocaleString('en-US')} DA · ${h.category}`)
    }
  }
  if (options.velocity) lines.push(velocityLine(input.velocity))
  if (options.health) {
    lines.push(`Health: ${STAGE_LABEL[input.health.stage]} · ${input.health.score.toFixed(1)} / 100.`)
  }
  lines.push('')
  lines.push('Sent by hand from Ember. Nothing in the app is shared automatically.')
  return lines.join('\n')
}
