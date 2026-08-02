/**
 * XP & levels — the engagement track. Deliberately separate from the Health
 * Score: XP rewards showing up; the score reflects financial reality.
 */

/**
 * XP roster — the canonical reward table (the product spec defers to this).
 * readLesson was reserved until real lesson content existed (paying XP for a
 * claim the user cannot perform is a hollow grant); with src/content/lessons.ts
 * shipped, the lesson quest in DEFAULT_QUESTS pays it — verified, since the
 * app itself observes the "Got it" tap on today's actual lesson.
 */
export const XP_REWARDS = {
  logExpense: 5,
  resistImpulse: 50,
  runSimulation: 15,
  readLesson: 15,
  reviewRecent: 10,
} as const

export type XpAction = keyof typeof XP_REWARDS

/**
 * Max resistImpulse XP grants per local day. The resist button is an
 * unverifiable self-report, and it is the largest routine reward — uncapped,
 * it is an unlimited zero-friction XP lever. Entries past the cap still log
 * (the record is the point); only the XP stops.
 */
export const RESIST_XP_DAILY_CAP = 2

/** XP needed to complete a given level (1-indexed). Gentle early curve. */
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50
}

export interface XpState {
  level: number
  xpIntoLevel: number
  totalXp: number
}

export const LEVEL_TITLES: Array<{ min: number; title: string }> = [
  { min: 30, title: 'Financial Sage' },
  { min: 20, title: 'Financial Strategist' },
  { min: 10, title: 'Financial Explorer' },
  { min: 5, title: 'Money Apprentice' },
  { min: 1, title: 'Spark' },
]

export function levelTitle(level: number): string {
  return LEVEL_TITLES.find((t) => level >= t.min)!.title
}

export function grantXp(state: XpState, action: XpAction): { next: XpState; leveledUp: boolean } {
  const amount = XP_REWARDS[action]
  let { level, xpIntoLevel } = state
  xpIntoLevel += amount
  let leveledUp = false
  while (xpIntoLevel >= xpForLevel(level)) {
    xpIntoLevel -= xpForLevel(level)
    level += 1
    leveledUp = true
  }
  return {
    next: { level, xpIntoLevel, totalXp: state.totalXp + amount },
    leveledUp,
  }
}

/**
 * One XP grant, kept as append-only evidence. Two tabs that diverged (a
 * frozen background tab missed a storage event, then the user acted in it)
 * each hold grants the other never saw; a bare max(totalXp) merge would
 * silently drop the smaller tab's grant even though the merged transactions
 * and quest flags keep its evidence. Grant logs union by id instead — see
 * mergeStates in the store. `action: 'legacy'` marks a pre-log total migrated
 * by sanitizeState.
 */
export interface XpGrant {
  id: string
  action: XpAction | 'legacy'
  /** XP paid at grant time — stored so re-pricing XP_REWARDS never rewrites history. */
  amount: number
  /** Local day (YYYY-MM-DD) the grant landed; '' for the migrated legacy baseline. */
  date: string
}

/**
 * Product ceiling on any XP total or single grant amount. Legitimate play
 * cannot approach it (a billion XP is ~55,000 years of the daily maximum);
 * its only job is defense. Without a clamp, a hand-edited or corrupted
 * localStorage payload carrying totalXp = 1e300 spins the level loop below
 * effectively forever — the per-level subtraction is absorbed by float
 * precision (1e300 - 15000 === 1e300) — bricking the app at every load and,
 * via storage events, freezing every other open tab too. Enforced both here
 * (xpStateFromTotal) and at the sanitizer boundary (isXpGrant in the store).
 */
export const MAX_TOTAL_XP = 1_000_000_000

/** Level and progress are a pure function of the total: rebuild them from it. */
export function xpStateFromTotal(totalXp: number): XpState {
  // Clamp untrusted totals into [0, MAX_TOTAL_XP] so the loop is always
  // bounded (~6,300 iterations at the ceiling) — see MAX_TOTAL_XP.
  totalXp = Math.min(Math.max(0, totalXp), MAX_TOTAL_XP)
  let level = 1
  let xpIntoLevel = totalXp
  while (xpIntoLevel >= xpForLevel(level)) {
    xpIntoLevel -= xpForLevel(level)
    level += 1
  }
  return { level, xpIntoLevel, totalXp }
}

/**
 * Fold a grant log into an XpState. Re-applies the resist daily cap across
 * the WHOLE log: two tabs may each have granted up to the cap on the same day
 * before merging, and their union must not jointly overpay it. Entries fold
 * in canonical (date, id) order, so every tab folding the same union lands on
 * the identical result regardless of the order the grants arrived in.
 */
export function xpFromLog(log: XpGrant[]): XpState {
  const sorted = [...log].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  const resistsByDay = new Map<string, number>()
  let total = 0
  for (const g of sorted) {
    if (g.action === 'resistImpulse') {
      const n = resistsByDay.get(g.date) ?? 0
      if (n >= RESIST_XP_DAILY_CAP) continue
      resistsByDay.set(g.date, n + 1)
    }
    total += g.amount
  }
  return xpStateFromTotal(total)
}
