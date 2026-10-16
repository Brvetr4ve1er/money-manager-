/**
 * Social money engine — tontine schedules, IOU balances, runway items and
 * the zakat estimate. Pure: every function takes an explicit `today` (local
 * day key); nothing here reads the wall clock or any other slice.
 *
 * Forecasts, not verdicts: an unpaid round or a passed due date is reported
 * as a fact with a date, never as a judgement.
 */

import type { Iou, SocialState, Tontine } from '../state/slices/social.ts'
import { iouOutstanding } from '../state/slices/social.ts'
import { addDaysISO, addMonthsISO, daysBetween } from './dates.ts'

/* ------------------------------ tontines ------------------------------ */

/** Day of a 1-based round. Monthly rounds clamp to month ends (Jan 31 → Feb 28). */
export function tontineRoundDate(t: Pick<Tontine, 'startDate' | 'cadence'>, round: number): string {
  const n = round - 1
  return t.cadence === 'weekly' ? addDaysISO(t.startDate, 7 * n) : addMonthsISO(t.startDate, n)
}

export interface TontineView {
  tontine: Tontine
  /** One round per member. */
  rounds: number
  roundDates: string[]
  /** False until round 1's day arrives. */
  started: boolean
  /** Latest round whose day has arrived (1 before the start). */
  currentRound: number
  /** Everyone's contribution × members — what the receiver of a round gets. */
  pot: number
  myPayoutDate: string
  /** Whether my payout day has arrived. */
  payoutReached: boolean
  /** Distinct rounds I've marked paid, ascending. */
  paidRounds: number[]
  /** Rounds whose day has arrived (today counts). */
  roundsDue: number
  /** Of those, how many I've paid. */
  roundsPaidOfDue: number
  /** First round I haven't paid yet; null when every round is paid. */
  nextRound: number | null
  nextContributionDate: string | null
  /** Days from today to the next contribution (negative = it has passed). */
  nextInDays: number | null
  complete: boolean
}

export function tontineView(t: Tontine, social: SocialState, today: string): TontineView {
  const rounds = t.members.length
  const roundDates = Array.from({ length: rounds }, (_, i) => tontineRoundDate(t, i + 1))
  const roundsDue = roundDates.filter((d) => d <= today).length
  const paid = new Set<number>()
  for (const c of social.contributions) {
    if (c.tontineId === t.id && c.round >= 1 && c.round <= rounds) paid.add(c.round)
  }
  const paidRounds = [...paid].sort((a, b) => a - b)
  let nextRound: number | null = null
  for (let r = 1; r <= rounds; r++) {
    if (!paid.has(r)) {
      nextRound = r
      break
    }
  }
  const nextContributionDate = nextRound === null ? null : roundDates[nextRound - 1]
  const myPayoutDate = roundDates[t.myTurn - 1]
  return {
    tontine: t,
    rounds,
    roundDates,
    started: roundsDue > 0,
    currentRound: Math.max(1, roundsDue),
    pot: t.contribution * rounds,
    myPayoutDate,
    payoutReached: myPayoutDate <= today,
    paidRounds,
    roundsDue,
    roundsPaidOfDue: paidRounds.filter((r) => r <= roundsDue).length,
    nextRound,
    nextContributionDate,
    nextInDays: nextContributionDate === null ? null : daysBetween(today, nextContributionDate),
    complete: nextRound === null,
  }
}

export function liveTontines(social: SocialState): Tontine[] {
  return social.tontines.filter((t) => !t.archived)
}

/* -------------------------------- IOUs -------------------------------- */

export interface IouView {
  iou: Iou
  settled: number
  outstanding: number
  /** Days from today to the due date (negative = it has passed); null = no date. */
  daysUntilDue: number | null
  /** Due date has passed and something is still outstanding. */
  overdue: boolean
  fullySettled: boolean
}

export function iouView(iou: Iou, social: SocialState, today: string): IouView {
  const outstanding = iouOutstanding(social, iou)
  const daysUntilDue = iou.dueDate === null ? null : daysBetween(today, iou.dueDate)
  return {
    iou,
    settled: Math.round((iou.amount - outstanding) * 100) / 100,
    outstanding,
    daysUntilDue,
    overdue: iou.dueDate !== null && iou.dueDate < today && outstanding > 0,
    fullySettled: outstanding <= 0,
  }
}

export interface IouTotals {
  owedToMe: number
  iOwe: number
  lent: IouView[]
  borrowed: IouView[]
}

/** Live IOUs split by direction, open ones first (soonest due first), with totals. */
export function iouTotals(social: SocialState, today: string): IouTotals {
  const views = social.ious.filter((x) => !x.archived).map((x) => iouView(x, social, today))
  const order = (a: IouView, b: IouView) => {
    if (a.fullySettled !== b.fullySettled) return a.fullySettled ? 1 : -1
    const da = a.iou.dueDate ?? '9999-12-31'
    const db = b.iou.dueDate ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    return a.iou.id < b.iou.id ? -1 : a.iou.id > b.iou.id ? 1 : 0
  }
  const lent = views.filter((v) => v.iou.direction === 'lent').sort(order)
  const borrowed = views.filter((v) => v.iou.direction === 'borrowed').sort(order)
  const sum = (xs: IouView[]) => xs.reduce((n, v) => n + v.outstanding, 0)
  return { owedToMe: sum(lent), iOwe: sum(borrowed), lent, borrowed }
}

/** Gentle due label: "due in 3 days", "due today", "was due 3 days ago". */
export function dueLabel(daysUntilDue: number | null): string {
  if (daysUntilDue === null) return 'no date set'
  if (daysUntilDue === 0) return 'due today'
  if (daysUntilDue === 1) return 'due tomorrow'
  if (daysUntilDue > 1) return `due in ${daysUntilDue} days`
  if (daysUntilDue === -1) return 'was due yesterday'
  return `was due ${-daysUntilDue} days ago`
}

/* ------------------------------- runway ------------------------------- */

export type SocialRunwayKind = 'tontine-pay' | 'tontine-payout' | 'iou-due'

export interface SocialRunwayItem {
  id: string
  kind: SocialRunwayKind
  label: string
  /** Positive = money in, negative = money out. */
  amountDA: number
  /** Local day it lands. Items already past (an unpaid round, an IOU that was
   *  due) still affect cash, so they are dated `today`. */
  date: string
}

/**
 * Dated social cash events between `today` and `untilDay` (inclusive):
 * each unpaid tontine round (−contribution), my pot on my payout day
 * (+pot, only while that day is still ahead or today), and each open IOU
 * with a due date (lent = +outstanding, borrowed = −outstanding). Sorted by
 * date, then id. Empty when `untilDay` is before `today`.
 */
export function socialRunwayItems(social: SocialState, today: string, untilDay: string): SocialRunwayItem[] {
  if (untilDay < today) return []
  const out: SocialRunwayItem[] = []
  for (const t of liveTontines(social)) {
    const v = tontineView(t, social, today)
    const paid = new Set(v.paidRounds)
    for (let r = 1; r <= v.rounds; r++) {
      if (paid.has(r)) continue
      const day = v.roundDates[r - 1]
      if (day > untilDay) break
      out.push({
        id: `tontine-pay:${t.id}:${r}`,
        kind: 'tontine-pay',
        label: `${t.name} — round ${r}`,
        amountDA: -t.contribution,
        date: day < today ? today : day,
      })
    }
    if (v.myPayoutDate >= today && v.myPayoutDate <= untilDay) {
      out.push({
        id: `tontine-payout:${t.id}`,
        kind: 'tontine-payout',
        label: `${t.name} — your pot`,
        amountDA: v.pot,
        date: v.myPayoutDate,
      })
    }
  }
  for (const iou of social.ious) {
    if (iou.archived || iou.dueDate === null || iou.dueDate > untilDay) continue
    const outstanding = iouOutstanding(social, iou)
    if (outstanding <= 0) continue
    const lent = iou.direction === 'lent'
    out.push({
      id: `iou-due:${iou.id}`,
      kind: 'iou-due',
      label: lent ? `Back from ${iou.person}` : `Back to ${iou.person}`,
      amountDA: lent ? outstanding : -outstanding,
      date: iou.dueDate < today ? today : iou.dueDate,
    })
  }
  return out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/* -------------------------------- zakat ------------------------------- */

/** Gold nisab in grams (the commonly cited 85 g). */
export const NISAB_GOLD_GRAMS = 85
export const ZAKAT_RATE = 0.025

export interface ZakatEstimate {
  /** 85 g × the user's gold price; null without a price. */
  nisab: number | null
  /** Savings ≥ nisab; null when either figure is missing. */
  eligible: boolean | null
  /** 2.5% of savings when they reach the nisab, 0 below it, null when unknown. */
  estimate: number | null
}

/** An estimate to plan with — never a ruling. Inputs are the user's own figures. */
export function zakatEstimate(savingsDA: number | null, goldPricePerGram: number | null): ZakatEstimate {
  const price = goldPricePerGram !== null && Number.isFinite(goldPricePerGram) && goldPricePerGram > 0 ? goldPricePerGram : null
  const savings = savingsDA !== null && Number.isFinite(savingsDA) && savingsDA >= 0 ? savingsDA : null
  const nisab = price === null ? null : NISAB_GOLD_GRAMS * price
  if (nisab === null || savings === null) return { nisab, eligible: null, estimate: null }
  const eligible = savings >= nisab
  return { nisab, eligible, estimate: eligible ? savings * ZAKAT_RATE : 0 }
}
