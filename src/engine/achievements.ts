/**
 * Achievements + loot — the engagement track's badge shelf. Every badge is a
 * pure predicate over AppState the user EARNS by doing something the app can
 * observe; there is no purchase path and never will be. The loot is a
 * pixel-pet companion per badge, shown beside the stage badge — cosmetic
 * only. Neither badges nor pets pay XP or touch the Health Score: the unlock
 * moment (toast + sparkle) and the permanent shelf row ARE the whole reward,
 * so the collection can never become an XP lever or a score input.
 */

import type { AchievementUnlock, AppState, Transaction } from '../state/store.ts'
import { BRANCHES, type BranchId } from '../content/curriculum.ts'
import { branchMastered, masteredCount } from './learn.ts'

export interface PixelPet {
  emoji: string
  name: string
}

export interface Achievement {
  id: string
  name: string
  /** Locked-state copy: names the earning action — "not yet", never shame. */
  hint: string
  /** Cosmetic companion this badge unlocks (see HeroCard's pet strip). */
  pet: PixelPet
  earned(state: AppState): boolean
  /** Retired mechanic: shown only once earned, never as a locked goal. */
  legacy?: boolean
}

/** A purchase row: money actually left — resists log a row but spend nothing. */
function isPurchase(t: Transaction): boolean {
  return t.resistedImpulse !== true
}

/**
 * Number of distinct local calendar days holding at least one logged row.
 * ANY row counts, resists included — the badge rewards showing up, the same
 * show-up rule the boss engine's hasLogInWeek applies. Deliberately NOT a
 * consecutive-day streak: a streak resets to zero on one missed day, which
 * punishes exactly the people (low-energy weeks, episodes, hospital stays)
 * the app most wants to keep. Days accumulate forever and never reset.
 */
export function loggedDayCount(transactions: Transaction[]): number {
  return new Set(transactions.map((t) => t.date)).size
}

/** One companion per skill-tree branch — cosmetic, like every pet. */
const BRANCH_PETS: Record<BranchId, PixelPet> = {
  flow: { emoji: '🐟', name: 'Hout' },
  save: { emoji: '🐿️', name: 'Sanjoub' },
  borrow: { emoji: '🦔', name: 'Qanfoud' },
  dinar: { emoji: '🐫', name: 'Jamal' },
  earn: { emoji: '🐜', name: 'Namla' },
  family: { emoji: '🕊️', name: 'Hamama' },
  guard: { emoji: '🦅', name: 'Saqr' },
  grow: { emoji: '🐞', name: 'Khanfoussa' },
}

/**
 * The canonical roster. Predicates read only persisted evidence, so every
 * unlock survives reload and merges identically in any tab:
 * - simulation / boss-win badges key off the xpLog (the verified sim quest is
 *   the sole runSimulation grant vehicle, the retired BOSS_VICTORY the sole weeklyBoss
 *   one — the append-only evidence log doubles as the achievement record);
 * - level badges read the xp counter, itself rebuilt from that log;
 * - the rest count transactions / codex entries directly.
 */
export const ACHIEVEMENTS: ReadonlyArray<Achievement> = [
  {
    id: 'first-log',
    name: 'First Spark',
    hint: 'Log your first purchase.',
    pet: { emoji: '🐣', name: 'Kit' },
    earned: (s) => s.transactions.some(isPurchase),
  },
  {
    id: 'first-resist',
    name: 'Held the Line',
    hint: 'Use the resist button once.',
    pet: { emoji: '🐢', name: 'Sabr' },
    earned: (s) => s.transactions.some((t) => t.resistedImpulse === true),
  },
  {
    id: 'ten-logs',
    name: 'Ten in the Ledger',
    hint: 'Log 10 purchases.',
    pet: { emoji: '🐝', name: 'Nahla' },
    earned: (s) => s.transactions.filter(isPurchase).length >= 10,
  },
  {
    id: 'first-sim',
    name: 'Future Sight',
    hint: 'Run one decision simulation.',
    pet: { emoji: '🦉', name: 'Hakim' },
    earned: (s) => s.xpLog.some((g) => g.action === 'runSimulation'),
  },
  {
    id: 'seven-days',
    name: 'Seven-Day Flame',
    hint: 'Log something on 7 different days — in a row or not.',
    pet: { emoji: '🐉', name: 'Jamra' },
    earned: (s) => loggedDayCount(s.transactions) >= 7,
  },
  {
    id: 'codex-5',
    name: 'Codex Collector',
    hint: 'Collect 5 codex lessons.',
    pet: { emoji: '🦋', name: 'Farasha' },
    earned: (s) => s.lessonsSeen.length >= 5,
  },
  {
    id: 'boss-win',
    name: 'Monster Tamer',
    hint: 'Beat the weekly Impulse Monster (retired — kept for those who did).',
    pet: { emoji: '🐺', name: 'Dib' },
    earned: (s) => s.xpLog.some((g) => g.action === 'weeklyBoss'),
    legacy: true,
  },
  {
    id: 'level-5',
    name: 'Apprentice Badge',
    hint: 'Reach level 5.',
    pet: { emoji: '🐱', name: 'Mishmish' },
    earned: (s) => s.xp.level >= 5,
  },
  {
    id: 'level-10',
    name: 'Explorer Badge',
    hint: 'Reach level 10.',
    pet: { emoji: '🦁', name: 'Sultan' },
    earned: (s) => s.xp.level >= 10,
  },
  // Learn room — mastery is read + quiz + a verified apply check (see
  // engine/learn.ts), all persisted in the learn slice, so these merge and
  // reload like every other badge. Ids are permanent.
  {
    id: 'first-mastery',
    name: 'First Lantern',
    hint: 'Master one lesson: read it, pass its quiz, try it for real.',
    pet: { emoji: '🦊', name: 'Fennec' },
    earned: (s) => masteredCount(s.learn) >= 1,
  },
  ...BRANCHES.map((b): Achievement => ({
    id: `branch-${b.id}`,
    name: `${b.title} Keeper`,
    hint: `Master every lesson on the ${b.title} trail.`,
    pet: BRANCH_PETS[b.id],
    earned: (s) => branchMastered(b.id, s.learn),
  })),
]

/** Id roster for the sanitizer/reducer — same gatekeeping role as LESSON_IDS. */
export const ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(ACHIEVEMENTS.map((a) => a.id))

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export function achievementById(id: string): Achievement | undefined {
  return BY_ID.get(id)
}

/** Ids earned by the current state but not yet persisted as unlocks. */
export function newlyEarnedIds(state: AppState): string[] {
  const have = new Set(state.achievements.map((u) => u.id))
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.earned(state)).map((a) => a.id)
}

/** Unlocked companions in roster order — the HeroCard strip's data. */
export function unlockedPets(unlocks: AchievementUnlock[]): PixelPet[] {
  const have = new Set(unlocks.map((u) => u.id))
  return ACHIEVEMENTS.filter((a) => have.has(a.id)).map((a) => a.pet)
}
