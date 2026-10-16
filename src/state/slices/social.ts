/**
 * Social slice — money that lives between people: tontines (jam'iyya /
 * daret rotating savings), IOUs with friends and family (no interest, ever),
 * and the zakat helper's one stored setting (the user's own gold price).
 *
 * Merge-safe like every other slice:
 * - Entities (tontines, IOUs) carry `updatedAt`; the newer copy wins a
 *   cross-tab merge (compared as instants), ties break on the greater JSON
 *   string (symmetric). Deletion is an `archived` tombstone, never removal.
 * - Logs (tontine contributions, IOU settlements) are append-only and union
 *   by id. Derived numbers (rounds paid, outstanding) are never stored.
 * - Output is always in defaultSocial() key order so a sanitized slice is a
 *   merge fixpoint under mergeStates' JSON comparison.
 */

import { isIsoDatetime, isValidDayKey } from '../../engine/dates.ts'

export type TontineCadence = 'monthly' | 'weekly'

export interface Tontine {
  id: string
  name: string
  /** DA each member puts in per round. */
  contribution: number
  cadence: TontineCadence
  /** Local day of round 1. */
  startDate: string
  /** Display names in payout order (round r pays members[r − 1]); includes "Me". */
  members: string[]
  /** 1-based round in which I receive the pot. */
  myTurn: number
  archived: boolean
  updatedAt: string
}

export interface Contribution {
  id: string
  tontineId: string
  /** 1-based round this contribution paid. */
  round: number
  /** Local day it was marked paid. */
  date: string
  paid: true
}

export type IouDirection = 'lent' | 'borrowed'

export interface Iou {
  id: string
  person: string
  direction: IouDirection
  /** DA lent or borrowed — no interest. */
  amount: number
  date: string
  note: string
  dueDate: string | null
  archived: boolean
  updatedAt: string
}

export interface Settlement {
  id: string
  iouId: string
  /** DA repaid (partial repayments allowed). */
  amount: number
  date: string
}

export interface ZakatSettings {
  /** The user's own DA-per-gram figure; never fetched. */
  goldPricePerGram: number | null
  savedAt: string
}

export interface SocialState {
  tontines: Tontine[]
  contributions: Contribution[]
  ious: Iou[]
  settlements: Settlement[]
  zakat: ZakatSettings
}

export function defaultSocial(): SocialState {
  return {
    tontines: [],
    contributions: [],
    ious: [],
    settlements: [],
    zakat: { goldPricePerGram: null, savedAt: '' },
  }
}

/* ------------------------------ sanitize ------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isPositive = (v: unknown): v is number => isNum(v) && v > 0
const isName = (v: unknown): v is string => isStr(v) && v.trim() !== '' && v === v.trim()
const isRound = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 1

export const MAX_TONTINE_MEMBERS = 60

export function sanitizeTontine(v: unknown): Tontine | null {
  if (!isRecord(v) || !isStr(v.id) || !isName(v.name) || !isPositive(v.contribution)) return null
  if (v.cadence !== 'monthly' && v.cadence !== 'weekly') return null
  if (!isValidDayKey(v.startDate) || !isIsoDatetime(v.updatedAt)) return null
  if (!Array.isArray(v.members) || !v.members.every(isName)) return null
  const members = v.members as string[]
  if (members.length < 2 || members.length > MAX_TONTINE_MEMBERS) return null
  if (new Set(members).size !== members.length) return null
  if (!isRound(v.myTurn) || v.myTurn > members.length) return null
  return {
    id: v.id,
    name: v.name,
    contribution: v.contribution,
    cadence: v.cadence,
    startDate: v.startDate,
    members: [...members],
    myTurn: v.myTurn,
    archived: v.archived === true,
    updatedAt: v.updatedAt,
  }
}

function sanitizeContribution(v: unknown): Contribution | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.tontineId) || !isRound(v.round)) return null
  if (!isValidDayKey(v.date) || v.paid !== true) return null
  return { id: v.id, tontineId: v.tontineId, round: v.round, date: v.date, paid: true }
}

export function sanitizeIou(v: unknown): Iou | null {
  if (!isRecord(v) || !isStr(v.id) || !isName(v.person) || !isPositive(v.amount)) return null
  if (v.direction !== 'lent' && v.direction !== 'borrowed') return null
  if (!isValidDayKey(v.date) || !isIsoDatetime(v.updatedAt)) return null
  const dueDate = v.dueDate ?? null
  if (dueDate !== null && !isValidDayKey(dueDate)) return null
  return {
    id: v.id,
    person: v.person,
    direction: v.direction,
    amount: v.amount,
    date: v.date,
    note: isStr(v.note) ? v.note : '',
    dueDate,
    archived: v.archived === true,
    updatedAt: v.updatedAt,
  }
}

function sanitizeSettlement(v: unknown): Settlement | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.iouId) || !isPositive(v.amount)) return null
  if (!isValidDayKey(v.date)) return null
  return { id: v.id, iouId: v.iouId, amount: v.amount, date: v.date }
}

function sanitizeZakat(v: unknown): ZakatSettings {
  const out = defaultSocial().zakat
  if (!isRecord(v)) return out
  if (isPositive(v.goldPricePerGram)) out.goldPricePerGram = v.goldPricePerGram
  if (isIsoDatetime(v.savedAt)) out.savedAt = v.savedAt
  return out
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Instant of an ISO stamp; '' (never saved) sorts before everything. */
function instant(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY
}

/** Newer updatedAt wins (as instants); ties keep the greater JSON (symmetric). */
function newer<T extends { updatedAt: string }>(a: T, b: T): T {
  const ta = instant(a.updatedAt)
  const tb = instant(b.updatedAt)
  if (ta !== tb) return ta > tb ? a : b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function mergeEntities<T extends { id: string; updatedAt: string }>(xs: T[]): T[] {
  const m = new Map<string, T>()
  for (const x of xs) {
    const prev = m.get(x.id)
    m.set(x.id, prev ? newer(prev, x) : x)
  }
  return [...m.values()].sort(byId)
}

function unionById<T extends { id: string }>(xs: T[]): T[] {
  const m = new Map<string, T>()
  for (const x of xs) {
    const prev = m.get(x.id)
    if (!prev || JSON.stringify(x) > JSON.stringify(prev)) m.set(x.id, x)
  }
  return [...m.values()].sort(byId)
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
 * Field-by-field validation of an untrusted social payload. Malformed rows
 * are dropped (never repaired), duplicates collapse through the merge rules,
 * so the result is already a merge fixpoint.
 */
export function sanitizeSocial(v: unknown): SocialState {
  const out = defaultSocial()
  if (!isRecord(v)) return out
  out.tontines = mergeEntities(clean(v.tontines, sanitizeTontine))
  out.contributions = unionById(clean(v.contributions, sanitizeContribution))
  out.ious = mergeEntities(clean(v.ious, sanitizeIou))
  out.settlements = unionById(clean(v.settlements, sanitizeSettlement))
  out.zakat = sanitizeZakat(v.zakat)
  return out
}

function mergeZakat(a: ZakatSettings, b: ZakatSettings): ZakatSettings {
  const ta = instant(a.savedAt)
  const tb = instant(b.savedAt)
  if (ta !== tb) return ta > tb ? a : b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

/** Symmetric cross-tab merge; output is in defaultSocial() key order. */
export function mergeSocial(a: SocialState, b: SocialState): SocialState {
  return {
    tontines: mergeEntities([...a.tontines, ...b.tontines]),
    contributions: unionById([...a.contributions, ...b.contributions]),
    ious: mergeEntities([...a.ious, ...b.ious]),
    settlements: unionById([...a.settlements, ...b.settlements]),
    zakat: mergeZakat(a.zakat, b.zakat),
  }
}

/* ------------------------------ reducer ------------------------------- */

export type SocialAction =
  | { type: 'social/tontine-upsert'; tontine: Tontine }
  | { type: 'social/tontine-archive'; id: string; nowISO: string }
  | { type: 'social/contribution-add'; contribution: Contribution }
  | { type: 'social/iou-upsert'; iou: Iou }
  | { type: 'social/iou-archive'; id: string; nowISO: string }
  | { type: 'social/settlement-add'; settlement: Settlement }
  | { type: 'social/zakat-settings'; goldPricePerGram: number | null; nowISO: string }

function upsert<T extends { id: string }>(xs: T[], x: T): T[] {
  return [...xs.filter((y) => y.id !== x.id), x].sort(byId)
}

/** Outstanding DA on an IOU after its settlements (never below zero). */
export function iouOutstanding(s: SocialState, iou: Iou): number {
  const paid = s.settlements.filter((x) => x.iouId === iou.id).reduce((n, x) => n + x.amount, 0)
  return Math.max(0, Math.round((iou.amount - paid) * 100) / 100)
}

/**
 * Pure slice transitions. Every upsert re-sanitizes the incoming payload
 * (UI values come from free-text fields) and returns the SAME state object
 * when it is invalid, so a smuggled NaN never persists.
 */
export function socialReducer(s: SocialState, a: SocialAction): SocialState {
  switch (a.type) {
    case 'social/tontine-upsert': {
      const t = sanitizeTontine(a.tontine)
      return t ? { ...s, tontines: upsert(s.tontines, t) } : s
    }
    case 'social/tontine-archive': {
      const t = s.tontines.find((x) => x.id === a.id)
      if (!t || t.archived || !isIsoDatetime(a.nowISO)) return s
      return { ...s, tontines: upsert(s.tontines, { ...t, archived: true, updatedAt: a.nowISO }) }
    }
    case 'social/contribution-add': {
      const c = sanitizeContribution(a.contribution)
      if (!c || s.contributions.some((x) => x.id === c.id)) return s
      const t = s.tontines.find((x) => x.id === c.tontineId)
      if (!t || t.archived || c.round > t.members.length) return s
      // A double tap must not log the same round twice.
      if (s.contributions.some((x) => x.tontineId === c.tontineId && x.round === c.round)) return s
      return { ...s, contributions: unionById([...s.contributions, c]) }
    }
    case 'social/iou-upsert': {
      const iou = sanitizeIou(a.iou)
      return iou ? { ...s, ious: upsert(s.ious, iou) } : s
    }
    case 'social/iou-archive': {
      const iou = s.ious.find((x) => x.id === a.id)
      if (!iou || iou.archived || !isIsoDatetime(a.nowISO)) return s
      return { ...s, ious: upsert(s.ious, { ...iou, archived: true, updatedAt: a.nowISO }) }
    }
    case 'social/settlement-add': {
      const st = sanitizeSettlement(a.settlement)
      if (!st || s.settlements.some((x) => x.id === st.id)) return s
      const iou = s.ious.find((x) => x.id === st.iouId)
      if (!iou || iou.archived || st.amount > iouOutstanding(s, iou) + 1e-9) return s
      return { ...s, settlements: unionById([...s.settlements, st]) }
    }
    case 'social/zakat-settings': {
      if (!isIsoDatetime(a.nowISO)) return s
      if (a.goldPricePerGram !== null && !isPositive(a.goldPricePerGram)) return s
      return { ...s, zakat: sanitizeZakat({ goldPricePerGram: a.goldPricePerGram, savedAt: a.nowISO }) }
    }
    default:
      return s
  }
}
