/**
 * Monthly recap — the "moon ceremony". Pure aggregation over the ledger and
 * the money slice for one calendar month. Positive-only framing by design:
 * the recap mirrors what happened and names what went well; it never ranks
 * the user, never says "overspent", and a quiet month is a valid month.
 */

import type { AppState } from '../state/store.ts'
import { addMonthsISO, daysBetween, localDayISO } from './dates.ts'

export interface CategoryLine {
  category: string
  amountDA: number
  share: number
}

export interface MonthRecap {
  /** 'YYYY-MM' */
  month: string
  label: string
  spentDA: number
  logs: number
  loggedDays: number
  topCategories: CategoryLine[]
  /** Spend change vs the previous month in DA; null when that month is empty. */
  deltaDA: number | null
  /** Resisted amounts typed this month ("kept, not spent"). */
  keptDA: number
  resists: number
  billsPaid: number
  /** Net DA moved into jars this month (top-ups, payday, charms, covers in). */
  savedToJarsDA: number
  jarsReached: number
  /** Short, positive, factual highlights — never verdicts. */
  highlights: string[]
}

export function monthOf(day: string): string {
  return day.slice(0, 7)
}

export function previousMonth(month: string): string {
  return addMonthsISO(`${month}-01`, -1).slice(0, 7)
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function spendIn(state: AppState, month: string) {
  return state.transactions.filter((t) => !t.resistedImpulse && monthOf(t.date) === month)
}

export function monthRecap(state: AppState, month: string): MonthRecap {
  const rows = spendIn(state, month)
  const spentDA = rows.reduce((s, t) => s + t.amountDA, 0)
  const byCat = new Map<string, number>()
  for (const t of rows) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amountDA)
  const topCategories = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([category, amountDA]) => ({ category, amountDA, share: spentDA > 0 ? amountDA / spentDA : 0 }))
  const prevRows = spendIn(state, previousMonth(month))
  const prevDA = prevRows.reduce((s, t) => s + t.amountDA, 0)
  const resistRows = state.transactions.filter((t) => t.resistedImpulse && monthOf(t.date) === month)
  const keptDA = resistRows.reduce((s, t) => s + t.amountDA, 0)
  const loggedDays = new Set(state.transactions.filter((t) => monthOf(t.date) === month).map((t) => t.date)).size
  const billsPaid = state.money.payments.filter((p) => !p.void && monthOf(p.paidOn) === month).length
  const savedToJarsDA = state.money.jarMoves
    .filter((m) => monthOf(m.date) === month && m.amount > 0 && m.kind !== 'cover')
    .reduce((s, m) => s + m.amount, 0)
  // A jar "reached" this month: its running balance crossed the target on a
  // move dated in this month.
  let jarsReached = 0
  for (const jar of state.money.jars) {
    if (jar.archived || jar.target === null) continue
    const moves = state.money.jarMoves
      .filter((m) => m.jarId === jar.id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
    let bal = 0
    for (const m of moves) {
      const before = bal
      bal += m.amount
      if (before < jar.target && bal >= jar.target && monthOf(m.date) === month) {
        jarsReached++
        break
      }
    }
  }
  const highlights: string[] = []
  if (loggedDays > 0) highlights.push(`You showed up on ${loggedDays} day${loggedDays === 1 ? '' : 's'}.`)
  if (billsPaid > 0) highlights.push(`${billsPaid} bill${billsPaid === 1 ? '' : 's'} handled.`)
  if (savedToJarsDA > 0) highlights.push(`${fmt(savedToJarsDA)} given a job in your jars.`)
  if (jarsReached > 0) highlights.push(`${jarsReached} jar${jarsReached === 1 ? '' : 's'} reached its target.`)
  if (keptDA > 0) highlights.push(`${fmt(keptDA)} kept, not spent.`)
  if (prevDA > 0 && spentDA < prevDA) highlights.push(`${fmt(prevDA - spentDA)} lighter than the month before.`)
  if (highlights.length === 0) highlights.push('A quiet month. Quiet months count too.')
  return {
    month,
    label: monthLabel(month),
    spentDA,
    logs: rows.length,
    loggedDays,
    topCategories,
    deltaDA: prevDA > 0 ? spentDA - prevDA : null,
    keptDA,
    resists: resistRows.length,
    billsPaid,
    savedToJarsDA,
    jarsReached,
    highlights,
  }
}

function fmt(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} DA`
}

/**
 * The recap to offer on Home: last month's, during the first 7 days of a new
 * month, if it had any activity. Otherwise null (the Me room always has it).
 */
export function ceremonyDue(state: AppState, today: string): string | null {
  const day = Number(today.slice(8, 10))
  if (day > 7) return null
  const last = previousMonth(monthOf(today))
  const any = state.transactions.some((t) => monthOf(t.date) === last) || state.money.jarMoves.some((m) => monthOf(m.date) === last)
  return any ? last : null
}

/** Months (newest first) that have any ledger activity, for the recap picker. */
export function activeMonths(state: AppState, today: string): string[] {
  const set = new Set<string>([monthOf(today)])
  for (const t of state.transactions) set.add(monthOf(t.date))
  return [...set].sort().reverse()
}

/** Days remaining in the month containing `today` (inclusive of today). */
export function daysLeftInMonth(today: string): number {
  const [y, m] = today.split('-').map(Number)
  return daysBetween(today, localDayISO(new Date(y, m, 0))) + 1
}
