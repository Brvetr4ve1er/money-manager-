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
  it('never funds the goal while liquid is negative (buffer-repair contract)', () => {
    // 184,000 DA lump: the month liquid first crosses zero used to contribute
    // the full goal amount and drive liquid negative again with goalPaused
    // still false — exactly the misleading output the trust rules forbid.
    const edge = runSimulation(yasmine, { amount: 184_000, funding: 'lump' })
    for (const m of edge.scenario) {
      if (!m.goalPaused) {
        expect(m.liquidBalance).toBeGreaterThanOrEqual(0)
      }
    }
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

describe('goal or debt pushed past the horizon', () => {
  // Goal is nearly done: baseline completes in month 2 (480k + 12k + 12k).
  // A 400,000 DA lump craters liquid for the whole horizon, so the scenario
  // never resumes contributions and the goal stops completing — the single
  // biggest tradeoff, which must never collapse to a silent null.
  const nearGoal: SimProfile = {
    ...yasmine,
    goal: { target: 500_000, current: 480_000, monthlyContribution: 12_000 },
  }
  const r = runSimulation(nearGoal, { amount: 400_000, funding: 'lump' })

  it('flags a goal that completes at baseline but not with the purchase', () => {
    expect(r.goalDelayMonths).toBeNull()
    expect(r.goalMissesHorizon).toBe(true)
  })
  it('flags debt that clears at baseline but not with the purchase', () => {
    expect(r.debtDelayMonths).toBeNull()
    expect(r.debtMissesHorizon).toBe(true)
  })
  it('surfaces both misses in the copy instead of staying quiet', () => {
    const text = describeResult(r)
    expect(text).toContain('no longer completes within the 12-month projection')
    expect(text).toContain("doesn't clear within the 12-month projection")
  })
  it('stays null (not a miss) when neither path completes', () => {
    // Yasmine's real goal (150k → 500k at 12k/mo) can't finish in 12 months
    // on either path.
    const base = runSimulation(yasmine, { amount: 5_000, funding: 'lump' })
    expect(base.goalDelayMonths).toBeNull()
    expect(base.goalMissesHorizon).toBe(false)
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
  it('never treats financedMonths: 0 as a free purchase', () => {
    const zero = runSimulation(yasmine, {
      amount: 180_000,
      funding: 'financed',
      financedMonths: 0,
    })
    const one = runSimulation(yasmine, {
      amount: 180_000,
      funding: 'financed',
      financedMonths: 1,
    })
    // Clamped to a single-month installment: the full amount is charged.
    expect(zero.scenario).toEqual(one.scenario)
    expect(zero.scenario[0].liquidBalance).toBeLessThan(
      zero.baseline[0].liquidBalance,
    )
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
  it('describes a near-zero final delta as a projection, not reassurance', () => {
    const r = runSimulation(yasmine, { amount: 5_000, funding: 'lump' })
    expect(Math.abs(r.healthDeltaFinal)).toBeLessThan(3) // guard: hits the branch
    const text = describeResult(r)
    expect(text).not.toContain("doesn't leave a lasting mark")
    expect(text).toContain('within 3 points')
  })
})
