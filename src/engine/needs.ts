/**
 * Needs-based setup. The picker asks "what helps you", by need and never by
 * diagnosis — the same mechanic serves someone in a manic episode, someone
 * with ADHD and someone who simply spends when stressed, and none of them
 * owes the app a label. Each need composes defaults the user can change
 * afterwards; nothing here is a lock-in.
 */

import type { BrakeRule } from './brakes.ts'

export type NeedId = 'brakes' | 'low-energy' | 'calm' | 'second-pair'

export interface Need {
  id: NeedId
  label: string
  hint: string
}

export const NEEDS: ReadonlyArray<Need> = [
  {
    id: 'brakes',
    label: 'I spend fast when I am up',
    hint: 'Big or risky purchases wait a day before they count. You decide again after the wait.',
  },
  {
    id: 'low-energy',
    label: 'Some days I cannot face it',
    hint: 'A one-tap low-energy view: what is due, what is free, one button to log. No quests, no scores.',
  },
  {
    id: 'calm',
    label: 'Noise and surprises stress me',
    hint: 'Sound off, no animation, nothing pops up. The app only speaks when you open it.',
  },
  {
    id: 'second-pair',
    label: 'I want someone I trust to see a summary',
    hint: 'You build a weekly snapshot and send it yourself. Nothing is shared automatically.',
  },
]

export const NEED_IDS: ReadonlySet<string> = new Set(NEEDS.map((n) => n.id))

export interface NeedsDefaults {
  /** A starting brake rule, or null when the need was not picked. */
  brakes: BrakeRule | null
  lowEnergy: boolean
  calm: boolean
  wantsTrusted: boolean
}

/** Starting brake: hold anything 5,000 DA or more, and all "Fun", for a day. */
export const DEFAULT_BRAKE_RULE: BrakeRule = {
  thresholdDA: 5_000,
  categories: ['Fun'],
  delayHours: 24,
}

export function composeDefaults(needs: ReadonlyArray<NeedId>): NeedsDefaults {
  const has = (id: NeedId) => needs.includes(id)
  return {
    brakes: has('brakes') ? DEFAULT_BRAKE_RULE : null,
    lowEnergy: has('low-energy'),
    calm: has('calm'),
    wantsTrusted: has('second-pair'),
  }
}
