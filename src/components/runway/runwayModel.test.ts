import { describe, it, expect } from 'vitest'
import { obligationView, obligationViews } from '../../engine/money.ts'
import { addDaysISO } from '../../engine/dates.ts'
import { defaultMoney, type MoneyState, type Obligation, type Payment } from '../../state/slices/money.ts'
import {
  auditSummary,
  dueBeforePayday,
  dueLabel,
  objectKindFor,
  objectStateFor,
  statusLabel,
  timelineItems,
} from './runwayModel.ts'

const ISO = '2026-01-01T00:00:00.000Z'
const TODAY = '2026-10-16'

function ob(p: Partial<Obligation> & { id: string }): Obligation {
  return {
    name: p.id,
    amount: 1000,
    currency: 'DA',
    kind: 'bill',
    cadence: 'monthly',
    firstDue: TODAY,
    accountId: null,
    installment: null,
    nextStep: '',
    archived: false,
    updatedAt: ISO,
    ...p,
  }
}
function pay(obligationId: string, due: string, paidOn: string, amount = 1000): Payment {
  return { id: `p-${obligationId}-${due}`, obligationId, due, paidOn, amount, currency: 'DA', txId: `t-${due}`, void: false, updatedAt: ISO }
}
function money(obligations: Obligation[], payments: Payment[] = [], fx: number | null = null): MoneyState {
  const m = defaultMoney()
  return { ...m, obligations, payments, settings: { ...m.settings, fxDaPerUsd: fx } }
}

describe('dueLabel', () => {
  it('speaks in days, gently', () => {
    expect(dueLabel(3)).toBe('due in 3 days')
    expect(dueLabel(1)).toBe('due tomorrow')
    expect(dueLabel(0)).toBe('due today')
    expect(dueLabel(-1)).toBe('1 day late')
    expect(dueLabel(-4)).toBe('4 days late')
    expect(dueLabel(null)).toBe('all paid')
  })
})

describe('timelineItems', () => {
  const payday = '2026-10-31'
  it('puts late cycles above Today, and Payday after everything due on or before it', () => {
    const m = money([
      ob({ id: 'late', firstDue: addDaysISO(TODAY, -2) }),
      ob({ id: 'soon', firstDue: addDaysISO(TODAY, 2) }),
      ob({ id: 'onPayday', firstDue: payday }),
      ob({ id: 'after', firstDue: '2026-11-05' }),
      ob({ id: 'done', cadence: 'once', firstDue: '2026-10-01' }),
    ], [pay('done', '2026-10-01', '2026-10-01')])
    const items = timelineItems(obligationViews(m, TODAY), TODAY, payday)
    const flat = items.map((i) => (i.type === 'node' ? i.view.obligation.id : i.type))
    expect(flat).toEqual(['late', 'today', 'soon', 'onPayday', 'payday', 'after', 'done'])
  })

  it('still draws both markers with nothing ahead', () => {
    const m = money([ob({ id: 'late', firstDue: addDaysISO(TODAY, -2) })])
    const flat = timelineItems(obligationViews(m, TODAY), TODAY, payday).map((i) => i.type)
    expect(flat).toEqual(['node', 'today', 'payday'])
  })

  it('places Today before Payday even when the first cycle is after payday', () => {
    const m = money([ob({ id: 'far', firstDue: '2026-12-01' })])
    const flat = timelineItems(obligationViews(m, TODAY), TODAY, payday).map((i) => i.type)
    expect(flat).toEqual(['today', 'payday', 'node'])
  })
})

describe('dueBeforePayday', () => {
  it('counts every cycle in the window and flags USD without a rate', () => {
    const m = money([
      ob({ id: 'weekly', cadence: 'weekly', amount: 500, firstDue: TODAY }),
      ob({ id: 'usd', currency: 'USD', amount: 10, firstDue: addDaysISO(TODAY, 1) }),
      ob({ id: 'later', firstDue: '2026-11-20' }),
    ])
    const r = dueBeforePayday(obligationViews(m, TODAY), '2026-10-31', null)
    // Oct 16, 23, 30 → three weekly cycles
    expect(r).toEqual({ totalDA: 1500, cycles: 3, missingRate: 1 })
    const withFx = dueBeforePayday(obligationViews(money(m.obligations, [], 250), TODAY), '2026-10-31', 250)
    expect(withFx.totalDA).toBe(1500 + 2500)
    expect(withFx.missingRate).toBe(0)
  })
})

describe('object state', () => {
  it('maps status and kind to light', () => {
    const m = money([
      ob({ id: 'late', firstDue: addDaysISO(TODAY, -1) }),
      ob({ id: 'soon', firstDue: addDaysISO(TODAY, 2) }),
      ob({ id: 'up', firstDue: addDaysISO(TODAY, 10) }),
      ob({ id: 'var', kind: 'variable', firstDue: addDaysISO(TODAY, 10) }),
      ob({ id: 'paid', firstDue: addDaysISO(TODAY, -20) }),
    ], [pay('paid', addDaysISO(TODAY, -20), addDaysISO(TODAY, -2))])
    const st = (id: string) => objectStateFor(obligationView(m.obligations.find((o) => o.id === id)!, m, TODAY), TODAY)
    expect(st('late')).toBe('out')
    expect(st('soon')).toBe('flicker')
    expect(st('up')).toBe('dim')
    expect(st('var')).toBe('hazy')
    expect(st('paid')).toBe('lit')
    const v = obligationView(m.obligations.find((o) => o.id === 'paid')!, m, TODAY)
    expect(statusLabel(v, TODAY)).toBe('Lit')
    // ...but an old payment no longer keeps it lit.
    expect(objectStateFor(v, addDaysISO(TODAY, 8))).toBe('dim')
  })

  it('picks the object for the kind', () => {
    expect(objectKindFor(ob({ id: 'a', kind: 'bill' }))).toBe('lantern')
    expect(objectKindFor(ob({ id: 'a', kind: 'subscription' }))).toBe('window')
    expect(objectKindFor(ob({ id: 'a', kind: 'variable' }))).toBe('plant')
    expect(objectKindFor(ob({ id: 'a', kind: 'installment' }))).toBe('ring')
  })
})

describe('auditSummary', () => {
  it('sorts by yearly cost, totals DA, and puts unknown USD last', () => {
    const m = money([
      ob({ id: 'monthly', amount: 1000 }),
      ob({ id: 'weekly', cadence: 'weekly', amount: 500 }),
      ob({ id: 'yearly', cadence: 'yearly', amount: 5000 }),
      ob({ id: 'usd', currency: 'USD', amount: 10 }),
      ob({ id: 'once', cadence: 'once', amount: 99999 }),
    ])
    const s = auditSummary(m, TODAY)
    expect(s.rows.map((r) => r.view.obligation.id)).toEqual(['weekly', 'monthly', 'yearly', 'usd'])
    expect(s.totalYearlyDA).toBe(26000 + 12000 + 5000)
    expect(s.missingRate).toBe(1)
  })
})
