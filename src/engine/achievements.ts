/**
 * Achievements + loot — the engagement track's badge shelf. Every badge is a
 * pure predicate over AppState the user EARNS by doing something the app can
 * observe; there is no purchase path and never will be. The loot is a
 * pixel-pet companion per badge, shown beside the stage badge — cosmetic
 * only. Neither badges nor pets pay XP or touch the Health Score: the unlock
 * moment (toast + sparkle) and the permanent shelf row ARE the whole reward,
 * so the collection can never become an XP lever or a score input.
 */

import { addDaysISO } from './boss.ts'
import type { AchievementUnlock, AppState, Transaction } from '../state/store.ts'

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
}

/** A purchase row: money actually left — resists log a row but spend nothing. */
function isPurchase(t: Transaction): boolean {
  return t.resistedImpulse !== true
}

/**
 * Longest run of consecutive local calendar days holding at least one logged
 * row. ANY row counts, resists included — the streak rewards the logging
 * habit itself (showing up), the same show-up rule the boss engine's
 * hasLogInWeek applies. Pure over the list (no wall clock): a streak once
 * built stays computable identically on every tab and reload, and the unlock
 * persists anyway, so "longest ever" needs no reference day.
 */
export function longestLogStreak(transactions: Transaction[]): number {
  const days = [...new Set(transactions.map((t) => t.date))].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const day of days) {
    run = prev !== null && addDaysISO(prev, 1) === day ? run + 1 : 1
    if (run > best) best = run
    prev = day
  }
  return best
}

/**
 * The canonical roster. Predicates read only persisted evidence, so every
 * unlock survives reload and merges identically in any tab:
 * - simulation / boss-win badges key off the xpLog (the verified sim quest is
 *   the sole runSimulation grant vehicle, BOSS_VICTORY the sole weeklyBoss
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
    id: 'streak-7',
    name: 'Seven-Day Flame',
    hint: 'Log something 7 days in a row.',
    pet: { emoji: '🐉', name: 'Jamra' },
    earned: (s) => longestLogStreak(s.transactions) >= 7,
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
    hint: 'Beat the weekly Impulse Monster.',
    pet: { emoji: '🐺', name: 'Dib' },
    earned: (s) => s.xpLog.some((g) => g.action === 'weeklyBoss'),
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
