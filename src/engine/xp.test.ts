import { describe, it, expect } from 'vitest'
import { grantXp, xpForLevel, levelTitle, XP_REWARDS, type XpState } from './xp.ts'

const at = (level: number, xpIntoLevel: number, totalXp = 0): XpState => ({
  level,
  xpIntoLevel,
  totalXp,
})

describe('xpForLevel', () => {
  it('follows the gentle early curve', () => {
    expect(xpForLevel(1)).toBe(100)
    expect(xpForLevel(2)).toBe(150)
    expect(xpForLevel(3)).toBe(200)
  })
})

describe('grantXp', () => {
  it('grants a single action without leveling', () => {
    const { next, leveledUp } = grantXp(at(1, 0), 'logExpense')
    expect(next).toEqual({ level: 1, xpIntoLevel: 5, totalXp: 5 })
    expect(leveledUp).toBe(false)
  })

  it('levels up exactly at the boundary (xpIntoLevel === xpForLevel)', () => {
    // 95 + 5 lands exactly on the 100-XP requirement: must roll to level 2
    // with 0 into the new level, never sit at a full-but-unrolled bar.
    const { next, leveledUp } = grantXp(at(1, 95, 95), 'logExpense')
    expect(next).toEqual({ level: 2, xpIntoLevel: 0, totalXp: 100 })
    expect(leveledUp).toBe(true)
  })

  it('rolls through multiple levels in one grant (while-loop)', () => {
    // 240 + 50 = 290: clears level 1 (100) and level 2 (150), landing at
    // level 3 with 40 of its 200 requirement.
    const { next, leveledUp } = grantXp(at(1, 240, 240), 'resistImpulse')
    expect(next).toEqual({ level: 3, xpIntoLevel: 40, totalXp: 290 })
    expect(leveledUp).toBe(true)
  })

  it('accumulates totalXp across grants without mutating the input', () => {
    const start = at(1, 0)
    const first = grantXp(start, 'resistImpulse').next
    const second = grantXp(first, 'resistImpulse').next
    expect(start).toEqual(at(1, 0)) // input untouched
    expect(second.totalXp).toBe(100)
    expect(second.level).toBe(2) // 50 + 50 hits the boundary exactly
    expect(second.xpIntoLevel).toBe(0)
  })

  it('covers every reward action', () => {
    for (const action of Object.keys(XP_REWARDS) as Array<keyof typeof XP_REWARDS>) {
      const { next } = grantXp(at(1, 0), action)
      expect(next.totalXp).toBe(XP_REWARDS[action])
    }
  })
})

describe('levelTitle', () => {
  it('maps level bands to titles', () => {
    expect(levelTitle(1)).toBe('Spark')
    expect(levelTitle(4)).toBe('Spark')
    expect(levelTitle(5)).toBe('Money Apprentice')
    expect(levelTitle(10)).toBe('Financial Explorer')
    expect(levelTitle(20)).toBe('Financial Strategist')
    expect(levelTitle(30)).toBe('Financial Sage')
  })
})
