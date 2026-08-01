/**
 * User financial profile plus the pure derivations that feed the engines.
 * Keeping these next to the engines (instead of inline in App) makes the
 * health-input windowing unit-testable and gives onboarding a single type to
 * fill in — App only ever sees a UserProfile.
 */

import {
  savingsRateScore,
  budgetAdherenceScore,
  emergencyFundScore,
  debtTrendScore,
  impulseControlScore,
  type HealthInputs,
} from './healthScore.ts'
import type { SimProfile } from './simulator.ts'
import type { Transaction } from '../state/store.ts'

export interface UserProfile {
  monthlyIncome: number
  monthlyEssentials: number
  monthlyDiscretionary: number
  budgeted: number
  efBalance: number
  debtStart: number
  debtNow: number
  liquidBalance: number
  debtMinimum: number
  extraDebtPayment: number
  /** Annual rate on the revolving balance as a decimal (0 = interest-free). */
  revolvingApr: number
  goal: { target: number; current: number; monthlyContribution: number } | null
}

/**
 * Demo profile powering score components until onboarding exists. Transaction
 * logging is live; income/budget/EF/debt setup ships next.
 */
export const DEMO_PROFILE: UserProfile = {
  monthlyIncome: 90_000,
  monthlyEssentials: 52_000,
  monthlyDiscretionary: 15_000,
  budgeted: 62_000,
  efBalance: 45_000,
  debtStart: 12_000,
  debtNow: 9_500,
  liquidBalance: 60_000,
  debtMinimum: 500,
  extraDebtPayment: 2_000,
  // Placeholder consumer-credit rate so the simulator prices carrying the
  // revolving balance instead of treating delay as free; onboarding collects
  // the real rate.
  revolvingApr: 0.18,
  goal: { target: 500_000, current: 150_000, monthlyContribution: 12_000 },
}

/**
 * Max resisted events per day that count toward Impulse Control. Mirrors the
 * resist XP cap in the reducer: the resist button is an unverifiable
 * self-report, and without a cap ten free taps drive IC raw to 100 at full
 * confidence — a health score must never be a tappable lever.
 */
export const IC_RESISTED_DAILY_CAP = 2

/**
 * Confidence for score components backed by DEMO_PROFILE placeholders rather
 * than any real user history. Deliberately low so shrink() pulls them toward
 * the neutral 50: a brand-new user must not see a fully-confident score built
 * on fictional income/EF/debt numbers, and the lurch when onboarding replaces
 * the demo data stays small. Rises to history-derived confidence once
 * onboarding ships real numbers.
 */
export const DEMO_PROFILE_CONFIDENCE = 0.3

/** Local-calendar day key `n` days before `dayISO` (pure — no wall clock). */
function daysBeforeISO(dayISO: string, n: number): string {
  const [y, m, d] = dayISO.split('-').map(Number)
  const dt = new Date(y, m - 1, d - n)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

/**
 * Derive Health Score inputs from the transaction log and profile, windowed
 * to the trailing 30 days ending at `today` (a YYYY-MM-DD local day key).
 */
export function deriveHealthInputs(
  transactions: Transaction[],
  profile: UserProfile,
  today: string,
): HealthInputs {
  // Trailing-30d spend window, matching the savingsRateScore contract and
  // the IC window below. A calendar-month window would reset to zero on the
  // 1st, spiking SR/BA to their no-spend maxima and banking half the jump
  // into the persisted snapshot via smooth()'s fast-up rate.
  const cutoff = daysBeforeISO(today, 30)
  const trailingSpend = transactions
    .filter((t) => t.date >= cutoff && !t.resistedImpulse)
    .reduce((s, t) => s + t.amountDA, 0)
  // Impulse Control counts only explicitly flagged events (per the IC
  // contract: resisted / total flagged), scoped to the same trailing 30
  // days as the spend window above. Ordinary spending — Fun included — was
  // never flagged as an impulse and must not drag IC down. No UI sets
  // impulseFlagged yet ("I bought it anyway" ships later), so yielded stays
  // 0 and IC confidence stays honestly low.
  // Resisted events count toward IC at most IC_RESISTED_DAILY_CAP per day —
  // yielded events are never capped (self-reporting against yourself is not
  // gameable upward).
  const resistedByDay = new Map<string, number>()
  for (const t of transactions) {
    if (t.resistedImpulse && t.date >= cutoff) {
      resistedByDay.set(t.date, (resistedByDay.get(t.date) ?? 0) + 1)
    }
  }
  let resisted = 0
  for (const n of resistedByDay.values()) {
    resisted += Math.min(n, IC_RESISTED_DAILY_CAP)
  }
  const yielded = transactions.filter(
    (t) => t.impulseFlagged && !t.resistedImpulse && t.date >= cutoff,
  ).length

  // SR/BA/EF/DT are built on DEMO_PROFILE placeholders until onboarding
  // ships, so they carry DEMO_PROFILE_CONFIDENCE, not 1 — full confidence in
  // fictional numbers would contradict the engine's own shrinkage design.
  return {
    SR: {
      structurallyUndefined: false,
      raw: savingsRateScore(profile.monthlyIncome, profile.monthlyEssentials + trailingSpend),
      confidence: DEMO_PROFILE_CONFIDENCE,
    },
    BA: {
      structurallyUndefined: false,
      raw: budgetAdherenceScore([
        { budgeted: profile.budgeted, actual: profile.monthlyEssentials + trailingSpend },
      ]),
      confidence: DEMO_PROFILE_CONFIDENCE,
    },
    EF: {
      structurallyUndefined: false,
      raw: emergencyFundScore(profile.efBalance, profile.monthlyEssentials),
      confidence: DEMO_PROFILE_CONFIDENCE,
    },
    DT: {
      structurallyUndefined: false,
      raw: debtTrendScore(profile.debtStart, profile.debtNow),
      confidence: DEMO_PROFILE_CONFIDENCE,
    },
    IC: {
      structurallyUndefined: resisted + yielded === 0,
      raw: impulseControlScore(resisted, yielded),
      confidence: Math.min(1, (resisted + yielded) / 10),
    },
  }
}

/** Map the user profile onto the Decision Simulator's input shape. */
export function buildSimProfile(profile: UserProfile): SimProfile {
  return {
    monthlyIncome: profile.monthlyIncome,
    monthlyEssentials: profile.monthlyEssentials,
    monthlyDiscretionary: profile.monthlyDiscretionary,
    liquidBalance: profile.liquidBalance,
    efBalance: profile.efBalance,
    debtBalance: profile.debtNow,
    revolvingApr: profile.revolvingApr,
    debtMinimum: profile.debtMinimum,
    extraDebtPayment: profile.extraDebtPayment,
    goal: profile.goal,
  }
}
