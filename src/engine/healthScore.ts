/**
 * Health Score engine — implements Health Score Formula v0.1.
 *
 * Five components, each 0–100, each shrunk toward neutral (50) when data is
 * thin and excluded entirely (weight redistributed) when the underlying data
 * is structurally undefined. Blended, then smoothed asymmetrically (fast up,
 * slow down) and mapped to an avatar stage with ±3 hysteresis.
 *
 * XP and levels are deliberately NOT inputs here: the score reflects
 * financial state only, never app engagement.
 */

export type ComponentKey = 'SR' | 'BA' | 'EF' | 'DT' | 'IC'

export const WEIGHTS: Record<ComponentKey, number> = {
  SR: 0.25,
  BA: 0.2,
  EF: 0.2,
  DT: 0.2,
  IC: 0.15,
}

export type Stage = 'ember' | 'hearth' | 'bonfire' | 'beacon'

/** Stage lower bounds; hysteresis of ±3 applied at transitions. */
const STAGE_BOUNDS: Array<{ stage: Stage; min: number }> = [
  { stage: 'beacon', min: 80 },
  { stage: 'bonfire', min: 55 },
  { stage: 'hearth', min: 30 },
  { stage: 'ember', min: 0 },
]
const HYSTERESIS = 3

export interface ComponentInput {
  /** Data does not exist at all (no EF account tagged, no debt linked...). */
  structurallyUndefined: boolean
  /** Raw 0–100 score. Ignored when structurallyUndefined. */
  raw: number
  /** 0–1; how much history backs this number. Ignored when structurallyUndefined. */
  confidence: number
}

export interface HealthInputs {
  SR: ComponentInput
  BA: ComponentInput
  EF: ComponentInput
  DT: ComponentInput
  IC: ComponentInput
}

export interface HealthResult {
  /** Smoothed score for today, 0–100. */
  score: number
  /** Unsmoothed blend, exposed for explainability UI. */
  rawBlend: number
  /** Per-component shrunk scores for included components. */
  components: Partial<Record<ComponentKey, number>>
  stage: Stage
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v))

/** Piecewise-linear map through anchor points [x, y], sorted by x ascending. */
export function mapAnchors(x: number, anchors: Array<[number, number]>): number {
  if (anchors.length === 0) return 0
  if (x <= anchors[0][0]) return anchors[0][1]
  const last = anchors[anchors.length - 1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i - 1]
    const [x2, y2] = anchors[i]
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1)
      return y1 + t * (y2 - y1)
    }
  }
  return last[1]
}

/** Savings Rate: trailing-30d (smoothed income − expenses) / smoothed income. */
export function savingsRateScore(income30dSmoothed: number, expenses30d: number): number {
  if (income30dSmoothed <= 0) return 0
  const sr = (income30dSmoothed - expenses30d) / income30dSmoothed
  return mapAnchors(sr, [
    [-0.1, 0],
    [0, 40],
    [0.2, 85],
    [0.4, 100],
  ])
}

/** Budget Adherence: only overspend counts against the score. */
export function budgetAdherenceScore(
  categories: Array<{ budgeted: number; actual: number }>,
): number {
  const totalBudget = categories.reduce((s, c) => s + c.budgeted, 0)
  if (totalBudget <= 0) return 100
  const overspend = categories.reduce(
    (s, c) => s + Math.max(0, c.actual - c.budgeted),
    0,
  )
  return 100 * clamp(1 - overspend / totalBudget, 0, 1)
}

/** Emergency Fund: months of essential spend covered; 6 months = full score. */
export function emergencyFundScore(
  efBalance: number,
  avgMonthlyEssentials: number,
): number {
  if (avgMonthlyEssentials <= 0) return 100
  const months = efBalance / avgMonthlyEssentials
  return 100 * Math.min(1, months / 6)
}

/** Debt Trend: 30-day payoff rate on revolving debt. */
export function debtTrendScore(debtStart: number, debtNow: number): number {
  if (debtStart === 0 && debtNow === 0) return 100
  if (debtStart === 0) return 0 // debt appeared from nothing this window
  const payoffRate = (debtStart - debtNow) / debtStart
  return mapAnchors(payoffRate, [
    [-0.1, 0],
    [0, 50],
    [0.1, 100],
  ])
}

/** Impulse Control: resisted / total flagged events. */
export function impulseControlScore(resisted: number, yielded: number): number {
  const total = resisted + yielded
  if (total === 0) return 50 // callers should exclude instead; neutral fallback
  return (100 * resisted) / total
}

/** Confidence shrink toward the neutral midpoint. */
export const shrink = (raw: number, confidence: number): number =>
  clamp(confidence, 0, 1) * raw + (1 - clamp(confidence, 0, 1)) * 50

/** Asymmetric smoothing: improvement registers fast, decline must be sustained. */
export function smooth(prev: number, rawToday: number): number {
  const rate = rawToday >= prev ? 0.5 : 0.15
  return prev + rate * (rawToday - prev)
}

/** Map a score to a stage with ±3 hysteresis against the current stage. */
export function mapToStage(score: number, currentStage: Stage | null): Stage {
  // Defense in depth: a score below every bound (e.g. an out-of-range
  // persisted snapshot that slipped past sanitization) must map to the floor
  // stage, never crash on `find()` missing — a corrupted payload would brick
  // the app at every render until localStorage is cleared.
  const plain = (STAGE_BOUNDS.find((b) => score >= b.min) ?? STAGE_BOUNDS[STAGE_BOUNDS.length - 1]).stage
  if (currentStage === null || plain === currentStage) return plain

  const order: Stage[] = ['ember', 'hearth', 'bonfire', 'beacon']
  const curIdx = order.indexOf(currentStage)
  const newIdx = order.indexOf(plain)

  if (newIdx > curIdx) {
    // Moving up: must clear the next boundary + hysteresis.
    const bound = STAGE_BOUNDS.find((b) => b.stage === order[curIdx + 1])!.min
    return score >= bound + HYSTERESIS
      ? mapToStage(score, order[curIdx + 1])
      : currentStage
  }
  // Moving down: must fall below the current stage's floor − hysteresis.
  const floor = STAGE_BOUNDS.find((b) => b.stage === currentStage)!.min
  return score < floor - HYSTERESIS
    ? mapToStage(score, order[curIdx - 1])
    : currentStage
}

export function computeHealthScore(
  inputs: HealthInputs,
  prevSmoothed: number | null,
  currentStage: Stage | null,
): HealthResult {
  const components: Partial<Record<ComponentKey, number>> = {}
  let weightSum = 0
  let blend = 0

  for (const key of Object.keys(WEIGHTS) as ComponentKey[]) {
    const input = inputs[key]
    if (input.structurallyUndefined) continue
    const shrunk = shrink(input.raw, input.confidence)
    components[key] = shrunk
    blend += WEIGHTS[key] * shrunk
    weightSum += WEIGHTS[key]
  }

  // Nothing included at all (brand-new user): neutral start. The smoothed
  // score is clamped to [0, 100]: `prevSmoothed` comes from persisted state,
  // and even a sanitizer miss on an out-of-range snapshot must degrade to a
  // clamped score, never leak out of range into stage mapping or the UI.
  const rawBlend = weightSum > 0 ? blend / weightSum : 50
  const score = clamp(
    prevSmoothed === null ? rawBlend : smooth(prevSmoothed, rawBlend),
    0,
    100,
  )
  const stage = mapToStage(score, currentStage)

  return { score, rawBlend, components, stage }
}
