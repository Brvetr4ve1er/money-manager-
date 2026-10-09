/**
 * Shared fixture for the four UI prototypes. Every prototype renders THIS
 * data and nothing else, so the directions are compared on art direction,
 * not on which one invented friendlier numbers. Amounts in DA are integers;
 * USD amounts are floats. Nothing here touches the real app state.
 */

export const TODAY = '2026-10-09'
export const PAYDAY = '2026-10-30'
export const DAYS_TO_PAYDAY = 21
export const MONTHLY_INCOME_DA = 85_000

/** User-set rate (DA per 1 USD). There is no API feed on purpose: the
 *  official and parallel rates differ a lot, so the user owns this number. */
export const FX_DA_PER_USD = 245

export type Currency = 'DA' | 'USD'

export interface Account {
  id: 'cash' | 'redotpay'
  name: string
  currency: Currency
  /** Last balance the user typed in. */
  anchorBalance: number
  /** Local day the anchor was confirmed. */
  anchorDate: string
  /** anchor − spend parsed/logged since the anchor. Labelled "estimated". */
  estimatedBalance: number
  kind: 'manual' | 'estimated'
}

export const ACCOUNTS: Account[] = [
  {
    id: 'cash',
    name: 'Cash & CCP',
    currency: 'DA',
    anchorBalance: 42_300,
    anchorDate: '2026-10-09',
    estimatedBalance: 42_300,
    kind: 'manual',
  },
  {
    id: 'redotpay',
    name: 'RedotPay card',
    currency: 'USD',
    anchorBalance: 118.4,
    anchorDate: '2026-10-06',
    estimatedBalance: 97.92,
    kind: 'estimated',
  },
]

/** Per-obligation lifecycle: scheduled → due_soon → paid | late → settled. */
export type ObligationStatus = 'paid' | 'due_soon' | 'upcoming' | 'late' | 'estimated'

export interface Obligation {
  id: string
  name: string
  amount: number
  currency: Currency
  /** ISO date of the next due instance. */
  dueDate: string
  status: ObligationStatus
  account: Account['id']
  /** Short lifecycle flavour: fixed bill, variable bill, subscription, installment. */
  kind: 'bill' | 'variable' | 'subscription' | 'installment'
  /** For installments: "3 of 12". */
  progress?: { paid: number; total: number }
  /** For variable bills: last three amounts, oldest first. */
  history?: number[]
}

export const OBLIGATIONS: Obligation[] = [
  { id: 'rent', name: 'Rent', amount: 25_000, currency: 'DA', dueDate: '2026-10-01', status: 'paid', account: 'cash', kind: 'bill' },
  { id: 'gym', name: 'Gym', amount: 3_000, currency: 'DA', dueDate: '2026-10-05', status: 'late', account: 'cash', kind: 'bill' },
  { id: 'internet', name: 'Idoom fibre', amount: 3_200, currency: 'DA', dueDate: '2026-10-12', status: 'due_soon', account: 'cash', kind: 'bill' },
  { id: 'phone', name: 'Ooredoo', amount: 1_500, currency: 'DA', dueDate: '2026-10-15', status: 'upcoming', account: 'cash', kind: 'bill' },
  { id: 'power', name: 'Sonelgaz', amount: 4_800, currency: 'DA', dueDate: '2026-10-18', status: 'estimated', account: 'cash', kind: 'variable', history: [4_100, 5_300, 4_800] },
  { id: 'netflix', name: 'Netflix', amount: 7.99, currency: 'USD', dueDate: '2026-10-20', status: 'upcoming', account: 'redotpay', kind: 'subscription' },
  { id: 'ai', name: 'Claude Pro', amount: 20, currency: 'USD', dueDate: '2026-10-25', status: 'upcoming', account: 'redotpay', kind: 'subscription' },
  { id: 'phone-plan', name: 'Phone installment', amount: 6_000, currency: 'DA', dueDate: '2026-10-28', status: 'upcoming', account: 'cash', kind: 'installment', progress: { paid: 3, total: 12 } },
]

export interface Transaction {
  id: string
  amount: number
  currency: Currency
  category: string
  merchant: string
  date: string
  account: Account['id']
  /** 'manual' = typed by the user, 'inbox' = confirmed from an email candidate. */
  source: 'manual' | 'inbox'
}

export const TRANSACTIONS: Transaction[] = [
  { id: 't1', amount: 150, currency: 'DA', category: 'coffee', merchant: 'Café du Coin', date: '2026-10-09', account: 'cash', source: 'manual' },
  { id: 't2', amount: 50, currency: 'DA', category: 'transport', merchant: 'Bus', date: '2026-10-09', account: 'cash', source: 'manual' },
  { id: 't3', amount: 2_400, currency: 'DA', category: 'groceries', merchant: 'Superette', date: '2026-10-08', account: 'cash', source: 'manual' },
  { id: 't4', amount: 12.49, currency: 'USD', category: 'games', merchant: 'Steam', date: '2026-10-08', account: 'redotpay', source: 'inbox' },
  { id: 't5', amount: 400, currency: 'DA', category: 'transport', merchant: 'Taxi', date: '2026-10-07', account: 'cash', source: 'manual' },
  { id: 't6', amount: 4.99, currency: 'USD', category: 'apps', merchant: 'Google Play', date: '2026-10-07', account: 'redotpay', source: 'inbox' },
  { id: 't7', amount: 20, currency: 'DA', category: 'bread', merchant: 'Boulangerie', date: '2026-10-07', account: 'cash', source: 'manual' },
  { id: 't8', amount: 3, currency: 'USD', category: 'fees', merchant: 'RedotPay FX fee', date: '2026-10-06', account: 'redotpay', source: 'inbox' },
]

/** One-tap repeat chips derived from the user's frequent (amount, category). */
export const REPEAT_CHIPS = [
  { amount: 150, category: 'coffee' },
  { amount: 50, category: 'transport' },
  { amount: 20, category: 'bread' },
  { amount: 400, category: 'transport' },
]

/**
 * Inbox-parsed candidates awaiting review. Parsing is never auto-committed:
 * each one is a claim with evidence, and the user confirms or rejects. The
 * fixture deliberately includes a duplicate (two emails for one purchase),
 * a non-charge notice, and a promo false-positive — the tray must make those
 * easy to spot.
 */
export interface Candidate {
  id: string
  merchant: string
  amount: number
  currency: Currency
  date: string
  /** The emails this candidate was derived from. */
  sources: { from: string; subject: string }[]
  /** Parser confidence 0–1. */
  confidence: number
  /** Why the parser is unsure, if it is. */
  flag?: 'duplicate' | 'not_a_charge' | 'promo'
  suggestedCategory: string
}

export const CANDIDATES: Candidate[] = [
  {
    id: 'c1',
    merchant: 'Jumia',
    amount: 5_600,
    currency: 'DA',
    date: '2026-10-09',
    sources: [{ from: 'orders@jumia.dz', subject: 'Your order #JM-48213 is confirmed' }],
    confidence: 0.92,
    suggestedCategory: 'shopping',
  },
  {
    id: 'c2',
    merchant: 'Steam',
    amount: 12.49,
    currency: 'USD',
    date: '2026-10-08',
    sources: [
      { from: 'noreply@steampowered.com', subject: 'Thank you for your Steam purchase' },
      { from: 'no-reply@redotpay.com', subject: 'Card transaction: USD 12.49 at STEAMGAMES.COM' },
    ],
    confidence: 0.97,
    flag: 'duplicate',
    suggestedCategory: 'games',
  },
  {
    id: 'c3',
    merchant: 'Netflix',
    amount: 7.99,
    currency: 'USD',
    date: '2026-10-09',
    sources: [{ from: 'info@account.netflix.com', subject: 'Your membership renews on 20 October' }],
    confidence: 0.41,
    flag: 'not_a_charge',
    suggestedCategory: 'subscriptions',
  },
  {
    id: 'c4',
    merchant: 'Spotify',
    amount: 0,
    currency: 'USD',
    date: '2026-10-08',
    sources: [{ from: 'no-reply@spotify.com', subject: 'Get 3 months of Premium for $0' }],
    confidence: 0.12,
    flag: 'promo',
    suggestedCategory: 'subscriptions',
  },
  {
    id: 'c5',
    merchant: 'Yassir',
    amount: 650,
    currency: 'DA',
    date: '2026-10-08',
    sources: [{ from: 'receipts@yassir.com', subject: 'Your trip receipt — 650 DA' }],
    confidence: 0.88,
    suggestedCategory: 'transport',
  },
]

/* ---------- derived numbers, computed once so every prototype agrees ---------- */

export function toDA(amount: number, currency: Currency): number {
  return currency === 'DA' ? amount : Math.round(amount * FX_DA_PER_USD)
}

/** Unpaid obligations due before payday, in DA. */
export const DUE_BEFORE_PAYDAY_DA = OBLIGATIONS.filter(
  (o) => o.status !== 'paid' && o.dueDate <= PAYDAY,
).reduce((sum, o) => sum + toDA(o.amount, o.currency), 0)

/** Everything the user holds, in DA, with the RedotPay estimate converted. */
export const TOTAL_HOLDINGS_DA = ACCOUNTS.reduce(
  (sum, a) => sum + toDA(a.estimatedBalance, a.currency),
  0,
)

/**
 * The one number the app exists to answer: what is actually free to spend
 * before payday. Stated as a forecast, never a verdict.
 */
export const BREATHING_ROOM_DA = TOTAL_HOLDINGS_DA - DUE_BEFORE_PAYDAY_DA
export const PER_DAY_DA = Math.floor(BREATHING_ROOM_DA / DAYS_TO_PAYDAY)

/** This month's spend so far, in DA. */
export const SPENT_THIS_MONTH_DA = TRANSACTIONS.reduce(
  (sum, t) => sum + toDA(t.amount, t.currency),
  0,
)

export function fmtDA(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} DA`
}
export function fmtUSD(n: number): string {
  return `$${n.toFixed(2)}`
}
export function fmtMoney(amount: number, currency: Currency): string {
  return currency === 'DA' ? fmtDA(amount) : fmtUSD(amount)
}
