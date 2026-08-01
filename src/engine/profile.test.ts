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
import { RESIST_XP_DAILY_CAP } from './xp.ts'
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

  it('pins the boundary: today−29 is inside the 30-day window, today−30 is out', () => {
    // Inclusive >= filter: cutoff must be today−29 so the window holds exactly
    // 30 calendar days ending at today — a today−30 cutoff keeps 31 days,
    // permanently overstating spend against one month of income/essentials.
    const inputs = deriveHealthInputs(
      [
        tx({ id: 'in', amountDA: 10_000, date: '2026-07-03' }), // today−29
        tx({ id: 'out', amountDA: 999_999, date: '2026-07-02' }), // today−30
      ],
      DEMO_PROFILE,
      TODAY,
    )
    const expectedSpend = DEMO_PROFILE.monthlyEssentials + 10_000
    expect(inputs.SR.raw).toBe(savingsRateScore(DEMO_PROFILE.monthlyIncome, expectedSpend))
    // The same cutoff scopes the IC counts.
    const icOut = deriveHealthInputs(
      [tx({ id: 'r', amountDA: 0, resistedImpulse: true, date: '2026-07-02' })],
      DEMO_PROFILE,
      TODAY,
    )
    expect(icOut.IC.structurallyUndefined).toBe(true)
    const icIn = deriveHealthInputs(
      [tx({ id: 'r', amountDA: 0, resistedImpulse: true, date: '2026-07-03' })],
      DEMO_PROFILE,
      TODAY,
    )
    expect(icIn.IC.structurallyUndefined).toBe(false)
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

  it('excludes future-dated transactions from every trailing window', () => {
    // Device clock skew or a hand-edited payload: a transaction dated after
    // `today` must not sit inside every window "ending at today" forever,
    // deflating SR/BA or inflating the IC resist count.
    const baseline = deriveHealthInputs([], DEMO_PROFILE, TODAY)
    const inputs = deriveHealthInputs(
      [
        tx({ id: 'tomorrow', amountDA: 999_999, date: '2026-08-02' }),
        tx({ id: 'far', amountDA: 999_999, date: '2030-12-31' }),
        tx({ id: 'r-future', amountDA: 0, resistedImpulse: true, date: '2026-08-15' }),
        tx({ id: 'y-future', amountDA: 500, impulseFlagged: true, date: '2026-08-15' }),
      ],
      DEMO_PROFILE,
      TODAY,
    )
    expect(inputs.SR.raw).toBe(baseline.SR.raw)
    expect(inputs.BA.raw).toBe(baseline.BA.raw)
    expect(inputs.IC.structurallyUndefined).toBe(true)
  })

  it('ignores flagged events outside the 30-day window', () => {
    const inputs = deriveHealthInputs(
      [tx({ id: 'old', amountDA: 0, resistedImpulse: true, date: '2026-06-01' })],
      DEMO_PROFILE,
      TODAY,
    )
    expect(inputs.IC.structurallyUndefined).toBe(true)
  })

  it('keeps the IC cap and the resist XP cap in lockstep — drift fails CI', () => {
    expect(IC_RESISTED_DAILY_CAP).toBe(RESIST_XP_DAILY_CAP)
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

  it('keeps replayed catch-up days blind to transactions dated after them', () => {
    // The documented invariant: a user returning after N days gets the same
    // N-step trajectory as one who opened the app daily. A transaction dated
    // `today` did not exist on any earlier replayed day, so it must not leak
    // into those steps — here every replayed day is before the tx date, so
    // the chain must match a transaction-free replay exactly.
    const txs = [tx({ id: 'today', amountDA: 20_000, date: TODAY })]
    const replayed = finalizeHealthThrough(txs, DEMO_PROFILE, '2026-07-25', TODAY, 30, 'ember')
    const clean = finalizeHealthThrough([], DEMO_PROFILE, '2026-07-25', TODAY, 30, 'ember')
    expect(replayed.score).toBeCloseTo(clean.score, 10)
    expect(replayed.stage).toBe(clean.stage)
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

  it('returns promptly for a far-future five-digit-year healthDate sentinel', () => {
    // A hand-edited '9999-12-31' rolls to '10000-01-01', which compares LESS
    // than any real day key (five digits vs four), so a purely lexicographic
    // loop guard would walk ~3.7M single-day steps and freeze first render.
    // The iteration bound caps it at ROLLOVER_CATCHUP_DAYS; the test simply
    // finishing (well inside the runner timeout) is the assertion that
    // matters, plus a sane in-range score.
    const start = Date.now()
    const result = finalizeHealthThrough([], DEMO_PROFILE, '9999-12-31', TODAY, 50, 'hearth')
    expect(Date.now() - start).toBeLessThan(2_000)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
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
