import { describe, it, expect } from 'vitest'
import { appReducer } from './reducer.ts'
import { defaultState, mergeStates, type AppState } from './store.ts'
import { nodeById } from '../content/curriculum.ts'
import { XP_REWARDS } from '../engine/xp.ts'
import { achievementById, ACHIEVEMENT_IDS, newlyEarnedIds } from '../engine/achievements.ts'
import { BRANCHES, nodesInBranch } from '../content/curriculum.ts'
import type { Jar } from './slices/money.ts'

const TODAY = '2026-10-16'
const ISO = '2026-10-16T09:00:00.000Z'
const JAR_NODE = 'a8-breathing-room' // apply: has-jar
const NULL_NODE = 'c3-riba-vs-markup' // apply: null

const fresh = (): AppState => ({ ...defaultState(), questsDate: TODAY })
const jar: Jar = { id: 'j', name: 'Eid', emoji: '🫙', target: null, targetDate: null, locked: false, archived: false, updatedAt: ISO }
const withJar = (s: AppState): AppState => appReducer(s, { type: 'money/jar-upsert', jar })
const pass = (s: AppState, nodeId: string, today = TODAY) => appReducer(s, { type: 'LEARN_QUIZ_PASS', nodeId, today })
const total = (s: AppState) => s.xp.totalXp

describe('LEARN_QUIZ_PASS', () => {
  it('records the pass, pays quizPass once ever, and completes the lesson quest', () => {
    const s1 = pass(fresh(), JAR_NODE)
    expect(s1.learn.progress[0].quizPassedAt).toBe(TODAY)
    expect(s1.learn.cards).toHaveLength(2)
    expect(s1.xpLog.map((g) => g.id)).toContain(`quiz:${JAR_NODE}`)
    expect(s1.quests.find((q) => q.id === 'lesson')!.done).toBe(true)
    expect(total(s1)).toBe(XP_REWARDS.quizPass + XP_REWARDS.readLesson)
    // A retake (even on another day) pays no second quizPass.
    const s2 = pass(s1, JAR_NODE, '2026-10-20')
    expect(total(s2)).toBe(total(s1))
    expect(s2.xpLog.filter((g) => g.action === 'quizPass')).toHaveLength(1)
  })

  it('ignores unknown nodes and bad days', () => {
    const s = fresh()
    expect(pass(s, 'ghost')).toBe(s)
    expect(pass(s, JAR_NODE, 'someday')).toBe(s)
  })

  it('two tabs passing the same node merge to a single grant', () => {
    const a = pass(fresh(), JAR_NODE)
    const b = pass(fresh(), JAR_NODE)
    const m = mergeStates(a, b)
    expect(m.xpLog.filter((g) => g.id === `quiz:${JAR_NODE}`)).toHaveLength(1)
  })
})

describe('LEARN_APPLY', () => {
  it('is refused until the real-state predicate holds and the quiz is passed', () => {
    const s = fresh()
    expect(appReducer(s, { type: 'LEARN_APPLY', nodeId: JAR_NODE, today: TODAY })).toBe(s)
    const passed = pass(s, JAR_NODE)
    // No jar yet: the reducer re-checks the predicate, never trusts the tap.
    expect(appReducer(passed, { type: 'LEARN_APPLY', nodeId: JAR_NODE, today: TODAY })).toBe(passed)
    // Jar, but no pass: still refused.
    const jarOnly = withJar(s)
    expect(appReducer(jarOnly, { type: 'LEARN_APPLY', nodeId: JAR_NODE, today: TODAY })).toBe(jarOnly)
  })

  it('pays nodeApplied once per node ever', () => {
    const ready = withJar(pass(fresh(), JAR_NODE))
    const a1 = appReducer(ready, { type: 'LEARN_APPLY', nodeId: JAR_NODE, today: TODAY })
    expect(a1.learn.progress[0].appliedAt).toBe(TODAY)
    expect(total(a1) - total(ready)).toBe(XP_REWARDS.nodeApplied)
    expect(appReducer(a1, { type: 'LEARN_APPLY', nodeId: JAR_NODE, today: '2026-10-17' })).toBe(a1)
  })

  it('nodes without an in-app action have nothing to apply', () => {
    const s = pass(fresh(), NULL_NODE)
    expect(appReducer(s, { type: 'LEARN_APPLY', nodeId: NULL_NODE, today: TODAY })).toBe(s)
  })
})

describe('LEARN_REVIEW', () => {
  const q1 = nodeById(JAR_NODE)!.quiz[0].id
  const q2 = nodeById(JAR_NODE)!.quiz[1].id

  it('pays reviewDone at most once per day, only for correct answers', () => {
    const s = pass(fresh(), JAR_NODE)
    const wrong = appReducer(s, { type: 'LEARN_REVIEW', questionId: q1, correct: false, today: '2026-10-17' })
    expect(total(wrong)).toBe(total(s))
    const r1 = appReducer(wrong, { type: 'LEARN_REVIEW', questionId: q2, correct: true, today: '2026-10-17' })
    expect(total(r1) - total(s)).toBe(XP_REWARDS.reviewDone)
    const r2 = appReducer(r1, { type: 'LEARN_REVIEW', questionId: q1, correct: true, today: '2026-10-17' })
    expect(total(r2)).toBe(total(r1))
    const r3 = appReducer(r2, { type: 'LEARN_REVIEW', questionId: q1, correct: true, today: '2026-10-18' })
    expect(total(r3) - total(r2)).toBe(XP_REWARDS.reviewDone)
  })

  it('a wrong answer costs nothing beyond box 1 — no XP removed, no progress lost', () => {
    const s = pass(fresh(), JAR_NODE)
    const w = appReducer(s, { type: 'LEARN_REVIEW', questionId: q1, correct: false, today: '2026-10-17' })
    expect(w.xp).toEqual(s.xp)
    expect(w.learn.progress).toEqual(s.learn.progress)
    expect(w.learn.cards.find((c) => c.questionId === q1)).toMatchObject({ box: 1, due: '2026-10-18' })
  })

  it('a review of a card that does not exist is a no-op', () => {
    const s = fresh()
    expect(appReducer(s, { type: 'LEARN_REVIEW', questionId: q1, correct: true, today: TODAY })).toBe(s)
  })
})

describe('learn badges', () => {
  it('first-mastery unlocks on the first mastered node', () => {
    const s = pass(fresh(), NULL_NODE) // null apply: pass = mastery
    expect(achievementById('first-mastery')!.earned(fresh())).toBe(false)
    expect(achievementById('first-mastery')!.earned(s)).toBe(true)
    expect(newlyEarnedIds(s)).toContain('first-mastery')
  })

  it('has one permanent branch badge per branch, earned only when every node is mastered', () => {
    for (const b of BRANCHES) expect(ACHIEVEMENT_IDS.has(`branch-${b.id}`)).toBe(true)
    const nodes = nodesInBranch('guard')
    let s: AppState = { ...fresh(), support: { ...fresh().support, trusted: { name: 'A', options: {} as never } } }
    s = { ...s, money: { ...s.money, accounts: [{ id: 'a', name: 'CCP', currency: 'DA', anchorBalance: 1, anchorAt: ISO, archived: false, updatedAt: ISO }] } }
    for (const n of nodes.slice(0, -1)) {
      s = pass(s, n.id)
      s = appReducer(s, { type: 'LEARN_APPLY', nodeId: n.id, today: TODAY })
    }
    expect(achievementById('branch-guard')!.earned(s)).toBe(false)
    const last = nodes[nodes.length - 1]
    s = pass(s, last.id)
    s = appReducer(s, { type: 'LEARN_APPLY', nodeId: last.id, today: TODAY })
    expect(achievementById('branch-guard')!.earned(s)).toBe(true)
    expect(achievementById('branch-flow')!.earned(s)).toBe(false)
  })
})
