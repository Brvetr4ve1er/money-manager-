import { describe, it, expect } from 'vitest'
import { deriveHealthInputs, buildSimProfile, DEMO_PROFILE } from './profile.ts'
import { savingsRateScore, budgetAdherenceScore } from './healthScore.ts'
import type { Transaction } from '../state/store.ts'

const TODAY = '2026-08-01'

const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  amountDA: 1_000,
  category: 'Food',
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
