import { describe, it, expect } from 'vitest'
import {
  installment,
  runSimulation,
  describeResult,
  type SimProfile,
} from './simulator.ts'

/** Yasmine's profile from the Decision Simulator worked example. */
const yasmine: SimProfile = {
  monthlyIncome: 90_000,
  monthlyEssentials: 52_000,
  monthlyDiscretionary: 15_000,
  liquidBalance: 60_000,
  efBalance: 45_000,
  debtBalance: 9_500,
  debtMinimum: 500,
  extraDebtPayment: 2_000,
  goal: { target: 500_000, current: 150_000, monthlyContribution: 12_000 },
}

describe('installment', () => {
  it('splits evenly at 0% APR', () => {
    expect(installment(180_000, 6)).toBe(30_000)
  })
  it('charges more with APR', () => {
    expect(installment(180_000, 6, 0.24)).toBeGreaterThan(30_000)
  })
})

describe('lump-sum purchase', () => {
  const r = runSimulation(yasmine, { amount: 180_000, funding: 'lump' })

  it('craters liquid balance in month 1 and repairs over time', () => {
    expect(r.scenario[0].liquidBalance).toBeLessThan(0)
    expect(r.scenario[11].liquidBalance).toBeGreaterThan(
      r.scenario[0].liquidBalance,
    )
  })
  it('pauses the goal during buffer repair', () => {
    expect(r.scenario[0].goalPaused).toBe(true)
    expect(r.baseline[0].goalPaused).toBe(false)
  })
  it('delays debt clearance vs. baseline', () => {
    expect(r.debtDelayMonths).not.toBeNull()
    expect(r.debtDelayMonths!).toBeGreaterThan(0)
  })
  it('shows a big month-1 health dip that mostly recovers by month 12', () => {
    expect(r.healthDeltaMonth1).toBeLessThan(-15)
    expect(Math.abs(r.healthDeltaFinal)).toBeLessThan(
      Math.abs(r.healthDeltaMonth1) / 2,
    )
  })
})

describe('financed purchase', () => {
  const r = runSimulation(yasmine, {
    amount: 180_000,
    funding: 'financed',
    financedMonths: 6,
  })
  it('avoids the single-month liquid crater', () => {
    const lump = runSimulation(yasmine, { amount: 180_000, funding: 'lump' })
    expect(r.scenario[0].liquidBalance).toBeGreaterThan(
      lump.scenario[0].liquidBalance,
    )
  })
  it('softens the month-1 health dip vs. lump sum', () => {
    const lump = runSimulation(yasmine, { amount: 180_000, funding: 'lump' })
    expect(r.healthDeltaMonth1).toBeGreaterThan(lump.healthDeltaMonth1)
  })
})

describe('describeResult trust rules', () => {
  it('never says "afford"; states tradeoffs', () => {
    const r = runSimulation(yasmine, { amount: 180_000, funding: 'lump' })
    const text = describeResult(r)
    expect(text.toLowerCase()).not.toContain('afford')
    expect(text.length).toBeGreaterThan(40)
  })
  it('pairs the month-1 dip with the end position when the dip is deep', () => {
    const r = runSimulation(yasmine, { amount: 180_000, funding: 'lump' })
    const text = describeResult(r)
    if (r.healthDeltaMonth1 < -10) {
      expect(text).toContain('month one')
    }
  })
})
