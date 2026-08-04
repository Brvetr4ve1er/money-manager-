/**
 * Local-first persistence. Manual logging is the core mechanic, not a
 * fallback — the store is built around fast transaction entry.
 */

import {
  MAX_TOTAL_XP,
  XP_REWARDS,
  xpFromLog,
  xpStateFromTotal,
  type XpAction,
  type XpGrant,
  type XpState,
} from '../engine/xp.ts'
import type { Stage } from '../engine/healthScore.ts'
import { LESSON_IDS } from '../content/lessons.ts'
// Runtime-safe despite achievements.ts importing store types: type imports
// erase at build, so only this direction carries code (same shape as boss.ts).
import { ACHIEVEMENT_IDS } from '../engine/achievements.ts'

export interface Transaction {
  id: string
  amountDA: number
  category: string
  note?: string
  /** ISO date string. */
  date: string
  /** True when this entry was flagged as a resisted impulse (no money spent). */
  resistedImpulse?: boolean
  /** True when the user explicitly flagged this purchase as a yielded impulse
   *  (a future "I bought it anyway" flow). Only flagged events may count
   *  against Impulse Control — ordinary planned spending never does. */
  impulseFlagged?: boolean
}

export interface ProfileGoal {
  /** Display name only — engines see target/current/contribution. */
  name: string
  target: number
  current: number
  monthlyContribution: number
}

/**
 * The user's real numbers from the setup card, persisted as entered. This is
 * deliberately NOT the engine-facing UserProfile: fields the user never
 * answered stay null here (blank ≠ zero — a blank emergency fund is excluded
 * from the Health Score, a typed 0 is real data scoring 0), and the engine
 * shape is derived in resolveProfile. `null` at the AppState level means
 * setup never completed and the engines run on DEMO_PROFILE.
 */
export interface ProfileData {
  monthlyIncome: number
  monthlyEssentials: number
  /** null = not entered: the EF component stays structurally excluded. */
  efBalance: number | null
  /** null = not entered: the DT component stays structurally excluded. */
  debt: { balance: number; minimum: number } | null
  goal: ProfileGoal | null
  /** Local day (YYYY-MM-DD) this profile was saved — newer wins in mergeStates. */
  savedDate: string
}

export interface Quest {
  id: string
  text: string
  xpAction: XpAction
  /** True when the app itself verifies completion (e.g. SimCard dispatches on
   *  an actual simulation run). Verified quests render as non-interactive
   *  status rows — a tap must never self-report a quest the code promises is
   *  verified. */
  verified?: boolean
  done: boolean
}

/**
 * One collected codex lesson. The date is the FIRST day the lesson was read —
 * lessonForDay excludes ids seen strictly before today, so keeping the
 * earliest date everywhere (sanitize, merge, reducer) is what makes "no
 * repeats until all seen" hold across tabs and reloads.
 */
export interface LessonSeen {
  id: string
  /** Local day (YYYY-MM-DD) the lesson was first read. */
  date: string
}

/**
 * One earned achievement badge. The date is the local day the predicate first
 * held on this device; a peer tab earning the same badge merges by id keeping
 * the EARLIEST date — a badge, once shown as earned on some day, must never
 * drift to a later date after a merge.
 */
export interface AchievementUnlock {
  id: string
  /** Local day (YYYY-MM-DD) the badge was earned. */
  date: string
}

export interface AppState {
  transactions: Transaction[]
  xp: XpState
  /** Append-only XP grant evidence, unioned by id across tabs (see mergeStates). */
  xpLog: XpGrant[]
  prevHealthScore: number | null
  stage: Stage | null
  /** Local day (YYYY-MM-DD) the health snapshot was last persisted; '' = never. */
  healthDate: string
  quests: Quest[]
  questsDate: string
  /** Codex collection — every lesson ever read, unioned by id across tabs. */
  lessonsSeen: LessonSeen[]
  muted: boolean
  /** Real numbers from the setup card; null = demo profile still in use. */
  profile: ProfileData | null
  /** Earned achievement badges (ids + dates), unioned by id across tabs. */
  achievements: AchievementUnlock[]
}

const KEY = 'ember-state-v1'

export const DEFAULT_QUESTS: Omit<Quest, 'done'>[] = [
  { id: 'log', text: 'Log every purchase today', xpAction: 'logExpense' },
  // Every quest must be an action the app actually supports today — a quest
  // promising nonexistent content pays XP for a claim the user cannot
  // perform. The lesson quest exists BECAUSE lessons.ts now ships real
  // content; it is verified (pressing "Got it" on today's actual lesson
  // dispatches completion — see App), and it is the sole XP vehicle for
  // reading: LessonCard's tap itself grants nothing extra, so one read pays
  // readLesson exactly once per day.
  { id: 'lesson', text: "Read today's lesson", xpAction: 'readLesson', verified: true },
  // The sim quest self-verifies the same way: running a simulation completes
  // it (see SimCard's onRun in App) — and because it is verified, QuestCard
  // renders it without a tap-to-complete button.
  { id: 'sim', text: 'Run one decision simulation', xpAction: 'runSimulation', verified: true },
  // The Ledger's "Recent" list is the surface this quest points at, and it now
  // genuinely groups by day with per-day totals — so the old constraint here
  // ("must not promise a yesterday view the app doesn't have") is satisfied and
  // the wording is free to move. It deliberately hasn't, and it stays a
  // self-report tap rather than joining the verified quests, for one reason:
  // the only thing the app can OBSERVE on that card is the expand control, and
  // that control does not exist until a fourth logged day. Verifying against it
  // would make a DAILY quest unreachable for the whole first week — and naming
  // "yesterday" in the text would promise a heading a day-1 ledger cannot
  // render. A quest the app cannot observe is honest as a self-report; a
  // verified flag over an unobservable action is the hollow grant.
  { id: 'review', text: 'Look back over your recent purchases', xpAction: 'reviewRecent' },
]

function localDayISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Local-calendar day key (YYYY-MM-DD). Deliberately NOT toISOString(): the
 * target market is UTC+1, so UTC keys would roll quests at 01:00 local time
 * and stamp late-night purchases with the previous day/month.
 */
export function todayISO(): string {
  return localDayISO(new Date())
}

/**
 * Unique id for transactions. crypto.randomUUID exists only in secure
 * contexts (https/localhost) — on a plain-http deployment (LAN preview, cheap
 * shared hosting) it is undefined, and calling it would throw from the log
 * handlers, silently killing the app's core action. getRandomValues IS
 * available in insecure contexts, so fall back to it: merge/dedupe only needs
 * uniqueness, never the RFC-4122 shape.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return `${Date.now().toString(36)}-${rand[0].toString(36)}-${rand[1].toString(36)}`
}

export function freshQuests(): Quest[] {
  return DEFAULT_QUESTS.map((q) => ({ ...q, done: false }))
}

/**
 * Roll the daily quest list when the stored quest day is not `today`.
 * Used by loadState at mount AND by the day-change effect in App, so a tab
 * left open past midnight rolls quests the same way a reload does. Returns
 * the same object when nothing needs to change.
 */
export function rollQuests(state: AppState, today: string): AppState {
  if (state.questsDate === today) return state
  return { ...state, quests: freshQuests(), questsDate: today }
}

export function defaultState(): AppState {
  return {
    transactions: [],
    xp: { level: 1, xpIntoLevel: 0, totalXp: 0 },
    xpLog: [],
    prevHealthScore: null,
    stage: null,
    healthDate: '',
    quests: freshQuests(),
    questsDate: todayISO(),
    lessonsSeen: [],
    muted: false,
    profile: null,
    achievements: [],
  }
}

const STAGES: ReadonlyArray<Stage> = ['ember', 'hearth', 'bonfire', 'beacon']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isOptionalBoolean(v: unknown): v is boolean | undefined {
  return v === undefined || typeof v === 'boolean'
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Shape AND calendar validity: DAY_KEY_RE alone accepts impossible keys like
 * '2026-99-99' or '2026-02-30', which compare lexicographically ABOVE every
 * real day in their year — a hand-edited payload could pin such a row inside
 * every trailing window and atop the ledger sort forever. Round-tripping
 * through the same local-day formatter the app stamps dates with (Date
 * normalizes overflow: month 99 rolls into the next years) rejects anything
 * the app itself could never have written.
 */
function computeValidDayKey(v: string): boolean {
  if (!DAY_KEY_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  return localDayISO(new Date(y, m - 1, d)) === v
}

/**
 * Memoised, and that is a startup-cost fix, not a micro-optimisation: this
 * gate runs once per transaction, per codex entry and per badge on every
 * load — synchronously inside App's useReducer initialiser, BEFORE first
 * paint — and again on every peer-tab write. A year of logging holds ~365
 * distinct keys, so at N=5000 the same few hundred strings each allocate a
 * Date and re-format it dozens of times over; the check measured half of
 * sanitizeState's total. Sound to cache because the answer is a pure
 * function of the string (the local-calendar rules it round-trips through
 * cannot change under a running tab).
 *
 * The cap is the part that matters for the sanitizer's contract: a hostile
 * or corrupt payload of all-distinct junk keys must not be able to grow an
 * unbounded map: past the cap the check simply stops being cached and
 * behaves exactly as it did before. Cache misses cost one map probe.
 */
const DAY_KEY_CACHE_MAX = 4096
const dayKeyCache = new Map<string, boolean>()

function isValidDayKey(v: string): boolean {
  const hit = dayKeyCache.get(v)
  if (hit !== undefined) return hit
  const ok = computeValidDayKey(v)
  if (dayKeyCache.size < DAY_KEY_CACHE_MAX) dayKeyCache.set(v, ok)
  return ok
}

/**
 * Union {id, date} entries by id, keeping the earliest date, in canonical id
 * order. Deterministic and commutative regardless of input order, so the
 * sanitizer and mergeStates share it and every tab converges on one JSON
 * string (the merge fixpoint compares strings — see mergeStates). Shared by
 * the codex (LessonSeen) and the achievement shelf (AchievementUnlock): both
 * collections key their UI off the FIRST day the entry landed.
 */
function dedupeEarliestById(entries: { id: string; date: string }[]): { id: string; date: string }[] {
  const byId = new Map<string, { id: string; date: string }>()
  for (const e of entries) {
    const prev = byId.get(e.id)
    if (!prev || e.date < prev.date) byId.set(e.id, { id: e.id, date: e.date })
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Grant id for XP earned before the grant log existed (older schemas). */
const LEGACY_XP_GRANT_ID = 'legacy-total'

const XP_GRANT_ACTIONS: ReadonlySet<string> = new Set([...Object.keys(XP_REWARDS), 'legacy'])

function isXpGrant(v: unknown): v is XpGrant {
  // The MAX_TOTAL_XP ceiling applies per grant too: xpFromLog sums amounts,
  // and a single hand-edited grant of 1e300 would push the fold's total into
  // the float range where xpStateFromTotal's level loop can no longer
  // terminate without its own clamp. No real grant exceeds the reward table.
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.action === 'string' &&
    XP_GRANT_ACTIONS.has(v.action) &&
    isFiniteNumber(v.amount) &&
    v.amount >= 0 &&
    v.amount <= MAX_TOTAL_XP &&
    typeof v.date === 'string' &&
    (v.date === '' || DAY_KEY_RE.test(v.date))
  )
}

function isTransaction(v: unknown): v is Transaction {
  // Strict on exactly the fields that feed the health score: a negative
  // amount would *reduce* trailing-30d spend (inflating SR/BA), and a truthy
  // non-boolean resistedImpulse (e.g. "no") would count as a resisted impulse
  // in IC while excluding the row from spend. Dates are compared
  // lexicographically against YYYY-MM-DD window cutoffs, so enforce the shape
  // AND calendar validity (see isValidDayKey).
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    isFiniteNumber(v.amountDA) &&
    v.amountDA >= 0 &&
    typeof v.category === 'string' &&
    typeof v.date === 'string' &&
    isValidDayKey(v.date) &&
    (v.note === undefined || typeof v.note === 'string') &&
    isOptionalBoolean(v.resistedImpulse) &&
    isOptionalBoolean(v.impulseFlagged)
  )
}

/** Finite and non-negative — the validity rule for every profile amount. */
function isMoney(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0
}

/**
 * Validate an untrusted profile payload into ProfileData, or null when any
 * field is malformed. All-or-nothing on purpose: the profile is one atomic
 * user entry, and salvaging half of it (say, real income next to a NaN-turned-
 * default essentials) would feed the Health Score a mixture the user never
 * stated. Optional sections accept undefined as null (older payloads), and the
 * result is rebuilt field by field so every stored profile carries one
 * canonical key order — mergeStates compares profiles as JSON strings.
 * Shared by sanitizeState and the PROFILE_SET reducer path.
 */
export function sanitizeProfile(v: unknown): ProfileData | null {
  if (!isRecord(v)) return null
  if (!isMoney(v.monthlyIncome) || !isMoney(v.monthlyEssentials)) return null
  const ef = v.efBalance ?? null
  if (ef !== null && !isMoney(ef)) return null
  const rawDebt = v.debt ?? null
  let debt: ProfileData['debt'] = null
  if (rawDebt !== null) {
    if (!isRecord(rawDebt) || !isMoney(rawDebt.balance) || !isMoney(rawDebt.minimum)) return null
    debt = { balance: rawDebt.balance, minimum: rawDebt.minimum }
  }
  const rawGoal = v.goal ?? null
  let goal: ProfileData['goal'] = null
  if (rawGoal !== null) {
    if (
      !isRecord(rawGoal) ||
      typeof rawGoal.name !== 'string' ||
      !isMoney(rawGoal.target) ||
      !isMoney(rawGoal.current) ||
      !isMoney(rawGoal.monthlyContribution)
    ) {
      return null
    }
    goal = {
      name: rawGoal.name,
      target: rawGoal.target,
      current: rawGoal.current,
      monthlyContribution: rawGoal.monthlyContribution,
    }
  }
  // Same calendar-validity rule as transaction dates: savedDate arbitrates
  // profile recency lexicographically in mergeStates, so an impossible key
  // ('2026-99-99') would make a hand-edited profile unbeatable forever.
  if (typeof v.savedDate !== 'string' || !isValidDayKey(v.savedDate)) return null
  return {
    monthlyIncome: v.monthlyIncome,
    monthlyEssentials: v.monthlyEssentials,
    efBalance: ef,
    debt,
    goal,
    savedDate: v.savedDate,
  }
}

/**
 * Field-by-field validation of untrusted persisted JSON over defaultState().
 * A corrupted, hand-edited, or older-schema payload must never brick the app:
 * every unrecognized field falls back to its default instead of crashing at
 * first render. Exported for tests.
 */
export function sanitizeState(parsed: unknown): AppState {
  const out = defaultState()
  if (!isRecord(parsed)) return out

  if (Array.isArray(parsed.transactions)) {
    out.transactions = parsed.transactions.filter(isTransaction)
  }
  const xp = parsed.xp
  if (isRecord(xp) && isFiniteNumber(xp.totalXp)) {
    // Only totalXp is user data — level/xpIntoLevel are BY CONSTRUCTION a pure
    // function of it (xpStateFromTotal), so persisted values are never
    // trusted. Clamping them individually would still admit an inconsistent
    // triple like { level: 7, xpIntoLevel: 10, totalXp: 0 }, which renders as
    // "Level 7" with zero evidence until the first cross-tab merge rebuilds
    // from totalXp and the level silently collapses. Deriving here makes load
    // and merge agree on the same derivation. xpStateFromTotal clamps into
    // [0, MAX_TOTAL_XP]: an absurd persisted total (1e300) must derive a
    // bounded level instead of spinning the level loop forever at load.
    out.xp = xpStateFromTotal(xp.totalXp)
  }
  if (Array.isArray(parsed.xpLog)) {
    // Union by id like transactions; a duplicated id keeps the larger amount
    // so applying the same rule in any order (or twice) lands on the same log.
    const byId = new Map<string, XpGrant>()
    for (const g of parsed.xpLog) {
      if (isXpGrant(g)) {
        const prev = byId.get(g.id)
        if (!prev || g.amount > prev.amount) {
          byId.set(g.id, { id: g.id, action: g.action, amount: g.amount, date: g.date })
        }
      }
    }
    out.xpLog = [...byId.values()]
  }
  // Reconcile the counter with the grant evidence. XP earned before the log
  // existed (older schema) has no entries: bank the shortfall as a single
  // mergeable baseline grant, so deriving XP from a merged log can never pay
  // less than the total this payload already showed. If instead the log holds
  // MORE than the counter (corrupt/hand-edited xp field), the evidence wins.
  const logged = xpFromLog(out.xpLog)
  if (logged.totalXp > out.xp.totalXp) {
    out.xp = logged
  } else if (out.xp.totalXp > logged.totalXp) {
    const prior = out.xpLog.find((g) => g.id === LEGACY_XP_GRANT_ID)
    out.xpLog = [
      {
        id: LEGACY_XP_GRANT_ID,
        action: 'legacy',
        amount: (prior?.amount ?? 0) + (out.xp.totalXp - logged.totalXp),
        date: '',
      },
      ...out.xpLog.filter((g) => g.id !== LEGACY_XP_GRANT_ID),
    ]
  }
  if (isFiniteNumber(parsed.prevHealthScore)) {
    // Clamp into the score's [0, 100] range: a hand-edited negative snapshot
    // would smooth() to a negative score and crash stage mapping at first
    // render — the exact permanent brick this sanitizer exists to prevent.
    out.prevHealthScore = Math.min(100, Math.max(0, parsed.prevHealthScore))
  }
  if (STAGES.includes(parsed.stage as Stage)) {
    out.stage = parsed.stage as Stage
  }
  // Day keys must hold the YYYY-MM-DD shape the rest of the app compares
  // lexicographically (same rule as transaction dates): finalizeHealthThrough
  // walks single-day steps from healthDate, and a free-form string here (a
  // hand-edited 'never', an old schema's ISO timestamp) would feed the
  // rollover garbage. Mismatches fall back to the default ('' = never).
  if (typeof parsed.healthDate === 'string' && DAY_KEY_RE.test(parsed.healthDate)) {
    out.healthDate = parsed.healthDate
  }
  if (Array.isArray(parsed.quests)) {
    // Rebuild from the canonical roster: only same-day completion state is
    // user data — text, xpAction, and `verified` are product invariants the
    // roster owns. Trusting the persisted list wholesale would let unknown or
    // duplicate ids (old schemas, hand-edited payloads) render as tappable
    // self-report rows, each an unearned same-day XP grant.
    const doneById = new Map<string, boolean>()
    for (const q of parsed.quests) {
      if (isRecord(q) && typeof q.id === 'string') doneById.set(q.id, q.done === true)
    }
    out.quests = DEFAULT_QUESTS.map((d) => ({ ...d, done: doneById.get(d.id) === true }))
  }
  if (typeof parsed.questsDate === 'string' && DAY_KEY_RE.test(parsed.questsDate)) {
    out.questsDate = parsed.questsDate
  }
  if (Array.isArray(parsed.lessonsSeen)) {
    // Ids must exist in the canonical roster (a hand-added 'lesson31' would
    // inflate the codex count past its own denominator forever) and dates must
    // be real calendar keys — lessonForDay compares them lexicographically
    // against today. Duplicated ids keep the EARLIEST date: the first-read day
    // is what the no-repeat rotation keys off, and taking min in any order
    // (or twice) lands on the same list — the same idempotence rule the
    // xpLog/transaction unions follow.
    out.lessonsSeen = dedupeEarliestById(
      parsed.lessonsSeen.filter(
        (e): e is LessonSeen =>
          isRecord(e) &&
          typeof e.id === 'string' &&
          LESSON_IDS.has(e.id) &&
          typeof e.date === 'string' &&
          isValidDayKey(e.date),
      ),
    )
  }
  if (typeof parsed.muted === 'boolean') {
    out.muted = parsed.muted
  }
  // All-or-nothing (see sanitizeProfile): a malformed profile falls back to
  // null — the engines return to the honestly-disclosed demo numbers rather
  // than run on a half-default mixture.
  out.profile = sanitizeProfile(parsed.profile)
  if (Array.isArray(parsed.achievements)) {
    // Same gatekeeping as the codex: ids must exist in the canonical roster
    // (a hand-added id would inflate the earned count past the shelf's own
    // denominator) and dates must be real calendar keys. Dropping an invalid
    // unlock costs nothing — the predicate still holds, so useAchievements
    // simply re-earns the badge (stamped with today) at next render.
    out.achievements = dedupeEarliestById(
      parsed.achievements.filter(
        (e): e is AchievementUnlock =>
          isRecord(e) &&
          typeof e.id === 'string' &&
          ACHIEVEMENT_IDS.has(e.id) &&
          typeof e.date === 'string' &&
          isValidDayKey(e.date),
      ),
    )
  }
  return out
}

/**
 * Has this browser ever run Ember? The cold-start gate (Root.tsx) shows the
 * landing surface to a first-time visitor and the app to everyone else, and
 * this is the whole test.
 *
 * Deliberately NOT `loadState()` compared against `defaultState()`: loadState
 * returns a default state both when the key is missing AND when it is present
 * but corrupt, so that comparison would throw a returning user whose payload
 * got mangled back onto a marketing page instead of into their app. The
 * PRESENCE of the key is the honest signal — App's save effect writes it on
 * mount, so entering the app once is what retires the landing for good.
 *
 * Same try/catch as the rest of the store: localStorage getters throw outright
 * in some privacy modes, and a marketing gate must never be the thing that
 * stops the app from booting. Unreadable storage reads as "first visit".
 */
export function hasSavedState(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    const state = sanitizeState(JSON.parse(raw) as unknown)
    return rollQuests(state, todayISO())
  } catch {
    return defaultState()
  }
}

/**
 * Persist, and REPORT whether the write landed. The boolean is not optional
 * politeness: setItem throws QuotaExceededError when the origin's budget is
 * exhausted (~13,000 transactions at the measured 189 chars each) and — far
 * more commonly — in privacy modes that grant zero quota, where every write
 * fails from the very first tap. Swallowing that made the app confirm a save
 * it never made: the row rendered, the undo strip read "Logged 4,200 DA",
 * the live region announced the XP, and localStorage was byte-for-byte
 * unchanged. For a local-first manual-logging app the write IS the product,
 * and Trust Rule 7 ("data leaves when you do") presumes the data is there to
 * leave with. The caller must surface a false — see App.
 *
 * In-memory state stays authoritative on failure: the row must not vanish
 * from the screen it was just added to, and "Export my data" reads that same
 * in-memory state, so export remains the honest recovery path.
 */
export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/**
 * Merge a peer tab's freshly-written state into this tab's in-memory state.
 * Two open tabs (common on mobile browsers that keep background tabs alive)
 * each saveState() on every change; without a merge, whichever tab writes
 * last — even on an automatic midnight quest roll — silently erases the
 * other tab's transactions, the worst possible failure for a local-first app.
 * The merge must be deterministic, idempotent AND commutative — merge(A, B)
 * deep-equals merge(B, A) — so that when writes truly cross (both tabs save
 * before receiving each other's storage event), both converge on one
 * canonical payload and the write ping-pong settles instead of oscillating.
 * When the merge changes nothing, `local` itself is returned, so the HYDRATE
 * reducer path (and React's bail-out) skips the re-render and re-save.
 */
export function mergeStates(local: AppState, incoming: AppState): AppState {
  // Transactions: union by id, in canonical order — date desc (the Ledger's
  // newest-first), id asc within a day. Insertion-ordered output would make
  // crossed writes each adopt the other's differing ordering forever, every
  // save a new JSON string that never reaches a fixpoint.
  const incomingIds = new Set(incoming.transactions.map((t) => t.id))
  const transactions = [
    ...local.transactions.filter((t) => !incomingIds.has(t.id)),
    ...incoming.transactions,
  ].sort((a, b) =>
    a.date !== b.date ? (a.date > b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  // XP: union the grant logs by id and fold. Diverged tabs each hold grants
  // the other missed (A logged a purchase while B finished a quest), and a
  // bare max(totalXp) would silently drop the smaller tab's grant even though
  // the transaction/quest union preserves its evidence. Duplicated ids keep
  // the larger amount (deterministic in any merge order); the fold re-applies
  // the resist daily cap across the union so two tabs can't jointly overpay
  // it. max() with both counters floors the result for pre-log legacy totals.
  const grantById = new Map<string, XpGrant>()
  for (const g of [...local.xpLog, ...incoming.xpLog]) {
    const prev = grantById.get(g.id)
    if (!prev || g.amount > prev.amount) grantById.set(g.id, g)
  }
  const xpLog = [...grantById.values()].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  const xp = xpStateFromTotal(
    Math.max(xpFromLog(xpLog).totalXp, local.xp.totalXp, incoming.xp.totalXp),
  )
  // Health snapshot: the newer healthDate supersedes (day keys compare
  // lexicographically). Same-day ties need a SYMMETRIC rule — "keep local"
  // would leave two crossed writers each adopting the other's snapshot
  // forever: the higher score wins (null loses to any score), and on equal
  // scores the further stage, so both tabs pick the identical trio.
  let snapshot: AppState
  if (local.healthDate !== incoming.healthDate) {
    snapshot = local.healthDate > incoming.healthDate ? local : incoming
  } else {
    const ls = local.prevHealthScore ?? -1
    const is = incoming.prevHealthScore ?? -1
    snapshot =
      ls !== is
        ? ls > is
          ? local
          : incoming
        : STAGES.indexOf(local.stage as Stage) >= STAGES.indexOf(incoming.stage as Stage)
          ? local
          : incoming
  }
  // Quests: same-day lists union their done flags — a quest completed in
  // either tab granted its XP once already, and reviving it as incomplete
  // would offer a second grant. Across days, the newer roster wins.
  let quests = incoming.quests
  let questsDate = incoming.questsDate
  if (local.questsDate === incoming.questsDate) {
    quests = local.quests.map((q) => ({
      ...q,
      done: q.done || incoming.quests.some((i) => i.id === q.id && i.done),
    }))
    questsDate = local.questsDate
  } else if (local.questsDate > incoming.questsDate) {
    quests = local.quests
    questsDate = local.questsDate
  }
  // Profile: any profile beats null (setup completing in one tab must survive
  // the other's write), and the newer savedDate wins across days. Same-day
  // edits from two tabs carry no recency signal at all — the greater JSON
  // string wins, an arbitrary but SYMMETRIC tie-break: both tabs converging on
  // the same edit matters more than which edit survives, and "keep local"
  // would leave crossed writes swapping profiles forever.
  let profile: ProfileData | null
  if (local.profile === null || incoming.profile === null) {
    profile = local.profile ?? incoming.profile
  } else if (local.profile.savedDate !== incoming.profile.savedDate) {
    profile =
      local.profile.savedDate > incoming.profile.savedDate ? local.profile : incoming.profile
  } else {
    profile =
      JSON.stringify(incoming.profile) > JSON.stringify(local.profile)
        ? incoming.profile
        : local.profile
  }
  const merged: AppState = {
    transactions,
    xp,
    xpLog,
    prevHealthScore: snapshot.prevHealthScore,
    stage: snapshot.stage,
    healthDate: snapshot.healthDate,
    quests,
    questsDate,
    // Codex union: a lesson collected in either tab stays collected — same
    // survival rule as transactions. Earliest date wins on duplicates (see
    // dedupeEarliestById) so both tabs converge on the identical list.
    lessonsSeen: dedupeEarliestById([...local.lessonsSeen, ...incoming.lessonsSeen]),
    // Mute merges as OR: muting is the safety direction — a stale unmuted
    // peer write must never switch sound back on against this tab's explicit
    // mute (there is no timestamp to arbitrate recency), and OR is symmetric
    // so crossed writes still converge. The cost — an unmute can be re-muted
    // by a still-muted background tab's next write — errs silent, never loud.
    muted: local.muted || incoming.muted,
    // AFTER muted, matching defaultState's key order: the fixpoint check below
    // and the storage-echo settling both compare JSON strings, so a merged
    // object with a different key order than a sanitized load would never
    // string-equal an identical state.
    profile,
    // Badge union: earned in either tab stays earned, earliest date wins on
    // duplicates — same survival + convergence rules as the codex.
    achievements: dedupeEarliestById([...local.achievements, ...incoming.achievements]),
  }
  // Fixpoint short-circuit: an unchanged merge returns the SAME reference, so
  // useReducer's HYDRATE hands React an identical state, the re-render bails,
  // and the save effect never echoes an equal payload back into storage.
  return JSON.stringify(merged) === JSON.stringify(local) ? local : merged
}

/**
 * Re-sync when ANOTHER tab writes the store key ('storage' fires only in
 * non-writing tabs, and only when the value actually changed — so writing the
 * merged result back cannot echo forever). The payload is untrusted persisted
 * JSON like any load: sanitize + roll quests before handing it to the reducer.
 */
export function subscribeToPeerWrites(onWrite: (incoming: AppState) => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key !== KEY || e.newValue === null) return
    try {
      onWrite(rollQuests(sanitizeState(JSON.parse(e.newValue) as unknown), todayISO()))
    } catch {
      // Corrupt peer payload — this tab's in-memory state stays authoritative.
    }
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

/** Full export, always available, open format — the data-ownership guarantee. */
export function exportJSON(state: AppState): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), version: 1, ...state },
    null,
    2,
  )
}
