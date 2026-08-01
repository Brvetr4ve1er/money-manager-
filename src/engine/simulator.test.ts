import { describe, it, expect } from 'vitest'
import {
  installment,
  runSimulation,
  describeResult,
  type SimProfile,
  type SimResult,
  type MonthState,
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
  it('carries the financed principal as debt from month 1', () => {
    // The contractual obligation must be visible to debtBalance / DT — a
    // financed purchase is not debt-free just because it isn't revolving.
    expect(r.scenario[0].debtBalance).toBeGreaterThan(
      r.baseline[0].debtBalance + 100_000,
    )
  })
  it('reports the financed debt tradeoff via debtDelayMonths', () => {
    // Baseline clears the 9,500 revolving balance in month 4 (500 min +
    // 2,000 extra). Installments eat the whole surplus for 6 months, pausing
    // extra paydown, so clearance slips well past baseline.
    expect(r.debtDelayMonths).not.toBeNull()
    expect(r.debtDelayMonths!).toBeGreaterThan(0)
  })
  it('fully amortizes the financed balance by the final installment', () => {
    // During months 1–6 the installment consumes the surplus, so only the
    // 500/mo minimum hits the revolving balance: 9,500 − 6×500 = 6,500.
    // The financed principal itself must be exactly 0 after installment 6.
    expect(r.scenario[5].debtBalance).toBeCloseTo(6_500, 6)
    const withApr = runSimulation(yasmine, {
      amount: 180_000,
      funding: 'financed',
      financedMonths: 6,
      apr: 0.24,
    })
    expect(withApr.scenario[5].debtBalance).toBeCloseTo(6_500, 6)
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
  it('states the magnitude when the projection lands ahead, never "slightly"', () => {
    const mk = (month: number, health: number): MonthState => ({
      month,
      liquidBalance: 0,
      debtBalance: 0,
      goalBalance: 0,
      goalPaused: false,
      health,
    })
    const ahead: SimResult = {
      baseline: Array.from({ length: 12 }, (_, i) => mk(i + 1, 50)),
      scenario: Array.from({ length: 12 }, (_, i) => mk(i + 1, 65)),
      goalDelayMonths: null,
      goalMissesHorizon: false,
      debtDelayMonths: null,
      debtMissesHorizon: false,
      healthDeltaMonth1: 15,
      healthDeltaFinal: 15,
    }
    const text = describeResult(ahead)
    expect(text).toContain('15 points ahead')
    expect(text).not.toContain('slightly')
  })
  it('describes a near-zero final delta as a projection, not reassurance', () => {
    const r = runSimulation(yasmine, { amount: 5_000, funding: 'lump' })
    expect(Math.abs(r.healthDeltaFinal)).toBeLessThan(3) // guard: hits the branch
    const text = describeResult(r)
    expect(text).not.toContain("doesn't leave a lasting mark")
    expect(text).toContain('within 3 points')
  })
})
