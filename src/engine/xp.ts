/**
 * XP & levels — the engagement track. Deliberately separate from the Health
 * Score: XP rewards showing up; the score reflects financial reality.
 */

/**
 * XP roster — the canonical reward table (the product spec defers to this).
 * Deliberate divergence from the spec draft's "daily lesson +15": no lesson
 * content ships yet, and paying XP for a claim the user cannot perform would
 * be a hollow grant, so +15 rewards running a decision simulation instead.
 * "Lesson +15" stays reserved: when lesson content lands, add `lesson: 15`
 * here and restore the lesson quest in DEFAULT_QUESTS.
 */
export const XP_REWARDS = {
  logExpense: 5,
  resistImpulse: 50,
  runSimulation: 15,
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
