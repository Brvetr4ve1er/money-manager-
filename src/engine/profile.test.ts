import { describe, it, expect } from 'vitest'
import {
  deriveHealthInputs,
  finalizeHealthThrough,
  buildSimProfile,
  DEMO_PROFILE,
  DEMO_PROFILE_CONFIDENCE,
  IC_RESISTED_DAILY_CAP,
  ROLLOVER_CATCHUP_DAYS,
} from './profile.ts'
import {
  savingsRateScore,
  budgetAdherenceScore,
  computeHealthScore,
  type Stage,
} from './healthScore.ts'
import type { Transaction } from '../state/store.ts'

const TODAY = '2026-08-01'

// Default category is discretionary: essential categories (Food, Bills,
// Health) are excluded from trailing spend while the placeholder models them.
const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  amountDA: 1_000,
  category: 'Fun',
  date: TODAY,
  ...over,
})

describe('deriveHealthInputs', () => {
  it('windows spend to the trailing 30 days ending at `today`', () => {
    const inputs = deriveHealthInputs(
      [
        tx({ id: 'in', amountDA: 10_000, date: '2026-07-15' }),
        tx({ id: 'out', amountDA: 999_999, date: '2026-06-01' }),
      ],
      DEMO_PROFILE,
      TODAY,
    )
    const expectedSpend = DEMO_PROFILE.monthlyEssentials + 10_000
    expect(inputs.SR.raw).toBe(savingsRateScore(DEMO_PROFILE.monthlyIncome, expectedSpend))
    expect(inputs.BA.raw).toBe(
      budgetAdherenceScore([{ budgeted: DEMO_PROFILE.budgeted, actual: expectedSpend }]),
    )
  })

  it('excludes resisted impulses from spend and counts them toward IC', () => {
    const inputs = deriveHealthInputs(
      [tx({ id: 'r', amountDA: 0, resistedImpulse: true })],
      DEMO_PROFILE,
      TODAY,
    )
    expect(inputs.SR.raw).toBe(
      savingsRateScore(DEMO_PROFILE.monthlyIncome, DEMO_PROFILE.monthlyEssentials),
    )
    expect(inputs.IC.structurallyUndefined).toBe(false)
    expect(inputs.IC.raw).toBe(100) // 1 resisted, 0 yielded
    expect(inputs.IC.confidence).toBeCloseTo(0.1, 6)
  })

  it('does not double-count essential categories the placeholder already models', () => {
    // The daily quest says "log every purchase" — a compliant user logging
    // real groceries/bills must not have them counted on top of the 52,000 DA
    // essentials placeholder, deflating SR/BA for doing what XP rewards.
    const baseline = deriveHealthInputs([], DEMO_PROFILE, TODAY)
    const withEssentials = deriveHealthInputs(
      [
        tx({ id: 'b', amountDA: 8_000, category: 'Bills' }),
        tx({ id: 'f', amountDA: 4_000, category: 'Food' }),
        tx({ id: 'h', amountDA: 2_000, category: 'Health' }),
      ],
      DEMO_PROFILE,
      TODAY,
    )
    expect(withEssentials.SR.raw).toBe(baseline.SR.raw)
    expect(withEssentials.BA.raw).toBe(baseline.BA.raw)
  })

  it('marks IC structurally undefined with no flagged events (honest low confidence)', () => {
    const inputs = deriveHealthInputs([tx({ id: 'a' })], DEMO_PROFILE, TODAY)
    expect(inputs.IC.structurallyUndefined).toBe(true)
    expect(inputs.IC.confidence).toBe(0)
  })

  it('ignores flagged events outside the 30-day window', () => {
    const inputs = deriveHealthInputs(
      [tx({ id: 'old', amountDA: 0, resistedImpulse: true, date: '2026-06-01' })],
      DEMO_PROFILE,
      TODAY,
    )
    expect(inputs.IC.structurallyUndefined).toBe(true)
  })

  it('caps resisted events counted toward IC per day — ten free taps cannot max IC', () => {
    const spam = Array.from({ length: 10 }, (_, i) =>
      tx({ id: `spam${i}`, amountDA: 0, resistedImpulse: true }),
    )
    const inputs = deriveHealthInputs(spam, DEMO_PROFILE, TODAY)
    // Only IC_RESISTED_DAILY_CAP of the ten same-day taps count.
    expect(inputs.IC.raw).toBe(100)
    expect(inputs.IC.confidence).toBeCloseTo(IC_RESISTED_DAILY_CAP / 10, 6)
  })

  it('counts resisted events on separate days up to the cap each day', () => {
    const inputs = deriveHealthInputs(
      [
        tx({ id: 'a', amountDA: 0, resistedImpulse: true, date: '2026-07-30' }),
        tx({ id: 'b', amountDA: 0, resistedImpulse: true, date: '2026-07-30' }),
        tx({ id: 'c', amountDA: 0, resistedImpulse: true, date: '2026-07-31' }),
      ],
      DEMO_PROFILE,
      TODAY,
    )
    expect(inputs.IC.confidence).toBeCloseTo(0.3, 6) // 2 + 1 events of 10
  })

  it('carries low confidence on demo-profile-backed components until onboarding ships', () => {
    const inputs = deriveHealthInputs([], DEMO_PROFILE, TODAY)
    for (const key of ['SR', 'BA', 'EF', 'DT'] as const) {
      expect(inputs[key].confidence).toBe(DEMO_PROFILE_CONFIDENCE)
    }
    expect(DEMO_PROFILE_CONFIDENCE).toBeLessThan(0.5)
  })
})

describe('finalizeHealthThrough', () => {
  it('a 7-day gap equals seven chained daily computations (never one big step)', () => {
    const txs = [tx({ id: 'a', amountDA: 12_000, date: '2026-07-24' })]
    const result = finalizeHealthThrough(txs, DEMO_PROFILE, '2026-07-25', TODAY, 30, 'ember')
    let score: number | null = 30
    let stage: Stage | null = 'ember'
    for (const day of [
      '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28',
      '2026-07-29', '2026-07-30', '2026-07-31',
    ]) {
      const r = computeHealthScore(deriveHealthInputs(txs, DEMO_PROFILE, day), score, stage)
      score = r.score
      stage = r.stage
    }
    expect(result.score).toBeCloseTo(score!, 10)
    expect(result.stage).toBe(stage)
  })

  it('a single elapsed day matches one computeHealthScore step (the old rollover)', () => {
    const txs = [tx({ id: 'a', amountDA: 5_000, date: '2026-07-31' })]
    const one = computeHealthScore(
      deriveHealthInputs(txs, DEMO_PROFILE, '2026-07-31'),
      40,
      'hearth',
    )
    const result = finalizeHealthThrough(txs, DEMO_PROFILE, '2026-07-31', TODAY, 40, 'hearth')
    expect(result.score).toBeCloseTo(one.score, 10)
    expect(result.stage).toBe(one.stage)
  })

  it('caps catch-up at ROLLOVER_CATCHUP_DAYS so an ancient healthDate cannot stall the UI', () => {
    // 60 days before 2026-08-01 is 2026-06-02: an older start must chain the
    // same capped window, not iterate through decades.
    const ancient = finalizeHealthThrough([], DEMO_PROFILE, '2000-01-01', TODAY, 50, 'hearth')
    const capped = finalizeHealthThrough([], DEMO_PROFILE, '2026-06-02', TODAY, 50, 'hearth')
    expect(ROLLOVER_CATCHUP_DAYS).toBe(60)
    expect(ancient.score).toBeCloseTo(capped.score, 10)
    expect(ancient.stage).toBe(capped.stage)
  })
})

describe('buildSimProfile', () => {
  it('maps the profile onto the simulator shape, including revolving APR', () => {
    const sim = buildSimProfile(DEMO_PROFILE)
    expect(sim).toEqual({
      monthlyIncome: DEMO_PROFILE.monthlyIncome,
      monthlyEssentials: DEMO_PROFILE.monthlyEssentials,
      monthlyDiscretionary: DEMO_PROFILE.monthlyDiscretionary,
      liquidBalance: DEMO_PROFILE.liquidBalance,
      efBalance: DEMO_PROFILE.efBalance,
      debtBalance: DEMO_PROFILE.debtNow,
      revolvingApr: DEMO_PROFILE.revolvingApr,
      debtMinimum: DEMO_PROFILE.debtMinimum,
      extraDebtPayment: DEMO_PROFILE.extraDebtPayment,
      goal: DEMO_PROFILE.goal,
    })
  })
})
