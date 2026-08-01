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
 *  - contributions resume automatically once the buffer is repaired.
 */

import {
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
  debtBalance: number
  goalBalance: number
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

/** Projected health blend with Impulse Control excluded (can't be projected). */
export function projectedHealth(
  s: { income: number; expenses: number; overspend: number; budgetTotal: number; ef: number; essentials: number; debtStart: number; debtNow: number },
): number {
  const w = { SR: 0.25, BA: 0.2, EF: 0.2, DT: 0.2 }
  const totalW = w.SR + w.BA + w.EF + w.DT // 0.85, renormalized below
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
  const months: MonthState[] = []
  let liquid = profile.liquidBalance
  let debt = profile.debtBalance
  let goalBal = profile.goal?.current ?? 0

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
    const debtStartOfMonth = debt
    const install = m <= financedMonths ? monthlyInstallment : 0

    const fixedOutflow =
      profile.monthlyEssentials +
      profile.monthlyDiscretionary +
      Math.min(debt, profile.debtMinimum) +
      install
    debt = Math.max(0, debt - Math.min(debt, profile.debtMinimum))

    let surplus = profile.monthlyIncome - fixedOutflow
    liquid += surplus
    surplus = Math.max(0, surplus)

    let goalPaused = false
    if (liquid < 0) {
      // Buffer repair: the entire month's surplus already went in via the
      // += above; contributions pause until liquid recovers.
      goalPaused = true
    } else {
      // Optional outflows are capped by liquid as well as surplus so the
      // month the buffer first crosses zero can never fund the goal back
      // into the red (buffer-repair contract in the header).
      const available = Math.max(0, Math.min(surplus, liquid))
      const goalContribution = profile.goal
        ? Math.min(profile.goal.monthlyContribution, available)
        : 0
      const afterGoal = available - goalContribution
      const extraDebt = Math.min(debt, Math.min(profile.extraDebtPayment, afterGoal))
      goalBal += goalContribution
      debt -= extraDebt
      liquid -= goalContribution + extraDebt
    }

    const expensesThisMonth = fixedOutflow + (m === 1 && purchase?.funding === 'lump' ? purchase.amount : 0)
    const health = projectedHealth({
      income: profile.monthlyIncome,
      expenses: expensesThisMonth,
      overspend: 0, // simulator-logged purchases are exempt from Budget Adherence
      budgetTotal: profile.monthlyEssentials + profile.monthlyDiscretionary,
      ef: profile.efBalance,
      essentials: profile.monthlyEssentials,
      debtStart: debtStartOfMonth,
      debtNow: debt,
    })

    months.push({
      month: m,
      liquidBalance: liquid,
      debtBalance: debt,
      goalBalance: goalBal,
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
  const debtClearBase = firstMonthReaching(baseline, (m) => m.debtBalance <= 0)
  const debtClearScen = firstMonthReaching(scenario, (m) => m.debtBalance <= 0)

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
 */
export function describeResult(r: SimResult): string {
  const parts: string[] = []
  const horizon = r.baseline.length
  const finalDelta = r.healthDeltaFinal
  if (Math.abs(finalDelta) < 3) {
    // Neutral projection statement, not reassurance: "doesn't leave a mark"
    // reads as a verdict one step from "you can afford it".
    parts.push(
      `By month ${horizon} the buy and wait paths land within 3 points of each other.`,
    )
  } else if (finalDelta < 0) {
    parts.push(
      `By the end of the projection your overall position sits about ${Math.abs(finalDelta).toFixed(0)} points lower than if you wait.`,
    )
  } else {
    parts.push('This purchase leaves your projected position slightly ahead — likely via debt or cash-flow effects worth double-checking.')
  }
  if (r.goalMissesHorizon) {
    parts.push(
      `Your goal no longer completes within the ${horizon}-month projection — on the wait path it does.`,
    )
  } else if (r.goalDelayMonths !== null && r.goalDelayMonths > 0) {
    parts.push(`Your goal slips about ${r.goalDelayMonths} month${r.goalDelayMonths === 1 ? '' : 's'}.`)
  }
  if (r.debtMissesHorizon) {
    parts.push(
      `Your card balance doesn't clear within the ${horizon}-month projection — on the wait path it does.`,
    )
  } else if (r.debtDelayMonths !== null && r.debtDelayMonths > 0) {
    parts.push(`You'd carry your card balance about ${r.debtDelayMonths} month${r.debtDelayMonths === 1 ? '' : 's'} longer.`)
  }
  if (r.healthDeltaMonth1 < -10) {
    parts.push('The rough part is month one — your numbers dip hard right after the purchase and recover from there.')
  }
  return parts.join(' ')
}
