/**
 * Local-first persistence. Manual logging is the core mechanic, not a
 * fallback — the store is built around fast transaction entry.
 */

import {
  MAX_TOTAL_XP,
  XP_REWARDS,
  xpFromLog,
  xpStateFromTotal,
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
  /** What it was, in the user's own words. Optional forever: a row without
   *  one is a complete money record, never a deficient one (§12.3). */
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

/**
 * What happened after a decision was simulated. 'open' is the honest default:
 * the app does not know, and never guesses.
 *
 * §12.3 / §12.6 — these four are peers. 'bought' is not a failure state and
 * nothing in the UI may render it as one: same ink, same weight, same voice as
 * 'waited'. There is deliberately no 'regretted', no rating and no score.
 */
export type DecisionOutcome = 'open' | 'bought' | 'waited' | 'resisted'

/**
 * THE THREE ANSWERS, AND THEY ARE PEERS (§12.3 / §12.6).
 *
 * "Bought it" is first because it is the honest answer nearest the thumb, not
 * because it is the wrong one: same ink, same weight, same voice, no colour
 * split, no ✓/✗, and nowhere in the product is a bought-vs-waited tally — a
 * count of "you bought 6 of 9" is one step from a verdict about the user.
 *
 * IT LIVES HERE, BESIDE THE TYPE, because three surfaces render these words:
 * SimCard's buttons, SimCard's closed-row line, and the landing page's mechanic
 * grid. The landing states what the app does, so it must read the words the app
 * actually ships rather than a copy of them typed into marketing prose — the
 * same discipline as the note cap and the cash denominations there.
 */
export const DECISION_ANSWERS: ReadonlyArray<{
  outcome: Exclude<DecisionOutcome, 'open'>
  label: string
}> = [
  { outcome: 'bought', label: 'Bought it' },
  { outcome: 'waited', label: 'Waited' },
  { outcome: 'resisted', label: 'Resisted it' },
]

/** Derived from the roster above plus the open state, so a fourth answer cannot
    be added to the UI and silently fail the sanitizer on reload. */
const DECISION_OUTCOMES: ReadonlySet<string> = new Set<string>([
  'open',
  ...DECISION_ANSWERS.map((a) => a.outcome),
])

/**
 * HOW LONG A BOUGHT DECISION WAITS BEFORE THE RECORD ASKS ABOUT IT.
 *
 * A named constant beside the type, like CALIBRATION_DAYS and
 * RESIST_XP_DAILY_CAP, and never a literal at a call site: three surfaces read
 * it (the scheduled line, the due test, the landing/README claim), and a
 * hand-typed 14 in any one of them is how the app promises one horizon and
 * keeps another.
 *
 * Fourteen days, not thirty: it has to be long enough that "still using it" is
 * a real answer rather than novelty, and short enough that the object is still
 * in memory. The app cannot validate that choice and does not pretend to — it
 * is a product judgement, stated here rather than buried.
 */
export const CHECK_BACK_DAYS = 14

/**
 * THE THREE CHECK-BACK ANSWERS, AND THEY ARE PEERS (§12.3 / §12.6).
 *
 * Same rule as DECISION_ANSWERS below-and-above: same ink, same weight, same
 * class, no ✓/✗, no colour split, and no ordering that reads best-to-worst.
 *
 * WHAT THE QUESTION MAY ASK, which is the binding constraint here. The obvious
 * phrasing — "weeks later, was it worth it?" — is a REGRET PROMPT: it asks the
 * user to grade a past self, which is the punitive framing §12.6 forbids and
 * which App.test already bans as a literal string on this card. The app cannot
 * know whether a purchase was worth it, so it does not ask. It asks a factual
 * question about the OBJECT — is it in use — and files the answer.
 *
 * AND NOTHING IS EVER COUNTED. There is deliberately no tally of these three
 * anywhere in the product, for the same reason there is no bought-vs-waited
 * tally: "you stopped using 4 of 7" is one step from a verdict about the
 * user's character, and it is exactly the number a scoring product would ship.
 */
export type CheckBackAnswer = 'using' | 'stopped' | 'unused'

export const CHECK_BACK_ANSWERS: ReadonlyArray<{
  answer: CheckBackAnswer
  label: string
}> = [
  { answer: 'using', label: 'Still using it' },
  { answer: 'stopped', label: 'Not any more' },
  { answer: 'unused', label: 'Never used it' },
]

/** Derived from the roster, so a fourth answer cannot be added to the UI and
    silently fail the sanitizer on reload (same shape as DECISION_OUTCOMES). */
const CHECK_BACK_VALUES: ReadonlySet<string> = new Set<string>(
  CHECK_BACK_ANSWERS.map((a) => a.answer),
)

/**
 * THE DECISION RECORD — one simulation the user ran, and what they did about
 * it. The simulator used to throw its whole output away (a `useState` string in
 * SimCard), so the deepest engine in the app left no trace but a bare XP grant.
 *
 * `line` is the exact projection string shown at the time, frozen (§12.5). It
 * is never recomputed against today's profile: re-running the model after the
 * user edits My numbers would silently rewrite what the app said then, which is
 * the one thing a record may not do.
 */
export interface Decision {
  id: string
  /** Local day (YYYY-MM-DD) the simulation ran. */
  date: string
  amountDA: number
  /** The projection, as it read on the day. Frozen — see above. */
  line: string
  /**
   * WHOSE NUMBERS PRODUCED THIS LINE (Trust Rule 5). True while the run was
   * projected on DEMO_PROFILE — invented income, invented goal — false once the
   * user's own figures are in.
   *
   * It has to travel WITH the row, not be recomputed from the live profile: a
   * run made on day 1 and a setup completed on day 3 leaves the card saying
   * "Projected on your numbers" above a frozen line ("your goal slips about 2
   * months") derived entirely from figures the user never entered. The card's
   * scope note is a statement about the NEXT run; this is the statement about
   * the ones already on the page.
   */
  demo: boolean
  outcome: DecisionOutcome
  /** Local day the outcome was recorded; absent while open. */
  outcomeDate?: string
  /** The transaction the outcome produced, when it produced one. */
  txId?: string
  /**
   * THE CHECK-BACK ANSWER. Present only on a 'bought' row, and only once the
   * user answered — the app never fills it in, guesses it, or defaults it.
   *
   * It is the one field on this record written LATER than the row itself, and
   * writing it must not disturb anything else on the row: `line`, `demo`,
   * `amountDA`, `outcome`, `outcomeDate` and `txId` are frozen the moment they
   * land (§12.5), so a check-back answers the record without editing it.
   */
  checkBack?: CheckBackAnswer
  /** Local day the check-back was answered; absent until then. */
  checkBackDate?: string
}

/**
 * The day this row's check-back comes due, or null when it never does.
 *
 * Only a 'bought' row schedules one: 'waited' and 'resisted' bought no object,
 * so there is nothing to be using or not using, and an 'open' row has not said
 * anything happened at all. Pure — no wall clock — so the card, the reducer
 * and the tests all read the same rule.
 */
export function checkBackDueOn(d: Decision): string | null {
  if (d.outcome !== 'bought' || d.outcomeDate === undefined) return null
  return addDaysISO(d.outcomeDate, CHECK_BACK_DAYS)
}

export type CheckBackState = 'none' | 'scheduled' | 'due' | 'answered'

/**
 * Where a row stands in the check-back cycle, as one value the UI switches on.
 *
 * Day keys compare lexicographically (that is the whole reason every date in
 * this product is YYYY-MM-DD), so `due <= today` needs no arithmetic and no
 * timezone. A row closed today is 'scheduled', never 'due' — CHECK_BACK_DAYS
 * is 14 and 14 > 0, so the boundary is a property of the constant, and the
 * test that pins it is testing the constant as much as this function.
 */
export function checkBackState(d: Decision, today: string): CheckBackState {
  if (d.checkBack !== undefined) return 'answered'
  const due = checkBackDueOn(d)
  if (due === null) return 'none'
  return due <= today ? 'due' : 'scheduled'
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
  /** Codex collection — every lesson ever read, unioned by id across tabs. */
  lessonsSeen: LessonSeen[]
  muted: boolean
  /** Real numbers from the setup card; null = demo profile still in use. */
  profile: ProfileData | null
  /** Earned achievement badges (ids + dates), unioned by id across tabs. */
  achievements: AchievementUnlock[]
  /** Simulations run and what came of them, newest first (see Decision). */
  decisions: Decision[]
}

const KEY = 'ember-state-v1'

/**
 * THE CALENDAR RULE, IN ONE PLACE.
 *
 * Deliberately NOT toISOString(): the target market is UTC+1, so UTC keys would
 * roll the health snapshot at 01:00 local time and stamp late-night purchases
 * with the previous day/month. Every day key in this product is a LOCAL
 * calendar day.
 *
 * This function had four identical copies (here, engine/profile.ts,
 * engine/boss.ts, content/sampleLedger.ts), each re-deriving the same rule with
 * its own paragraph explaining it. Four copies of a calendar convention is four
 * chances for one of them to be "fixed" to UTC by someone reading it alone.
 */
function localDayISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Local-calendar day key (YYYY-MM-DD) for right now. */
export function todayISO(): string {
  return localDayISO(new Date())
}

/**
 * Local-calendar day key `n` days after `dayISO`. Negative `n` goes back. Pure
 * — no wall clock, so it is safe in derivations and in tests.
 *
 * The LOCAL Date constructor, deliberately: it normalises the calendar (month
 * and year underflow) and never touches a duration, so it is DST-safe for this
 * direction. ledger.ts's dayIndex does UTC arithmetic for the opposite reason —
 * it measures a DIFFERENCE between two local midnights, which is 23 or 25 hours
 * apart twice a year. Same care, opposite tool.
 */
export function addDaysISO(dayISO: string, n: number): string {
  const [y, m, d] = dayISO.split('-').map(Number)
  return localDayISO(new Date(y, m - 1, d + n))
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

export function defaultState(): AppState {
  return {
    transactions: [],
    xp: { level: 1, xpIntoLevel: 0, totalXp: 0 },
    xpLog: [],
    prevHealthScore: null,
    stage: null,
    healthDate: '',
    lessonsSeen: [],
    muted: false,
    profile: null,
    achievements: [],
    decisions: [],
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
    // isValidDayKey, not DAY_KEY_RE: shape alone accepts '2026-02-30' and
    // '2026-99-99', and this is the one sanitizer where an impossible key BUYS
    // something. xpFromLog buckets resist grants by date, so every distinct
    // key — real or not — mints its own bucket and its own allowance against
    // RESIST_XP_DAILY_CAP. Four grants dated on days that do not exist folded
    // to 150 XP. Engagement track only (the Health Score never reads xpLog,
    // §12.1) and MAX_TOTAL_XP still clamps the total, but the rule stated at
    // computeValidDayKey — impossible keys are rejected everywhere — had one
    // hole and this was it.
    (v.date === '' || isValidDayKey(v.date))
  )
}

function isTransaction(v: unknown): v is Transaction {
  // Strict on exactly the fields that feed the health score: a negative
  // amount would *reduce* trailing-30d spend (inflating SR/BA), and a truthy
  // non-boolean resistedImpulse (e.g. "no") would count as a resisted impulse
  // in IC while excluding the row from spend. Dates are compared
  // lexicographically against YYYY-MM-DD window cutoffs, so enforce the shape
  // AND calendar validity (see isValidDayKey).
  //
  // `note` is deliberately NOT gated here — see sanitizeNote. It feeds no
  // engine, so a malformed memo must cost the memo and never the money fact
  // the row records.
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    isFiniteNumber(v.amountDA) &&
    v.amountDA >= 0 &&
    typeof v.category === 'string' &&
    typeof v.date === 'string' &&
    isValidDayKey(v.date) &&
    isOptionalBoolean(v.resistedImpulse) &&
    isOptionalBoolean(v.impulseFlagged)
  )
}

/**
 * Longest note the app stores. Enforced at BOTH ends — `maxLength` on the
 * field so typing is bounded visibly, and here so a hand-edited or
 * peer-written payload is bounded at all.
 *
 * The cap is a quota rule, not a style preference, so the arithmetic has to
 * count what a logged row ACTUALLY costs — which the earlier version of this
 * comment did not. A transaction measures 146 chars of JSON bare and 191 with
 * a full 80-char note, but every LOG_TX also appends an XpGrant to xpLog
 * (reducer.ts), and a measured grant is 101 chars
 * (`{"id":"tx:<uuid>","action":"logExpense","amount":5,"date":"2026-08-04"}`).
 * A logged row is therefore ~247 chars bare and ~290 with a note. Against the
 * origin's ~5MB budget stored as UTF-16 (~2.6M chars) that is ~10,600 rows
 * bare and ~9,000 with notes — not the ~13,000 this comment used to claim from
 * the transaction alone, a ~30-40% overstatement of its own basis.
 * One pasted multi-megabyte memo exhausts that budget by itself, and every
 * write after it fails — saveState returns false and the app runs permanently
 * in its persistFailed state, having lost nothing but its ability to keep
 * anything. 80 chars holds "bread and milk from the corner shop" four times
 * over and bounds the per-row growth at ~30%.
 *
 * xpLog IS DELIBERATELY UNCAPPED, unlike decisions (see DECISION_MAX). Two
 * reasons, and the second is the binding one. A grant is ~101 chars and there
 * is at most one per logged row plus a handful of daily lesson/sim/boss grants, so
 * it is a bounded fraction of a cost already counted above. And the log is
 * EVIDENCE: xpFromLog folds it into the visible XP total, so trimming the
 * oldest grants would silently take XP off a counter the user was already
 * shown — the one thing the two-track rule's engagement side must never do.
 * A cap here would need a legacy-baseline rollup like the one sanitizeState
 * already mints for pre-log schemas; until the quota argument demands it, it
 * stays unbounded on purpose rather than by omission.
 */
export const NOTE_MAX_LEN = 80

/**
 * Validate an untrusted note into a note, or `undefined`. Never throws away
 * the row it rides on (see isTransaction).
 *
 * Trim, cap, trim again — and the second trim is not belt-and-braces, it is
 * what makes this idempotent: cutting at NOTE_MAX_LEN can land on a space,
 * and a result with a trailing space would sanitize to something SHORTER on
 * the next pass. Idempotence is the property the merge fixpoint (which
 * compares whole states as JSON strings) needs to settle, and the property
 * that lets the sanitizer and the LOG_TX path both apply it.
 * An all-whitespace note collapses to `undefined` rather than persisting a
 * blank second line on the ledger row.
 */
export function sanitizeNote(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim().slice(0, NOTE_MAX_LEN).trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Apply sanitizeNote to a row, returning the SAME object when nothing
 * changes. Spread rather than field-by-field rebuild: mergeStates compares
 * whole states as JSON strings, so a row's key order has to survive a load
 * unchanged or a merge would produce a different string from an identical
 * state and re-save forever.
 */
export function withSanitizedNote(t: Transaction): Transaction {
  const note = sanitizeNote(t.note)
  if (note === t.note) return t
  const out: Transaction = { ...t, note }
  if (note === undefined) delete out.note
  return out
}

/**
 * Longest projection line the record stores. Same quota argument as
 * NOTE_MAX_LEN — the cap is what stops a hand-edited or peer-written payload
 * from spending the origin's ~5MB budget on one string and leaving every write
 * after it failing — but the number is bigger because the string is longer by
 * construction: describeResult's four branches concatenate to ~335 characters
 * at their maximum. 400 clears that with room and still bounds a decision row
 * at well under a kilobyte.
 */
export const DECISION_LINE_MAX_LEN = 400

/**
 * How many decisions the record keeps. Bounded for the same quota reason, and
 * dropped from the OLDEST end — a record is a log, and the rows the user can
 * still act on are the recent ones.
 *
 * The cap is applied AFTER the canonical sort, never on arrival order, so
 * trimming is a pure function of the set: sanitize and merge cannot disagree
 * about which rows survive, which is what the merge fixpoint needs.
 *
 * KNOWN EDGE, STATED RATHER THAN HIDDEN: the sort is newest-day-first, so the
 * trim falls on the OLDEST rows — which is exactly where the most overdue
 * check-backs live (see CHECK_BACK_DAYS). A user who runs more than
 * DECISION_MAX simulations inside a 14-day window loses pending questions
 * silently. It is not fixed here on purpose: exempting answered-or-pending rows
 * from the cap would make the cap unbounded in exactly the case the quota
 * argument was written for, and a record is a log before it is a queue.
 */
export const DECISION_MAX = 60

/**
 * Validate one untrusted decision, or drop it. Dropping costs the decision and
 * nothing else — the transactions in the same payload are filtered separately
 * (see sanitizeState), which is the same "a bad memo costs the memo, never the
 * row" rule the note sanitizer follows.
 */
export function sanitizeDecision(v: unknown): Decision | null {
  if (!isRecord(v)) return null
  if (typeof v.id !== 'string' || v.id === '') return null
  if (typeof v.date !== 'string' || !isValidDayKey(v.date)) return null
  // Same money rule as every other amount: a NaN/Infinity/negative would render
  // as a nonsense figure on the row and JSON round-trip to null.
  if (!isFiniteNumber(v.amountDA) || v.amountDA < 0) return null
  if (typeof v.line !== 'string') return null
  if (typeof v.outcome !== 'string' || !DECISION_OUTCOMES.has(v.outcome)) return null
  const out: Decision = {
    id: v.id,
    date: v.date,
    amountDA: v.amountDA,
    // Trimmed then capped then trimmed, exactly like sanitizeNote and for the
    // same reason: the second trim is what makes this idempotent, and the merge
    // fixpoint compares whole states as JSON strings.
    line: v.line.trim().slice(0, DECISION_LINE_MAX_LEN).trim(),
    // DEFAULTS TRUE, and the default is the point. An unmarked row is a row
    // whose basis cannot be verified — written by an older build, hand-edited,
    // merged in from a peer — and the conservative reading of "we cannot tell
    // whose numbers these were" is "not the user's" (Trust Rule 5). Claiming
    // personalization the row cannot prove is the failure this field exists to
    // stop, so only an explicit `false` retires the disclosure.
    demo: v.demo !== false,
    outcome: v.outcome as DecisionOutcome,
  }
  // An outcomeDate only means anything on a closed row, and a closed row
  // without one would render "Recorded" with no day. Repair rather than drop:
  // the projection and the amount are the record's substance.
  if (typeof v.outcomeDate === 'string' && isValidDayKey(v.outcomeDate) && out.outcome !== 'open') {
    out.outcomeDate = v.outcomeDate
  }
  if (typeof v.txId === 'string' && v.txId !== '') out.txId = v.txId
  // GATED ON 'bought', because that is the only row the app ever asks about
  // (see checkBackDueOn). An answer on a waited or resisted row is data this
  // build could not have written — a hand-edit or a payload from something
  // that is not Ember — and the same rule the note follows applies: dropping
  // it costs the ANSWER, never the row and never the money facts on it.
  if (
    out.outcome === 'bought' &&
    typeof v.checkBack === 'string' &&
    CHECK_BACK_VALUES.has(v.checkBack)
  ) {
    out.checkBack = v.checkBack as CheckBackAnswer
    // Repaired rather than dropped, exactly like outcomeDate above: an answer
    // with no day still says what the user said, and the row renders it
    // without a date instead of losing it.
    if (typeof v.checkBackDate === 'string' && isValidDayKey(v.checkBackDate)) {
      out.checkBackDate = v.checkBackDate
    }
  }
  return out
}

/**
 * Which of two versions of the SAME decision survives a merge.
 *
 * ANSWERED BEATS UNANSWERED, and it needs its own clause rather than falling
 * through to the JSON tie-break, because the tie-break gets this exactly
 * backwards. `checkBack` is the last key in the canonical order, so an
 * unanswered row's serialisation ends `…"txId":"abc"}` where the answered
 * one continues `…"txId":"abc","checkBack":…`. '}' is 0x7D and ',' is 0x2C, so
 * the string comparison prefers the row WITHOUT the answer — and a question the
 * user already answered would be asked again after any cross-tab merge.
 *
 * Two DIFFERENT answers carry no recency signal (checkBackDate can tie), so
 * they fall to the same arbitrary-but-SYMMETRIC greater-JSON rule the rest of
 * this file uses: both tabs converging matters more than which one wins.
 */
function preferDecision(a: Decision, b: Decision): Decision {
  const aAnswered = a.checkBack !== undefined
  const bAnswered = b.checkBack !== undefined
  if (aAnswered !== bAnswered) return aAnswered ? a : b
  return JSON.stringify(a) > JSON.stringify(b) ? a : b
}

/**
 * Union decisions by id into one canonical, capped list. Deterministic,
 * idempotent AND commutative, so sanitizeState and mergeStates share it and two
 * tabs converge on a single JSON string (see mergeStates' fixpoint).
 *
 * CLOSED BEATS OPEN: recording an outcome in either tab is a user action the
 * other tab has no evidence against, and reviving it as open would ask the same
 * question twice. ANSWERED BEATS UNANSWERED for the identical reason one level
 * down — see preferDecision, which also explains why that clause cannot be left
 * to the JSON tie-break. Two DIFFERENT closed outcomes (or two different
 * check-back answers) carry no recency signal at all (outcomeDate can tie), so
 * the greater JSON string wins — arbitrary but SYMMETRIC, the same tie-break the
 * profile uses, because both tabs agreeing matters more than which of the two
 * survives.
 */
export function canonicalDecisions(entries: Decision[]): Decision[] {
  const byId = new Map<string, Decision>()
  for (const d of entries) {
    const prev = byId.get(d.id)
    if (!prev) {
      byId.set(d.id, d)
      continue
    }
    if (prev.outcome === d.outcome) {
      byId.set(d.id, preferDecision(prev, d))
    } else if (prev.outcome === 'open') {
      byId.set(d.id, d)
    } else if (d.outcome !== 'open') {
      byId.set(d.id, preferDecision(prev, d))
    }
  }
  return (
    [...byId.values()]
      // Newest day first (the record reads top-down), and WITHIN a day the
      // greater id first. That second key is chronological in practice because
      // decision ids are minted time-ordered — see newDecisionId — so two runs
      // on one day render newest-first; for any other id it is still a total,
      // commutative order, just not a chronological one. Insertion order would
      // make crossed writes each adopt the other's ordering forever, every save
      // a new JSON string that never reaches a fixpoint.
      .sort((a, b) =>
        a.date !== b.date ? (a.date > b.date ? -1 : 1) : a.id > b.id ? -1 : a.id < b.id ? 1 : 0,
      )
      .slice(0, DECISION_MAX)
  )
}

/**
 * A decision id that sorts chronologically inside its day. The record is read
 * newest-first and the top row is the one the card treats as the current
 * projection, so a random uuid alone would put a fresh run second on a day that
 * already held one.
 *
 * Fixed-width base-36 milliseconds, then newId() for uniqueness: the timestamp
 * is 8 characters from 2004 to 2059 and the pad keeps lexicographic order
 * correct outside that range too. It is a display-order hint, never an
 * authority — the DATE is what every window and every merge compares.
 */
export function newDecisionId(): string {
  return `${Date.now().toString(36).padStart(9, '0')}-${newId()}`
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
    // Filter on the money facts, then repair the memo. A row whose note is a
    // number, an object, or 4MB of pasted text is still a row the user logged:
    // it keeps its amount, category and date, and loses only the note.
    out.transactions = parsed.transactions.filter(isTransaction).map(withSanitizedNote)
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
    // and, on equal amounts, the earliest date — the identical rule
    // mergeStates applies, for the identical reason (see the fold there). Load
    // and merge have to agree on one derivation or a payload would change
    // shape simply by making the round trip.
    const byId = new Map<string, XpGrant>()
    for (const g of parsed.xpLog) {
      if (isXpGrant(g)) {
        const prev = byId.get(g.id)
        if (!prev || g.amount > prev.amount || (g.amount === prev.amount && g.date < prev.date)) {
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
  // isValidDayKey rather than the bare shape, for consistency with every other
  // date this sanitizer touches. finalizeHealthThrough is iteration-bounded, so
  // this was not exploitable — but "impossible keys are rejected" is easier to
  // keep true as a rule with no exceptions than as a rule with a documented one.
  if (typeof parsed.healthDate === 'string' && isValidDayKey(parsed.healthDate)) {
    out.healthDate = parsed.healthDate
  }
  // `quests` AND `questsDate` ARE READ BY NOTHING, AND THAT IS THE MIGRATION.
  // The daily quest list is deleted (see XpStrip / the XP roster in engine/xp).
  // This sanitizer builds `out` from defaultState() and copies only keys it
  // recognises, so a payload written by the old schema still loads: the two
  // dead fields are dropped on the way in and every transaction, decision,
  // lesson and xpLog grant beside them comes through untouched. The GRANTS
  // those quests minted (`quest:<id>:<day>`) keep folding at full value —
  // XP_GRANT_ACTIONS still carries every action they used, so nothing the user
  // earned is retroactively un-paid (see reviewRecent in engine/xp.ts).
  // THE TWO DEAD FIELDS ARE NOT THE WHOLE MIGRATION, and this sentence used to
  // imply they were. Keeping those grants is only half of it: the reducer paths
  // that replaced the quests changed the grant IDS too (`quest:lesson:<day>` ->
  // `lesson:<day>`, `quest:sim:<day>` -> `sim:<day>`), so READ_LESSON and
  // RUN_SIM accept the old id as payment as well as the new one. Without that
  // the upgrade day would pay both — see the note at READ_LESSON in reducer.ts.
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
  if (Array.isArray(parsed.decisions)) {
    // Row-by-row, like transactions and unlike the profile: each decision is an
    // independent record of one run, so one malformed entry must never take the
    // rest of the record — or the transactions beside it — down with it.
    const kept: Decision[] = []
    for (const d of parsed.decisions) {
      const ok = sanitizeDecision(d)
      if (ok !== null) kept.push(ok)
    }
    out.decisions = canonicalDecisions(kept)
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
    return sanitizeState(JSON.parse(raw) as unknown)
  } catch {
    return defaultState()
  }
}

/**
 * Persist, and REPORT whether the write landed. The boolean is not optional
 * politeness: setItem throws QuotaExceededError when the origin's budget is
 * exhausted (~9,000-10,600 logged rows: ~247 chars for a bare transaction plus
 * its XP grant, ~290 with a full note — see NOTE_MAX_LEN) and — far
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
 * last silently erases the other tab's transactions, the worst possible failure for a local-first app.
 * The merge must be deterministic, idempotent AND commutative — merge(A, B)
 * deep-equals merge(B, A) — so that when writes truly cross (both tabs save
 * before receiving each other's storage event), both converge on one
 * canonical payload and the write ping-pong settles instead of oscillating.
 * When the merge changes nothing, `local` itself is returned, so the HYDRATE
 * reducer path (and React's bail-out) skips the re-render and re-save.
 */
export function mergeStates(local: AppState, incoming: AppState): AppState {
  // Transactions: union by id, in canonical order — date desc (ArchiveCard's
  // newest-first), id asc within a day. Insertion-ordered output would make
  // crossed writes each adopt the other's differing ordering forever, every
  // save a new JSON string that never reaches a fixpoint.
  // A DUPLICATED ID LETS `incoming` WIN UNCONDITIONALLY HERE, WHICH IS NOT
  // SYMMETRIC — and it is left that way on purpose rather than hardened.
  // newId() keeps row ids unique per device and a transaction id is never
  // derived from anything two tabs could compute independently (unlike an XP
  // grant id, which is — see the fold below and the bug it fixes), so the
  // asymmetric branch is unreachable. Deriving a tie-break for a collision
  // that cannot happen would be untested code guarding an impossible state; a
  // comment naming the invariant it depends on is the honest version.
  const incomingIds = new Set(incoming.transactions.map((t) => t.id))
  const transactions = [
    ...local.transactions.filter((t) => !incomingIds.has(t.id)),
    ...incoming.transactions,
  ].sort((a, b) =>
    a.date !== b.date ? (a.date > b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  // XP: union the grant logs by id and fold. Diverged tabs each hold grants
  // the other missed (A logged a purchase while B read the lesson), and a
  // bare max(totalXp) would silently drop the smaller tab's grant even though
  // the transaction union preserves its evidence. Duplicated ids keep
  // the larger amount (deterministic in any merge order); the fold re-applies
  // the resist daily cap across the union so two tabs can't jointly overpay
  // it. max() with both counters floors the result for pre-log legacy totals.
  //
  // THE EQUAL-AMOUNT TIE NEEDS ITS OWN RULE, AND A STRICT `>` IS NOT ONE.
  // `g.amount > prev.amount` alone keeps whichever grant the iteration saw
  // FIRST — always `local` — so merge(A,B) and merge(B,A) produced different
  // bytes and the convergence invariant this function declares as binding was
  // false. It is reachable, not theoretical: reducer.ts writes the boss grant
  // as { id: bossGrantId(weekStart), date: action.date }, so the id names the
  // WEEK and the date names TODAY. Tab A claims week W on Monday; a frozen
  // background tab B that never saw the storage event claims the same week on
  // Tuesday; both hold id boss:W at 150 XP with different dates. XP totals
  // agree, so nothing about XP integrity was wrong — but the two tabs each
  // believed they had converged, persisted different payloads, and whichever
  // wrote last decided what the export said about when the week was won.
  // The tie-break is EARLIEST DATE, following the convention
  // dedupeEarliestById already sets for {id, date} collections: a claim never
  // drifts to a later day after a merge. Total and symmetric, so the fixpoint
  // holds in both directions.
  const grantById = new Map<string, XpGrant>()
  for (const g of [...local.xpLog, ...incoming.xpLog]) {
    const prev = grantById.get(g.id)
    if (!prev || g.amount > prev.amount || (g.amount === prev.amount && g.date < prev.date)) {
      // Rebuilt rather than stored by reference: two tabs can hold the same
      // grant with different KEY ORDER (one built by the reducer, one revived
      // by JSON.parse), and the merge fixpoint compares JSON strings.
      grantById.set(g.id, { id: g.id, action: g.action, amount: g.amount, date: g.date })
    }
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
  // NO QUEST BRANCH ANY MORE, and nothing replaces it. The quest list was the
  // one piece of per-day engagement state two tabs had to reconcile by hand;
  // the daily grants that survived it (readLesson, runSimulation) are carried
  // by the xpLog union above on deterministic per-day ids, which is the same
  // mechanism BOSS_VICTORY has always used. Two tabs reading the lesson on the
  // same day now dedupe to one `lesson:<day>` grant instead of to one done
  // flag — strictly less state, identical result.
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
    // Decision record union: a run in either tab survives, and an outcome
    // recorded in either tab stays recorded (see canonicalDecisions).
    decisions: canonicalDecisions([...local.decisions, ...incoming.decisions]),
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
 * JSON like any load: sanitize before handing it to the reducer.
 */
export function subscribeToPeerWrites(onWrite: (incoming: AppState) => void): () => void {
  const listener = (e: StorageEvent) => {
    if (e.key !== KEY || e.newValue === null) return
    try {
      onWrite(sanitizeState(JSON.parse(e.newValue) as unknown))
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
