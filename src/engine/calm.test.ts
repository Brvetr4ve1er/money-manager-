import { describe, it, expect } from 'vitest'
import {
  CATCH_UP_CATEGORY,
  CATCH_UP_NOTE,
  REENTRY_AFTER_DAYS,
  catchUpTransaction,
  daysBetween,
  reentryFor,
} from './calm.ts'

describe('daysBetween', () => {
  it('is 0 for the same day', () => {
    expect(daysBetween('2026-08-10', '2026-08-10')).toBe(0)
  })
  it('counts forward', () => {
    expect(daysBetween('2026-08-10', '2026-08-15')).toBe(5)
  })
  it('is negative going backward', () => {
    expect(daysBetween('2026-08-15', '2026-08-10')).toBe(-5)
  })
  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-07-30', '2026-08-02')).toBe(3)
    expect(daysBetween('2025-12-30', '2026-01-02')).toBe(3)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // leap year
  })
})

describe('reentryFor', () => {
  it('is null when the app was never opened', () => {
    expect(reentryFor('', '2026-08-10')).toBeNull()
  })
  it('is null for a gap below the threshold', () => {
    expect(REENTRY_AFTER_DAYS).toBe(5)
    expect(reentryFor('2026-08-06', '2026-08-10')).toBeNull()
    expect(reentryFor('2026-08-10', '2026-08-10')).toBeNull()
  })
  it('flags exactly 5 days away', () => {
    expect(reentryFor('2026-08-05', '2026-08-10')).toEqual({ since: '2026-08-05', days: 5 })
  })
  it('flags a month away with the full day count', () => {
    expect(reentryFor('2026-07-11', '2026-08-10')).toEqual({ since: '2026-07-11', days: 30 })
  })
})

describe('catchUpTransaction', () => {
  it('builds one lump row dated today in the Other category', () => {
    const row = catchUpTransaction('c1', 12_000, '2026-08-10')
    expect(row).toEqual({
      id: 'c1',
      amountDA: 12_000,
      category: 'Other',
      note: 'rough catch-up for days away',
      date: '2026-08-10',
    })
    expect(row.category).toBe(CATCH_UP_CATEGORY)
    expect(row.note).toBe(CATCH_UP_NOTE)
    expect(row.resistedImpulse).toBeUndefined()
  })
})
