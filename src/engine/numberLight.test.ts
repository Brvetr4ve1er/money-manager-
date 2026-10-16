import { describe, it, expect } from 'vitest'
import { friendlyDA, friendlyRound, tankLevel, vsUsualDay } from './numberLight.ts'

describe('number-light', () => {
  it('rounds by magnitude', () => {
    expect(friendlyRound(137)).toBe(150)
    expect(friendlyRound(1_949)).toBe(1_900)
    expect(friendlyRound(40_932)).toBe(41_000)
    expect(friendlyRound(123_456)).toBe(123_000)
    expect(friendlyDA(1_949)).toBe('about 1,900 DA')
  })
  it('fills the tank from what is free out of what you hold', () => {
    expect(tankLevel(40_000, 80_000)).toBe(0.5)
    expect(tankLevel(-5, 100)).toBe(0)
    expect(tankLevel(10, 0)).toBe(0)
  })
  it('compares to your own usual day, or says nothing', () => {
    expect(vsUsualDay(2000, 1000)).toBe('more than a usual day for you')
    expect(vsUsualDay(1000, 1000)).toBe('about a usual day for you')
    expect(vsUsualDay(600, 1000)).toBe('a lighter day than usual')
    expect(vsUsualDay(100, 1000)).toBe('a much lighter day than usual')
    expect(vsUsualDay(100, 0)).toBeNull()
  })
})
