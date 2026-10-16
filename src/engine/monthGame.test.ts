import { describe, it, expect } from 'vitest'
import {
  CHARACTERS,
  EVENTS,
  WEEKS,
  advance,
  availableChoices,
  choose,
  currentEvent,
  isGameState,
  isOver,
  mulberry32,
  newGame,
  summary,
  weekDone,
  type CharacterId,
  type GameState,
} from './monthGame.ts'
import { NODE_IDS } from '../content/curriculum.ts'

type Picker = (s: GameState) => string

const first: Picker = (s) => availableChoices(s)[0].id
const lastOf = <T,>(xs: T[]): T => xs[xs.length - 1]
const last: Picker = (s) => {
  const c = availableChoices(s)
  return lastOf(c).id
}

/** Play a whole month with a picker; returns every state along the way. */
function play(id: CharacterId, seed: number, pick: Picker = first): GameState[] {
  const states: GameState[] = []
  let s = newGame(id, seed)
  states.push(s)
  for (let steps = 0; !isOver(s); steps++) {
    if (steps > 50) throw new Error('game did not end')
    s = weekDone(s) ? advance(s) : choose(s, pick(s))
    states.push(s)
  }
  return states
}

/** Build a state sitting on a specific event (queue overridden). */
function onEvent(eventId: string, id: CharacterId = 'samira', week = 1): GameState {
  const s = newGame(id, 1)
  return { ...s, week, queue: [eventId], eventIdx: 0, used: [...s.used, eventId] }
}

/** Advance through the remaining weeks choosing first options, collecting notices. */
function runOut(s: GameState): { end: GameState; notices: string[] } {
  const notices: string[] = []
  let steps = 0
  while (!isOver(s)) {
    if (steps++ > 50) throw new Error('loop')
    if (weekDone(s)) {
      s = advance(s)
      notices.push(...s.notices.map((n) => n.text))
    } else s = choose(s, first(s))
  }
  return { end: s, notices }
}

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    let a = 42
    let b = 42
    for (let i = 0; i < 100; i++) {
      const [x, na] = mulberry32(a)
      const [y, nb] = mulberry32(b)
      expect(x).toBe(y)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      a = na
      b = nb
    }
  })
})

describe('Hearth Month engine', () => {
  it('has 3–4 characters and ~18 events with 2–3 choices each, unique ids', () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(3)
    expect(CHARACTERS.length).toBeLessThanOrEqual(4)
    expect(EVENTS.length).toBeGreaterThanOrEqual(18)
    const ids = new Set<string>()
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2)
      expect(e.choices.length).toBeLessThanOrEqual(3)
      for (const c of e.choices) {
        expect(ids.has(c.id)).toBe(false)
        ids.add(c.id)
      }
    }
    expect(EVENTS.some((e) => e.choices.some((c) => c.later?.length))).toBe(true)
  })

  it('is deterministic per seed', () => {
    for (const c of CHARACTERS) {
      expect(play(c.id, 1234)).toEqual(play(c.id, 1234))
      expect(play(c.id, 99, last)).toEqual(play(c.id, 99, last))
    }
    // Different seeds give different months somewhere across the cast.
    const a = CHARACTERS.map((c) => play(c.id, 1).slice(-1)[0].used.join())
    const b = CHARACTERS.map((c) => play(c.id, 2).slice(-1)[0].used.join())
    expect(a).not.toEqual(b)
  })

  it('always ends after week 4, never negative, warmth in range', () => {
    for (const c of CHARACTERS) {
      for (let seed = 0; seed < 40; seed++) {
        for (const pick of [first, last]) {
          const states = play(c.id, seed, pick)
          const end = states.slice(-1)[0]
          expect(end.week).toBe(WEEKS + 1)
          expect(isOver(end)).toBe(true)
          expect(availableChoices(end)).toEqual([])
          expect(currentEvent(end)).toBeNull()
          const weeks = new Set(end.log.map((l) => l.week))
          expect([...weeks].sort()).toEqual([1, 2, 3, 4])
          for (const s of states) {
            expect(s.cash).toBeGreaterThanOrEqual(0)
            expect(s.jar).toBeGreaterThanOrEqual(0)
            expect(s.warmth).toBeGreaterThanOrEqual(0)
            expect(s.warmth).toBeLessThanOrEqual(100)
            expect(isGameState(JSON.parse(JSON.stringify(s)))).toBe(true)
          }
          // Choosing after the end is a no-op.
          expect(choose(end, EVENTS[0].choices[0].id)).toBe(end)
        }
      }
    }
  })

  it('applies every choice of every event, effects matching the declared ones', () => {
    for (const e of EVENTS) {
      for (const ch of e.choices) {
        // Rich start so no shortfall muddies the arithmetic.
        const s0 = { ...onEvent(e.id), cash: 100_000, jar: 50_000, owed: 0 }
        const views = availableChoices(s0)
        expect(views.map((v) => v.id)).toEqual(e.choices.map((c) => c.id))
        expect(views.every((v) => v.label.length > 0)).toBe(true)
        const s1 = choose(s0, ch.id)
        expect(s1).not.toBe(s0)
        const fx = ch.effect
        expect(s1.cash).toBe(s0.cash + (fx.cash ?? 0))
        expect(s1.jar).toBe(s0.jar + (fx.jar ?? 0))
        expect(s1.owedToMe).toBe(s0.owedToMe + (fx.owedToMe ?? 0))
        expect(s1.warmth).toBe(Math.min(100, Math.max(0, s0.warmth + (fx.warmth ?? 0))))
        expect(s1.pending.length).toBe(s0.pending.length + (ch.later?.length ?? 0))
        expect(s1.log[s1.log.length - 1]).toMatchObject({ eventId: e.id, choiceId: ch.id })
        expect(s1.lastOutcome?.text.length).toBeGreaterThan(0)
      }
    }
  })

  it('rejects a choice that is not on the current event', () => {
    const s = onEvent('flash-sale')
    expect(choose(s, 'fever:go')).toBe(s)
    expect(choose(s, 'nope')).toBe(s)
  })

  it('scales event amounts for the student', () => {
    const s = { ...onEvent('cousin-wedding', 'lina'), cash: 50_000 }
    const s1 = choose(s, 'cousin-wedding:full')
    expect(s1.cash).toBe(50_000 - 4_000)
    expect(availableChoices(s)[0].label).toContain('4,000 DA')
  })

  it('a cash shortfall becomes a gentle family IOU, a jar shortfall falls to cash', () => {
    const s = { ...onEvent('cousin-wedding'), cash: 3_000, jar: 0 }
    const s1 = choose(s, 'cousin-wedding:full')
    expect(s1.cash).toBe(0)
    expect(s1.owed).toBe(7_000)
    expect(s1.lastOutcome?.notes.join(' ')).toMatch(/IOU/)
    const j = { ...onEvent('fever'), cash: 10_000, jar: 1_000 }
    const j1 = choose(j, 'fever:jar')
    expect(j1.jar).toBe(0)
    expect(j1.cash).toBe(7_500)
  })

  it('delayed effects fire on schedule: installment bill next week', () => {
    const s = { ...onEvent('installment-offer', 'samira', 1), cash: 50_000 }
    const s1 = choose(s, 'installment-offer:sign')
    expect(s1.pending.map((p) => p.week)).toEqual([2, 6])
    const s2 = advance(s1)
    expect(s2.week).toBe(2)
    const bill = s2.bills.find((b) => b.label.startsWith('Speaker installment'))
    expect(bill).toBeDefined()
    expect(bill!.dueWeek).toBe(2)
    expect(s2.notices.some((n) => n.kind === 'landed' && /installment 1 of 12/.test(n.text))).toBe(true)
    // The rest of the installments are listed for next month.
    const { end } = runOut(s2)
    expect(end.ahead.some((a) => /installments 2–12/.test(a))).toBe(true)
  })

  it('delayed effects fire on schedule: a cracked screen gets worse two weeks later', () => {
    const s1 = choose(onEvent('cracked-screen', 'samira', 1), 'cracked-screen:wait')
    expect(s1.pending[0].week).toBe(3)
    const s2 = advance(s1)
    expect(s2.bills.some((b) => b.label.startsWith('Screen repair'))).toBe(false)
    let s = s2
    while (s.week < 3) s = weekDone(s) ? advance(s) : choose(s, first(s))
    expect(s.bills.some((b) => b.label.startsWith('Screen repair') && b.dueWeek === 3)).toBe(true)
  })

  it('lending resolves in week 4, seeded: sometimes back, sometimes not', () => {
    const outcomes = new Set<string>()
    for (let seed = 0; seed < 40; seed++) {
      const base = newGame('samira', seed)
      const s0 = { ...base, queue: ['friend-borrow'], eventIdx: 0, cash: 30_000, used: [...base.used, 'friend-borrow'] }
      const s1 = choose(s0, 'friend-borrow:full')
      expect(s1.owedToMe).toBe(5_000)
      expect(s1.pending[0].week).toBe(4)
      let s = s1
      while (s.week < 4) s = weekDone(s) ? advance(s) : choose(s, first(s))
      expect(s.pending.some((p) => p.kind === 'repay')).toBe(false)
      const repaid = s.flags.includes('repaid')
      outcomes.add(repaid ? 'repaid' : 'not')
      expect(s.notices.some((n) => /Amine/.test(n.text))).toBe(true)
      if (repaid) expect(s.owedToMe).toBe(0)
      else expect(s.owedToMe).toBe(5_000)
      // Same seed, same luck.
      let t = s1
      while (t.week < 4) t = weekDone(t) ? advance(t) : choose(t, first(t))
      expect(t.flags.includes('repaid')).toBe(repaid)
    }
    expect(outcomes).toEqual(new Set(['repaid', 'not']))
  })

  it('a loan made in week 4 is carried into next month, not lost', () => {
    const s1 = choose({ ...onEvent('friend-borrow', 'samira', 4), cash: 20_000 }, 'friend-borrow:full')
    const { end } = runOut(s1)
    expect(end.owedToMe).toBe(5_000)
    expect(end.ahead.some((a) => /still out/.test(a))).toBe(true)
    expect(summary(end).lessons.some((l) => l.nodeId === 'f4-lending-to-friends')).toBe(true)
    expect(summary(end).lessons.find((l) => l.nodeId === 'f4-lending-to-friends')!.text).toMatch(/hasn't come back/)
  })

  it('unpaid bills roll into catch-up instead of ending anything', () => {
    const s = newGame('karim', 5)
    // Drain cash so week-2 bills cannot be paid.
    const broke = { ...s, cash: 0 }
    const { end } = runOut({ ...broke, eventIdx: broke.queue.length })
    const sum = summary(end)
    expect(isOver(end)).toBe(true)
    expect(sum.billsTotal).toBeGreaterThan(0)
    expect(sum.billsPaid + sum.catchUp.length).toBe(sum.billsTotal)
  })

  it('freelancer income arrives in three uneven chunks summing to the month', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = newGame('yacine', seed)
      expect(s.incomes.length).toBe(3)
      expect(s.incomes.reduce((a, i) => a + i.amount, 0)).toBe(64_000)
      expect(new Set(s.incomes.map((i) => i.amount)).size).toBeGreaterThan(1)
    }
  })

  it('summary: three lessons, valid node ids, a kind title', () => {
    const banned = /fail|lose|bad/i
    const titles = new Set<string>()
    for (const c of CHARACTERS) {
      for (let seed = 0; seed < 30; seed++) {
        for (const pick of [first, last]) {
          const end = play(c.id, seed, pick).slice(-1)[0]
          const sum = summary(end)
          expect(sum.lessons).toHaveLength(3)
          expect(new Set(sum.lessons.map((l) => l.nodeId)).size).toBe(3)
          for (const l of sum.lessons) {
            expect(NODE_IDS.has(l.nodeId)).toBe(true)
            expect(l.text.length).toBeGreaterThan(20)
          }
          expect(sum.title).not.toMatch(banned)
          expect(sum.titleLine).not.toMatch(banned)
          titles.add(sum.title)
        }
      }
    }
    expect(titles.size).toBeGreaterThan(1)
  })

  it('lessons come from the actual choices', () => {
    const s1 = choose({ ...onEvent('sure-thing', 'samira', 1), cash: 40_000 }, 'sure-thing:send')
    const { end } = runOut(s1)
    expect(summary(end).lessons[0].nodeId).toBe('g6-after-a-scam')
    const t1 = choose({ ...onEvent('installment-offer', 'samira', 1), cash: 40_000 }, 'installment-offer:sign')
    expect(summary(runOut(t1).end).lessons.some((l) => l.nodeId === 'c2-true-cost')).toBe(true)
  })

  it('isGameState rejects junk', () => {
    expect(isGameState(null)).toBe(false)
    expect(isGameState({})).toBe(false)
    expect(isGameState({ ...newGame('samira', 1), characterId: 'ghost' })).toBe(false)
    expect(isGameState({ ...newGame('samira', 1), queue: ['nope'] })).toBe(false)
    expect(isGameState(newGame('samira', 1))).toBe(true)
  })
})
