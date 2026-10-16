import { describe, it, expect } from 'vitest'
import { DEFAULT_BRAKE_RULE, NEEDS, NEED_IDS, composeDefaults } from './needs.ts'

describe('composeDefaults', () => {
  it('composes nothing for an empty pick', () => {
    expect(composeDefaults([])).toEqual({
      brakes: null,
      lowEnergy: false,
      calm: false,
      numberLight: false,
      wantsTrusted: false,
    })
  })
  it('brakes picks the starting rule only', () => {
    expect(composeDefaults(['brakes'])).toEqual({
      brakes: DEFAULT_BRAKE_RULE,
      lowEnergy: false,
      calm: false,
      numberLight: false,
      wantsTrusted: false,
    })
    expect(DEFAULT_BRAKE_RULE).toEqual({ thresholdDA: 5_000, categories: ['Fun'], delayHours: 24 })
  })
  it('low-energy flips lowEnergy only', () => {
    expect(composeDefaults(['low-energy'])).toEqual({
      brakes: null,
      lowEnergy: true,
      calm: false,
      numberLight: false,
      wantsTrusted: false,
    })
  })
  it('calm flips calm only', () => {
    expect(composeDefaults(['calm'])).toEqual({
      brakes: null,
      lowEnergy: false,
      calm: true,
      numberLight: false,
      wantsTrusted: false,
    })
  })
  it('second-pair flips wantsTrusted only', () => {
    expect(composeDefaults(['second-pair'])).toEqual({
      brakes: null,
      lowEnergy: false,
      calm: false,
      numberLight: false,
      wantsTrusted: true,
    })
  })
  it('numbers flips numberLight only', () => {
    expect(composeDefaults(['numbers']).numberLight).toBe(true)
    expect(composeDefaults(['numbers']).calm).toBe(false)
  })
  it('combines every need additively', () => {
    expect(composeDefaults(['brakes', 'low-energy', 'calm', 'second-pair'])).toEqual({
      brakes: DEFAULT_BRAKE_RULE,
      lowEnergy: true,
      calm: true,
      numberLight: false,
      wantsTrusted: true,
    })
  })
})

describe('NEED_IDS', () => {
  it('matches the NEEDS roster exactly', () => {
    expect([...NEED_IDS].sort()).toEqual(NEEDS.map((n) => n.id).sort())
    expect(NEED_IDS.size).toBe(NEEDS.length)
    expect(NEED_IDS.has('brakes')).toBe(true)
    expect(NEED_IDS.has('diagnosis')).toBe(false)
  })
  it('every need carries a label and a hint', () => {
    for (const n of NEEDS) {
      expect(n.label.length).toBeGreaterThan(0)
      expect(n.hint.length).toBeGreaterThan(0)
    }
  })
})
