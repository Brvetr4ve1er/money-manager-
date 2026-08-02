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
  computeHealthScore,
  type HealthInputs,
  type Stage,
} from './healthScore.ts'
import { RESIST_XP_DAILY_CAP } from './xp.ts'
import type { SimProfile } from './simulator.ts'
import type { ProfileData, Transaction } from '../state/store.ts'

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
 * Demo profile powering score components until the setup card is completed
 * (state.profile === null). Every surface running on these numbers must say
 * so — see SimCard's honesty note.
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
 * Max resisted events per day that count toward Impulse Control. Defined AS
 * the resist XP cap (not a copied literal) so the XP incentive and the IC
 * component can never desynchronize — paying XP for resists that stopped
 * counting toward IC, or vice versa. The resist button is an unverifiable
 * self-report, and without a cap ten free taps drive IC raw to 100 at full
 * confidence — a health score must never be a tappable lever.
 */
export const IC_RESISTED_DAILY_CAP = RESIST_XP_DAILY_CAP

/**
 * Confidence for score components backed by DEMO_PROFILE placeholders rather
 * than any real user history. Deliberately low so shrink() pulls them toward
 * the neutral 50: a brand-new user must not see a fully-confident score built
 * on fictional income/EF/debt numbers, and the lurch when setup replaces the
 * demo data stays small.
 */
export const DEMO_PROFILE_CONFIDENCE = 0.3

/**
 * Confidence once the user has entered their own numbers. Real but still a
 * one-time self-report — not verified by any logged history — so it stays
 * below 1 and shrink() keeps tempering the components; well above the demo
 * value because the numbers are at least the user's own.
 */
export const USER_PROFILE_CONFIDENCE = 0.8

/**
 * What the active profile can honestly back: the confidence its numbers carry
 * and which components exist at all. Travels alongside the UserProfile the
 * engines consume (see resolveProfile) instead of being baked into it, so
 * deriveHealthInputs can structurally exclude EF/DT — per the health-score
 * spec, a component whose underlying data was never entered redistributes its
 * weight rather than scoring a guess.
 */
export interface ProfileMeta {
  confidence: number
  /** False = no emergency-fund balance entered: EF structurally excluded. */
  efKnown: boolean
  /** False = no debt numbers entered: DT structurally excluded. */
  debtKnown: boolean
}

/** Demo numbers cover every component — just at placeholder confidence. */
export const DEMO_META: ProfileMeta = {
  confidence: DEMO_PROFILE_CONFIDENCE,
  efKnown: true,
  debtKnown: true,
}

/**
 * Placeholder consumer-credit rate applied when the user entered a revolving
 * balance: the setup card stays five questions and does not ask for an APR,
 * but pricing the balance at 0 would let the simulator treat delaying paydown
 * as free — under-reporting a real tradeoff, which the trust rules forbid.
 */
export const ASSUMED_REVOLVING_APR = 0.18

export interface ResolvedProfile {
  profile: UserProfile
  meta: ProfileMeta
  /** True while the engines still run on DEMO_PROFILE (setup not completed). */
  isDemo: boolean
}

/**
 * Turn the persisted setup answers (or their absence) into the engine-facing
 * profile plus its honesty metadata. Fields the five-question setup does not
 * ask for are derived conservatively, each choice commented — silently
 * inventing optimistic numbers would put fiction back into a score that just
 * became real.
 */
export function resolveProfile(data: ProfileData | null): ResolvedProfile {
  if (data === null) return { profile: DEMO_PROFILE, meta: DEMO_META, isDemo: true }
  const contribution = data.goal?.monthlyContribution ?? 0
  const debtBalance = data.debt?.balance ?? 0
  const freeCashFlow = Math.max(0, data.monthlyIncome - data.monthlyEssentials)
  return {
    profile: {
      monthlyIncome: data.monthlyIncome,
      monthlyEssentials: data.monthlyEssentials,
      // Discretionary allowance = what income leaves after essentials and the
      // stated goal contribution. Only the simulator's baseline outflow uses
      // it; trailing spend still comes from the actual log.
      monthlyDiscretionary: Math.max(0, freeCashFlow - contribution),
      // The spending plan Budget Adherence measures against: everything except
      // the goal contribution is spendable, so overspend begins exactly where
      // spending eats the user's own stated savings plan.
      budgeted: Math.max(0, data.monthlyIncome - contribution),
      efBalance: data.efBalance ?? 0,
      // A one-time balance entry has no 30-day history: with start == now the
      // trend reads neutral (50) while debt is carried and 100 when debt-free
      // — never a fabricated payoff direction. A balance-update flow can
      // supply a real trend later.
      debtStart: debtBalance,
      debtNow: debtBalance,
      // Setup doesn't ask for a checking balance; one month of free cash flow
      // is a deliberately modest buffer stand-in so a lump purchase in the
      // simulator shows real knock-on effects without every small buy reading
      // as instantly unaffordable.
      liquidBalance: freeCashFlow,
      debtMinimum: data.debt?.minimum ?? 0,
      // Not asked at setup: assuming voluntary extra paydown would flatter the
      // baseline path.
      extraDebtPayment: 0,
      revolvingApr: debtBalance > 0 ? ASSUMED_REVOLVING_APR : 0,
      goal: data.goal
        ? {
            target: data.goal.target,
            current: data.goal.current,
            monthlyContribution: data.goal.monthlyContribution,
          }
        : null,
    },
    meta: {
      confidence: USER_PROFILE_CONFIDENCE,
      efKnown: data.efBalance !== null,
      debtKnown: data.debt !== null,
    },
    isDemo: false,
  }
}

/**
 * Categories the profile's monthlyEssentials figure already models — the
 * demo placeholder and the user's own stated essentials alike. Logged
 * transactions in these categories are excluded from trailing spend: counting
 * them would charge essentials twice (stated monthly figure + log), deflating
 * SR/BA and punishing exactly the "log every purchase" behavior the daily
 * quest rewards. Only discretionary logging moves SR/BA.
 */
export const ESSENTIAL_CATEGORIES: ReadonlySet<string> = new Set(['Food', 'Bills', 'Health'])

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
  meta: ProfileMeta = DEMO_META,
): HealthInputs {
  // Trailing-30d spend window, matching the savingsRateScore contract and
  // the IC window below. A calendar-month window would reset to zero on the
  // 1st, spiking SR/BA to their no-spend maxima and banking half the jump
  // into the persisted snapshot via smooth()'s fast-up rate.
  // 29, not 30: the filter below is inclusive (>= cutoff), so today−29
  // through today is exactly 30 calendar days — a 31-day window compared
  // against one month of income/essentials would carry a permanent
  // overstated-spend bias into SR/BA (and skew the IC counts).
  const cutoff = daysBeforeISO(today, 29)
  // Bounded on BOTH ends: `<= today` matters as much as the cutoff. A
  // future-dated transaction (device clock skew, a hand-edited payload) would
  // otherwise sit inside every window "ending at today" indefinitely — and
  // break finalizeHealthThrough's replay contract, where each catch-up day
  // must see only the transactions that existed by that day.
  const inWindow = (date: string): boolean => date >= cutoff && date <= today
  // Essential categories are excluded: the monthlyEssentials placeholder
  // already models them (see ESSENTIAL_CATEGORIES) — summing both would
  // double-count a compliant logger's groceries and bills.
  const trailingSpend = transactions
    .filter(
      (t) => inWindow(t.date) && !t.resistedImpulse && !ESSENTIAL_CATEGORIES.has(t.category),
    )
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
    if (t.resistedImpulse && inWindow(t.date)) {
      resistedByDay.set(t.date, (resistedByDay.get(t.date) ?? 0) + 1)
    }
  }
  let resisted = 0
  for (const n of resistedByDay.values()) {
    resisted += Math.min(n, IC_RESISTED_DAILY_CAP)
  }
  const yielded = transactions.filter(
    (t) => t.impulseFlagged && !t.resistedImpulse && inWindow(t.date),
  ).length

  // SR/BA/EF/DT carry the profile's confidence: DEMO_PROFILE_CONFIDENCE on
  // the placeholder numbers, USER_PROFILE_CONFIDENCE once setup entered real
  // ones — never 1, per the engine's shrinkage design. EF/DT are structurally
  // excluded (weight redistributed, per the spec) while the user has not
  // entered those numbers at all: blank is "does not exist", not zero.
  return {
    SR: {
      structurallyUndefined: false,
      raw: savingsRateScore(profile.monthlyIncome, profile.monthlyEssentials + trailingSpend),
      confidence: meta.confidence,
    },
    BA: {
      structurallyUndefined: false,
      raw: budgetAdherenceScore([
        { budgeted: profile.budgeted, actual: profile.monthlyEssentials + trailingSpend },
      ]),
      confidence: meta.confidence,
    },
    EF: {
      structurallyUndefined: !meta.efKnown,
      raw: emergencyFundScore(profile.efBalance, profile.monthlyEssentials),
      confidence: meta.confidence,
    },
    DT: {
      structurallyUndefined: !meta.debtKnown,
      raw: debtTrendScore(profile.debtStart, profile.debtNow),
      confidence: meta.confidence,
    },
    IC: {
      structurallyUndefined: resisted + yielded === 0,
      raw: impulseControlScore(resisted, yielded),
      confidence: Math.min(1, (resisted + yielded) / 10),
    },
  }
}

/**
 * Cap on how many elapsed days the rollover catch-up chains through. By 60
 * daily steps the slow (15%) smoothing rate has long converged — (1 − 0.15)^60
 * leaves ~6e−5 of the original delta — and a corrupted or ancient persisted
 * healthDate must not stall the UI in a years-long loop.
 */
export const ROLLOVER_CATCHUP_DAYS = 60

/**
 * Finalize the persisted health snapshot across every elapsed calendar day in
 * [`fromDay`, `toDay`), chaining one smooth() step per day. A user who returns
 * after N days gets the same N-step trajectory as one who opened the app every
 * day: score dynamics (and stage hysteresis, which must compound day over day)
 * reflect wall-clock days, never app-open frequency — engagement may not leak
 * into the health score.
 *
 * Anomalous clocks (`fromDay` >= `toDay`, e.g. the device clock moved back)
 * finalize a single step at `fromDay`, matching the one-day rollover.
 */
export function finalizeHealthThrough(
  transactions: Transaction[],
  profile: UserProfile,
  fromDay: string,
  toDay: string,
  prevScore: number | null,
  prevStage: Stage | null,
  meta: ProfileMeta = DEMO_META,
): { score: number; stage: Stage } {
  const earliest = daysBeforeISO(toDay, ROLLOVER_CATCHUP_DAYS)
  let day = fromDay < earliest ? earliest : fromDay
  let result = computeHealthScore(
    deriveHealthInputs(transactions, profile, day, meta),
    prevScore,
    prevStage,
  )
  // Iteration-bounded, not just date-bounded: the day cursor is a string, and
  // a five-digit-year healthDate ('9999-12-31' increments to '10000-01-01')
  // compares LESS than any real toDay, so the lexicographic guard alone would
  // walk millions of single-day steps and freeze first render — the exact
  // stall ROLLOVER_CATCHUP_DAYS exists to prevent. (The earliest-clamp above
  // only bounds the past direction, and the anomalous-clock single-step path
  // assumes future dates always compare greater — false once the year gains a
  // digit.)
  let steps = 0
  for (
    day = daysBeforeISO(day, -1);
    steps < ROLLOVER_CATCHUP_DAYS && day < toDay;
    day = daysBeforeISO(day, -1), steps++
  ) {
    result = computeHealthScore(
      deriveHealthInputs(transactions, profile, day, meta),
      result.score,
      result.stage,
    )
  }
  return { score: result.score, stage: result.stage }
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
