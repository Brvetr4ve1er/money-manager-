/**
 * Learn engine — pure derivations over the curriculum, the learn slice and
 * the rest of AppState. No wall clock: every day-dependent rule takes an
 * explicit `today`.
 *
 * Design rules this module encodes:
 * - Content is never gated. `suggested` only ranks what to open next; any
 *   node can be opened at any time.
 * - Mastery is read + quiz + apply (or read + quiz when the node has no
 *   in-app action). Apply checks read REAL state — a jar that exists, a bill
 *   that was paid — never a self-report.
 * - XP is the engagement track only (see engine/xp.ts); nothing here ever
 *   feeds the Health Score.
 */

import {
  BRANCHES,
  NODES,
  nodeById,
  nodesInBranch,
  type ApplyId,
  type BranchId,
  type QuizQuestion,
  type SkillNode,
} from '../content/curriculum.ts'
import { XP_REWARDS } from './xp.ts'
import { daysBetween, localDayISO } from './dates.ts'
import type { AppState } from '../state/store.ts'
import { progressFor, type LearnState, type ReviewCard } from '../state/slices/learn.ts'

export type NodeState = 'new' | 'read' | 'quizzed' | 'mastered'

/** XP the learn track pays, re-exported from the canonical table. */
export const LEARN_XP = {
  quizPass: XP_REWARDS.quizPass,
  nodeApplied: XP_REWARDS.nodeApplied,
  reviewDone: XP_REWARDS.reviewDone,
} as const

const RANK: Record<NodeState, number> = { new: 0, read: 1, quizzed: 2, mastered: 3 }

export function nodeState(node: SkillNode, learn: LearnState, _appState?: AppState): NodeState {
  const p = progressFor(learn, node.id)
  if (!p) return 'new'
  if (p.quizPassedAt !== null) {
    if (node.apply === null || p.appliedAt !== null) return 'mastered'
    return 'quizzed'
  }
  return p.readAt !== null ? 'read' : 'new'
}

/** True when the node's state is at least `min`. */
export function atLeast(state: NodeState, min: NodeState): boolean {
  return RANK[state] >= RANK[min]
}

/**
 * A node is suggested when every prereq is at least quizzed. Suggestion is a
 * ranking hint only — locked-looking nodes say "best after X", never a lock.
 */
export function suggested(node: SkillNode, learn: LearnState): boolean {
  return node.prereqs.every((id) => {
    const pre = nodeById(id)
    return pre !== undefined && atLeast(nodeState(pre, learn), 'quizzed')
  })
}

/** Prereqs not yet quizzed — the "best after X" list. */
export function missingPrereqs(node: SkillNode, learn: LearnState): SkillNode[] {
  return node.prereqs
    .map((id) => nodeById(id))
    .filter((n): n is SkillNode => n !== undefined && !atLeast(nodeState(n, learn), 'quizzed'))
}

export interface BranchProgress {
  branch: BranchId
  total: number
  read: number
  quizzed: number
  mastered: number
}

export function branchProgress(branch: BranchId, learn: LearnState): BranchProgress {
  const nodes = nodesInBranch(branch)
  const states = nodes.map((n) => nodeState(n, learn))
  return {
    branch,
    total: nodes.length,
    read: states.filter((s) => atLeast(s, 'read')).length,
    quizzed: states.filter((s) => atLeast(s, 'quizzed')).length,
    mastered: states.filter((s) => s === 'mastered').length,
  }
}

export function masteredCount(learn: LearnState): number {
  return NODES.filter((n) => nodeState(n, learn) === 'mastered').length
}

export function branchMastered(branch: BranchId, learn: LearnState): boolean {
  const p = branchProgress(branch, learn)
  return p.total > 0 && p.mastered === p.total
}

/** Nodes in path order: branch order, then position within the branch. */
export function pathOrder(): SkillNode[] {
  return [...BRANCHES].sort((a, b) => a.order - b.order).flatMap((b) => nodesInBranch(b.id))
}

/**
 * "Learn one thing today": the first suggested node in path order that has
 * not been quizzed yet. Falls back to the first un-quizzed node at all, then
 * to the first quizzed-but-unapplied one; null when everything is mastered.
 */
export function topSuggested(learn: LearnState): SkillNode | null {
  const path = pathOrder()
  return (
    path.find((n) => suggested(n, learn) && !atLeast(nodeState(n, learn), 'quizzed')) ??
    path.find((n) => !atLeast(nodeState(n, learn), 'quizzed')) ??
    path.find((n) => nodeState(n, learn) !== 'mastered') ??
    null
  )
}

/* ---------------------------- spaced review --------------------------- */

const QUESTION_INDEX: ReadonlyMap<string, { node: SkillNode; question: QuizQuestion }> = new Map(
  NODES.flatMap((node) => node.quiz.map((question) => [question.id, { node, question }] as const)),
)

export function questionById(id: string): { node: SkillNode; question: QuizQuestion } | undefined {
  return QUESTION_INDEX.get(id)
}

/** Cards due on or before `today`, most overdue first (then by id). */
export function reviewDue(learn: LearnState, today: string): ReviewCard[] {
  return learn.cards
    .filter((c) => c.due <= today && QUESTION_INDEX.has(c.questionId))
    .sort((a, b) => (a.due !== b.due ? (a.due < b.due ? -1 : 1) : a.questionId < b.questionId ? -1 : 1))
}

/* ---------------------------- apply checks ---------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Non-archived records from a possibly-absent array field. */
function liveRows(container: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(container)) return []
  const xs = container[key]
  if (!Array.isArray(xs)) return []
  return xs.filter((x): x is Record<string, unknown> => isRecord(x) && x.archived !== true)
}

function localDayOfInstant(iso: string): string | null {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? localDayISO(new Date(t)) : null
}

/**
 * Does real app state prove the skill? Every check reads persisted evidence
 * only. `today` defaults to the state's own day clock (questsDate).
 *
 * The social and inbox slices may still be stubs; their checks narrow
 * `unknown` defensively and return false when the fields are absent.
 */
export function isApplied(applyId: ApplyId, s: AppState, today: string = s.questsDate): boolean {
  const m = s.money
  const accounts = m.accounts.filter((a) => !a.archived)
  const obligations = m.obligations.filter((o) => !o.archived)
  const jars = m.jars.filter((j) => !j.archived)
  switch (applyId) {
    case 'has-account':
      return accounts.length > 0
    case 'confirm-balance':
      // Re-anchored after first use (the anchor is newer than a purchase or
      // income on that account), or any anchor confirmed in the last 30 days.
      return accounts.some((a) => {
        const anchorDay = localDayOfInstant(a.anchorAt)
        if (anchorDay !== null && daysBetween(anchorDay, today) <= 30 && daysBetween(anchorDay, today) >= 0) return true
        const anchorMs = Date.parse(a.anchorAt)
        const usedBefore =
          m.incomes.some((i) => i.accountId === a.id && Date.parse(i.at) < anchorMs) ||
          s.transactions.some((t) => t.accountId === a.id && anchorDay !== null && t.date < anchorDay)
        return usedBefore
      })
    case 'fx-set':
      return m.settings.fxDaPerUsd !== null
    case 'log-any':
      return s.transactions.length > 0
    case 'log-7-days':
      return new Set(s.transactions.map((t) => t.date)).size >= 7
    case 'resisted':
      return s.transactions.some((t) => t.resistedImpulse === true)
    case 'has-obligation':
      return obligations.length > 0
    case 'paid-obligation':
      return m.payments.some((p) => !p.void)
    case 'installment-tracked':
      return obligations.some((o) => o.kind === 'installment' && o.installment !== null)
    case 'has-jar':
      return jars.length > 0
    case 'jar-with-target':
      return jars.some((j) => j.target !== null)
    case 'emergency-jar':
      return jars.some((j) => /emergenc/i.test(j.name) && j.target !== null)
    case 'payday-split':
      return m.settings.split.length > 0 || m.jarMoves.some((mv) => mv.kind === 'payday')
    case 'has-charm':
      return m.charms.some((c) => !c.archived)
    case 'set-brake':
      return s.support.brakes !== null
    case 'profile-set':
      return s.profile !== null
    case 'ran-sim':
      return s.xpLog.some((g) => g.action === 'runSimulation')
    case 'has-tontine':
      return liveRows(s.social, 'tontines').length > 0
    case 'has-iou':
      return liveRows(s.social, 'ious').length > 0
    case 'used-zakat': {
      const social: unknown = s.social
      const zakat = isRecord(social) ? social.zakat : undefined
      if (!isRecord(zakat)) return false
      const price = zakat.goldPricePerGram
      return (typeof price === 'number' && Number.isFinite(price) && price > 0) ||
        (typeof zakat.savedAt === 'string' && zakat.savedAt !== '')
    }
    case 'inbox-confirmed':
      return liveRows(s.inbox, 'candidates').some((c) => c.status === 'confirmed')
    case 'trusted-set':
      return s.support.trusted !== null
    case 'recurring-reviewed':
      return obligations.filter((o) => o.cadence !== 'once').length >= 2
  }
}

/** Where each apply check is satisfied, and how the Try-it step words it. */
export interface ApplyInfo {
  room: 'Home' | 'Runway' | 'Jars' | 'Me' | 'Learn'
  href: '#/home' | '#/runway' | '#/jars' | '#/me' | '#/learn'
  /** Completes "Done ✓ — …". */
  done: string
  /** Completes "Not yet — …". */
  todo: string
}

export const APPLY_INFO: Record<ApplyId, ApplyInfo> = {
  'has-account': { room: 'Home', href: '#/home', done: 'you have a money account in Ember', todo: 'add an account on Home' },
  'confirm-balance': { room: 'Home', href: '#/home', done: 'you confirmed a balance recently', todo: 'confirm a balance on Home' },
  'fx-set': { room: 'Home', href: '#/home', done: 'your own dollar rate is set', todo: 'set your rate on Home' },
  'log-any': { room: 'Home', href: '#/home', done: 'you have logged money moving', todo: 'log one purchase on Home' },
  'log-7-days': { room: 'Home', href: '#/home', done: 'you have logged on 7 different days', todo: 'log on 7 different days (any 7)' },
  resisted: { room: 'Home', href: '#/home', done: 'you have resisted an impulse', todo: 'tap “I resisted” on Home next time' },
  'has-obligation': { room: 'Runway', href: '#/runway', done: 'a bill is on your runway', todo: 'add a bill in Runway' },
  'paid-obligation': { room: 'Runway', href: '#/runway', done: 'you have marked a bill paid', todo: 'mark a bill paid in Runway' },
  'installment-tracked': { room: 'Runway', href: '#/runway', done: 'an installment plan is tracked', todo: 'add an installment in Runway' },
  'has-jar': { room: 'Jars', href: '#/jars', done: 'you already have a jar', todo: 'open Jars' },
  'jar-with-target': { room: 'Jars', href: '#/jars', done: 'a jar has a target', todo: 'give a jar a target in Jars' },
  'emergency-jar': { room: 'Jars', href: '#/jars', done: 'your emergency jar has a target', todo: 'make an “Emergency” jar with a target' },
  'payday-split': { room: 'Jars', href: '#/jars', done: 'your payday split is set', todo: 'set a payday split in Jars' },
  'has-charm': { room: 'Jars', href: '#/jars', done: 'a save charm is working', todo: 'add a save charm in Jars' },
  'set-brake': { room: 'Me', href: '#/me', done: 'your brakes are on', todo: 'set a brake in Me' },
  'profile-set': { room: 'Me', href: '#/me', done: 'your numbers are saved', todo: 'save your numbers in Me' },
  'ran-sim': { room: 'Learn', href: '#/learn', done: 'you have run a simulation', todo: 'run the simulator below' },
  'has-tontine': { room: 'Me', href: '#/me', done: 'a jam’iyya is tracked', todo: 'add a jam’iyya in Me' },
  'has-iou': { room: 'Me', href: '#/me', done: 'a debt between people is noted', todo: 'note one in Me' },
  'used-zakat': { room: 'Me', href: '#/me', done: 'you have used the zakat helper', todo: 'try the zakat helper in Me' },
  'inbox-confirmed': { room: 'Me', href: '#/me', done: 'you confirmed an inbox entry', todo: 'confirm one in the inbox in Me' },
  'trusted-set': { room: 'Me', href: '#/me', done: 'a trusted person is set', todo: 'choose a trusted person in Me' },
  'recurring-reviewed': { room: 'Runway', href: '#/runway', done: 'your recurring costs are listed', todo: 'add two recurring costs in Runway' },
}
