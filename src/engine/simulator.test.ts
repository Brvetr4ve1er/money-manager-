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

describe('horizon hardening', () => {
  it('clamps a non-positive horizon to a 1-month projection instead of crashing', () => {
    // simulate() would return [] for horizonMonths <= 0 and runSimulation
    // would then throw reading scenario[0].health — the same class of hole
    // the financedMonths: 0 clamp already closes.
    const r = runSimulation(yasmine, { amount: 10_000, funding: 'lump' }, 0)
    expect(r.baseline).toHaveLength(1)
    expect(r.scenario).toHaveLength(1)
    expect(Number.isFinite(r.healthDeltaMonth1)).toBe(true)
    expect(runSimulation(yasmine, { amount: 10_000, funding: 'lump' }, -3).baseline).toHaveLength(1)
  })
  it('floors a fractional horizon to whole months', () => {
    expect(runSimulation(yasmine, { amount: 10_000, funding: 'lump' }, 2.9).baseline).toHaveLength(2)
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
  it('reports goal months as paused while installments consume the surplus', () => {
    // 90k income vs 97.5k fixed outflow during the 6 installment months:
    // liquid stays positive but the goal receives nothing — those months must
    // say so instead of flatlining with goalPaused: false.
    for (let i = 0; i < 6; i++) {
      expect(r.scenario[i].goalContribution).toBe(0)
      expect(r.scenario[i].goalPaused).toBe(true)
    }
    // Contributions resume at full plan once the installments end.
    expect(r.scenario[6].goalContribution).toBe(12_000)
    expect(r.scenario[6].goalPaused).toBe(false)
  })
  it('reports the funded amount at baseline (full plan, not paused)', () => {
    for (const m of r.baseline) {
      expect(m.goalContribution).toBe(12_000)
      expect(m.goalPaused).toBe(false)
    }
  })
  it('tracks the revolving balance separately from the financed principal', () => {
    // Month 1: revolving 9,500 − 500 minimum (surplus is eaten by the
    // installment, so no extra paydown); the financed principal sits on top
    // in the combined total only.
    expect(r.scenario[0].revolvingBalance).toBeCloseTo(9_000, 6)
    expect(r.scenario[0].debtBalance).toBeGreaterThan(r.scenario[0].revolvingBalance + 100_000)
  })
  it('never attributes installment debt to a nonexistent card balance', () => {
    // With no revolving debt, both paths carry a zero card balance from month
    // 1 — the installment plan is not a "card balance carried longer", and
    // copy claiming so would misstate the tradeoff (trust rules). The
    // financed obligation still shows through debtBalance and the health deltas.
    const noRevolving = runSimulation(
      { ...yasmine, debtBalance: 0 },
      { amount: 180_000, funding: 'financed', financedMonths: 6 },
    )
    expect(noRevolving.debtDelayMonths).toBe(0)
    expect(noRevolving.debtMissesHorizon).toBe(false)
    expect(describeResult(noRevolving)).not.toContain('card balance')
    expect(noRevolving.scenario[0].debtBalance).toBeGreaterThan(100_000)
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

describe('goal completion', () => {
  // 480k of 500k at 12k/mo: month 1 funds the full plan (492k), month 2 only
  // the 8k remainder, and every later month contributes nothing.
  const nearDone: SimProfile = {
    ...yasmine,
    goal: { target: 500_000, current: 480_000, monthlyContribution: 12_000 },
  }
  const r = runSimulation(nearDone, { amount: 5_000, funding: 'lump' })

  it('caps the final contribution at the remaining amount and stops at target', () => {
    expect(r.baseline[0].goalContribution).toBe(12_000)
    expect(r.baseline[1].goalContribution).toBe(8_000)
    for (let i = 2; i < r.baseline.length; i++) {
      expect(r.baseline[i].goalContribution).toBe(0)
      expect(r.baseline[i].goalBalance).toBe(500_000)
    }
  })
  it('never reports a completed goal as paused', () => {
    for (const m of r.baseline) expect(m.goalPaused).toBe(false)
  })
  it('redirects the freed surplus to liquid after completion', () => {
    // Month 3 (no contribution) must grow liquid faster than month 2 (8k
    // contribution) — the surplus stays in the buffer instead of vanishing
    // into a finished goal.
    const growth = (i: number) => r.baseline[i].liquidBalance - r.baseline[i - 1].liquidBalance
    expect(growth(2)).toBeGreaterThan(growth(1))
  })
})

describe('revolving APR', () => {
  it('accrues interest identically on both paths before payments land', () => {
    const r = runSimulation(
      { ...yasmine, revolvingApr: 0.24 },
      { amount: 5_000, funding: 'lump' },
    )
    // Month 1: 9,500 × 2%/mo = 190 interest, then 500 minimum + 2,000 extra.
    expect(r.baseline[0].debtBalance).toBeCloseTo(9_500 * 1.02 - 2_500, 6)
    expect(r.scenario[0].debtBalance).toBeCloseTo(9_500 * 1.02 - 2_500, 6)
  })
  it('defaults to 0% when revolvingApr is omitted', () => {
    const r = runSimulation(yasmine, { amount: 5_000, funding: 'lump' })
    expect(r.baseline[0].debtBalance).toBe(9_500 - 2_500)
  })
  it('makes a longer debt carry cost health instead of being free in-model', () => {
    // 15k revolving at 30% APR: baseline clears within the horizon, but the
    // financed purchase pauses extra paydown for 6 months and the interest
    // keeps the balance alive at month 12 — where the interest-free model
    // would have cleared it. Delaying paydown must show up in the deltas.
    const indebted: SimProfile = { ...yasmine, debtBalance: 15_000 }
    const purchase = { amount: 180_000, funding: 'financed' as const, financedMonths: 6 }
    const withApr = runSimulation({ ...indebted, revolvingApr: 0.3 }, purchase)
    const noApr = runSimulation(indebted, purchase)
    expect(noApr.debtMissesHorizon).toBe(false)
    expect(withApr.debtMissesHorizon).toBe(true)
    expect(withApr.healthDeltaFinal).toBeLessThan(noApr.healthDeltaFinal)
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
      revolvingBalance: 0,
      goalBalance: 0,
      goalContribution: 0,
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
  it('only claims recovery from the month-1 dip when the projection shows it', () => {
    const mk = (month: number, health: number): MonthState => ({
      month,
      liquidBalance: 0,
      debtBalance: 0,
      revolvingBalance: 0,
      goalBalance: 0,
      goalContribution: 0,
      goalPaused: false,
      health,
    })
    const base = {
      goalDelayMonths: null,
      goalMissesHorizon: false,
      debtDelayMonths: null,
      debtMissesHorizon: false,
    }
    // Dip persists to month 12: asserting recovery here would be the soft
    // reassurance the trust rules forbid.
    const persisting: SimResult = {
      ...base,
      baseline: Array.from({ length: 12 }, (_, i) => mk(i + 1, 60)),
      scenario: Array.from({ length: 12 }, (_, i) => mk(i + 1, 45)),
      healthDeltaMonth1: -15,
      healthDeltaFinal: -15,
    }
    const persistingText = describeResult(persisting)
    expect(persistingText).toContain('persisting')
    expect(persistingText).not.toContain('recover')
    // Genuine recovery keeps the original copy.
    const recovering: SimResult = {
      ...base,
      baseline: Array.from({ length: 12 }, (_, i) => mk(i + 1, 60)),
      scenario: Array.from({ length: 12 }, (_, i) => mk(i + 1, i === 0 ? 42 : 59)),
      healthDeltaMonth1: -18,
      healthDeltaFinal: -1,
    }
    expect(describeResult(recovering)).toContain('recover from there')
  })
  it('describes a near-zero final delta as a projection, not reassurance', () => {
    const r = runSimulation(yasmine, { amount: 5_000, funding: 'lump' })
    expect(Math.abs(r.healthDeltaFinal)).toBeLessThan(3) // guard: hits the branch
    const text = describeResult(r)
    expect(text).not.toContain("doesn't leave a lasting mark")
    expect(text).toContain('within 3 points')
  })
})
