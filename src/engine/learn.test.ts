import { describe, it, expect } from 'vitest'
import {
  APPLY_INFO,
  branchProgress,
  isApplied,
  masteredCount,
  missingPrereqs,
  nodeState,
  reviewDue,
  suggested,
  topSuggested,
} from './learn.ts'
import { NODES, nodeById, nodesInBranch, type ApplyId } from '../content/curriculum.ts'
import { defaultState, type AppState, type Transaction } from '../state/store.ts'
import { defaultLearn, type LearnState, type NodeProgress } from '../state/slices/learn.ts'
import type { Account, Jar, Obligation, Payment } from '../state/slices/money.ts'

const TODAY = '2026-10-16'
const ISO = '2026-10-16T09:00:00.000Z'

const prog = (nodeId: string, over: Partial<NodeProgress> = {}): NodeProgress => ({
  nodeId,
  readAt: '2026-10-01',
  quizPassedAt: null,
  appliedAt: null,
  ...over,
})
const learnWith = (...p: NodeProgress[]): LearnState => ({ ...defaultLearn(), progress: p })
const base = (): AppState => ({ ...defaultState(), questsDate: TODAY })

const account = (over: Partial<Account> = {}): Account => ({
  id: 'acc', name: 'CCP', currency: 'DA', anchorBalance: 10000, anchorAt: ISO, archived: false, updatedAt: ISO, ...over,
})
const jar = (over: Partial<Jar> = {}): Jar => ({
  id: 'j', name: 'Eid', emoji: '🫙', target: null, targetDate: null, locked: false, archived: false, updatedAt: ISO, ...over,
})
const obligation = (over: Partial<Obligation> = {}): Obligation => ({
  id: 'o', name: 'Rent', amount: 15000, currency: 'DA', kind: 'bill', cadence: 'monthly', firstDue: TODAY,
  accountId: null, installment: null, nextStep: '', archived: false, updatedAt: ISO, ...over,
})
const payment = (over: Partial<Payment> = {}): Payment => ({
  id: 'p', obligationId: 'o', due: TODAY, paidOn: TODAY, amount: 15000, currency: 'DA', txId: 't', void: false, updatedAt: ISO, ...over,
})
const tx = (date: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `t-${date}-${Math.random()}`, amountDA: 100, category: 'Food', date, ...over,
})
const withMoney = (s: AppState, patch: Partial<AppState['money']>): AppState => ({ ...s, money: { ...s.money, ...patch } })

describe('nodeState', () => {
  const withApply = NODES.find((n) => n.apply !== null)!
  const noApply = NODES.find((n) => n.apply === null)!

  it('walks new → read → quizzed → mastered', () => {
    expect(nodeState(withApply, defaultLearn())).toBe('new')
    expect(nodeState(withApply, learnWith(prog(withApply.id)))).toBe('read')
    expect(nodeState(withApply, learnWith(prog(withApply.id, { quizPassedAt: TODAY })))).toBe('quizzed')
    expect(nodeState(withApply, learnWith(prog(withApply.id, { quizPassedAt: TODAY, appliedAt: TODAY })))).toBe('mastered')
  })

  it('read + quiz is mastery when the node has no in-app action', () => {
    expect(nodeState(noApply, learnWith(prog(noApply.id, { quizPassedAt: TODAY })))).toBe('mastered')
  })
})

describe('suggested / missingPrereqs / topSuggested', () => {
  const a1 = nodeById('a1-where-money-goes')!
  const a2 = nodeById('a2-money-in-money-out')!
  const a5 = nodeById('a5-cash-envelopes')!

  it('roots are suggested from the start', () => {
    expect(suggested(a1, defaultLearn())).toBe(true)
    expect(suggested(a2, defaultLearn())).toBe(false)
  })

  it('a node is suggested once every prereq is at least quizzed — reading is not enough', () => {
    expect(suggested(a2, learnWith(prog(a1.id)))).toBe(false)
    expect(suggested(a2, learnWith(prog(a1.id, { quizPassedAt: TODAY })))).toBe(true)
    const l = learnWith(prog(a2.id, { quizPassedAt: TODAY }))
    expect(missingPrereqs(a5, l).map((n) => n.id)).toEqual(['a4-needs-wants-later'])
  })

  it('topSuggested picks the first suggested, un-quizzed node in path order', () => {
    expect(topSuggested(defaultLearn())!.id).toBe(a1.id)
    expect(topSuggested(learnWith(prog(a1.id, { quizPassedAt: TODAY })))!.id).toBe(a2.id)
  })

  it('topSuggested is null when every node is mastered', () => {
    const all = learnWith(...NODES.map((n) => prog(n.id, { quizPassedAt: TODAY, appliedAt: TODAY })))
    expect(topSuggested(all)).toBeNull()
    expect(masteredCount(all)).toBe(NODES.length)
  })
})

describe('branchProgress', () => {
  it('counts read / quizzed / mastered against the branch roster', () => {
    const flow = nodesInBranch('flow')
    const l = learnWith(
      prog(flow[0].id, { quizPassedAt: TODAY, appliedAt: TODAY }),
      prog(flow[1].id, { quizPassedAt: TODAY }),
      prog(flow[2].id),
    )
    expect(branchProgress('flow', l)).toEqual({ branch: 'flow', total: flow.length, read: 3, quizzed: 2, mastered: 1 })
  })
})

describe('reviewDue', () => {
  it('returns cards due on or before today, most overdue first', () => {
    const q = (i: number, j: 0 | 1) => NODES[i].quiz[j].id
    const l: LearnState = {
      ...defaultLearn(),
      cards: [
        { questionId: q(0, 0), box: 1, due: '2026-10-17', updatedAt: ISO },
        { questionId: q(0, 1), box: 2, due: TODAY, updatedAt: ISO },
        { questionId: q(1, 0), box: 3, due: '2026-10-10', updatedAt: ISO },
      ],
    }
    expect(reviewDue(l, TODAY).map((c) => c.questionId)).toEqual([q(1, 0), q(0, 1)])
  })
})

describe('isApplied — every ApplyId reads real state', () => {
  // [apply id, a state that satisfies it]; the default state satisfies none.
  const cases: Array<[ApplyId, () => AppState]> = [
    ['has-account', () => withMoney(base(), { accounts: [account()] })],
    ['confirm-balance', () => withMoney(base(), { accounts: [account({ anchorAt: '2026-10-01T09:00:00.000Z' })] })],
    ['fx-set', () => withMoney(base(), { settings: { ...base().money.settings, fxDaPerUsd: 240 } })],
    ['log-any', () => ({ ...base(), transactions: [tx(TODAY)] })],
    ['log-7-days', () => ({ ...base(), transactions: [1, 2, 3, 4, 5, 6, 8].map((d) => tx(`2026-10-0${d}`)) })],
    ['resisted', () => ({ ...base(), transactions: [tx(TODAY, { resistedImpulse: true, amountDA: 0 })] })],
    ['has-obligation', () => withMoney(base(), { obligations: [obligation()] })],
    ['paid-obligation', () => withMoney(base(), { obligations: [obligation()], payments: [payment()] })],
    ['installment-tracked', () => withMoney(base(), { obligations: [obligation({ kind: 'installment', installment: { total: 12, paidBefore: 2 } })] })],
    ['has-jar', () => withMoney(base(), { jars: [jar()] })],
    ['jar-with-target', () => withMoney(base(), { jars: [jar({ target: 20000 })] })],
    ['emergency-jar', () => withMoney(base(), { jars: [jar({ name: 'Emergency cushion', target: 30000 })] })],
    ['payday-split', () => withMoney(base(), { settings: { ...base().money.settings, split: [{ jarId: 'j', amount: 5000 }] } })],
    ['has-charm', () => withMoney(base(), { charms: [{ id: 'c', kind: 'roundup', jarId: 'j', category: null, value: 100, since: TODAY, active: true, archived: false, updatedAt: ISO }] })],
    ['set-brake', () => ({ ...base(), support: { ...base().support, brakes: { thresholdDA: 5000, categories: [], delayHours: 24 } as unknown as AppState['support']['brakes'] } })],
    ['profile-set', () => ({ ...base(), profile: { monthlyIncome: 50000, monthlyEssentials: 30000, efBalance: null, debt: null, goal: null, savedDate: TODAY } })],
    ['ran-sim', () => ({ ...base(), xpLog: [{ id: 'quest:sim:x', action: 'runSimulation', amount: 15, date: TODAY }] })],
    ['has-tontine', () => ({ ...base(), social: { tontines: [{ id: 't', archived: false }] } as unknown as AppState['social'] })],
    ['has-iou', () => ({ ...base(), social: { ious: [{ id: 'i', archived: false }] } as unknown as AppState['social'] })],
    ['used-zakat', () => ({ ...base(), social: { zakat: { goldPricePerGram: 12000, savedAt: ISO } } as unknown as AppState['social'] })],
    ['inbox-confirmed', () => ({ ...base(), inbox: { candidates: [{ id: 'c', status: 'confirmed' }] } as unknown as AppState['inbox'] })],
    ['trusted-set', () => ({ ...base(), support: { ...base().support, trusted: { name: 'Amina', options: base().support.trusted?.options ?? ({} as never) } } })],
    ['recurring-reviewed', () => withMoney(base(), { obligations: [obligation(), obligation({ id: 'o2', name: 'Idoom', kind: 'subscription' })] })],
  ]

  it('covers every ApplyId in the curriculum type', () => {
    expect(cases.map(([id]) => id).sort()).toEqual((Object.keys(APPLY_INFO) as ApplyId[]).sort())
  })

  for (const [id, make] of cases) {
    it(`${id}: false on a fresh state, true once the evidence exists`, () => {
      expect(isApplied(id, base(), TODAY)).toBe(false)
      expect(isApplied(id, make(), TODAY)).toBe(true)
    })
  }

  it('stub social / inbox slices read as not-yet, never throw', () => {
    const s = base() // stubs: { v: 1 }
    for (const id of ['has-tontine', 'has-iou', 'used-zakat', 'inbox-confirmed'] as const) {
      expect(isApplied(id, s, TODAY)).toBe(false)
    }
    const odd = { ...s, social: { tontines: 'x', ious: [null, 3], zakat: [] }, inbox: { candidates: [{ status: 'pending' }] } } as unknown as AppState
    for (const id of ['has-tontine', 'has-iou', 'used-zakat', 'inbox-confirmed'] as const) {
      expect(isApplied(id, odd, TODAY)).toBe(false)
    }
  })

  it('archived rows never count', () => {
    expect(isApplied('has-jar', withMoney(base(), { jars: [jar({ archived: true })] }), TODAY)).toBe(false)
    expect(isApplied('has-account', withMoney(base(), { accounts: [account({ archived: true })] }), TODAY)).toBe(false)
    const tont = { ...base(), social: { tontines: [{ id: 't', archived: true }] } as unknown as AppState['social'] }
    expect(isApplied('has-tontine', tont, TODAY)).toBe(false)
  })

  it('a voided payment is not a paid bill', () => {
    const s = withMoney(base(), { obligations: [obligation()], payments: [payment({ void: true })] })
    expect(isApplied('paid-obligation', s, TODAY)).toBe(false)
  })

  it('emergency-jar needs both the name and a target', () => {
    expect(isApplied('emergency-jar', withMoney(base(), { jars: [jar({ name: 'Emergency' })] }), TODAY)).toBe(false)
    expect(isApplied('emergency-jar', withMoney(base(), { jars: [jar({ target: 5000 })] }), TODAY)).toBe(false)
  })

  it('confirm-balance: an old anchor counts only if it was re-confirmed after use', () => {
    const old = account({ anchorAt: '2026-06-10T09:00:00.000Z' })
    expect(isApplied('confirm-balance', withMoney(base(), { accounts: [old] }), TODAY)).toBe(false)
    const used = { ...withMoney(base(), { accounts: [old] }), transactions: [tx('2026-06-01', { accountId: 'acc' })] }
    expect(isApplied('confirm-balance', used, TODAY)).toBe(true)
  })

  it('recurring-reviewed ignores one-off obligations', () => {
    const s = withMoney(base(), { obligations: [obligation(), obligation({ id: 'o2', cadence: 'once' })] })
    expect(isApplied('recurring-reviewed', s, TODAY)).toBe(false)
  })

  it('log-7-days counts distinct days, not rows', () => {
    const s = { ...base(), transactions: Array.from({ length: 10 }, () => tx(TODAY)) }
    expect(isApplied('log-7-days', s, TODAY)).toBe(false)
  })
})
