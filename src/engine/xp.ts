/**
 * XP & levels — the engagement track. Deliberately separate from the Health
 * Score: XP rewards showing up; the score reflects financial reality.
 */

export const XP_REWARDS = {
  logExpense: 5,
  resistImpulse: 50,
  save: 30,
  readLesson: 15,
  reviewYesterday: 10,
  weeklyReview: 150,
} as const

export type XpAction = keyof typeof XP_REWARDS

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
