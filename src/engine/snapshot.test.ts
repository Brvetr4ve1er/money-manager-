import { describe, it, expect } from 'vitest'
import { DEFAULT_SNAPSHOT_OPTIONS, buildSnapshot, type SnapshotInput, type SnapshotOptions } from './snapshot.ts'
import type { HeldPurchase, Velocity } from './brakes.ts'
import type { Transaction } from '../state/store.ts'

const today = '2026-08-10'
const from = '2026-08-04'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: Math.random().toString(36).slice(2),
  amountDA: 1_000,
  category: 'Food',
  date: today,
  ...over,
})

const velocity = (level: Velocity['level']): Velocity => ({
  level,
  ratio: level === 'unknown' ? null : 1,
  recentPerDay: 0,
  baselinePerDay: 0,
})

const held = (over: Partial<HeldPurchase> = {}): HeldPurchase => ({
  id: 'h1',
  amountDA: 6_000,
  category: 'Fun',
  impulseFlagged: false,
  heldAt: '2026-08-10T10:00:00.000Z',
  releaseAt: '2026-08-11T10:00:00.000Z',
  ...over,
})

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  transactions: [],
  held: [],
  velocity: velocity('usual'),
  health: { score: 61.2, stage: 'hearth' },
  today,
  trustedName: '',
  ...over,
})

const OFF: SnapshotOptions = { totals: false, categories: false, held: false, velocity: false, health: false }
const ALL: SnapshotOptions = { totals: true, categories: true, held: true, velocity: true, health: true }

const lines = (text: string) => text.split('\n')

describe('buildSnapshot header and footer', () => {
  it('always opens with the week range and ends with the "Sent by hand" line', () => {
    const text = buildSnapshot(input(), OFF)
    const ls = lines(text)
    expect(ls[0]).toBe(`Ember weekly snapshot · ${from} → ${today}`)
    expect(ls[ls.length - 1]).toBe('Sent by hand from Ember. Nothing in the app is shared automatically.')
    expect(buildSnapshot(input(), ALL)).toMatch(/Sent by hand from Ember\. Nothing in the app is shared automatically\.$/)
  })
  it('addresses the trusted person when a name is set, trimmed', () => {
    expect(lines(buildSnapshot(input({ trustedName: '  Mum ' }), OFF))[0]).toBe(
      `Ember weekly snapshot for Mum · ${from} → ${today}`,
    )
    expect(lines(buildSnapshot(input({ trustedName: '   ' }), OFF))[0]).toBe(
      `Ember weekly snapshot · ${from} → ${today}`,
    )
  })
  it('adds a From line only for a non-blank user name', () => {
    expect(buildSnapshot(input({ userName: ' Nadia ' }), OFF)).toContain('From: Nadia')
    expect(buildSnapshot(input({ userName: '  ' }), OFF)).not.toContain('From:')
    expect(buildSnapshot(input(), OFF)).not.toContain('From:')
  })
  it('exposes defaults with held off and everything else on', () => {
    expect(DEFAULT_SNAPSHOT_OPTIONS).toEqual({ totals: true, categories: true, held: false, velocity: true, health: true })
  })
})

describe('buildSnapshot totals', () => {
  it('sums the week and counts logs with singular/plural', () => {
    const one = buildSnapshot(input({ transactions: [tx({ amountDA: 1_500 })] }), { ...OFF, totals: true })
    expect(one).toContain('Spent: 1,500 DA across 1 log.')
    const two = buildSnapshot(
      input({ transactions: [tx({ amountDA: 1_500 }), tx({ amountDA: 11_000 })] }),
      { ...OFF, totals: true },
    )
    expect(two).toContain('Spent: 12,500 DA across 2 logs.')
  })
  it('is absent when toggled off', () => {
    expect(buildSnapshot(input({ transactions: [tx()] }), { ...ALL, totals: false })).not.toContain('Spent:')
  })
  it('excludes rows older than 7 days and resisted rows from spend', () => {
    const text = buildSnapshot(
      input({
        transactions: [
          tx({ amountDA: 100, date: '2026-08-03' }), // 8 days ago — out
          tx({ amountDA: 200, date: from }), // window start — in
          tx({ amountDA: 400, date: today }),
          tx({ amountDA: 9_999, resistedImpulse: true }), // nothing spent
        ],
      }),
      { ...OFF, totals: true },
    )
    expect(text).toContain('Spent: 600 DA across 2 logs.')
  })
  it('counts resisted impulses in their own line, only when there are any', () => {
    const none = buildSnapshot(input({ transactions: [tx()] }), { ...OFF, totals: true })
    expect(none).not.toContain('Resisted:')
    const one = buildSnapshot(
      input({ transactions: [tx({ resistedImpulse: true }), tx({ resistedImpulse: true, date: '2026-08-01' })] }),
      { ...OFF, totals: true },
    )
    expect(one).toContain('Resisted: 1 impulse.') // the older one is outside the week
    const two = buildSnapshot(
      input({ transactions: [tx({ resistedImpulse: true }), tx({ resistedImpulse: true, date: from })] }),
      { ...OFF, totals: true },
    )
    expect(two).toContain('Resisted: 2 impulses.')
  })
})

describe('buildSnapshot categories', () => {
  it('sorts by amount desc, then by name', () => {
    const text = buildSnapshot(
      input({
        transactions: [
          tx({ amountDA: 1_500, category: 'Fun' }),
          tx({ amountDA: 3_000, category: 'Food' }),
          tx({ amountDA: 1_500, category: 'Bills' }),
          tx({ amountDA: 1_000, category: 'Food' }),
        ],
      }),
      { ...OFF, categories: true },
    )
    const ls = lines(text)
    const at = ls.indexOf('By category:')
    expect(at).toBeGreaterThan(0)
    expect(ls.slice(at + 1, at + 4)).toEqual(['  Food: 4,000 DA', '  Bills: 1,500 DA', '  Fun: 1,500 DA'])
  })
  it('is absent when off or when the week is empty', () => {
    expect(buildSnapshot(input({ transactions: [tx()] }), { ...ALL, categories: false })).not.toContain('By category:')
    expect(buildSnapshot(input(), ALL)).not.toContain('By category:')
    expect(buildSnapshot(input({ transactions: [tx({ date: '2026-08-01' })] }), ALL)).not.toContain('By category:')
  })
})

describe('buildSnapshot held', () => {
  it('says nothing is held when the queue is empty', () => {
    expect(buildSnapshot(input(), { ...OFF, held: true })).toContain('Held by the brakes: nothing right now.')
  })
  it('lists each held purchase with its count', () => {
    const text = buildSnapshot(
      input({ held: [held(), held({ id: 'h2', amountDA: 12_000, category: 'Other' })] }),
      { ...OFF, held: true },
    )
    const ls = lines(text)
    const at = ls.indexOf('Held by the brakes (2):')
    expect(at).toBeGreaterThan(0)
    expect(ls.slice(at + 1, at + 3)).toEqual(['  6,000 DA · Fun', '  12,000 DA · Other'])
  })
  it('is absent when off', () => {
    expect(buildSnapshot(input({ held: [held()] }), { ...ALL, held: false })).not.toContain('Held by the brakes')
  })
})

describe('buildSnapshot velocity and health', () => {
  it('phrases each pace level', () => {
    const opt = { ...OFF, velocity: true }
    expect(buildSnapshot(input({ velocity: velocity('usual') }), opt)).toContain('Pace: about usual.')
    expect(buildSnapshot(input({ velocity: velocity('faster') }), opt)).toContain(
      'Pace: a bit faster than usual this week.',
    )
    expect(buildSnapshot(input({ velocity: velocity('much-faster') }), opt)).toContain(
      'Pace: a lot faster than usual this week.',
    )
    expect(buildSnapshot(input({ velocity: velocity('unknown') }), opt)).toContain(
      'Pace: not enough history to say yet.',
    )
    expect(buildSnapshot(input(), { ...ALL, velocity: false })).not.toContain('Pace:')
  })
  it('prints the stage label and a one-decimal score', () => {
    const opt = { ...OFF, health: true }
    expect(buildSnapshot(input(), opt)).toContain('Health: Hearth-fire · 61.2 / 100.')
    expect(buildSnapshot(input({ health: { score: 12, stage: 'ember' } }), opt)).toContain('Health: Ember · 12.0 / 100.')
    expect(buildSnapshot(input({ health: { score: 80.04, stage: 'bonfire' } }), opt)).toContain(
      'Health: Bonfire · 80.0 / 100.',
    )
    expect(buildSnapshot(input({ health: { score: 95.5, stage: 'beacon' } }), opt)).toContain(
      'Health: Beacon · 95.5 / 100.',
    )
    expect(buildSnapshot(input(), { ...ALL, health: false })).not.toContain('Health:')
  })
})
