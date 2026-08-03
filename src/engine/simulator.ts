/**
 * Decision Simulator engine — implements Decision Simulator Logic v0.1.
 *
 * Projects a baseline ("wait") path and a scenario ("buy") path month by
 * month, using the same raw-score functions as the Health Score engine so a
 * purchase the simulator calls fine can never contradict the avatar later.
 *
 * The monthly step model:
 *  - essentials, debt minimums, and typical discretionary spend are
 *    non-negotiable outflows;
 *  - if liquid balance would go negative, that month's surplus repairs the
 *    buffer first, pausing goal contributions and extra debt paydown;
 *  - contributions resume automatically once the buffer is repaired;
 *  - even with liquid positive, contributions are capped by the month's
 *    surplus — any month funded below plan reports goalPaused with the
 *    actual amount in goalContribution.
 */

import {
  WEIGHTS,
  savingsRateScore,
  budgetAdherenceScore,
  emergencyFundScore,
  debtTrendScore,
} from './healthScore.ts'

export interface SimProfile {
  /** Smoothed monthly income (90-day rolling basis). */
  monthlyIncome: number
  /** Average monthly essential spend (housing, utilities, groceries...). */
  monthlyEssentials: number
  /** Trailing-average monthly discretionary spend. */
  monthlyDiscretionary: number
  /** Non-EF liquid buffer (checking etc.). */
  liquidBalance: number
  /** Emergency fund balance (untouched by the simulator by design). */
  efBalance: number
  /** Current revolving debt balance. */
  debtBalance: number
  /** Annual rate on the revolving balance as a decimal (0.24 = 24% APR).
   *  Omit or 0 for interest-free. Accrued identically on both paths so
   *  carrying the balance longer has a real in-model cost — otherwise
   *  debtDelayMonths would read as free, under-reporting the tradeoff. */
  revolvingApr?: number
  /** Required minimum debt payment per month. */
  debtMinimum: number
  /** Extra (voluntary) debt paydown per month at baseline. */
  extraDebtPayment: number
  /** Active savings goal. */
  goal: { target: number; current: number; monthlyContribution: number } | null
}

export interface Purchase {
  amount: number
  /** 'lump' pays from liquid balance in month 0; 'financed' spreads over months. */
  funding: 'lump' | 'financed'
  financedMonths?: number
  /** Annual rate as a decimal (0.24 = 24% APR). Omit or 0 for interest-free. */
  apr?: number
}

export interface MonthState {
  month: number
  liquidBalance: number
  /** Total debt outstanding: revolving balance plus any unamortized financed principal. */
  debtBalance: number
  /** Revolving (card) balance alone. Debt-clearance months compare this, not
   *  debtBalance: a financed purchase keeps the combined total positive for
   *  its whole term, and measuring "carrying your card balance longer"
   *  against it would attribute the installment plan to a card balance the
   *  user may not even have. */
  revolvingBalance: number
  goalBalance: number
  /** Amount actually contributed to the goal this month — may be less than
   *  the planned monthlyContribution when the surplus is squeezed. */
  goalContribution: number
  /** True when a goal exists and this month funded it below plan (buffer
   *  repair, or installments/outflows eating the surplus). A UI charting the
   *  goal must never show it flatlining while claiming it is not paused. */
  goalPaused: boolean
  /** Projected health blend for this month (IC excluded, weights renormalized). */
  health: number
}

export interface SimResult {
  baseline: MonthState[]
  scenario: MonthState[]
  /** Months of delay to goal completion caused by the purchase (null if goal
   *  doesn't complete within the horizon on either path, or if the purchase
   *  pushes completion past the horizon — see goalMissesHorizon). */
  goalDelayMonths: number | null
  /** True when the baseline reaches the goal within the horizon but the
   *  purchase path does not: the purchase's biggest tradeoff, surfaced
   *  explicitly instead of collapsing to a null delay. */
  goalMissesHorizon: boolean
  /** Extra months carrying revolving debt vs. baseline (null if debt never
   *  clears within the horizon on either path, or if the purchase pushes
   *  clearance past the horizon — see debtMissesHorizon). */
  debtDelayMonths: number | null
  /** True when debt clears within the horizon at baseline but not with the
   *  purchase. */
  debtMissesHorizon: boolean
  healthDeltaMonth1: number
  healthDeltaFinal: number
}

/** Fixed-installment payment for a financed purchase. */
export function installment(amount: number, months: number, apr = 0): number {
  if (months <= 0) return amount
  if (apr <= 0) return amount / months
  const r = apr / 12
  return (amount * r) / (1 - Math.pow(1 + r, -months))
}

/**
 * Blend weights derived FROM the Health Score engine's WEIGHTS — never a
 * local copy: the module header promises the simulator scores like the
 * avatar, and a re-tuned WEIGHTS that a hardcoded copy here didn't follow
 * would break that contract silently. IC-exclusion-plus-renormalization is
 * the only local logic (Impulse Control can't be projected).
 */
const PROJECTION_WEIGHTS = {
  SR: WEIGHTS.SR,
  BA: WEIGHTS.BA,
  EF: WEIGHTS.EF,
  DT: WEIGHTS.DT,
} as const

/** Projected health blend with Impulse Control excluded (can't be projected). */
export function projectedHealth(
  s: { income: number; expenses: number; overspend: number; budgetTotal: number; ef: number; essentials: number; debtStart: number; debtNow: number },
): number {
  const w = PROJECTION_WEIGHTS
  const totalW = w.SR + w.BA + w.EF + w.DT // IC's weight renormalized away
  const sr = savingsRateScore(s.income, s.expenses)
  const ba = budgetAdherenceScore([{ budgeted: s.budgetTotal, actual: s.budgetTotal + s.overspend }])
  const ef = emergencyFundScore(s.ef, s.essentials)
  const dt = debtTrendScore(s.debtStart, s.debtNow)
  return (w.SR * sr + w.BA * ba + w.EF * ef + w.DT * dt) / totalW
}

function firstMonthReaching(
  states: MonthState[],
  pred: (m: MonthState) => boolean,
): number | null {
  const hit = states.find(pred)
  return hit ? hit.month : null
}

export function simulate(
  profile: SimProfile,
  purchase: Purchase | null,
  horizonMonths = 12,
): MonthState[] {
  // Clamp to a whole positive month count, same hardening as financedMonths
  // below: a 0/negative horizon would return [] and crash runSimulation on
  // scenario[0], and a fractional one would silently truncate the projection.
  horizonMonths = Math.max(1, Math.floor(horizonMonths))
  const months: MonthState[] = []
  let liquid = profile.liquidBalance
  let debt = profile.debtBalance
  let goalBal = profile.goal?.current ?? 0
  // A financed purchase is a contractual debt from month 0, amortized by the
  // installments below. It must be visible to debtBalance, debt-clearance
  // months, and the DT term — otherwise the financed path under-reports its
  // debt tradeoff, exactly what the trust rules forbid. Tracked separately
  // from the revolving balance so minimums / extra paydown never double-pay
  // what the fixed installment already covers.
  let financedDebt = purchase?.funding === 'financed' ? purchase.amount : 0

  // Clamp to a whole positive month count: an explicit 0 (or negative /
  // fractional) financedMonths must never simulate the purchase as free —
  // the ?? default only covers undefined.
  const financedMonths =
    purchase?.funding === 'financed'
      ? Math.max(1, Math.floor(purchase.financedMonths ?? 6))
      : 0
  const monthlyInstallment =
    purchase?.funding === 'financed'
      ? installment(purchase.amount, financedMonths, purchase.apr ?? 0)
      : 0

  // Lump-sum purchase lands before month 1.
  if (purchase?.funding === 'lump') liquid -= purchase.amount

  for (let m = 1; m <= horizonMonths; m++) {
    // Revolving interest accrues at the top of the month, before any payment
    // lands — identically on both paths, so a scenario that delays paydown
    // pays for every extra month it carries the balance.
    debt += debt * ((profile.revolvingApr ?? 0) / 12)
    const debtStartOfMonth = debt + financedDebt
    const install = m <= financedMonths ? monthlyInstallment : 0

    const fixedOutflow =
      profile.monthlyEssentials +
      profile.monthlyDiscretionary +
      Math.min(debt, profile.debtMinimum) +
      install
    debt = Math.max(0, debt - Math.min(debt, profile.debtMinimum))
    if (install > 0) {
      // The installment's principal portion (installment minus this month's
      // interest) amortizes the financed balance; interest is a pure cost.
      const interest = financedDebt * ((purchase?.apr ?? 0) / 12)
      financedDebt = Math.max(0, financedDebt - Math.max(0, install - interest))
      // The fixed-installment formula amortizes exactly over financedMonths;
      // clear float residue so the final installment truly zeroes the balance.
      if (m === financedMonths) financedDebt = 0
    }

    let surplus = profile.monthlyIncome - fixedOutflow
    liquid += surplus
    surplus = Math.max(0, surplus)

    // Planned contribution this month: the plan capped at what the goal still
    // needs. A completed goal takes nothing more — post-completion months must
    // not keep diverting surplus from liquid (and, via afterGoal, from extra
    // debt paydown) into a finished goal, which would understate liquid and
    // skew debt-clearance months on whichever path finishes first.
    const goalPlanned = profile.goal
      ? Math.min(profile.goal.monthlyContribution, Math.max(0, profile.goal.target - goalBal))
      : 0
    // While liquid < 0 the buffer repairs itself: the entire month's surplus
    // already went in via the += above; contributions pause until it recovers.
    let goalContribution = 0
    if (liquid >= 0) {
      // Optional outflows are capped by liquid as well as surplus so the
      // month the buffer first crosses zero can never fund the goal back
      // into the red (buffer-repair contract in the header).
      const available = Math.max(0, Math.min(surplus, liquid))
      goalContribution = Math.min(goalPlanned, available)
      const afterGoal = available - goalContribution
      const extraDebt = Math.min(debt, Math.min(profile.extraDebtPayment, afterGoal))
      goalBal += goalContribution
      debt -= extraDebt
      liquid -= goalContribution + extraDebt
    }
    // Paused = funded below plan, not just "liquid went negative": a financed
    // purchase can zero out contributions for months while liquid stays
    // positive, and reporting goalPaused: false there would be misleading.
    // The plan is goalPlanned, not monthlyContribution: a finished goal
    // receiving 0 is complete, not paused.
    const goalPaused = profile.goal !== null && goalContribution < goalPlanned

    const expensesThisMonth = fixedOutflow + (m === 1 && purchase?.funding === 'lump' ? purchase.amount : 0)
    const health = projectedHealth({
      income: profile.monthlyIncome,
      expenses: expensesThisMonth,
      overspend: 0, // simulator-logged purchases are exempt from Budget Adherence
      budgetTotal: profile.monthlyEssentials + profile.monthlyDiscretionary,
      ef: profile.efBalance,
      essentials: profile.monthlyEssentials,
      debtStart: debtStartOfMonth,
      debtNow: debt + financedDebt,
    })

    months.push({
      month: m,
      liquidBalance: liquid,
      debtBalance: debt + financedDebt,
      revolvingBalance: debt,
      goalBalance: goalBal,
      goalContribution,
      goalPaused,
      health,
    })
  }
  return months
}

export function runSimulation(
  profile: SimProfile,
  purchase: Purchase,
  horizonMonths = 12,
): SimResult {
  const baseline = simulate(profile, null, horizonMonths)
  const scenario = simulate(profile, purchase, horizonMonths)

  const target = profile.goal ? profile.goal.target : null
  const goalDoneBase = target !== null
    ? firstMonthReaching(baseline, (m) => m.goalBalance >= target)
    : null
  const goalDoneScen = target !== null
    ? firstMonthReaching(scenario, (m) => m.goalBalance >= target)
    : null
  // Clearance over the REVOLVING balance only: describeResult's copy says
  // "card balance", and with no revolving debt every baseline month clears in
  // month 1 while a financed purchase holds the combined total positive for
  // its term — the "delay" would be the installment plan itself measured
  // against a fictitious month-1 clearance. The financed principal still
  // shows its cost through debtBalance, DT, and the health deltas.
  const debtClearBase = firstMonthReaching(baseline, (m) => m.revolvingBalance <= 0)
  const debtClearScen = firstMonthReaching(scenario, (m) => m.revolvingBalance <= 0)

  return {
    baseline,
    scenario,
    goalDelayMonths:
      goalDoneBase !== null && goalDoneScen !== null
        ? goalDoneScen - goalDoneBase
        : null,
    goalMissesHorizon: goalDoneBase !== null && goalDoneScen === null,
    debtDelayMonths:
      debtClearBase !== null && debtClearScen !== null
        ? debtClearScen - debtClearBase
        : null,
    debtMissesHorizon: debtClearBase !== null && debtClearScen === null,
    healthDeltaMonth1: scenario[0].health - baseline[0].health,
    healthDeltaFinal:
      scenario[scenario.length - 1].health - baseline[baseline.length - 1].health,
  }
}

/**
 * Trust rules, encoded: the copy states specific tradeoffs, never a verdict,
 * and always pairs the month-1 dip with the month-12 position.
 *
 * VOICE (§7): every part below is a fragment stack under nine words per
 * sentence, leading with the object it measures — the parts join into a
 * paragraph, so a 15-word clause here compounds into a 60-word one on screen.
 * What compression may NOT touch: the hedges. "about", "worth double-checking"
 * and the conditional recovery branch are anti-false-confidence machinery, not
 * padding — "You lose 12 points." asserts precision this model does not have,
 * and §7.1 forbids that as firmly as it forbids blame.
 */
export function describeResult(r: SimResult): string {
  const parts: string[] = []
  const horizon = r.baseline.length
  const finalDelta = r.healthDeltaFinal
  if (Math.abs(finalDelta) < 3) {
    // Neutral projection statement, not reassurance: "doesn't leave a mark" —
    // and equally "no real difference" — reads as a verdict one step from
    // "you can afford it". Naming both paths and the band keeps it a
    // measurement.
    parts.push(`Buy and wait land within 3 points. Month ${horizon}.`)
  } else if (finalDelta < 0) {
    parts.push(`Buy path ends lower. About ${Math.abs(finalDelta).toFixed(0)} points below waiting.`)
  } else {
    // Mirror the negative branch: state the number, keep the hedge. Hiding
    // the magnitude behind "slightly" drifts toward soft reassurance.
    parts.push(
      `Buy path ends about ${finalDelta.toFixed(0)} points ahead. Worth double-checking against the debt and cash-flow lines.`,
    )
  }
  if (r.goalMissesHorizon) {
    parts.push(`Goal: no longer completes within the ${horizon}-month projection. The wait path finishes it.`)
  } else if (r.goalDelayMonths !== null && r.goalDelayMonths > 0) {
    parts.push(`Your goal slips about ${r.goalDelayMonths} month${r.goalDelayMonths === 1 ? '' : 's'}.`)
  }
  if (r.debtMissesHorizon) {
    parts.push(`Card balance: doesn't clear within the ${horizon}-month projection. The wait path clears it.`)
  } else if (r.debtDelayMonths !== null && r.debtDelayMonths > 0) {
    parts.push(`Card balance: about ${r.debtDelayMonths} month${r.debtDelayMonths === 1 ? '' : 's'} longer.`)
  }
  if (r.healthDeltaMonth1 < -10) {
    // Only claim recovery when the projection actually shows it: asserting
    // "and recover from there" while healthDeltaFinal stays deep in the red
    // is exactly the soft reassurance the trust rules forbid.
    if (r.healthDeltaFinal > r.healthDeltaMonth1 + 5) {
      parts.push('Month one takes the hit. Numbers dip hard, then recover from there.')
    } else {
      parts.push('Month one takes the hit. The projection shows it persisting.')
    }
  }
  return parts.join(' ')
}
