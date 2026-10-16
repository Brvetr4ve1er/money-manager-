/**
 * The Home room: what is waiting for you, and what your room has grown.
 * Pure derivations over AppState.
 *
 * - "Waiting" is the nothing-surprising digest: everything that wants your
 *   attention, in one calm list, only ever seen when you open the app.
 * - Room pieces grow from OUTCOMES (a jar reached, an emergency cushion, no
 *   late bills, a mastered lesson) — never from tap counts. Cosmetic only:
 *   the health warmth stays a pure function of finances (two-track rule).
 */

import type { AppState } from '../state/store.ts'
import { isReleasable } from './brakes.ts'
import {
  accountBalance,
  breathingRoom,
  charmSuggestions,
  jarView,
  liveAccounts,
  liveJars,
  obligationViews,
} from './money.ts'

export interface WaitingItem {
  id: string
  text: string
  href: string
  /** 'soft' items are gentle nudges; nothing here is ever an alarm. */
  tone: 'soft' | 'ready'
}

export function waitingFor(state: AppState, today: string, nowMs: number): WaitingItem[] {
  const out: WaitingItem[] = []
  for (const v of obligationViews(state.money, today)) {
    if (v.status === 'late') {
      out.push({ id: `late:${v.obligation.id}`, text: `${v.obligation.name} went out ${-(v.daysUntil ?? 0)} day${v.daysUntil === -1 ? '' : 's'} ago — relight it when you can.`, href: '#/runway', tone: 'soft' })
    } else if (v.status === 'due_soon') {
      const d = v.daysUntil ?? 0
      out.push({ id: `soon:${v.obligation.id}`, text: `${v.obligation.name} is due ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}.`, href: '#/runway', tone: 'soft' })
    }
  }
  const ready = state.support.held.filter((h) => isReleasable(h, nowMs)).length
  if (ready > 0) out.push({ id: 'held', text: `${ready} held purchase${ready === 1 ? ' is' : 's are'} ready for your decision.`, href: '#/home', tone: 'ready' })
  const charms = charmSuggestions(state.money, state.transactions).length
  if (charms > 0) out.push({ id: 'charms', text: `${charms} save-charm suggestion${charms === 1 ? '' : 's'} to confirm.`, href: '#/jars', tone: 'ready' })
  for (const j of liveJars(state.money)) {
    if (jarView(j, state.money, today).overspent) out.push({ id: `cover:${j.id}`, text: `${j.name} went past zero — cover it from another jar.`, href: '#/jars', tone: 'soft' })
  }
  for (const a of liveAccounts(state.money)) {
    const b = accountBalance(a, state.transactions, state.money, today)
    if (b.daysSinceConfirmed >= 14) out.push({ id: `confirm:${a.id}`, text: `${a.name} was last confirmed ${b.daysSinceConfirmed} days ago — a quick check keeps the forecast honest.`, href: '#/home', tone: 'soft' })
  }
  const inbox = (state.inbox as { candidates?: Array<{ status?: string }> }).candidates
  const pending = Array.isArray(inbox) ? inbox.filter((c) => c.status === 'pending').length : 0
  if (pending > 0) out.push({ id: 'inbox', text: `${pending} receipt${pending === 1 ? '' : 's'} waiting in your review tray.`, href: '#/me', tone: 'ready' })
  return out
}

export interface RoomPiece {
  id: string
  emoji: string
  name: string
  /** How it is earned — shown for unearned pieces as a gentle "not yet". */
  how: string
  earned: boolean
}

export function roomPieces(state: AppState, today: string): RoomPiece[] {
  const jars = liveJars(state.money).map((j) => jarView(j, state.money, today))
  const views = obligationViews(state.money, today)
  const room = breathingRoom(state.money, state.transactions, today)
  const essentials = state.profile?.monthlyEssentials ?? null
  const emergency = jars.find((j) => /emergenc/i.test(j.jar.name))
  const learn = state.learn as { progress?: Array<{ appliedAt?: string | null; quizPassedAt?: string | null }> }
  const mastered = Array.isArray(learn.progress) ? learn.progress.filter((p) => p.quizPassedAt).length : 0
  return [
    { id: 'hearth', emoji: '🔥', name: 'The hearth', how: 'Add what you have on Home.', earned: room.hasAccounts },
    { id: 'window', emoji: '🪟', name: 'A bright window', how: 'Breathing room above zero until payday.', earned: room.hasAccounts && room.room > 0 },
    { id: 'lanterns', emoji: '🏮', name: 'All lanterns lit', how: 'No bill gone out.', earned: views.length > 0 && views.every((v) => v.status !== 'late') },
    { id: 'plant', emoji: '🪴', name: 'A plant that grew', how: 'Fill any jar to its target.', earned: jars.some((j) => j.reached) },
    {
      id: 'cushion',
      emoji: '🛋️',
      name: 'A soft cushion',
      how: 'An Emergency jar holding a month of essentials.',
      earned: emergency !== undefined && essentials !== null && essentials > 0 && emergency.balance >= essentials,
    },
    { id: 'books', emoji: '📚', name: 'A shelf of books', how: 'Pass three lesson quizzes in Learn.', earned: mastered >= 3 },
  ]
}
