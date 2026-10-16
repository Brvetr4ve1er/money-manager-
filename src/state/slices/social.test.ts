import { describe, it, expect } from 'vitest'
import {
  defaultSocial,
  mergeSocial,
  sanitizeSocial,
  socialReducer,
  type Contribution,
  type Iou,
  type Settlement,
  type SocialState,
  type Tontine,
} from './social.ts'

const T1 = '2026-10-01T08:00:00.000Z'
const T2 = '2026-10-02T08:00:00.000Z'
const T2_NO_MS = '2026-10-02T08:00:00Z'

const tontine = (over: Partial<Tontine> = {}): Tontine => ({
  id: 't-1',
  name: 'Family daret',
  contribution: 5_000,
  cadence: 'monthly',
  startDate: '2026-10-01',
  members: ['Amina', 'Me', 'Yacine'],
  myTurn: 2,
  archived: false,
  updatedAt: T1,
  ...over,
})

const contribution = (over: Partial<Contribution> = {}): Contribution => ({
  id: 'c-1',
  tontineId: 't-1',
  round: 1,
  date: '2026-10-01',
  paid: true,
  ...over,
})

const iou = (over: Partial<Iou> = {}): Iou => ({
  id: 'i-1',
  person: 'Karim',
  direction: 'lent',
  amount: 10_000,
  date: '2026-10-01',
  note: '',
  dueDate: null,
  archived: false,
  updatedAt: T1,
  ...over,
})

const settlement = (over: Partial<Settlement> = {}): Settlement => ({
  id: 's-1',
  iouId: 'i-1',
  amount: 4_000,
  date: '2026-10-05',
  ...over,
})

const full = (): SocialState => ({
  tontines: [tontine()],
  contributions: [contribution()],
  ious: [iou()],
  settlements: [settlement()],
  zakat: { goldPricePerGram: 14_000, savedAt: T1 },
})

const j = (x: unknown) => JSON.stringify(x)

describe('sanitizeSocial', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSocial(null)).toEqual(defaultSocial())
    expect(sanitizeSocial('x')).toEqual(defaultSocial())
    expect(sanitizeSocial({ tontines: 'nope', ious: [1, null] })).toEqual(defaultSocial())
  })

  it('keeps valid rows and emits canonical key order', () => {
    const s = sanitizeSocial({ ...full(), extra: 1 })
    expect(Object.keys(s)).toEqual(Object.keys(defaultSocial()))
    expect(s).toEqual(full())
    expect(Object.keys(s.tontines[0])).toEqual(Object.keys(tontine()))
  })

  it('drops tontines with fewer than 2 members, duplicates, or a myTurn out of range', () => {
    const bad = [
      tontine({ id: 'a', members: ['Me'], myTurn: 1 }),
      tontine({ id: 'b', members: ['Me', 'Me'] }),
      tontine({ id: 'c', myTurn: 4 }),
      tontine({ id: 'd', myTurn: 0 }),
      tontine({ id: 'e', myTurn: 1.5 }),
      tontine({ id: 'f', contribution: Number.NaN }),
      tontine({ id: 'g', contribution: 0 }),
      tontine({ id: 'h', startDate: '2026-02-30' }),
      tontine({ id: 'i', cadence: 'yearly' as never }),
      tontine({ id: 'k', name: '  ' }),
      tontine({ id: 'l', members: ['Me', ' Amina'] }),
    ]
    expect(sanitizeSocial({ tontines: bad }).tontines).toEqual([])
  })

  it('drops bad contributions, IOUs and settlements', () => {
    const s = sanitizeSocial({
      contributions: [contribution({ round: 0 }), { ...contribution(), paid: false }, contribution({ date: 'x' })],
      ious: [iou({ amount: -1 }), iou({ direction: 'gift' as never }), iou({ dueDate: '2026-13-01' }), iou({ person: '' })],
      settlements: [settlement({ amount: 0 }), settlement({ amount: Infinity })],
    })
    expect(s.contributions).toEqual([])
    expect(s.ious).toEqual([])
    expect(s.settlements).toEqual([])
  })

  it('defaults optional IOU fields and validates zakat settings', () => {
    const { note: _n, dueDate: _d, archived: _a, ...bare } = iou()
    const s = sanitizeSocial({ ious: [bare], zakat: { goldPricePerGram: -3, savedAt: 'never' } })
    expect(s.ious[0]).toEqual(iou())
    expect(s.zakat).toEqual({ goldPricePerGram: null, savedAt: '' })
  })

  it('collapses duplicate ids with the merge rule (a merge fixpoint)', () => {
    const s = sanitizeSocial({
      tontines: [tontine({ name: 'Old' }), tontine({ name: 'New', updatedAt: T2 })],
      contributions: [contribution(), contribution()],
    })
    expect(s.tontines).toHaveLength(1)
    expect(s.tontines[0].name).toBe('New')
    expect(s.contributions).toHaveLength(1)
    expect(j(mergeSocial(s, s))).toBe(j(s))
  })
})

describe('mergeSocial', () => {
  it('is symmetric and a fixpoint on itself', () => {
    const a = full()
    const b: SocialState = {
      tontines: [tontine({ name: 'Renamed', updatedAt: T2 }), tontine({ id: 't-2', updatedAt: T1 })],
      contributions: [contribution({ id: 'c-2', round: 2 })],
      ious: [iou({ archived: true, updatedAt: T2 })],
      settlements: [settlement({ id: 's-2', amount: 1_000 })],
      zakat: { goldPricePerGram: 15_000, savedAt: T2 },
    }
    const ab = mergeSocial(a, b)
    expect(j(ab)).toBe(j(mergeSocial(b, a)))
    expect(j(mergeSocial(ab, ab))).toBe(j(ab))
    expect(j(sanitizeSocial(JSON.parse(j(ab))))).toBe(j(ab))
    expect(Object.keys(ab)).toEqual(Object.keys(defaultSocial()))
    expect(ab.tontines.map((t) => t.id)).toEqual(['t-1', 't-2'])
    expect(ab.tontines[0].name).toBe('Renamed')
    expect(ab.ious[0].archived).toBe(true) // the tombstone wins
    expect(ab.contributions).toHaveLength(2)
    expect(ab.settlements).toHaveLength(2)
    expect(ab.zakat.goldPricePerGram).toBe(15_000)
  })

  it('compares stamps as instants, and breaks ties symmetrically', () => {
    // "…00Z" is the same instant as "…00.000Z" but sorts differently as a string.
    const a = { ...defaultSocial(), tontines: [tontine({ name: 'A', updatedAt: T2_NO_MS })] }
    const b = { ...defaultSocial(), tontines: [tontine({ name: 'B', updatedAt: T2 })] }
    expect(j(mergeSocial(a, b))).toBe(j(mergeSocial(b, a)))
    const c = { ...defaultSocial(), tontines: [tontine({ name: 'C', updatedAt: T1 })] }
    expect(mergeSocial(c, b).tontines[0].name).toBe('B')
    expect(mergeSocial(b, c).tontines[0].name).toBe('B')
  })

  it('never-saved zakat loses to a saved one either way round', () => {
    const saved = { ...defaultSocial(), zakat: { goldPricePerGram: 9_000, savedAt: T1 } }
    expect(mergeSocial(defaultSocial(), saved).zakat.goldPricePerGram).toBe(9_000)
    expect(mergeSocial(saved, defaultSocial()).zakat.goldPricePerGram).toBe(9_000)
  })
})

describe('socialReducer', () => {
  const base = (): SocialState => ({ ...defaultSocial(), tontines: [tontine()], ious: [iou()] })

  it('upserts a valid tontine and returns the SAME state for an invalid one', () => {
    const s0 = defaultSocial()
    const s1 = socialReducer(s0, { type: 'social/tontine-upsert', tontine: tontine() })
    expect(s1.tontines).toHaveLength(1)
    expect(socialReducer(s1, { type: 'social/tontine-upsert', tontine: tontine({ myTurn: 9 }) })).toBe(s1)
    expect(socialReducer(s1, { type: 'social/tontine-upsert', tontine: tontine({ contribution: Number.NaN }) })).toBe(s1)
  })

  it('archives as a tombstone with a fresh stamp', () => {
    const s = socialReducer(base(), { type: 'social/tontine-archive', id: 't-1', nowISO: T2 })
    expect(s.tontines[0]).toMatchObject({ archived: true, updatedAt: T2 })
    expect(socialReducer(s, { type: 'social/tontine-archive', id: 't-1', nowISO: T2 })).toBe(s)
    const b = base()
    expect(socialReducer(b, { type: 'social/tontine-archive', id: 't-1', nowISO: 'bad' })).toBe(b)
    const s2 = socialReducer(base(), { type: 'social/iou-archive', id: 'i-1', nowISO: T2 })
    expect(s2.ious[0].archived).toBe(true)
  })

  it('logs a contribution once per round, only for a live tontine and a real round', () => {
    const s0 = base()
    const s1 = socialReducer(s0, { type: 'social/contribution-add', contribution: contribution() })
    expect(s1.contributions).toHaveLength(1)
    // same round, new id (double tap) → no-op
    expect(socialReducer(s1, { type: 'social/contribution-add', contribution: contribution({ id: 'c-x' }) })).toBe(s1)
    expect(socialReducer(s1, { type: 'social/contribution-add', contribution: contribution({ id: 'c-4', round: 4 }) })).toBe(s1)
    expect(
      socialReducer(s1, { type: 'social/contribution-add', contribution: contribution({ id: 'c-z', tontineId: 'nope' }) }),
    ).toBe(s1)
  })

  it('upserts IOUs and accepts partial settlements up to the outstanding amount', () => {
    const s0 = defaultSocial()
    const s1 = socialReducer(s0, { type: 'social/iou-upsert', iou: iou() })
    expect(socialReducer(s1, { type: 'social/iou-upsert', iou: iou({ amount: -5 }) })).toBe(s1)
    const s2 = socialReducer(s1, { type: 'social/settlement-add', settlement: settlement({ amount: 4_000 }) })
    expect(s2.settlements).toHaveLength(1)
    const s3 = socialReducer(s2, { type: 'social/settlement-add', settlement: settlement({ id: 's-2', amount: 6_000 }) })
    expect(s3.settlements).toHaveLength(2)
    // nothing left outstanding → an extra repayment is refused
    expect(socialReducer(s3, { type: 'social/settlement-add', settlement: settlement({ id: 's-3', amount: 1 }) })).toBe(s3)
    expect(socialReducer(s2, { type: 'social/settlement-add', settlement: settlement({ id: 's-4', amount: 7_000 }) })).toBe(s2)
  })

  it('stores the gold price with a stamp and rejects bad numbers', () => {
    const s0 = defaultSocial()
    const s1 = socialReducer(s0, { type: 'social/zakat-settings', goldPricePerGram: 14_500, nowISO: T1 })
    expect(s1.zakat).toEqual({ goldPricePerGram: 14_500, savedAt: T1 })
    expect(socialReducer(s1, { type: 'social/zakat-settings', goldPricePerGram: Number.NaN, nowISO: T2 })).toBe(s1)
    expect(socialReducer(s1, { type: 'social/zakat-settings', goldPricePerGram: 1, nowISO: 'x' })).toBe(s1)
  })

  it('ignores unknown actions', () => {
    const s = base()
    expect(socialReducer(s, { type: 'social/noop' } as never)).toBe(s)
  })
})
