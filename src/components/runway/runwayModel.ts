/**
 * Runway view-model — the room's own derivations on top of engine/money.ts.
 * Pure (explicit `today`, no wall clock) so the timeline order, the markers
 * and the copy rules are unit-tested without rendering.
 *
 * Copy rules: forecasts, never verdicts. A late bill has "gone out" and can
 * be relit; nothing here scolds.
 */

import {
  cyclesDueBy,
  recurringAudit,
  toDA,
  type ObligationView,
  type RecurringRow,
} from '../../engine/money.ts'
import { daysBetween } from '../../engine/dates.ts'
import type { MoneyState, Obligation } from '../../state/slices/money.ts'
import type { ObjectKind, ObjectState } from '../RoomObject.tsx'

/** A payment this many days old (or newer) still keeps its light on. */
export const RECENT_PAID_DAYS = 7

export const RATE_MESSAGE =
  'This one is in USD and no DA rate is set yet. Set the rate on Home, then come back to pay it.'

/* ------------------------------ timeline ------------------------------ */

export type TimelineItem =
  | { type: 'today'; date: string }
  | { type: 'payday'; date: string }
  | { type: 'node'; view: ObligationView }

/**
 * The thread from oldest unpaid cycle to payday and beyond. Views arrive
 * sorted by next due (engine order, finished ones last). "Today" sits before
 * the first cycle due today or later — late ones stay above it; "Payday" sits
 * after every cycle due on or before payday (cyclesDueBy counts payday-day
 * bills as due before payday, so the marker agrees with the header total).
 * Finished obligations close the thread.
 */
export function timelineItems(views: ObligationView[], today: string, payday: string): TimelineItem[] {
  const active = views.filter((v) => v.nextDue !== null)
  const done = views.filter((v) => v.nextDue === null)
  const out: TimelineItem[] = []
  let todayPlaced = false
  let paydayPlaced = false
  for (const v of active) {
    const due = v.nextDue as string
    if (!todayPlaced && due >= today) {
      out.push({ type: 'today', date: today })
      todayPlaced = true
    }
    if (!paydayPlaced && due > payday) {
      if (!todayPlaced) {
        out.push({ type: 'today', date: today })
        todayPlaced = true
      }
      out.push({ type: 'payday', date: payday })
      paydayPlaced = true
    }
    out.push({ type: 'node', view: v })
  }
  if (!todayPlaced) out.push({ type: 'today', date: today })
  if (!paydayPlaced) out.push({ type: 'payday', date: payday })
  for (const v of done) out.push({ type: 'node', view: v })
  return out
}

/* ------------------------------- header ------------------------------- */

export interface DueBeforePayday {
  /** DA of every convertible unpaid cycle due on or before payday. */
  totalDA: number
  /** Cycles counted (a weekly bill can count twice). */
  cycles: number
  /** USD obligations in the window that could not be converted (no rate). */
  missingRate: number
}

export function dueBeforePayday(views: ObligationView[], payday: string, fx: number | null): DueBeforePayday {
  let totalDA = 0
  let cycles = 0
  let missingRate = 0
  for (const v of views) {
    const n = cyclesDueBy(v, payday).length
    if (n === 0) continue
    const da = toDA(v.estimate, v.obligation.currency, fx)
    if (da === null) {
      missingRate++
      continue
    }
    totalDA += da * n
    cycles += n
  }
  return { totalDA, cycles, missingRate }
}

/* ------------------------------ one node ------------------------------ */

export function objectKindFor(ob: Obligation): ObjectKind {
  switch (ob.kind) {
    case 'variable':
      return 'plant'
    case 'installment':
      return 'ring'
    case 'subscription':
      return 'window'
    default:
      return 'lantern'
  }
}

/** Day the latest live payment went out, or null. */
export function lastPaidOn(view: ObligationView): string | null {
  let last: string | null = null
  for (const p of view.payments) if (last === null || p.paidOn > last) last = p.paidOn
  return last
}

export function paidRecently(view: ObligationView, today: string): boolean {
  const last = lastPaidOn(view)
  if (last === null) return false
  const ago = daysBetween(last, today)
  return ago >= 0 && ago <= RECENT_PAID_DAYS
}

/**
 * Light as state. Late → out (gently relightable); finished or paid recently
 * and nothing pressing → lit; due soon → flicker; a variable bill's estimate
 * is uncertain → hazy; otherwise upcoming → dim.
 */
export function objectStateFor(view: ObligationView, today: string): ObjectState {
  if (view.status === 'done') return 'lit'
  if (view.status === 'late') return 'out'
  if (view.status === 'due_soon') return 'flicker'
  if (paidRecently(view, today)) return 'lit'
  if (view.obligation.kind === 'variable') return 'hazy'
  return 'dim'
}

/** "due in 3 days", "due today", "4 days late"; finished → "all paid". */
export function dueLabel(daysUntil: number | null): string {
  if (daysUntil === null) return 'all paid'
  if (daysUntil === 0) return 'due today'
  if (daysUntil === 1) return 'due tomorrow'
  if (daysUntil > 1) return `due in ${daysUntil} days`
  if (daysUntil === -1) return '1 day late'
  return `${-daysUntil} days late`
}

export function statusLabel(view: ObligationView, today: string): string {
  switch (view.status) {
    case 'done':
      return view.obligation.installment ? 'Paid off' : 'Paid'
    case 'late':
      return 'Gone out'
    case 'due_soon':
      return 'Due soon'
    default:
      return paidRecently(view, today) ? 'Lit' : 'Upcoming'
  }
}

/* --------------------------- recurring audit --------------------------- */

export interface AuditSummary {
  rows: RecurringRow[]
  totalYearlyDA: number
  /** Rows whose yearly cost is unknown (USD, no rate). */
  missingRate: number
}

/** Recurring rows sorted by yearly cost, biggest first; unknown costs last. */
export function auditSummary(money: MoneyState, today: string): AuditSummary {
  const rows = [...recurringAudit(money, today)].sort((a, b) => {
    if (a.yearlyDA === null) return b.yearlyDA === null ? 0 : 1
    if (b.yearlyDA === null) return -1
    return b.yearlyDA - a.yearlyDA
  })
  let totalYearlyDA = 0
  let missingRate = 0
  for (const r of rows) {
    if (r.yearlyDA === null) missingRate++
    else totalYearlyDA += r.yearlyDA
  }
  return { rows, totalYearlyDA, missingRate }
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}
