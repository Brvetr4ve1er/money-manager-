/**
 * Learn slice — skill-tree progress and spaced review. Local-first and
 * merge-safe like every other slice:
 *
 * - Node progress is three "first time it happened" days (read, quiz
 *   passed, applied). A merge keeps, per field, the EARLIEST non-null day:
 *   progress never regresses, and two tabs converge on the same record.
 * - Review cards are Leitner boxes (1..5) with a due day. They are entities:
 *   the copy with the newer `updatedAt` wins a merge (compared as instants),
 *   ties break on the greater JSON string so the rule is symmetric.
 * - `lastReviewDay` is the latest day any review answer landed ('' = never).
 *
 * Nothing here is ever a penalty: a wrong review answer only moves a card
 * back to box 1, due tomorrow. There are no lives, streaks or timers.
 */

import { addDaysISO, isIsoDatetime, isValidDayKey } from '../../engine/dates.ts'
import { NODES, NODE_IDS } from '../../content/curriculum.ts'

export interface NodeProgress {
  nodeId: string
  /** Local day the lesson was first read; null = not yet. */
  readAt: string | null
  /** Local day both quiz questions were first answered correctly. */
  quizPassedAt: string | null
  /** Local day the in-app apply check was first confirmed. */
  appliedAt: string | null
}

export type LeitnerBox = 1 | 2 | 3 | 4 | 5

export interface ReviewCard {
  questionId: string
  box: LeitnerBox
  /** Local day the card is next due. */
  due: string
  /** ISO datetime of the last change — newer wins in a merge. */
  updatedAt: string
}

export interface LearnState {
  progress: NodeProgress[]
  cards: ReviewCard[]
  /** Local day of the most recent review answer; '' = never. */
  lastReviewDay: string
}

/** Days until the next review, indexed by the card's (new) box − 1. */
export const LEITNER_INTERVALS: readonly [number, number, number, number, number] = [1, 3, 7, 14, 30]

/** Every quiz question id in the curriculum — persisted cards validate against it. */
export const QUESTION_IDS: ReadonlySet<string> = new Set(NODES.flatMap((n) => n.quiz.map((q) => q.id)))

export function defaultLearn(): LearnState {
  return { progress: [], cards: [], lastReviewDay: '' }
}

/* ------------------------------ sanitize ------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

const dayOrNull = (v: unknown): string | null => (isValidDayKey(v) ? v : null)

function sanitizeProgress(v: unknown): NodeProgress | null {
  if (!isRecord(v) || typeof v.nodeId !== 'string' || !NODE_IDS.has(v.nodeId)) return null
  const p: NodeProgress = {
    nodeId: v.nodeId,
    readAt: dayOrNull(v.readAt),
    quizPassedAt: dayOrNull(v.quizPassedAt),
    appliedAt: dayOrNull(v.appliedAt),
  }
  // An all-empty record carries no information; dropping it keeps a
  // sanitized slice and a merged one string-equal.
  return p.readAt === null && p.quizPassedAt === null && p.appliedAt === null ? null : p
}

function sanitizeCard(v: unknown): ReviewCard | null {
  if (!isRecord(v) || typeof v.questionId !== 'string' || !QUESTION_IDS.has(v.questionId)) return null
  const box = v.box
  if (typeof box !== 'number' || !Number.isInteger(box) || box < 1 || box > 5) return null
  if (!isValidDayKey(v.due) || !isIsoDatetime(v.updatedAt)) return null
  return { questionId: v.questionId, box: box as LeitnerBox, due: v.due, updatedAt: v.updatedAt }
}

/** Earliest non-null day ('YYYY-MM-DD' keys sort chronologically). */
function earliest(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a <= b ? a : b
}

function mergeProgressList(xs: NodeProgress[]): NodeProgress[] {
  const m = new Map<string, NodeProgress>()
  for (const x of xs) {
    const prev = m.get(x.nodeId)
    m.set(
      x.nodeId,
      prev
        ? {
            nodeId: x.nodeId,
            readAt: earliest(prev.readAt, x.readAt),
            quizPassedAt: earliest(prev.quizPassedAt, x.quizPassedAt),
            appliedAt: earliest(prev.appliedAt, x.appliedAt),
          }
        : { nodeId: x.nodeId, readAt: x.readAt, quizPassedAt: x.quizPassedAt, appliedAt: x.appliedAt },
    )
  }
  return [...m.values()].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0))
}

function newerCard(a: ReviewCard, b: ReviewCard): ReviewCard {
  const ta = Date.parse(a.updatedAt)
  const tb = Date.parse(b.updatedAt)
  if (ta !== tb) return ta > tb ? a : b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function mergeCardList(xs: ReviewCard[]): ReviewCard[] {
  const m = new Map<string, ReviewCard>()
  for (const x of xs) {
    const prev = m.get(x.questionId)
    m.set(x.questionId, prev ? newerCard(prev, x) : x)
  }
  return [...m.values()].sort((a, b) =>
    a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0,
  )
}

function clean<T>(xs: unknown, fn: (v: unknown) => T | null): T[] {
  if (!Array.isArray(xs)) return []
  const out: T[] = []
  for (const x of xs) {
    const s = fn(x)
    if (s !== null) out.push(s)
  }
  return out
}

/**
 * Field-by-field validation of an untrusted learn payload. Unknown node and
 * question ids drop (a renamed or hand-added id must never persist), bad days
 * become null, and duplicates collapse through the merge rules — so a
 * sanitized slice is already a merge fixpoint.
 */
export function sanitizeLearn(v: unknown): LearnState {
  const out = defaultLearn()
  if (!isRecord(v)) return out
  out.progress = mergeProgressList(clean(v.progress, sanitizeProgress))
  out.cards = mergeCardList(clean(v.cards, sanitizeCard))
  out.lastReviewDay = isValidDayKey(v.lastReviewDay) ? v.lastReviewDay : ''
  return out
}

/** Symmetric cross-tab merge; output is in defaultLearn() key order. */
export function mergeLearn(a: LearnState, b: LearnState): LearnState {
  return {
    progress: mergeProgressList([...a.progress, ...b.progress]),
    cards: mergeCardList([...a.cards, ...b.cards]),
    lastReviewDay: a.lastReviewDay >= b.lastReviewDay ? a.lastReviewDay : b.lastReviewDay,
  }
}

/* ------------------------------ reducer ------------------------------- */

export type LearnAction =
  | { type: 'learn/read'; nodeId: string; today: string }
  /** Both questions answered correctly (in any number of tries). Seeds both
   *  into Leitner box 1, due tomorrow. */
  | { type: 'learn/quiz-passed'; nodeId: string; today: string; nowISO?: string }
  | { type: 'learn/applied'; nodeId: string; today: string }
  | { type: 'learn/review-answer'; questionId: string; correct: boolean; today: string; nowISO?: string }

export function progressFor(s: LearnState, nodeId: string): NodeProgress | undefined {
  return s.progress.find((p) => p.nodeId === nodeId)
}

/** A stamp for card edits. Callers pass a real instant; the fallback keeps
 *  the reducer pure and still yields a valid, day-ordered ISO datetime. */
function stamp(today: string, nowISO: string | undefined): string {
  return nowISO !== undefined && isIsoDatetime(nowISO) ? nowISO : `${today}T00:00:00.000Z`
}

function withProgress(s: LearnState, p: NodeProgress): LearnState {
  return { ...s, progress: mergeProgressList([...s.progress.filter((x) => x.nodeId !== p.nodeId), p]) }
}

function blank(nodeId: string): NodeProgress {
  return { nodeId, readAt: null, quizPassedAt: null, appliedAt: null }
}

/**
 * Pure slice transitions. Every "first time" field only ever moves from null
 * to a day — re-reading or re-passing keeps the original date — and invalid
 * ids or days are no-ops that return the same object.
 */
export function learnReducer(s: LearnState, a: LearnAction): LearnState {
  switch (a.type) {
    case 'learn/read': {
      if (!NODE_IDS.has(a.nodeId) || !isValidDayKey(a.today)) return s
      const p = progressFor(s, a.nodeId) ?? blank(a.nodeId)
      if (p.readAt !== null) return s
      return withProgress(s, { ...p, readAt: a.today })
    }
    case 'learn/quiz-passed': {
      if (!NODE_IDS.has(a.nodeId) || !isValidDayKey(a.today)) return s
      const p = progressFor(s, a.nodeId) ?? blank(a.nodeId)
      if (p.quizPassedAt !== null) return s
      // Passing implies reading — the sheet always shows the lesson first,
      // and a node must never sit at "quizzed" without "read".
      const next = withProgress(s, { ...p, readAt: p.readAt ?? a.today, quizPassedAt: a.today })
      const node = NODES.find((n) => n.id === a.nodeId)!
      const due = addDaysISO(a.today, 1)
      const updatedAt = stamp(a.today, a.nowISO)
      const fresh = node.quiz
        .filter((q) => !next.cards.some((c) => c.questionId === q.id))
        .map((q): ReviewCard => ({ questionId: q.id, box: 1, due, updatedAt }))
      return fresh.length === 0 ? next : { ...next, cards: mergeCardList([...next.cards, ...fresh]) }
    }
    case 'learn/applied': {
      if (!NODE_IDS.has(a.nodeId) || !isValidDayKey(a.today)) return s
      const p = progressFor(s, a.nodeId)
      // Mastery is read + quiz + apply: the apply step only exists after a pass.
      if (!p || p.quizPassedAt === null || p.appliedAt !== null) return s
      return withProgress(s, { ...p, appliedAt: a.today })
    }
    case 'learn/review-answer': {
      if (!isValidDayKey(a.today)) return s
      const card = s.cards.find((c) => c.questionId === a.questionId)
      if (!card) return s
      const box = (a.correct ? Math.min(5, card.box + 1) : 1) as LeitnerBox
      const due = addDaysISO(a.today, a.correct ? LEITNER_INTERVALS[box - 1] : 1)
      // The edit must out-date the copy it replaces, or a peer still holding
      // the old card would win the merge back (clock skew, fallback stamps).
      let updatedAt = stamp(a.today, a.nowISO)
      if (Date.parse(updatedAt) <= Date.parse(card.updatedAt)) {
        updatedAt = new Date(Date.parse(card.updatedAt) + 1).toISOString()
      }
      const next: ReviewCard = { questionId: card.questionId, box, due, updatedAt }
      return {
        ...s,
        cards: s.cards.map((c) => (c.questionId === card.questionId ? next : c)),
        lastReviewDay: a.today > s.lastReviewDay ? a.today : s.lastReviewDay,
      }
    }
  }
  return s
}
