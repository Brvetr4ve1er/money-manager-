import { describe, it, expect } from 'vitest'
import {
  savingsRateScore,
  budgetAdherenceScore,
  emergencyFundScore,
  debtTrendScore,
  impulseControlScore,
  shrink,
  smooth,
  mapToStage,
  computeHealthScore,
  mapAnchors,
  type HealthInputs,
} from './healthScore.ts'

const included = (raw: number, confidence = 1): HealthInputs['SR'] => ({
  structurallyUndefined: false,
  raw,
  confidence,
})
const excluded = (): HealthInputs['SR'] => ({
  structurallyUndefined: true,
  raw: 0,
  confidence: 0,
})

describe('anchor mapping', () => {
  it('clamps below and above the anchor range', () => {
    const anchors: Array<[number, number]> = [[0, 0], [1, 100]]
    expect(mapAnchors(-5, anchors)).toBe(0)
    expect(mapAnchors(5, anchors)).toBe(100)
  })
  it('interpolates linearly between anchors', () => {
    expect(mapAnchors(0.5, [[0, 0], [1, 100]])).toBe(50)
  })
})

describe('savings rate', () => {
  it('scores the worked example: 22.2% → ~86.7', () => {
    expect(savingsRateScore(90_000, 70_000)).toBeCloseTo(86.7, 1)
  })
  it('gives 40 at exactly break-even', () => {
    expect(savingsRateScore(1000, 1000)).toBe(40)
  })
  it('caps at 100 for extreme savers', () => {
    expect(savingsRateScore(1000, 100)).toBe(100)
  })
  it('returns 0 with no income', () => {
    expect(savingsRateScore(0, 500)).toBe(0)
  })
})

describe('budget adherence', () => {
  it('scores the worked example: 4,700 over on 62,000 → ~92.4', () => {
    expect(
      budgetAdherenceScore([{ budgeted: 62_000, actual: 66_700 }]),
    ).toBeCloseTo(92.4, 1)
  })
  it('does not penalize underspending', () => {
    expect(budgetAdherenceScore([{ budgeted: 100, actual: 20 }])).toBe(100)
  })
  it('underspend in one category cannot offset overspend in another', () => {
    const score = budgetAdherenceScore([
      { budgeted: 100, actual: 150 }, // 50 over
      { budgeted: 100, actual: 20 }, // 80 under — must not cancel
    ])
    expect(score).toBe(75)
  })
})

describe('emergency fund', () => {
  it('scores the worked example: 0.87 months → ~14.4', () => {
    expect(emergencyFundScore(45_000, 52_000)).toBeCloseTo(14.4, 1)
  })
  it('caps at 6 months coverage', () => {
    expect(emergencyFundScore(1_000_000, 1_000)).toBe(100)
  })
})

describe('debt trend', () => {
  it('no debt at all scores 100', () => {
    expect(debtTrendScore(0, 0)).toBe(100)
  })
  it('holding steady is neutral 50', () => {
    expect(debtTrendScore(1000, 1000)).toBe(50)
  })
  it('paying down 10%+ scores 100 (worked example: −20.8%)', () => {
    expect(debtTrendScore(12_000, 9_500)).toBe(100)
  })
  it('debt growing 10%+ scores 0', () => {
    expect(debtTrendScore(1000, 1200)).toBe(0)
  })
})

describe('impulse control', () => {
  it('scores resisted ratio: 4 of 6 → ~66.7', () => {
    expect(impulseControlScore(4, 2)).toBeCloseTo(66.7, 1)
  })
})

describe('shrink & smooth', () => {
  it('shrinks toward 50 at low confidence (worked example: 66.7 @ 0.6 → 60)', () => {
    expect(shrink(66.7, 0.6)).toBeCloseTo(60, 1)
  })
  it('moves fast upward, slow downward', () => {
    expect(smooth(68.5, 72.0)).toBeCloseTo(70.25, 2)
    expect(smooth(72.0, 68.5)).toBeCloseTo(71.475, 2)
  })
})

describe('stage mapping with hysteresis', () => {
  it('promotes only past boundary + 3', () => {
    expect(mapToStage(56, 'hearth')).toBe('hearth') // 55+3=58 not cleared
    expect(mapToStage(58, 'hearth')).toBe('bonfire')
  })
  it('demotes only below boundary − 3', () => {
    expect(mapToStage(53, 'bonfire')).toBe('bonfire') // 55−3=52, not below
    expect(mapToStage(51, 'bonfire')).toBe('hearth')
  })
  it('maps plainly with no current stage', () => {
    expect(mapToStage(72, null)).toBe('bonfire')
    expect(mapToStage(85, null)).toBe('beacon')
  })
})

describe('full blend — Yasmine day 45 worked example', () => {
  it('reproduces H_raw = 72.0 and smoothed 70.25', () => {
    const inputs: HealthInputs = {
      SR: included(86.7),
      BA: included(92.4),
      EF: included(14.4),
      DT: included(100),
      IC: included(66.7, 0.6),
    }
    const r = computeHealthScore(inputs, 68.5, 'bonfire')
    expect(r.rawBlend).toBeCloseTo(72.0, 1)
    expect(r.score).toBeCloseTo(70.25, 1)
    expect(r.stage).toBe('bonfire')
  })
  it('redistributes weight when a component is excluded', () => {
    const inputs: HealthInputs = {
      SR: included(80),
      BA: included(80),
      EF: excluded(),
      DT: included(80),
      IC: excluded(),
    }
    const r = computeHealthScore(inputs, null, null)
    expect(r.rawBlend).toBeCloseTo(80, 5) // all included agree at 80
    expect(r.components.EF).toBeUndefined()
  })
  it('starts neutral when nothing is included', () => {
    const inputs: HealthInputs = {
      SR: excluded(), BA: excluded(), EF: excluded(), DT: excluded(), IC: excluded(),
    }
    expect(computeHealthScore(inputs, null, null).rawBlend).toBe(50)
  })
})
