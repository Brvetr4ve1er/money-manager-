import { describe, it, expect } from 'vitest'
import {
  BRAKE_EDIT_LOCK_HOURS,
  applyPending,
  describeRule,
  holdPurchase,
  hoursUntilRelease,
  isAtLeastAsStrict,
  isEmptyRule,
  isReleasable,
  normalizeRule,
  requestRuleChange,
  shouldHold,
  spendVelocity,
  type BrakeRule,
  type HeldPurchase,
} from './brakes.ts'
import { addDaysISO } from './boss.ts'
import type { Transaction } from '../state/store.ts'

const rule = (over: Partial<BrakeRule> = {}): BrakeRule => ({
  thresholdDA: 5_000,
  categories: ['Fun'],
  delayHours: 24,
  ...over,
})

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0) // 2026-08-10T12:00:00.000Z

describe('normalizeRule', () => {
  it('turns a bad threshold into null', () => {
    expect(normalizeRule(rule({ thresholdDA: 0 })).thresholdDA).toBeNull()
    expect(normalizeRule(rule({ thresholdDA: -10 })).thresholdDA).toBeNull()
    expect(normalizeRule(rule({ thresholdDA: NaN })).thresholdDA).toBeNull()
    expect(normalizeRule(rule({ thresholdDA: Infinity })).thresholdDA).toBeNull()
    expect(normalizeRule(rule({ thresholdDA: 2_500 })).thresholdDA).toBe(2_500)
  })
  it('dedupes and sorts categories, dropping empty strings', () => {
    const out = normalizeRule(rule({ categories: ['Other', 'Fun', 'Other', '', 'Fun'] }))
    expect(out.categories).toEqual(['Fun', 'Other'])
  })
  it('falls back to a 24 hour delay when the value is not an allowed option', () => {
    expect(normalizeRule(rule({ delayHours: 5 })).delayHours).toBe(24)
    expect(normalizeRule(rule({ delayHours: 72 })).delayHours).toBe(72)
    expect(normalizeRule(rule({ delayHours: 1 })).delayHours).toBe(1)
  })
})

describe('isEmptyRule', () => {
  it('is true for null and for a rule with nothing to trigger on', () => {
    expect(isEmptyRule(null)).toBe(true)
    expect(isEmptyRule(rule({ thresholdDA: null, categories: [] }))).toBe(true)
  })
  it('is false when either a threshold or a category is set', () => {
    expect(isEmptyRule(rule({ thresholdDA: null }))).toBe(false)
    expect(isEmptyRule(rule({ categories: [] }))).toBe(false)
  })
})

describe('shouldHold', () => {
  it('holds a matching category whatever the amount', () => {
    expect(shouldHold(10, 'Fun', rule())).toBe(true)
  })
  it('holds an amount at or above the threshold', () => {
    expect(shouldHold(5_000, 'Food', rule())).toBe(true)
    expect(shouldHold(9_000, 'Food', rule())).toBe(true)
  })
  it('lets a below-threshold purchase in a free category through', () => {
    expect(shouldHold(4_999, 'Food', rule())).toBe(false)
  })
  it('never holds with a null rule or a null threshold on a free category', () => {
    expect(shouldHold(1_000_000, 'Fun', null)).toBe(false)
    expect(shouldHold(1_000_000, 'Food', rule({ thresholdDA: null }))).toBe(false)
  })
})

describe('holdPurchase / isReleasable / hoursUntilRelease', () => {
  const draft = { id: 'h1', amountDA: 6_000, category: 'Food', impulseFlagged: false }

  it('stamps heldAt now and releaseAt after the rule delay', () => {
    const held = holdPurchase(draft, rule({ delayHours: 24 }), NOW)
    expect(held).toEqual({
      ...draft,
      heldAt: '2026-08-10T12:00:00.000Z',
      releaseAt: '2026-08-11T12:00:00.000Z',
    })
  })
  it('is releasable only once releaseAt has passed (inclusive)', () => {
    const held = holdPurchase(draft, rule({ delayHours: 12 }), NOW)
    expect(isReleasable(held, NOW)).toBe(false)
    expect(isReleasable(held, NOW + 12 * HOUR - 1)).toBe(false)
    expect(isReleasable(held, NOW + 12 * HOUR)).toBe(true)
    expect(isReleasable(held, NOW + 30 * HOUR)).toBe(true)
  })
  it('counts whole hours until release, rounded up, and 0 when ready', () => {
    const held: HeldPurchase = holdPurchase(draft, rule({ delayHours: 24 }), NOW)
    expect(hoursUntilRelease(held, NOW)).toBe(24)
    expect(hoursUntilRelease(held, NOW + 23.5 * HOUR)).toBe(1)
    expect(hoursUntilRelease(held, NOW + 24 * HOUR)).toBe(0)
    expect(hoursUntilRelease(held, NOW + 48 * HOUR)).toBe(0)
  })
})

describe('isAtLeastAsStrict', () => {
  it('a lower threshold is stricter; a higher one is looser', () => {
    expect(isAtLeastAsStrict(rule({ thresholdDA: 1_000 }), rule({ thresholdDA: 5_000 }))).toBe(true)
    expect(isAtLeastAsStrict(rule({ thresholdDA: 5_000 }), rule({ thresholdDA: 1_000 }))).toBe(false)
    expect(isAtLeastAsStrict(rule(), rule())).toBe(true)
  })
  it('a null threshold is the loosest amount rule', () => {
    expect(isAtLeastAsStrict(rule({ thresholdDA: null }), rule({ thresholdDA: 5_000 }))).toBe(false)
    expect(isAtLeastAsStrict(rule({ thresholdDA: 5_000 }), rule({ thresholdDA: null }))).toBe(true)
    expect(isAtLeastAsStrict(rule({ thresholdDA: null }), rule({ thresholdDA: null }))).toBe(true)
  })
  it('a category superset is stricter; dropping one is looser', () => {
    expect(isAtLeastAsStrict(rule({ categories: ['Fun', 'Other'] }), rule({ categories: ['Fun'] }))).toBe(true)
    expect(isAtLeastAsStrict(rule({ categories: ['Fun'] }), rule({ categories: ['Fun', 'Other'] }))).toBe(false)
    expect(isAtLeastAsStrict(rule({ categories: ['Other'] }), rule({ categories: ['Fun'] }))).toBe(false)
  })
  it('a longer delay is stricter; a shorter one is looser', () => {
    expect(isAtLeastAsStrict(rule({ delayHours: 72 }), rule({ delayHours: 24 }))).toBe(true)
    expect(isAtLeastAsStrict(rule({ delayHours: 12 }), rule({ delayHours: 24 }))).toBe(false)
  })
  it('removing brakes is never stricter unless there were none', () => {
    expect(isAtLeastAsStrict(null, rule())).toBe(false)
    expect(isAtLeastAsStrict(null, null)).toBe(true)
    expect(isAtLeastAsStrict(rule(), null)).toBe(true)
  })
})

describe('requestRuleChange', () => {
  it('applies a tightening immediately with no pending change', () => {
    const current = rule({ thresholdDA: 5_000 })
    const out = requestRuleChange(current, rule({ thresholdDA: 2_000 }), NOW)
    expect(out).toEqual({ brakes: rule({ thresholdDA: 2_000 }), pending: null })
  })
  it('schedules a loosening exactly 48 hours later, keeping the current rule', () => {
    const current = rule({ thresholdDA: 2_000 })
    const out = requestRuleChange(current, rule({ thresholdDA: 9_000 }), NOW)
    expect(BRAKE_EDIT_LOCK_HOURS).toBe(48)
    expect(out.brakes).toBe(current)
    expect(out.pending).toEqual({
      rule: rule({ thresholdDA: 9_000 }),
      effectiveAt: '2026-08-12T12:00:00.000Z',
    })
  })
  it('a first-ever rule lands immediately', () => {
    const out = requestRuleChange(null, rule({ delayHours: 12 }), NOW)
    expect(out).toEqual({ brakes: rule({ delayHours: 12 }), pending: null })
  })
  it('normalizes the requested rule on the way in', () => {
    const out = requestRuleChange(null, rule({ categories: ['Other', 'Fun', 'Fun'], delayHours: 7 }), NOW)
    expect(out.brakes).toEqual(rule({ categories: ['Fun', 'Other'], delayHours: 24 }))
  })
  it('treats an empty rule as removal: pending when a rule exists, immediate when none', () => {
    const empty = rule({ thresholdDA: null, categories: [] })
    const current = rule()
    const out = requestRuleChange(current, empty, NOW)
    expect(out.brakes).toBe(current)
    expect(out.pending).toEqual({ rule: null, effectiveAt: '2026-08-12T12:00:00.000Z' })
    expect(requestRuleChange(null, empty, NOW)).toEqual({ brakes: null, pending: null })
    expect(requestRuleChange(null, null, NOW)).toEqual({ brakes: null, pending: null })
  })
})

describe('applyPending', () => {
  const current = rule({ thresholdDA: 2_000 })
  const pending = { rule: rule({ thresholdDA: 9_000 }), effectiveAt: '2026-08-12T12:00:00.000Z' }

  it('keeps the same references before effectiveAt', () => {
    const out = applyPending(current, pending, NOW)
    expect(out.brakes).toBe(current)
    expect(out.pending).toBe(pending)
    const edge = applyPending(current, pending, Date.parse(pending.effectiveAt) - 1)
    expect(edge.pending).toBe(pending)
  })
  it('promotes the pending rule at or after effectiveAt', () => {
    const at = applyPending(current, pending, Date.parse(pending.effectiveAt))
    expect(at).toEqual({ brakes: pending.rule, pending: null })
    const later = applyPending(current, pending, NOW + 100 * HOUR)
    expect(later.brakes).toBe(pending.rule)
    expect(later.pending).toBeNull()
  })
  it('promotes a pending removal to null brakes', () => {
    const removal = { rule: null, effectiveAt: '2026-08-12T12:00:00.000Z' }
    expect(applyPending(current, removal, NOW + 72 * HOUR)).toEqual({ brakes: null, pending: null })
  })
  it('returns the same references when nothing is pending', () => {
    const out = applyPending(current, null, NOW)
    expect(out.brakes).toBe(current)
    expect(out.pending).toBeNull()
  })
})

describe('describeRule', () => {
  it('says no brakes for null or an empty rule', () => {
    expect(describeRule(null)).toBe('No brakes set.')
    expect(describeRule(rule({ thresholdDA: null, categories: [] }))).toBe('No brakes set.')
  })
  it('spells out threshold, categories and the wait', () => {
    expect(describeRule(rule({ thresholdDA: 500, categories: ['Fun'], delayHours: 24 }))).toBe(
      'Hold anything 500 DA or more and all Fun for 1 day.',
    )
    expect(describeRule(rule({ thresholdDA: null, categories: ['Fun', 'Other'], delayHours: 72 }))).toBe(
      'Hold all Fun, Other for 3 days.',
    )
    expect(describeRule(rule({ thresholdDA: 500, categories: [], delayHours: 1 }))).toBe(
      'Hold anything 500 DA or more for 1 hour.',
    )
    expect(describeRule(rule({ thresholdDA: 500, categories: [], delayHours: 12 }))).toBe(
      'Hold anything 500 DA or more for 12 hours.',
    )
  })
})

describe('spendVelocity', () => {
  const today = '2026-08-28'
  // Recent window: 3 days including today. Baseline: the 28 days before.
  const recentFrom = addDaysISO(today, -2) // 2026-08-26
  const baseTo = addDaysISO(today, -3) // 2026-08-25
  const baseFrom = addDaysISO(baseTo, -27) // 2026-07-29

  const tx = (over: Partial<Transaction> = {}): Transaction => ({
    id: Math.random().toString(36).slice(2),
    amountDA: 1_000,
    category: 'Food',
    date: today,
    ...over,
  })
  /** One purchase of `amount` on baseFrom plus one today of `recent` — long enough history. */
  const ledger = (baseline: number, recent: number): Transaction[] => [
    tx({ amountDA: baseline, date: baseFrom }),
    tx({ amountDA: recent, date: today }),
  ]

  it('is unknown with no purchases at all', () => {
    expect(spendVelocity([], today)).toEqual({
      level: 'unknown',
      ratio: null,
      recentPerDay: 0,
      baselinePerDay: 0,
    })
  })
  it('is unknown with less than 14 days of history', () => {
    const txs = [tx({ date: addDaysISO(today, -13) }), tx({ date: today })]
    expect(spendVelocity(txs, today).level).toBe('unknown')
    // Exactly 14 days back is enough.
    const enough = [tx({ amountDA: 28_000, date: addDaysISO(today, -14) }), tx({ date: today })]
    expect(spendVelocity(enough, today).level).not.toBe('unknown')
  })
  it('is unknown with a zero baseline, but still reports the recent pace', () => {
    // History is old enough, but every purchase sits outside the baseline window.
    const txs = [tx({ amountDA: 5_000, date: addDaysISO(baseFrom, -1) }), tx({ amountDA: 3_000, date: today })]
    const v = spendVelocity(txs, today)
    expect(v.level).toBe('unknown')
    expect(v.ratio).toBeNull()
    expect(v.recentPerDay).toBe(1_000)
    expect(v.baselinePerDay).toBe(0)
  })
  it('reads usual when recent pace matches the baseline', () => {
    const v = spendVelocity(ledger(28_000, 3_000), today)
    expect(v.level).toBe('usual')
    expect(v.ratio).toBe(1)
    expect(v.baselinePerDay).toBe(1_000)
    expect(v.recentPerDay).toBe(1_000)
  })
  it('reads faster from 1.6× and much-faster from 2.5×', () => {
    expect(spendVelocity(ledger(28_000, 4_500), today).level).toBe('usual') // 1.5×
    expect(spendVelocity(ledger(28_000, 5_100), today).level).toBe('faster') // 1.7×
    expect(spendVelocity(ledger(28_000, 7_200), today).level).toBe('faster') // 2.4×
    const much = spendVelocity(ledger(28_000, 9_000), today) // 3×
    expect(much.level).toBe('much-faster')
    expect(much.ratio).toBe(3)
  })
  it('excludes resisted rows from history, baseline and recent spend', () => {
    // The only old row is resisted: history is too thin to speak.
    const thin = [tx({ amountDA: 28_000, date: baseFrom, resistedImpulse: true }), tx({ date: today })]
    expect(spendVelocity(thin, today).level).toBe('unknown')
    // A resisted row inside the recent window adds nothing to the pace.
    const v = spendVelocity(
      [...ledger(28_000, 3_000), tx({ amountDA: 50_000, date: today, resistedImpulse: true })],
      today,
    )
    expect(v.level).toBe('usual')
    expect(v.recentPerDay).toBe(1_000)
  })
  it('windows exactly: 3 recent days including today, 28 baseline days before', () => {
    const txs = [
      tx({ amountDA: 100, date: addDaysISO(baseFrom, -1) }), // before baseline — out
      tx({ amountDA: 28_000, date: baseFrom }), // first baseline day — in
      tx({ amountDA: 28_000, date: baseTo }), // last baseline day — in
      tx({ amountDA: 1_500, date: recentFrom }), // first recent day — in
      tx({ amountDA: 1_500, date: today }), // today — in
    ]
    const v = spendVelocity(txs, today)
    expect(v.baselinePerDay).toBe(2_000)
    expect(v.recentPerDay).toBe(1_000)
    expect(v.ratio).toBe(0.5)
    expect(v.level).toBe('usual')
  })
})
