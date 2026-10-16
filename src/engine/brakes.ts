/**
 * "Hold the door" — self-set spending brakes, and a spend-velocity signal.
 *
 * The brake is a Ulysses contract: stable-you binds episode-you. A purchase
 * matching the rule is HELD (queued with a release time) instead of logged;
 * when the delay passes the user decides again, with the same honesty rules
 * as any log (letting it go is never punished). Loosening the rule waits
 * BRAKE_EDIT_LOCK_HOURS; tightening is immediate. Pure over explicit clock
 * values (ms since epoch / ISO strings) so every path is unit-testable.
 */

import { addDaysISO } from './dates.ts'
import type { Transaction } from '../state/store.ts'

export interface BrakeRule {
  /** Purchases at or above this amount are held; null = amount never triggers. */
  thresholdDA: number | null
  /** Categories always held, whatever the amount. */
  categories: string[]
  /** How long a held purchase waits before it can be released. */
  delayHours: number
}

/** Loosening a rule (or removing it) takes effect only after this wait. */
export const BRAKE_EDIT_LOCK_HOURS = 48
export const DELAY_OPTIONS_HOURS: ReadonlyArray<number> = [1, 12, 24, 72]

export interface HeldPurchase {
  id: string
  amountDA: number
  category: string
  impulseFlagged: boolean
  /** ISO datetime the purchase was held. */
  heldAt: string
  /** ISO datetime from which it may be released into the ledger. */
  releaseAt: string
}

export interface PendingRule {
  /** The rule that will apply (null = brakes off) once effectiveAt passes. */
  rule: BrakeRule | null
  /** ISO datetime. */
  effectiveAt: string
}

const HOUR_MS = 3_600_000

/** Normalize a candidate rule: finite non-negative threshold, deduped categories, allowed delay. */
export function normalizeRule(rule: BrakeRule): BrakeRule {
  const thresholdDA =
    rule.thresholdDA !== null && Number.isFinite(rule.thresholdDA) && rule.thresholdDA > 0
      ? rule.thresholdDA
      : null
  const categories = [...new Set(rule.categories.filter((c) => typeof c === 'string' && c !== ''))].sort()
  const delayHours = DELAY_OPTIONS_HOURS.includes(rule.delayHours) ? rule.delayHours : 24
  return { thresholdDA, categories, delayHours }
}

/** A rule with nothing to trigger on holds nothing — treat it as "off". */
export function isEmptyRule(rule: BrakeRule | null): boolean {
  return rule === null || (rule.thresholdDA === null && rule.categories.length === 0)
}

export function shouldHold(amountDA: number, category: string, rule: BrakeRule | null): boolean {
  if (rule === null) return false
  if (rule.categories.includes(category)) return true
  return rule.thresholdDA !== null && amountDA >= rule.thresholdDA
}

export function holdPurchase(
  draft: { id: string; amountDA: number; category: string; impulseFlagged: boolean },
  rule: BrakeRule,
  nowMs: number,
): HeldPurchase {
  return {
    ...draft,
    heldAt: new Date(nowMs).toISOString(),
    releaseAt: new Date(nowMs + rule.delayHours * HOUR_MS).toISOString(),
  }
}

export function isReleasable(held: HeldPurchase, nowMs: number): boolean {
  return Date.parse(held.releaseAt) <= nowMs
}

/** Whole hours (rounded up) until a held purchase can be released; 0 when ready. */
export function hoursUntilRelease(held: HeldPurchase, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(held.releaseAt) - nowMs) / HOUR_MS))
}

/**
 * `next` is at least as strict as `current` when it can only hold MORE:
 * threshold no higher (null threshold = never triggers = loosest), categories
 * a superset, delay no shorter. Removing brakes is always loosening.
 */
export function isAtLeastAsStrict(next: BrakeRule | null, current: BrakeRule | null): boolean {
  if (next === null) return current === null
  if (current === null) return true
  const thr = (r: BrakeRule) => r.thresholdDA ?? Number.POSITIVE_INFINITY
  return (
    thr(next) <= thr(current) &&
    current.categories.every((c) => next.categories.includes(c)) &&
    next.delayHours >= current.delayHours
  )
}

/**
 * Apply a rule change: tightening lands now, loosening is scheduled behind
 * the edit lock. A pending loosening is replaced by any newer request, so
 * "I changed my mind, keep the brakes" cancels the countdown immediately.
 */
export function requestRuleChange(
  current: BrakeRule | null,
  next: BrakeRule | null,
  nowMs: number,
): { brakes: BrakeRule | null; pending: PendingRule | null } {
  const normalized = next === null || isEmptyRule(next) ? null : normalizeRule(next)
  if (isAtLeastAsStrict(normalized, current)) return { brakes: normalized, pending: null }
  return {
    brakes: current,
    pending: {
      rule: normalized,
      effectiveAt: new Date(nowMs + BRAKE_EDIT_LOCK_HOURS * HOUR_MS).toISOString(),
    },
  }
}

/** Promote a pending rule once its time has come. Returns the same inputs when nothing changes. */
export function applyPending(
  brakes: BrakeRule | null,
  pending: PendingRule | null,
  nowMs: number,
): { brakes: BrakeRule | null; pending: PendingRule | null } {
  if (pending === null || Date.parse(pending.effectiveAt) > nowMs) return { brakes, pending }
  return { brakes: pending.rule, pending: null }
}

export function describeRule(rule: BrakeRule | null): string {
  if (rule === null || isEmptyRule(rule)) return 'No brakes set.'
  const parts: string[] = []
  if (rule.thresholdDA !== null) parts.push(`anything ${rule.thresholdDA.toLocaleString()} DA or more`)
  if (rule.categories.length > 0) parts.push(`all ${rule.categories.join(', ')}`)
  const wait = rule.delayHours >= 24 ? `${rule.delayHours / 24} day${rule.delayHours > 24 ? 's' : ''}` : `${rule.delayHours} hour${rule.delayHours > 1 ? 's' : ''}`
  return `Hold ${parts.join(' and ')} for ${wait}.`
}

/* ------------------------------ velocity ------------------------------ */

export type VelocityLevel = 'unknown' | 'usual' | 'faster' | 'much-faster'

export interface Velocity {
  level: VelocityLevel
  /** recent ÷ baseline daily spend; null when unknown. */
  ratio: number | null
  recentPerDay: number
  baselinePerDay: number
}

export const VELOCITY_RECENT_DAYS = 3
export const VELOCITY_BASELINE_DAYS = 28
/** Days of history before the signal is allowed to speak at all. */
export const VELOCITY_MIN_HISTORY_DAYS = 14
export const VELOCITY_FASTER = 1.6
export const VELOCITY_MUCH_FASTER = 2.5

function spendBetween(transactions: Transaction[], fromDay: string, toDay: string): number {
  return transactions
    .filter((t) => !t.resistedImpulse && t.date >= fromDay && t.date <= toDay)
    .reduce((s, t) => s + t.amountDA, 0)
}

/**
 * How fast money is leaving compared with the user's OWN recent baseline.
 * Recent window: the last VELOCITY_RECENT_DAYS including today. Baseline: the
 * VELOCITY_BASELINE_DAYS before that, quiet days counting as zero. Says
 * "unknown" with thin history rather than guessing — a signal that cries
 * wolf in week one would be ignored in month three. Never a diagnosis: the
 * UI phrases it as pace, and offers the trusted person, nothing else.
 */
export function spendVelocity(transactions: Transaction[], today: string): Velocity {
  const unknown: Velocity = { level: 'unknown', ratio: null, recentPerDay: 0, baselinePerDay: 0 }
  const purchases = transactions.filter((t) => !t.resistedImpulse)
  if (purchases.length === 0) return unknown
  const earliest = purchases.reduce((m, t) => (t.date < m ? t.date : m), purchases[0].date)
  if (earliest > addDaysISO(today, -VELOCITY_MIN_HISTORY_DAYS)) return unknown
  const recentFrom = addDaysISO(today, -(VELOCITY_RECENT_DAYS - 1))
  const baseTo = addDaysISO(recentFrom, -1)
  const baseFrom = addDaysISO(baseTo, -(VELOCITY_BASELINE_DAYS - 1))
  const recentPerDay = spendBetween(purchases, recentFrom, today) / VELOCITY_RECENT_DAYS
  const baselinePerDay = spendBetween(purchases, baseFrom, baseTo) / VELOCITY_BASELINE_DAYS
  if (baselinePerDay <= 0) return { ...unknown, recentPerDay }
  const ratio = recentPerDay / baselinePerDay
  const level: VelocityLevel =
    ratio >= VELOCITY_MUCH_FASTER ? 'much-faster' : ratio >= VELOCITY_FASTER ? 'faster' : 'usual'
  return { level, ratio, recentPerDay, baselinePerDay }
}
