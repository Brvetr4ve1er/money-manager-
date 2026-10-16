/**
 * Money slice — accounts, obligations (bills/subscriptions/installments),
 * jars (envelopes), save charms, payday split, and FX. Local-first and
 * merge-safe like every other slice:
 *
 * - Entities (accounts, obligations, jars, charms) carry `updatedAt`; the
 *   newer copy wins a cross-tab merge, ties break on the greater JSON
 *   string (symmetric). Deletion is a tombstone (`archived`), never removal,
 *   so a peer that still holds the row can't resurrect it.
 * - Logs (payments, jar moves, incomes) are append-mostly and union by id.
 *   A payment can be voided (an entity edit), never deleted.
 * - Derived state is never stored: an obligation's next due date is its
 *   firstDue advanced once per live payment, a jar's balance is the sum of
 *   its moves, an account balance is its anchor minus spend since the anchor
 *   (see engine/money.ts). That is what makes the unions converge.
 */

import { isIsoDatetime, isValidDayKey } from '../../engine/dates.ts'

export type Currency = 'DA' | 'USD'

export interface Account {
  id: string
  name: string
  currency: Currency
  /** Balance the user last typed (in the account's own currency). */
  anchorBalance: number
  /** ISO datetime of that confirmation; spend after it moves the estimate. */
  anchorAt: string
  archived: boolean
  updatedAt: string
}

export type Cadence = 'monthly' | 'weekly' | 'yearly' | 'once'
export type ObligationKind = 'bill' | 'variable' | 'subscription' | 'installment'

export interface Obligation {
  id: string
  name: string
  /** Expected amount per cycle, in `currency`. Variable bills: the estimate. */
  amount: number
  currency: Currency
  kind: ObligationKind
  cadence: Cadence
  /** Local day of the first unpaid cycle when the obligation was added. */
  firstDue: string
  /** Account it is usually paid from; null = not chosen. */
  accountId: string | null
  /** Installments: total cycles, and how many were already paid before Ember. */
  installment: { total: number; paidBefore: number } | null
  /** Concrete next step ("open BaridiMob → Idoom → pay") — bills as next actions. */
  nextStep: string
  archived: boolean
  updatedAt: string
}

export interface Payment {
  id: string
  obligationId: string
  /** The cycle's due day this payment settled. */
  due: string
  paidOn: string
  /** Amount actually paid (may differ from the estimate for variable bills). */
  amount: number
  currency: Currency
  /** The ledger row this payment created (spend is a real transaction). */
  txId: string
  void: boolean
  updatedAt: string
}

export interface Jar {
  id: string
  name: string
  emoji: string
  /** Target in DA; null = open-ended jar. */
  target: number | null
  /** Local day the target should be reached by; null = no date. */
  targetDate: string | null
  /** Self-set soft lock: withdrawing asks for a confirm first. */
  locked: boolean
  archived: boolean
  updatedAt: string
}

export type JarMoveKind = 'topup' | 'withdraw' | 'cover' | 'payday' | 'charm'

export interface JarMove {
  id: string
  jarId: string
  /** Signed DA: + into the jar, − out of it. */
  amount: number
  date: string
  kind: JarMoveKind
}

export type CharmKind = 'roundup' | 'category' | 'treat-tax'

export interface Charm {
  id: string
  kind: CharmKind
  jarId: string
  /** 'category' and 'treat-tax' fire on this category; null for 'roundup'. */
  category: string | null
  /** roundup: round each log up to a multiple of this (DA). category: DA per
   *  matching log. treat-tax: percent of each matching log. */
  value: number
  /** Only logs on/after this day generate suggestions (no retroactive flood). */
  since: string
  active: boolean
  archived: boolean
  updatedAt: string
}

export interface Income {
  id: string
  accountId: string
  /** In the account's currency. */
  amount: number
  date: string
  /** ISO datetime it was recorded — compared against the account anchor. */
  at: string
  note: string
}

export interface PaydaySplitRow {
  jarId: string
  amount: number
}

export interface MoneySettings {
  /** User-set DA per 1 USD; null = not set (USD amounts can't be converted). */
  fxDaPerUsd: number | null
  /** Day of month income usually lands (1–28); null = end of month. */
  paydayDay: number | null
  /** Saved payday split replayed by the payday ritual. */
  split: PaydaySplitRow[]
  savedAt: string
}

export interface MoneyState {
  accounts: Account[]
  obligations: Obligation[]
  payments: Payment[]
  jars: Jar[]
  jarMoves: JarMove[]
  charms: Charm[]
  incomes: Income[]
  /** Charm suggestion ids the user dismissed. */
  dismissed: string[]
  settings: MoneySettings
}

export function defaultMoney(): MoneyState {
  return {
    accounts: [],
    obligations: [],
    payments: [],
    jars: [],
    jarMoves: [],
    charms: [],
    incomes: [],
    dismissed: [],
    settings: { fxDaPerUsd: null, paydayDay: null, split: [], savedAt: '' },
  }
}

/* ------------------------------ sanitize ------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isMoney = (v: unknown): v is number => isNum(v) && v >= 0
const isCurrency = (v: unknown): v is Currency => v === 'DA' || v === 'USD'
const CADENCES: ReadonlyArray<Cadence> = ['monthly', 'weekly', 'yearly', 'once']
const OB_KINDS: ReadonlyArray<ObligationKind> = ['bill', 'variable', 'subscription', 'installment']
const MOVE_KINDS: ReadonlyArray<JarMoveKind> = ['topup', 'withdraw', 'cover', 'payday', 'charm']
const CHARM_KINDS: ReadonlyArray<CharmKind> = ['roundup', 'category', 'treat-tax']

function sanitizeAccount(v: unknown): Account | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.name) || !isCurrency(v.currency)) return null
  if (!isNum(v.anchorBalance) || !isIsoDatetime(v.anchorAt) || !isIsoDatetime(v.updatedAt)) return null
  return {
    id: v.id,
    name: v.name,
    currency: v.currency,
    anchorBalance: v.anchorBalance,
    anchorAt: v.anchorAt,
    archived: v.archived === true,
    updatedAt: v.updatedAt,
  }
}

function sanitizeObligation(v: unknown): Obligation | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.name) || !isMoney(v.amount) || !isCurrency(v.currency)) return null
  if (!OB_KINDS.includes(v.kind as ObligationKind) || !CADENCES.includes(v.cadence as Cadence)) return null
  if (!isValidDayKey(v.firstDue) || !isIsoDatetime(v.updatedAt)) return null
  let installment: Obligation['installment'] = null
  if (isRecord(v.installment)) {
    const { total, paidBefore } = v.installment
    if (!isNum(total) || total < 1 || !isNum(paidBefore) || paidBefore < 0 || paidBefore > total) return null
    installment = { total: Math.floor(total), paidBefore: Math.floor(paidBefore) }
  }
  return {
    id: v.id,
    name: v.name,
    amount: v.amount,
    currency: v.currency,
    kind: v.kind as ObligationKind,
    cadence: v.cadence as Cadence,
    firstDue: v.firstDue,
    accountId: isStr(v.accountId) ? v.accountId : null,
    installment,
    nextStep: isStr(v.nextStep) ? v.nextStep : '',
    archived: v.archived === true,
    updatedAt: v.updatedAt,
  }
}

function sanitizePayment(v: unknown): Payment | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.obligationId) || !isStr(v.txId)) return null
  if (!isValidDayKey(v.due) || !isValidDayKey(v.paidOn) || !isMoney(v.amount) || !isCurrency(v.currency)) return null
  if (!isIsoDatetime(v.updatedAt)) return null
  return {
    id: v.id,
    obligationId: v.obligationId,
    due: v.due,
    paidOn: v.paidOn,
    amount: v.amount,
    currency: v.currency,
    txId: v.txId,
    void: v.void === true,
    updatedAt: v.updatedAt,
  }
}

function sanitizeJar(v: unknown): Jar | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.name) || !isIsoDatetime(v.updatedAt)) return null
  const target = v.target ?? null
  if (target !== null && !(isNum(target) && target > 0)) return null
  const targetDate = v.targetDate ?? null
  if (targetDate !== null && !isValidDayKey(targetDate)) return null
  return {
    id: v.id,
    name: v.name,
    emoji: isStr(v.emoji) ? v.emoji : '🫙',
    target,
    targetDate,
    locked: v.locked === true,
    archived: v.archived === true,
    updatedAt: v.updatedAt,
  }
}

function sanitizeMove(v: unknown): JarMove | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.jarId) || !isNum(v.amount) || v.amount === 0) return null
  if (!isValidDayKey(v.date) || !MOVE_KINDS.includes(v.kind as JarMoveKind)) return null
  return { id: v.id, jarId: v.jarId, amount: v.amount, date: v.date, kind: v.kind as JarMoveKind }
}

function sanitizeCharm(v: unknown): Charm | null {
  if (!isRecord(v) || !isStr(v.id) || !CHARM_KINDS.includes(v.kind as CharmKind) || !isStr(v.jarId)) return null
  if (!isNum(v.value) || v.value <= 0 || !isValidDayKey(v.since) || !isIsoDatetime(v.updatedAt)) return null
  const kind = v.kind as CharmKind
  const category = isStr(v.category) && v.category.trim() !== '' ? v.category : null
  if (kind !== 'roundup' && category === null) return null
  if (kind === 'treat-tax' && v.value > 100) return null
  return {
    id: v.id,
    kind,
    jarId: v.jarId,
    category: kind === 'roundup' ? null : category,
    value: v.value,
    since: v.since,
    active: v.active !== false,
    archived: v.archived === true,
    updatedAt: v.updatedAt,
  }
}

function sanitizeIncome(v: unknown): Income | null {
  if (!isRecord(v) || !isStr(v.id) || !isStr(v.accountId) || !isMoney(v.amount) || v.amount === 0) return null
  if (!isValidDayKey(v.date) || !isIsoDatetime(v.at)) return null
  return { id: v.id, accountId: v.accountId, amount: v.amount, date: v.date, at: v.at, note: isStr(v.note) ? v.note : '' }
}

function sanitizeSettings(v: unknown): MoneySettings {
  const out = defaultMoney().settings
  if (!isRecord(v)) return out
  if (isNum(v.fxDaPerUsd) && v.fxDaPerUsd > 0) out.fxDaPerUsd = v.fxDaPerUsd
  if (isNum(v.paydayDay) && v.paydayDay >= 1 && v.paydayDay <= 28) out.paydayDay = Math.floor(v.paydayDay)
  if (Array.isArray(v.split)) {
    const seen = new Set<string>()
    for (const r of v.split) {
      if (isRecord(r) && isStr(r.jarId) && isNum(r.amount) && r.amount > 0 && !seen.has(r.jarId)) {
        seen.add(r.jarId)
        out.split.push({ jarId: r.jarId, amount: r.amount })
      }
    }
  }
  if (isIsoDatetime(v.savedAt)) out.savedAt = v.savedAt
  return out
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Newer updatedAt wins (compared as instants — ISO strings with and without
 *  milliseconds do not sort chronologically); ties keep the greater JSON. */
function newer<T extends { updatedAt: string }>(a: T, b: T): T {
  const ta = Date.parse(a.updatedAt)
  const tb = Date.parse(b.updatedAt)
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
 * Field-by-field validation of an untrusted money payload. Malformed rows
 * are dropped (never repaired into something the user didn't enter), and
 * duplicates collapse through the same rules the merge uses, so a sanitized
 * slice is already a merge fixpoint.
 */
export function sanitizeMoney(v: unknown): MoneyState {
  const out = defaultMoney()
  if (!isRecord(v)) return out
  out.accounts = mergeEntities(clean(v.accounts, sanitizeAccount))
  out.obligations = mergeEntities(clean(v.obligations, sanitizeObligation))
  out.payments = mergeEntities(clean(v.payments, sanitizePayment))
  out.jars = mergeEntities(clean(v.jars, sanitizeJar))
  out.jarMoves = unionById(clean(v.jarMoves, sanitizeMove))
  out.charms = mergeEntities(clean(v.charms, sanitizeCharm))
  out.incomes = unionById(clean(v.incomes, sanitizeIncome))
  out.dismissed = Array.isArray(v.dismissed) ? [...new Set(v.dismissed.filter(isStr))].sort() : []
  out.settings = sanitizeSettings(v.settings)
  return out
}

/** Symmetric cross-tab merge; output is in defaultMoney() key order. */
export function mergeMoney(a: MoneyState, b: MoneyState): MoneyState {
  let settings = a.settings
  if (a.settings.savedAt !== b.settings.savedAt) {
    if (b.settings.savedAt > a.settings.savedAt) settings = b.settings
  } else if (JSON.stringify(b.settings) > JSON.stringify(a.settings)) {
    settings = b.settings
  }
  return {
    accounts: mergeEntities([...a.accounts, ...b.accounts]),
    obligations: mergeEntities([...a.obligations, ...b.obligations]),
    payments: mergeEntities([...a.payments, ...b.payments]),
    jars: mergeEntities([...a.jars, ...b.jars]),
    jarMoves: unionById([...a.jarMoves, ...b.jarMoves]),
    charms: mergeEntities([...a.charms, ...b.charms]),
    incomes: unionById([...a.incomes, ...b.incomes]),
    dismissed: [...new Set([...a.dismissed, ...b.dismissed])].sort(),
    settings,
  }
}

/* ------------------------------ reducer ------------------------------- */

export type MoneyAction =
  | { type: 'money/account-upsert'; account: Account }
  | { type: 'money/obligation-upsert'; obligation: Obligation }
  | { type: 'money/payment-void'; id: string; nowISO: string }
  | { type: 'money/jar-upsert'; jar: Jar }
  | { type: 'money/jar-move'; move: JarMove }
  | { type: 'money/jar-moves'; moves: JarMove[] }
  | { type: 'money/charm-upsert'; charm: Charm }
  | { type: 'money/charm-dismiss'; id: string }
  | { type: 'money/income-add'; income: Income }
  | { type: 'money/settings'; settings: Omit<MoneySettings, 'savedAt'>; nowISO: string }

function upsert<T extends { id: string }>(xs: T[], x: T): T[] {
  return [...xs.filter((y) => y.id !== x.id), x].sort(byId)
}

/**
 * Pure slice transitions. Every upsert re-runs the sanitizer on the incoming
 * entity (UI payloads come from free-text fields), and is a no-op when it
 * fails — a smuggled NaN must never persist and then vanish on reload.
 */
export function moneyReducer(s: MoneyState, a: MoneyAction): MoneyState {
  switch (a.type) {
    case 'money/account-upsert': {
      const acc = sanitizeAccount(a.account)
      return acc ? { ...s, accounts: upsert(s.accounts, acc) } : s
    }
    case 'money/obligation-upsert': {
      const ob = sanitizeObligation(a.obligation)
      return ob ? { ...s, obligations: upsert(s.obligations, ob) } : s
    }
    case 'money/payment-void': {
      const p = s.payments.find((x) => x.id === a.id)
      // A bad stamp would make the voided row fail the sanitizer at reload,
      // erasing the payment entirely — reject it instead.
      if (!p || p.void || !isIsoDatetime(a.nowISO)) return s
      return { ...s, payments: upsert(s.payments, { ...p, void: true, updatedAt: a.nowISO }) }
    }
    case 'money/jar-upsert': {
      const jar = sanitizeJar(a.jar)
      return jar ? { ...s, jars: upsert(s.jars, jar) } : s
    }
    case 'money/jar-move':
      return moneyReducer(s, { type: 'money/jar-moves', moves: [a.move] })
    case 'money/jar-moves': {
      const fresh = a.moves
        .map(sanitizeMove)
        .filter((m): m is JarMove => m !== null && !s.jarMoves.some((x) => x.id === m.id))
      return fresh.length === 0 ? s : { ...s, jarMoves: unionById([...s.jarMoves, ...fresh]) }
    }
    case 'money/charm-upsert': {
      const c = sanitizeCharm(a.charm)
      return c ? { ...s, charms: upsert(s.charms, c) } : s
    }
    case 'money/charm-dismiss':
      return s.dismissed.includes(a.id) ? s : { ...s, dismissed: [...s.dismissed, a.id].sort() }
    case 'money/income-add': {
      const inc = sanitizeIncome(a.income)
      if (!inc || s.incomes.some((x) => x.id === inc.id)) return s
      return { ...s, incomes: unionById([...s.incomes, inc]) }
    }
    case 'money/settings':
      return { ...s, settings: sanitizeSettings({ ...a.settings, savedAt: a.nowISO }) }
  }
}

/** Internal: record a payment (the root reducer pairs it with a ledger row). */
export function withPayment(s: MoneyState, p: Payment): MoneyState {
  const ok = sanitizePayment(p)
  if (!ok || s.payments.some((x) => x.id === ok.id)) return s
  return { ...s, payments: upsert(s.payments, ok) }
}
