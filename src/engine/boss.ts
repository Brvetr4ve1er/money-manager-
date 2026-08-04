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

/** What one Mon–Sun week's rows add up to, in the two terms this engine asks. */
interface WeekTally {
  /** Any logged row at all (resists included) — evidence the log was alive. */
  logged: boolean
  /** Sum of monster-feeding spend. */
  spend: number
}

/**
 * Several weeks, ONE PASS.
 *
 * Both public derivations below ask two questions ("was the log alive?", "what
 * did the monster eat?") about two weeks each, and each question used to be its
 * own full walk of the ledger — `hasLogInWeek` twice plus `impulseSpendInWeek`
 * twice per call, with `.filter()` allocating an intermediate array over the
 * WHOLE record to sum at most seven days of it. useBossBattle calls both on
 * every transactions change, so a logged purchase cost SEVEN traversals and
 * four throwaway arrays; it now costs two and none. The same idiom App.tsx
 * already applies to `resistXpCapped` and achievements.ts to `ten-logs` —
 * count in a loop, allocate nothing — applied to the week windows.
 *
 * WHAT THIS IS AND IS NOT WORTH, stated so nobody re-measures it hoping.
 * Timed in jsdom against a local reimplementation of the shape it replaces, at
 * 5,000 rows, the two forms sit inside each other's noise — 100–140 µs either
 * way — because V8 optimises the filter/reduce well and the `.some()` guard
 * short-circuits early on a newest-first ledger. What the change buys is the
 * ALLOCATIONS: four arrays as long as the whole record, per logged purchase, on
 * the mid-range Android this product is built for. It does not buy milliseconds
 * and this comment does not claim it does. The traversal count is the part that
 * is now pinned — boss.test.ts traps every walking array method and asserts one
 * pass per derivation.
 *
 * The pass is still whole-ledger and deliberately so: transaction order is not
 * taken on trust anywhere in this codebase (a hand-edited payload can put any
 * date at the head), so there is no prefix to stop at. What it stops doing is
 * walking it more than once.
 *
 * `break` on the first matching week is safe because the weeks handed in here
 * are always disjoint Mondays — a local day key belongs to exactly one Mon–Sun
 * week.
 */
function tallyWeeks(transactions: Transaction[], weekStarts: string[]): WeekTally[] {
  const ends = weekStarts.map((w) => addDaysISO(w, 7)) // exclusive: next Monday
  const out: WeekTally[] = weekStarts.map(() => ({ logged: false, spend: 0 }))
  for (const t of transactions) {
    for (let i = 0; i < weekStarts.length; i += 1) {
      if (t.date < weekStarts[i] || t.date >= ends[i]) continue
      out[i].logged = true
      if (feedsTheMonster(t)) out[i].spend += t.amountDA
      break
    }
  }
  return out
}

/** Sum of monster-feeding spend in the Mon–Sun week starting at `weekStart`. */
export function impulseSpendInWeek(transactions: Transaction[], weekStart: string): number {
  return tallyWeeks(transactions, [weekStart])[0].spend
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
  // One pass for both weeks and both questions — see tallyWeeks. The
  // sizing-up branch still short-circuits on the SAME evidence it always did
  // (was last week logged), it just no longer needs its own walk to find out.
  const [last, current] = tallyWeeks(transactions, [prevWeekStart, weekStart])
  if (!last.logged) return { kind: 'sizing-up', weekStart }
  return {
    kind: 'battle',
    weekStart,
    prevWeekStart,
    thisWeekSpend: current.spend,
    lastWeekSpend: last.spend,
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
  // One pass for both weeks and both questions — see tallyWeeks. Four walks of
  // the ledger and two throwaway arrays became one walk; the two show-up guards
  // are unchanged and still both required.
  const [before, prev] = tallyWeeks(transactions, [beforeWeekStart, prevWeekStart])
  if (!prev.logged) return null
  if (!before.logged) return null
  return prev.spend < before.spend
    ? { weekStart: prevWeekStart, spend: prev.spend, targetSpend: before.spend }
    : null
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
