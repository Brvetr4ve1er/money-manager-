import { describe, it, expect } from 'vitest'
import {
  LEITNER_INTERVALS,
  QUESTION_IDS,
  defaultLearn,
  learnReducer,
  mergeLearn,
  sanitizeLearn,
  type LearnState,
  type ReviewCard,
} from './learn.ts'
import { NODES } from '../../content/curriculum.ts'
import { addDaysISO } from '../../engine/dates.ts'
import { defaultState, mergeStates, sanitizeState } from '../store.ts'

const A = NODES[0].id
const B = NODES[1].id
const Q1 = NODES[0].quiz[0].id
const Q2 = NODES[0].quiz[1].id
const T = '2026-10-16'

const card = (over: Partial<ReviewCard> = {}): ReviewCard => ({
  questionId: Q1,
  box: 1,
  due: '2026-10-17',
  updatedAt: '2026-10-16T10:00:00.000Z',
  ...over,
})

describe('learn slice — sanitize', () => {
  it('returns defaults for garbage', () => {
    for (const v of [null, 42, 'x', [], { progress: 'no' }]) {
      expect(sanitizeLearn(v)).toEqual(defaultLearn())
    }
  })

  it('drops unknown node and question ids', () => {
    const s = sanitizeLearn({
      progress: [
        { nodeId: A, readAt: T, quizPassedAt: null, appliedAt: null },
        { nodeId: 'z9-made-up', readAt: T, quizPassedAt: null, appliedAt: null },
      ],
      cards: [card(), card({ questionId: 'nope/q1' })],
    })
    expect(s.progress.map((p) => p.nodeId)).toEqual([A])
    expect(s.cards.map((c) => c.questionId)).toEqual([Q1])
  })

  it('nulls bad days, drops empty records, rejects bad boxes and stamps', () => {
    const s = sanitizeLearn({
      progress: [
        { nodeId: A, readAt: '2026-02-30', quizPassedAt: T, appliedAt: 7 },
        { nodeId: B, readAt: null, quizPassedAt: 'nah', appliedAt: null },
      ],
      cards: [
        card({ box: 6 as 1 }),
        card({ questionId: Q2, box: 2.5 as 1 }),
        card({ questionId: NODES[1].quiz[0].id, updatedAt: 'yesterday' }),
        card({ questionId: NODES[1].quiz[1].id, due: '2026-13-01' }),
      ],
      lastReviewDay: 'later',
    })
    expect(s.progress).toEqual([{ nodeId: A, readAt: null, quizPassedAt: T, appliedAt: null }])
    expect(s.cards).toEqual([])
    expect(s.lastReviewDay).toBe('')
  })

  it('collapses duplicates through the merge rules and sorts canonically', () => {
    const s = sanitizeLearn({
      progress: [
        { nodeId: B, readAt: '2026-10-10', quizPassedAt: null, appliedAt: null },
        { nodeId: A, readAt: '2026-10-12', quizPassedAt: null, appliedAt: null },
        { nodeId: A, readAt: '2026-10-11', quizPassedAt: '2026-10-13', appliedAt: null },
      ],
    })
    expect(s.progress).toEqual([
      { nodeId: A, readAt: '2026-10-11', quizPassedAt: '2026-10-13', appliedAt: null },
      { nodeId: B, readAt: '2026-10-10', quizPassedAt: null, appliedAt: null },
    ].sort((x, y) => (x.nodeId < y.nodeId ? -1 : 1)))
  })

  it('every curriculum question id is a valid review card id', () => {
    expect(QUESTION_IDS.size).toBe(NODES.length * 2)
  })
})

describe('learn slice — merge', () => {
  const a: LearnState = {
    progress: [{ nodeId: A, readAt: '2026-10-05', quizPassedAt: null, appliedAt: '2026-10-09' }],
    cards: [card({ box: 2, updatedAt: '2026-10-16T10:00:00Z' })],
    lastReviewDay: '2026-10-15',
  }
  const b: LearnState = {
    progress: [
      { nodeId: A, readAt: '2026-10-07', quizPassedAt: '2026-10-08', appliedAt: null },
      { nodeId: B, readAt: '2026-10-01', quizPassedAt: null, appliedAt: null },
    ],
    // Same instant written with milliseconds — compared as instants, the
    // later one is the 10:00:00.500 edit.
    cards: [card({ box: 3, updatedAt: '2026-10-16T10:00:00.500Z' }), card({ questionId: Q2 })],
    lastReviewDay: '2026-10-16',
  }

  it('keeps the EARLIEST non-null day per field — progress never regresses', () => {
    const m = mergeLearn(a, b)
    expect(m.progress.find((p) => p.nodeId === A)).toEqual({
      nodeId: A,
      readAt: '2026-10-05',
      quizPassedAt: '2026-10-08',
      appliedAt: '2026-10-09',
    })
    expect(m.progress).toHaveLength(2)
  })

  it('newer card updatedAt wins (as instants), and unions the rest', () => {
    const m = mergeLearn(a, b)
    expect(m.cards.find((c) => c.questionId === Q1)!.box).toBe(3)
    expect(m.cards).toHaveLength(2)
    expect(m.lastReviewDay).toBe('2026-10-16')
  })

  it('is commutative, idempotent and a sanitize fixpoint', () => {
    const ab = mergeLearn(a, b)
    expect(JSON.stringify(ab)).toBe(JSON.stringify(mergeLearn(b, a)))
    expect(JSON.stringify(mergeLearn(ab, ab))).toBe(JSON.stringify(ab))
    expect(JSON.stringify(sanitizeLearn(JSON.parse(JSON.stringify(ab))))).toBe(JSON.stringify(ab))
  })

  it('ties on updatedAt break symmetrically', () => {
    const x = { ...a, cards: [card({ box: 2 })] }
    const y = { ...a, cards: [card({ box: 4 })] }
    expect(JSON.stringify(mergeLearn(x, y))).toBe(JSON.stringify(mergeLearn(y, x)))
  })

  it('round-trips through the whole-app sanitize + merge fixpoint', () => {
    const s1 = sanitizeState({ ...defaultState(), learn: a })
    const s2 = sanitizeState({ ...defaultState(), learn: b })
    const m = mergeStates(s1, s2)
    expect(mergeStates(m, m)).toBe(m)
    expect(JSON.stringify(sanitizeState(JSON.parse(JSON.stringify(m))).learn)).toBe(JSON.stringify(m.learn))
  })
})

describe('learn slice — reducer', () => {
  it('learn/read stamps the first read only, and ignores unknown ids', () => {
    const s1 = learnReducer(defaultLearn(), { type: 'learn/read', nodeId: A, today: T })
    expect(s1.progress).toEqual([{ nodeId: A, readAt: T, quizPassedAt: null, appliedAt: null }])
    expect(learnReducer(s1, { type: 'learn/read', nodeId: A, today: '2026-10-20' })).toBe(s1)
    expect(learnReducer(s1, { type: 'learn/read', nodeId: 'ghost', today: T })).toBe(s1)
    expect(learnReducer(s1, { type: 'learn/read', nodeId: B, today: 'nope' })).toBe(s1)
  })

  it('learn/quiz-passed implies read and seeds both questions into box 1, due tomorrow', () => {
    const s = learnReducer(defaultLearn(), { type: 'learn/quiz-passed', nodeId: A, today: T })
    expect(s.progress[0]).toEqual({ nodeId: A, readAt: T, quizPassedAt: T, appliedAt: null })
    expect(s.cards.map((c) => [c.questionId, c.box, c.due])).toEqual([
      [Q1, 1, '2026-10-17'],
      [Q2, 1, '2026-10-17'],
    ])
    // A second pass changes nothing (and never resets review progress).
    expect(learnReducer(s, { type: 'learn/quiz-passed', nodeId: A, today: '2026-10-18' })).toBe(s)
  })

  it('learn/applied needs a pass first, then stamps once', () => {
    const fresh = learnReducer(defaultLearn(), { type: 'learn/read', nodeId: A, today: T })
    expect(learnReducer(fresh, { type: 'learn/applied', nodeId: A, today: T })).toBe(fresh)
    const passed = learnReducer(fresh, { type: 'learn/quiz-passed', nodeId: A, today: T })
    const applied = learnReducer(passed, { type: 'learn/applied', nodeId: A, today: '2026-10-17' })
    expect(applied.progress[0].appliedAt).toBe('2026-10-17')
    expect(learnReducer(applied, { type: 'learn/applied', nodeId: A, today: '2026-10-20' })).toBe(applied)
  })

  it('Leitner: correct climbs a box with intervals 1,3,7,14,30 and caps at 5', () => {
    let s = learnReducer(defaultLearn(), { type: 'learn/quiz-passed', nodeId: A, today: T })
    let day = '2026-10-17'
    const seen: Array<[number, string]> = []
    for (let i = 0; i < 5; i++) {
      s = learnReducer(s, { type: 'learn/review-answer', questionId: Q1, correct: true, today: day })
      const c = s.cards.find((x) => x.questionId === Q1)!
      seen.push([c.box, c.due])
      day = c.due
    }
    expect(seen.map(([b]) => b)).toEqual([2, 3, 4, 5, 5])
    let prev = '2026-10-17'
    seen.forEach(([box, due]) => {
      expect(due).toBe(addDaysISO(prev, LEITNER_INTERVALS[box - 1]))
      prev = due
    })
    expect(s.lastReviewDay).toBe(seen[3][1])
  })

  it('Leitner: a wrong answer only sends the card to box 1, due tomorrow', () => {
    let s = learnReducer(defaultLearn(), { type: 'learn/quiz-passed', nodeId: A, today: T })
    s = learnReducer(s, { type: 'learn/review-answer', questionId: Q1, correct: true, today: '2026-10-17' })
    s = learnReducer(s, { type: 'learn/review-answer', questionId: Q1, correct: false, today: '2026-10-20' })
    const c = s.cards.find((x) => x.questionId === Q1)!
    expect([c.box, c.due]).toEqual([1, '2026-10-21'])
    // Nothing else moved: the node stays passed.
    expect(s.progress[0].quizPassedAt).toBe(T)
  })

  it('review edits always out-date the copy they replace', () => {
    let s = learnReducer(defaultLearn(), {
      type: 'learn/quiz-passed', nodeId: A, today: T, nowISO: '2026-10-16T20:00:00.000Z',
    })
    const before = s.cards[0]
    s = learnReducer(s, { type: 'learn/review-answer', questionId: Q1, correct: true, today: T })
    const after = s.cards.find((x) => x.questionId === Q1)!
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt))
    // A peer still holding the old card loses the merge.
    const peer: LearnState = { ...s, cards: [before] }
    expect(mergeLearn(s, peer).cards.find((x) => x.questionId === Q1)!.box).toBe(2)
  })

  it('review of an unknown card is a no-op', () => {
    const s = defaultLearn()
    expect(learnReducer(s, { type: 'learn/review-answer', questionId: Q1, correct: true, today: T })).toBe(s)
  })
})
