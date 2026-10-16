/**
 * Inbox dedupe — one purchase often arrives twice (the shop's receipt and the
 * card's alert). Two candidates are the same purchase when they share amount
 * and currency, sit within a day of each other, and name a similar merchant.
 * Pure; the slice applies it on `inbox/add`, the tray uses `alreadyLogged`
 * to warn about candidates the ledger already holds (derived, never stored).
 */

import { daysBetween } from '../dates.ts'
import { toDA } from '../money.ts'
import type { Transaction } from '../../state/store.ts'
import type { Candidate, CandidateSource, InboxFlag } from './parse.ts'
import { INBOX_FLAGS } from './parse.ts'

/** "www.SteamGames.com" → "steamgames"; "Café El-Bahdja" → "cafeelbahdja". */
export function normMerchant(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^www\./, '')
    .replace(/\.(com|dz|net|org|io|co)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function similarMerchant(a: string, b: string): boolean {
  const x = normMerchant(a)
  const y = normMerchant(b)
  if (x.length < 3 || y.length < 3) return x === y && x !== ''
  return x.includes(y) || y.includes(x)
}

const near = (a: string, b: string) => Math.abs(daysBetween(a, b)) <= 1
const sameMoney = (a: number, b: number) => Math.abs(a - b) < 0.005

type Dedupable = Pick<Candidate, 'merchant' | 'amount' | 'currency' | 'date' | 'flags'>

/** Same purchase? A renewal notice or promo never merges with a real charge. */
export function isSamePurchase(a: Dedupable, b: Dedupable): boolean {
  if (a.currency !== b.currency || !sameMoney(a.amount, b.amount) || !near(a.date, b.date)) return false
  for (const f of ['not_a_charge', 'promo', 'refund'] as const) {
    if (a.flags.includes(f) !== b.flags.includes(f)) return false
  }
  return similarMerchant(a.merchant, b.merchant)
}

function unionSources(a: CandidateSource[], b: CandidateSource[]): CandidateSource[] {
  const out = [...a]
  for (const s of b) if (!out.some((x) => x.text === s.text)) out.push(s)
  return out
}

/**
 * Fold `b` into `a` (same purchase). The more confident read keeps its
 * merchant and category; sources are unioned by text. A second *distinct*
 * message adds the 'duplicate' flag — the same text pasted twice does not.
 */
export function mergeCandidate<T extends Candidate>(a: T, b: Candidate): T {
  const sources = unionSources(a.sources, b.sources)
  const lead = b.confidence > a.confidence ? b : a
  const flags = new Set<InboxFlag>([...a.flags, ...b.flags])
  if (sources.length > 1) flags.add('duplicate')
  return {
    ...a,
    merchant: lead.merchant,
    suggestedCategory: lead.suggestedCategory,
    date: a.date <= b.date ? a.date : b.date,
    sources,
    // Two independent messages agreeing is itself evidence.
    confidence: Math.min(1, Math.round((Math.max(a.confidence, b.confidence) + (sources.length > a.sources.length ? 0.05 : 0)) * 100) / 100),
    flags: INBOX_FLAGS.filter((f) => flags.has(f)),
  }
}

/** Collapse a list of fresh candidates into one per purchase. */
export function dedupeCandidates(list: Candidate[]): Candidate[] {
  const out: Candidate[] = []
  for (const c of list) {
    const i = out.findIndex((x) => isSamePurchase(x, c))
    if (i === -1) out.push(c)
    else out[i] = mergeCandidate(out[i], c)
  }
  return out
}

/**
 * Does the ledger already hold this purchase? Same DA amount (or the same
 * original USD amount, or its DA conversion at the user's rate) within a day.
 */
export function alreadyLogged(
  c: Pick<Candidate, 'amount' | 'currency' | 'date'>,
  transactions: Transaction[],
  fx: number | null,
): boolean {
  const da = toDA(Math.abs(c.amount), c.currency, fx)
  return transactions.some((t) => {
    if (t.resistedImpulse || !near(t.date, c.date)) return false
    if (c.currency === 'USD' && t.original?.currency === 'USD' && sameMoney(t.original.amount, Math.abs(c.amount))) return true
    return da !== null && Math.round(t.amountDA) === Math.round(da)
  })
}
