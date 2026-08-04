/**
 * Weekly Boss Battle engine — the Impulse Monster. Pure derivations over the
 * transaction log: the monster's HP is this week's impulse-prone spend, and
 * the battle is won by ending the week under last week's total. Engagement
 * track only — victories pay XP and never touch the Health Score.
 *
 * Non-punitive by construction: a lost week costs nothing (no XP loss, no
 * health penalty), it simply offers a rematch on Monday. Copy built on these
 * numbers must stay beatable-framed — "beat him next week", never shame.
 */

import { ESSENTIAL_CATEGORIES } from './profile.ts'
import { addDaysISO, type Transaction } from '../state/store.ts'

/* Re-exported, not redefined. The local-day rule has ONE implementation (see
   store.ts) and this module's callers — achievements.ts, useBossBattle.ts,
   boss.test.ts — reach it here because week arithmetic is what this engine is
   about. The definition is not. */
export { addDaysISO }

/**
 * Monday of the week containing `dayISO` — weeks run Mon–Sun on local dates,
 * matching the local-day keys every transaction is stamped with.
 */
export function weekStartISO(dayISO: string): string {
  const [y, m, d] = dayISO.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay() // 0 = Sunday
  return addDaysISO(dayISO, -((dow + 6) % 7))
}

/**
 * What feeds the monster. Resisted rows never count (nothing was spent — a
 * resist must not grow the boss it exists to starve). Explicitly flagged
 * impulse buys always count, whatever their category. Otherwise the rule
 * mirrors deriveHealthInputs' trailing-spend exclusion: essential categories
 * are planned spending, not impulse-prone, so only discretionary rows count.
 */
function feedsTheMonster(t: Transaction): boolean {
  if (t.resistedImpulse) return false
  return t.impulseFlagged === true || !ESSENTIAL_CATEGORIES.has(t.category)
}

/** Sum of monster-feeding spend in the Mon–Sun week starting at `weekStart`. */
export function impulseSpendInWeek(transactions: Transaction[], weekStart: string): number {
  const end = addDaysISO(weekStart, 7) // exclusive: next Monday
  return transactions
    .filter((t) => t.date >= weekStart && t.date < end && feedsTheMonster(t))
    .reduce((s, t) => s + t.amountDA, 0)
}

/** Any logged row (resists included) — evidence the log was alive that week. */
function hasLogInWeek(transactions: Transaction[], weekStart: string): boolean {
  const end = addDaysISO(weekStart, 7)
  return transactions.some((t) => t.date >= weekStart && t.date < end)
}

/**
 * The card's view of the current week. `sizing-up` is the honest no-data
 * state: a week with zero logged rows is UNKNOWN, not zero — presenting an
 * unlogged last week as "0 DA" would hand the user a fake opponent number
 * (and an unbeatable boss), so the battle only starts once last week actually
 * holds logged data.
 */
export type BossBattle =
  | { kind: 'sizing-up'; weekStart: string }
  | {
      kind: 'battle'
      weekStart: string
      prevWeekStart: string
      /** The monster's current HP: this week's impulse-prone spend so far. */
      thisWeekSpend: number
      /** Last week's total — the line to stay under to win. */
      lastWeekSpend: number
    }

export function bossBattle(transactions: Transaction[], today: string): BossBattle {
  const weekStart = weekStartISO(today)
  const prevWeekStart = addDaysISO(weekStart, -7)
  if (!hasLogInWeek(transactions, prevWeekStart)) return { kind: 'sizing-up', weekStart }
  return {
    kind: 'battle',
    weekStart,
    prevWeekStart,
    thisWeekSpend: impulseSpendInWeek(transactions, weekStart),
    lastWeekSpend: impulseSpendInWeek(transactions, prevWeekStart),
  }
}

export interface BossVictory {
  /** Monday of the won (just-completed) week — the grant id's week key. */
  weekStart: string
  spend: number
  targetSpend: number
}

/**
 * Victory check for the most recently completed week, evaluated any day of
 * the following week. Winning requires the completed week to have been a real
 * battle — logged data in BOTH that week (the user showed up; an absent week's
 * zero spend is not a win, XP rewards showing up) and the week before it (the
 * opponent number was real) — and strictly less spend than that opponent
 * number. Older wins never claim retroactively: an unclaimed battle lapses,
 * costing nothing, once its following week passes.
 */
export function completedWeekVictory(
  transactions: Transaction[],
  today: string,
): BossVictory | null {
  const prevWeekStart = addDaysISO(weekStartISO(today), -7)
  const beforeWeekStart = addDaysISO(prevWeekStart, -7)
  if (!hasLogInWeek(transactions, prevWeekStart)) return null
  if (!hasLogInWeek(transactions, beforeWeekStart)) return null
  const spend = impulseSpendInWeek(transactions, prevWeekStart)
  const targetSpend = impulseSpendInWeek(transactions, beforeWeekStart)
  return spend < targetSpend ? { weekStart: prevWeekStart, spend, targetSpend } : null
}

/**
 * Deterministic per-week grant id: the BOSS_VICTORY reducer path checks it
 * before paying (StrictMode double-dispatch and re-fired mount effects are
 * no-ops), and two tabs claiming the same week's victory merge to a single
 * grant through the xpLog union — the same dedupe contract quest grants use.
 */
export function bossGrantId(weekStart: string): string {
  return `boss:${weekStart}`
}
