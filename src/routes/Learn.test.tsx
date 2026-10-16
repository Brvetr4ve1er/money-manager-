import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import App from '../App.tsx'
import { nodeFromHash } from './Learn.tsx'
import { NODES, nodeById, type QuizQuestion } from '../content/curriculum.ts'
import { XP_REWARDS } from '../engine/xp.ts'

// Sounds are reinforcement only; jsdom has no AudioContext, so stub the module.
vi.mock('../audio/chiptune.ts', () => ({
  setMuted: vi.fn(),
  blip: vi.fn(),
  arpeggio: vi.fn(),
  fanfare: vi.fn(),
  sparkle: vi.fn(),
  deny: vi.fn(),
  reveal: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
  if (typeof globalThis.crypto.randomUUID !== 'function') {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => `${Math.random()}`.slice(2),
      configurable: true,
    })
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const KEY = 'ember-state-v1'
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? '{}')
const xpNow = (): number => saved().xp?.totalXp ?? 0

const goto = (route: 'home' | 'runway' | 'jars' | 'learn' | 'me') =>
  act(() => {
    window.location.hash = `#/${route}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

const lantern = (nodeId: string) => {
  const el = document.querySelector<HTMLButtonElement>(`.lantern[data-node="${nodeId}"]`)
  if (!el) throw new Error(`no lantern for ${nodeId}`)
  return el
}
const right = (q: QuizQuestion) => q.options.find((o) => o.correct)!.text
const wrong = (q: QuizQuestion) => q.options.find((o) => !o.correct)!.text
const choose = (text: string) => fireEvent.click(screen.getByRole('button', { name: text }))

/** Answer both questions of the open sheet's quiz correctly. */
function passQuiz(nodeId: string) {
  const node = nodeById(nodeId)!
  choose(right(node.quiz[0]))
  fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
  choose(right(node.quiz[1]))
}

const JAR_NODE = 'a8-breathing-room' // apply: has-jar; prereqs a3 + a5
const ISO = '2026-10-16T09:00:00.000Z'

describe('Learn room — a node from lesson to mastery', () => {
  it('reads, explains a wrong answer and allows a retry, passes once for +20, links the apply room', () => {
    render(<App />)
    goto('learn')
    const node = nodeById(JAR_NODE)!
    // Not gated: an unsuggested lantern opens, with a gentle note instead of a lock.
    expect(lantern(JAR_NODE).textContent).toMatch(/Best after/)
    fireEvent.click(lantern(JAR_NODE))
    expect(screen.getByRole('heading', { name: node.title, level: 3 })).toBeTruthy()
    expect(screen.getByText(/Best after/, { selector: 'p' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(saved().learn.progress).toEqual([
      { nodeId: JAR_NODE, readAt: expect.any(String), quizPassedAt: null, appliedAt: null },
    ])

    // A wrong answer explains and costs nothing; every option stays open.
    const q1 = node.quiz[0]
    choose(wrong(q1))
    const why = q1.options.find((o) => !o.correct)!.why
    expect(screen.getByText((t) => t.startsWith('Not quite.') && t.includes(why))).toBeTruthy()
    expect(xpNow()).toBe(0)
    expect(screen.queryByRole('button', { name: 'Next question' })).toBeNull()
    // Retry immediately.
    choose(right(q1))
    expect(screen.getByText((t) => t.startsWith('Yes —'))).toBeTruthy()
    // Keyboard users land on the way forward.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next question' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    choose(right(node.quiz[1]))

    // Pass: the spring moment, +20 for the pass, +15 via the daily lesson quest.
    expect(screen.getByText('Lantern lit!')).toBeTruthy()
    expect(xpNow()).toBe(XP_REWARDS.quizPass + XP_REWARDS.readLesson)
    expect(saved().quests.find((q: { id: string }) => q.id === 'lesson').done).toBe(true)
    expect(saved().learn.cards).toHaveLength(2)

    // Try it: live apply status, with a link to the right room.
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Try it' }))
    expect(screen.getByText(node.tryIt)).toBeTruthy()
    expect(screen.getByText('Not yet — open Jars.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Jars' }).getAttribute('href')).toBe('#/jars')
    expect(screen.queryByRole('button', { name: /Mark mastered/ })).toBeNull()

    // A retake pays nothing more.
    fireEvent.click(screen.getByRole('button', { name: 'Re-read the lesson' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take the quiz again' }))
    passQuiz(JAR_NODE)
    expect(xpNow()).toBe(XP_REWARDS.quizPass + XP_REWARDS.readLesson)
    expect(saved().xpLog.filter((g: { id: string }) => g.id === `quiz:${JAR_NODE}`)).toHaveLength(1)

    // The lantern is bright now, and the Home quest row reads done.
    expect(lantern(JAR_NODE).className).toContain('is-quizzed')
    goto('home')
    expect(screen.getByText('Learn one thing today').closest('li')!.className).toContain('done')
  })

  it('auto-offers mastery once a jar exists, and pays +30 exactly once', () => {
    render(<App />)
    goto('learn')
    fireEvent.click(lantern(JAR_NODE))
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    passQuiz(JAR_NODE)
    const afterPass = xpNow()
    cleanup()

    // Seed a jar in persisted state (as the Jars room would), then come back.
    const s = saved()
    s.money.jars = [{ id: 'j1', name: 'Eid', emoji: '🫙', target: null, targetDate: null, locked: false, archived: false, updatedAt: ISO }]
    localStorage.setItem(KEY, JSON.stringify(s))
    render(<App />)
    goto('learn')
    expect(lantern(JAR_NODE).textContent).toMatch(/Ready to master/)
    fireEvent.click(lantern(JAR_NODE))
    // Opens straight on Try it: the predicate is already true.
    expect(screen.getByText('Done ✓ — you already have a jar.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Mark mastered/ }))
    expect(xpNow()).toBe(afterPass + XP_REWARDS.nodeApplied)
    expect(screen.getByText('Mastered ✓ — you already have a jar.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Mark mastered/ })).toBeNull()
    expect(saved().xpLog.filter((g: { id: string }) => g.id === `apply:${JAR_NODE}`)).toHaveLength(1)
    expect(lantern(JAR_NODE).className).toContain('is-mastered')
    // The codex now lists it, and the Flow trail counts it.
    expect(screen.getByText(`1 / ${NODES.length} mastered`)).toBeTruthy()
    expect(screen.getByText('1/8 mastered')).toBeTruthy()
  })
})

describe('Learn room — today card and spaced review', () => {
  it('suggests a root node, and next day offers the review; a right answer moves the box', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 16, 10, 0))
    render(<App />)
    goto('learn')
    const a1 = nodeById('a1-where-money-goes')!
    fireEvent.click(screen.getByRole('button', { name: `Start: ${a1.title}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    passQuiz(a1.id)
    expect(screen.queryByRole('button', { name: /^Review \d/ })).toBeNull() // due tomorrow, not today
    const xpDay1 = xpNow()
    cleanup()

    vi.setSystemTime(new Date(2026, 9, 17, 10, 0))
    render(<App />)
    goto('learn')
    fireEvent.click(screen.getByRole('button', { name: 'Review 2 cards' }))
    // Most-overdue first, then by id: q1.
    expect(screen.getByText(a1.quiz[0].prompt)).toBeTruthy()
    choose(right(a1.quiz[0]))
    const card = saved().learn.cards.find((c: { questionId: string }) => c.questionId === a1.quiz[0].id)
    expect(card).toMatchObject({ box: 2, due: '2026-10-20' })
    expect(xpNow()).toBe(xpDay1 + XP_REWARDS.reviewDone)

    // A wrong first answer on the next card: back to box 1, due tomorrow, no XP lost.
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }))
    choose(wrong(a1.quiz[1]))
    const card2 = saved().learn.cards.find((c: { questionId: string }) => c.questionId === a1.quiz[1].id)
    expect(card2).toMatchObject({ box: 1, due: '2026-10-18' })
    expect(xpNow()).toBe(xpDay1 + XP_REWARDS.reviewDone)
    // …and the learner can still find the answer.
    choose(right(a1.quiz[1]))
    fireEvent.click(screen.getByRole('button', { name: 'Finish review' }))
    expect(screen.getByText(/Nothing else is due/)).toBeTruthy()
  })
})

describe('Learn room — codex', () => {
  it('shows bonus cards as silhouettes that open and collect via the legacy lesson', () => {
    render(<App />)
    goto('learn')
    expect(screen.getByText('0 / 30 collected')).toBeTruthy()
    expect(screen.getByText(/Your first mastered lesson lands here/)).toBeTruthy()
    const tiles = screen.getAllByRole('button', { name: 'Uncollected bonus card' })
    expect(tiles).toHaveLength(30)
    fireEvent.click(tiles[3])
    const got = screen.getByRole('button', { name: /^Got it:/ })
    fireEvent.click(got)
    expect(screen.getByText('1 / 30 collected')).toBeTruthy()
    expect(saved().lessonsSeen).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Uncollected bonus card' })).toHaveLength(29)
    // Collecting counts as learning one thing today.
    expect(xpNow()).toBe(XP_REWARDS.readLesson)
  })
})

describe('nodeFromHash', () => {
  it('reads a real node id from a #/learn?node= link and ignores anything else', () => {
    const id = NODES[3].id
    expect(nodeFromHash(`#/learn?node=${id}`)).toBe(id)
    expect(nodeFromHash('#/learn?node=not-a-node')).toBeNull()
    expect(nodeFromHash('#/learn')).toBeNull()
  })
})
