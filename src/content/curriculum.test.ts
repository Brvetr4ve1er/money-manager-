import { describe, it, expect } from 'vitest'
import { BRANCHES, NODES, NODE_IDS, nodeById, nodesInBranch } from './curriculum.ts'

/**
 * Every node id from the curriculum report's skill tree, in table order. The
 * report's heading says "52 nodes" but its tables list 55; all 55 ship so no
 * report id is dropped or renamed.
 */
const REPORT_IDS = [
  'a1-where-money-goes', 'a2-money-in-money-out', 'a3-the-calendar', 'a4-needs-wants-later',
  'a5-cash-envelopes', 'a6-the-48h-rule', 'a7-leaks', 'a8-breathing-room',
  'b1-why-a-cushion', 'b2-first-10000', 'b3-where-to-keep-it', 'b4-sinking-funds',
  'b5-goal-math', 'b6-rebuild-after-use', 'b7-three-months', 'b8-saving-with-others',
  'c1-what-is-debt', 'c2-true-cost', 'c3-riba-vs-markup', 'c4-cash-flow-fit',
  'c5-owing-to-people', 'c6-debt-snowball', 'c7-credit-later',
  'd1-price-of-bread', 'd2-two-rates', 'd3-cash-loses-value', 'd4-budget-in-real-terms',
  'd5-fx-decisions', 'd6-wage-vs-prices',
  'e1-map-your-income', 'e2-irregular-income-budget', 'e3-price-your-work',
  'e4-getting-paid-safely', 'e5-informal-to-formal', 'e6-income-shock-plan',
  'f1-the-family-line', 'f2-saying-yes-with-limits', 'f3-tontine-mechanics',
  'f4-lending-to-friends', 'f5-zakat-sadaqa', 'f6-shared-household', 'f7-big-events',
  'g1-the-four-red-flags', 'g2-your-ccp-is-your-vault', 'g3-marketplace-scams',
  'g4-qr-and-sms', 'g5-job-visa-investment', 'g6-after-a-scam',
  'j1-save-vs-invest', 'j2-risk-and-time', 'j3-what-exists-locally', 'j4-halal-lens',
  'j5-gold-property-business', 'j6-first-100000', 'j7-diversify-and-ignore',
]
const NODE_COUNT = REPORT_IDS.length

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

/** All learner-facing lesson and quiz text of a node. */
function lessonAndQuizText(n: (typeof NODES)[number]): string[] {
  return [
    n.lesson,
    ...n.quiz.flatMap((q) => [q.prompt, ...q.options.flatMap((o) => [o.text, o.why])]),
  ]
}

describe('branches', () => {
  it('has 8 branches with unique ids and unique orders 1..8', () => {
    expect(BRANCHES).toHaveLength(8)
    expect(new Set(BRANCHES.map((b) => b.id)).size).toBe(8)
    expect(BRANCHES.map((b) => b.order).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    for (const b of BRANCHES) {
      expect(b.title.length).toBeGreaterThan(0)
      expect(b.blurb.length).toBeGreaterThan(0)
      expect(b.emoji.length).toBeGreaterThan(0)
    }
  })
})

describe('nodes', () => {
  it('ships every report node, with unique ids exactly as in the report', () => {
    expect(NODES).toHaveLength(NODE_COUNT)
    expect(new Set(NODES.map((n) => n.id)).size).toBe(NODE_COUNT)
    expect(NODES.map((n) => n.id).sort()).toEqual([...REPORT_IDS].sort())
  })

  it('every node belongs to an existing branch', () => {
    const ids = new Set(BRANCHES.map((b) => b.id))
    for (const n of NODES) expect(ids.has(n.branch)).toBe(true)
  })

  it('orders within each branch are contiguous 1..n', () => {
    for (const b of BRANCHES) {
      const orders = nodesInBranch(b.id).map((n) => n.order)
      expect(orders.length).toBeGreaterThan(0)
      expect(orders).toEqual(orders.map((_, i) => i + 1))
    }
  })

  it('prereqs reference existing nodes, never self, and same-branch prereqs come earlier', () => {
    for (const n of NODES) {
      for (const p of n.prereqs) {
        expect(NODE_IDS.has(p), `${n.id} → ${p}`).toBe(true)
        expect(p).not.toBe(n.id)
        const pre = nodeById(p)!
        if (pre.branch === n.branch) expect(pre.order).toBeLessThan(n.order)
      }
    }
  })

  it('prereqs form no cycles', () => {
    const state = new Map<string, 'visiting' | 'done'>()
    const visit = (id: string, path: string[]): void => {
      const s = state.get(id)
      if (s === 'done') return
      if (s === 'visiting') throw new Error(`cycle: ${[...path, id].join(' → ')}`)
      state.set(id, 'visiting')
      for (const p of nodeById(id)!.prereqs) visit(p, [...path, id])
      state.set(id, 'done')
    }
    expect(() => NODES.forEach((n) => visit(n.id, []))).not.toThrow()
  })

  it('every node has its required one-line fields filled', () => {
    for (const n of NODES) {
      expect(n.title.length).toBeGreaterThan(0)
      expect(n.objective.length).toBeGreaterThan(0)
      expect(n.misconception.length).toBeGreaterThan(0)
      expect(n.tryIt.length).toBeGreaterThan(0)
    }
  })
})

describe('lessons', () => {
  it('are at most 120 words, in 2–4 paragraphs', () => {
    for (const n of NODES) {
      expect(words(n.lesson), n.id).toBeLessThanOrEqual(120)
      const paras = n.lesson.split('\n\n')
      expect(paras.length, n.id).toBeGreaterThanOrEqual(2)
      expect(paras.length, n.id).toBeLessThanOrEqual(4)
      for (const p of paras) expect(p.trim().length).toBeGreaterThan(0)
    }
  })

  it('never say "you should" or "guaranteed" in lesson or quiz text', () => {
    for (const n of NODES) {
      for (const t of lessonAndQuizText(n)) {
        expect(t, n.id).not.toMatch(/you should/i)
        expect(t, n.id).not.toMatch(/guaranteed/i)
      }
    }
  })

  it('use DA, never foreign currency symbols', () => {
    for (const n of NODES) {
      for (const t of [...lessonAndQuizText(n), n.tryIt]) expect(t, n.id).not.toMatch(/[$€£]/)
    }
  })
})

describe('quizzes', () => {
  it('each node has 2 questions × 4 options, exactly one correct, every why filled', () => {
    for (const n of NODES) {
      expect(n.quiz).toHaveLength(2)
      for (const q of n.quiz) {
        expect(q.prompt.length).toBeGreaterThan(0)
        expect(q.options).toHaveLength(4)
        expect(q.options.filter((o) => o.correct)).toHaveLength(1)
        for (const o of q.options) {
          expect(o.text.trim().length).toBeGreaterThan(0)
          expect(o.why.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('question ids are unique across the curriculum', () => {
    const ids = NODES.flatMap((n) => n.quiz.map((q) => q.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('lookups', () => {
  it('NODE_IDS covers every node', () => {
    expect(NODE_IDS.size).toBe(NODE_COUNT)
  })

  it('nodeById round-trips every id and misses unknown ones', () => {
    for (const n of NODES) expect(nodeById(n.id)).toBe(n)
    expect(nodeById('nope')).toBeUndefined()
  })

  it('nodesInBranch partitions all nodes', () => {
    const total = BRANCHES.reduce((s, b) => s + nodesInBranch(b.id).length, 0)
    expect(total).toBe(NODE_COUNT)
  })
})
