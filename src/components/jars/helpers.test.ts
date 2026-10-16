import { describe, it, expect } from 'vitest'
import {
  charmRule,
  coverMoves,
  fillLevel,
  groupSuggestions,
  liveSplit,
  nextRentree,
  parseAmount,
  paydayMoves,
  plural,
  splitTotal,
} from './helpers.ts'
import { defaultMoney, moneyReducer } from '../../state/slices/money.ts'
import type { CharmSuggestion } from '../../engine/money.ts'

describe('parseAmount', () => {
  it('accepts plain, spaced and comma-grouped DA', () => {
    expect(parseAmount('12000')).toBe(12000)
    expect(parseAmount('12 000')).toBe(12000)
    expect(parseAmount('12,000')).toBe(12000)
    expect(parseAmount('1500 DA')).toBe(1500)
    expect(parseAmount('99.6')).toBe(100)
  })
  it('rejects empty, zero, negative and junk', () => {
    for (const s of ['', '0', '-5', 'abc', '1e5', 'NaN']) expect(parseAmount(s)).toBeNull()
  })
})

describe('cover and payday moves', () => {
  it('cover writes an out/in pair with deterministic ids that the reducer keeps once', () => {
    const moves = coverMoves('u1', 'src', 'dst', 2000, '2026-10-16')
    expect(moves).toEqual([
      { id: 'cover:u1:out', jarId: 'src', amount: -2000, date: '2026-10-16', kind: 'cover' },
      { id: 'cover:u1:in', jarId: 'dst', amount: 2000, date: '2026-10-16', kind: 'cover' },
    ])
    const once = moneyReducer(defaultMoney(), { type: 'money/jar-moves', moves })
    const twice = moneyReducer(once, { type: 'money/jar-moves', moves })
    expect(twice).toBe(once)
    expect(once.jarMoves).toHaveLength(2)
  })
  it('payday moves use payday:{incomeId}:{jarId} and skip zero rows', () => {
    const moves = paydayMoves('inc', [{ jarId: 'a', amount: 100 }, { jarId: 'b', amount: 0 }], '2026-10-16')
    expect(moves).toEqual([{ id: 'payday:inc:a', jarId: 'a', amount: 100, date: '2026-10-16', kind: 'payday' }])
  })
  it('splitTotal and liveSplit ignore archived jars', () => {
    const m = defaultMoney()
    m.jars = [
      { id: 'a', name: 'A', emoji: 'x', target: null, targetDate: null, locked: false, archived: false, updatedAt: '' },
      { id: 'b', name: 'B', emoji: 'x', target: null, targetDate: null, locked: false, archived: true, updatedAt: '' },
    ]
    m.settings.split = [{ jarId: 'a', amount: 10 }, { jarId: 'b', amount: 5 }]
    expect(splitTotal(m.settings.split)).toBe(15)
    expect(liveSplit(m)).toEqual([{ jarId: 'a', amount: 10 }])
  })
})

describe('fillLevel', () => {
  it('is empty at or below zero', () => {
    expect(fillLevel({ balance: 0, progress: 0 })).toBe(0)
    expect(fillLevel({ balance: -50, progress: null })).toBe(0)
  })
  it('follows progress for target jars, with a visible sliver', () => {
    expect(fillLevel({ balance: 5000, progress: 0.5 })).toBe(0.5)
    expect(fillLevel({ balance: 10, progress: 0.001 })).toBe(0.06)
  })
  it('rises softly and never brims for open-ended jars', () => {
    const a = fillLevel({ balance: 10_000, progress: null })
    const b = fillLevel({ balance: 100_000, progress: null })
    expect(b).toBeGreaterThan(a)
    expect(b).toBeLessThan(0.9)
  })
})

describe('groupSuggestions', () => {
  it('groups by jar with totals, in first-seen order', () => {
    const s = (id: string, jarId: string, amount: number) => ({ id, jarId, amount }) as CharmSuggestion
    const g = groupSuggestions([s('1', 'b', 10), s('2', 'a', 5), s('3', 'b', 20)])
    expect(g.map((x) => [x.jarId, x.items.length, x.total])).toEqual([
      ['b', 2, 30],
      ['a', 1, 5],
    ])
  })
})

describe('copy helpers', () => {
  it('describes each charm kind in plain words', () => {
    const jar = { name: 'Eid', emoji: '🌙' }
    expect(charmRule({ kind: 'roundup', category: null, value: 100 }, jar)).toBe('Round every log up to the nearest 100 DA → 🌙 Eid')
    expect(charmRule({ kind: 'category', category: 'Food', value: 200 }, jar)).toBe('Every time I log Food, put 200 DA in 🌙 Eid')
    expect(charmRule({ kind: 'treat-tax', category: 'Fun', value: 10 }, jar)).toBe('Treat tax: 10% of every Fun log → 🌙 Eid')
  })
  it('plural', () => {
    expect(plural(1, 'jar')).toBe('1 jar')
    expect(plural(3, 'jar')).toBe('3 jars')
  })
  it('nextRentree is the next 1 September after today', () => {
    expect(nextRentree('2026-10-16')).toBe('2027-09-01')
    expect(nextRentree('2026-08-31')).toBe('2026-09-01')
    expect(nextRentree('2026-09-01')).toBe('2027-09-01')
  })
})
