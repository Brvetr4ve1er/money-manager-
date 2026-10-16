import { describe, it, expect } from 'vitest'
import { defaultSocial, type Iou, type SocialState, type Tontine } from '../state/slices/social.ts'
import {
  dueLabel,
  iouTotals,
  iouView,
  socialRunwayItems,
  tontineRoundDate,
  tontineView,
  zakatEstimate,
} from './social.ts'

const T1 = '2026-10-01T08:00:00.000Z'

const tontine = (over: Partial<Tontine> = {}): Tontine => ({
  id: 't-1',
  name: 'Daret',
  contribution: 5_000,
  cadence: 'monthly',
  startDate: '2026-01-31',
  members: ['Amina', 'Me', 'Yacine', 'Sara'],
  myTurn: 2,
  archived: false,
  updatedAt: T1,
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

const state = (over: Partial<SocialState> = {}): SocialState => ({ ...defaultSocial(), ...over })

describe('tontine schedule', () => {
  it('clamps monthly rounds to month ends without drifting', () => {
    const t = tontine()
    expect([1, 2, 3, 4].map((r) => tontineRoundDate(t, r))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('steps weekly rounds across a month end', () => {
    const t = tontine({ cadence: 'weekly', startDate: '2026-10-28' })
    expect(tontineRoundDate(t, 2)).toBe('2026-11-04')
    expect(tontineRoundDate(t, 4)).toBe('2026-11-18')
  })

  it('reports current round, payout date, pot, and next contribution', () => {
    const t = tontine()
    const s = state({
      tontines: [t],
      contributions: [{ id: 'c1', tontineId: 't-1', round: 1, date: '2026-01-31', paid: true }],
    })
    const v = tontineView(t, s, '2026-03-05')
    expect(v.rounds).toBe(4)
    expect(v.started).toBe(true)
    expect(v.currentRound).toBe(2)
    expect(v.pot).toBe(20_000)
    expect(v.myPayoutDate).toBe('2026-02-28')
    expect(v.payoutReached).toBe(true)
    expect(v.roundsDue).toBe(2)
    expect(v.roundsPaidOfDue).toBe(1)
    expect(v.nextRound).toBe(2)
    expect(v.nextContributionDate).toBe('2026-02-28')
    expect(v.nextInDays).toBe(-5)
    expect(v.complete).toBe(false)
  })

  it('before the start: not started, current round shown as 1', () => {
    const v = tontineView(tontine(), state(), '2026-01-01')
    expect(v.started).toBe(false)
    expect(v.currentRound).toBe(1)
    expect(v.roundsDue).toBe(0)
    expect(v.nextInDays).toBe(30)
  })

  it('ignores contributions for out-of-range rounds and is complete when all rounds are paid', () => {
    const t = tontine({ members: ['Me', 'Amina'], myTurn: 1 })
    const contributions = [1, 2, 7].map((r) => ({ id: `c${r}`, tontineId: 't-1', round: r, date: '2026-01-31', paid: true as const }))
    const v = tontineView(t, state({ tontines: [t], contributions }), '2026-02-01')
    expect(v.paidRounds).toEqual([1, 2])
    expect(v.complete).toBe(true)
    expect(v.nextContributionDate).toBeNull()
  })
})

describe('IOU balances', () => {
  it('subtracts partial settlements and totals by direction', () => {
    const s = state({
      ious: [iou(), iou({ id: 'i-2', direction: 'borrowed', amount: 3_000, person: 'Mum' })],
      settlements: [
        { id: 's1', iouId: 'i-1', amount: 2_500, date: '2026-10-05' },
        { id: 's2', iouId: 'i-1', amount: 1_500, date: '2026-10-08' },
      ],
    })
    const v = iouView(s.ious[0], s, '2026-10-10')
    expect(v.settled).toBe(4_000)
    expect(v.outstanding).toBe(6_000)
    const totals = iouTotals(s, '2026-10-10')
    expect(totals.owedToMe).toBe(6_000)
    expect(totals.iOwe).toBe(3_000)
  })

  it('flags overdue only when a due date has passed with something still open', () => {
    const s = state({ ious: [iou({ dueDate: '2026-10-07' })] })
    expect(iouView(s.ious[0], s, '2026-10-10')).toMatchObject({ overdue: true, daysUntilDue: -3 })
    expect(iouView(s.ious[0], s, '2026-10-07').overdue).toBe(false)
    const paid = state({ ...s, settlements: [{ id: 's', iouId: 'i-1', amount: 10_000, date: '2026-10-08' }] })
    expect(iouView(paid.ious[0], paid, '2026-10-10')).toMatchObject({ overdue: false, fullySettled: true })
  })

  it('skips archived IOUs', () => {
    const s = state({ ious: [iou({ archived: true })] })
    expect(iouTotals(s, '2026-10-10').lent).toEqual([])
  })

  it('words due dates gently', () => {
    expect(dueLabel(-3)).toBe('was due 3 days ago')
    expect(dueLabel(-1)).toBe('was due yesterday')
    expect(dueLabel(0)).toBe('due today')
    expect(dueLabel(1)).toBe('due tomorrow')
    expect(dueLabel(5)).toBe('due in 5 days')
    expect(dueLabel(null)).toBe('no date set')
  })
})

describe('socialRunwayItems', () => {
  const t = tontine({ startDate: '2026-10-20', members: ['Amina', 'Me', 'Yacine'], myTurn: 2 })

  it('lists unpaid rounds, my payout and IOU dues inside the window, signed', () => {
    const s = state({
      tontines: [t],
      ious: [
        iou({ dueDate: '2026-11-01' }),
        iou({ id: 'i-2', direction: 'borrowed', amount: 2_000, person: 'Mum', dueDate: '2026-12-25' }),
        iou({ id: 'i-3', dueDate: null }),
      ],
      settlements: [{ id: 's', iouId: 'i-1', amount: 4_000, date: '2026-10-10' }],
    })
    const items = socialRunwayItems(s, '2026-10-16', '2026-11-30')
    expect(items).toEqual([
      { id: 'tontine-pay:t-1:1', kind: 'tontine-pay', label: 'Daret — round 1', amountDA: -5_000, date: '2026-10-20' },
      { id: 'iou-due:i-1', kind: 'iou-due', label: 'Back from Karim', amountDA: 6_000, date: '2026-11-01' },
      { id: 'tontine-pay:t-1:2', kind: 'tontine-pay', label: 'Daret — round 2', amountDA: -5_000, date: '2026-11-20' },
      { id: 'tontine-payout:t-1', kind: 'tontine-payout', label: 'Daret — your pot', amountDA: 15_000, date: '2026-11-20' },
    ])
    const later = socialRunwayItems(s, '2026-10-16', '2026-12-31')
    expect(later.find((x) => x.id === 'iou-due:i-2')).toMatchObject({ amountDA: -2_000, label: 'Back to Mum' })
  })

  it('dates past-due unpaid rounds and IOUs today, and drops paid / archived ones', () => {
    const s = state({
      tontines: [t, tontine({ id: 't-old', archived: true })],
      contributions: [{ id: 'c', tontineId: 't-1', round: 2, date: '2026-11-01', paid: true }],
      ious: [iou({ dueDate: '2026-11-01' })],
    })
    const items = socialRunwayItems(s, '2026-11-25', '2026-12-05')
    expect(items.map((x) => [x.id, x.date])).toEqual([
      ['iou-due:i-1', '2026-11-25'],
      ['tontine-pay:t-1:1', '2026-11-25'],
    ])
  })

  it('returns nothing for an inverted window', () => {
    expect(socialRunwayItems(state({ tontines: [t] }), '2026-10-16', '2026-10-01')).toEqual([])
  })
})

describe('zakatEstimate', () => {
  it('compares savings to 85 g of gold and estimates 2.5%', () => {
    expect(zakatEstimate(2_000_000, 20_000)).toEqual({ nisab: 1_700_000, eligible: true, estimate: 50_000 })
    expect(zakatEstimate(1_700_000, 20_000)).toMatchObject({ eligible: true, estimate: 42_500 })
    expect(zakatEstimate(1_699_999, 20_000)).toEqual({ nisab: 1_700_000, eligible: false, estimate: 0 })
  })

  it('stays unknown without both figures', () => {
    expect(zakatEstimate(null, 20_000)).toEqual({ nisab: 1_700_000, eligible: null, estimate: null })
    expect(zakatEstimate(1_000, null)).toEqual({ nisab: null, eligible: null, estimate: null })
    expect(zakatEstimate(1_000, -5)).toEqual({ nisab: null, eligible: null, estimate: null })
  })
})
