/**
 * XP/toast/sound reaction effects, extracted from App so the ordering
 * invariants documented below stay behind one module boundary. Everything
 * here reacts to state changes — never fires inside a state transition
 * (StrictMode double-invokes reducers in dev).
 */

import { useEffect, useRef, useState } from 'react'
import { levelTitle } from '../engine/xp.ts'
import * as sfx from '../audio/chiptune.ts'
import type { AppState } from '../state/store.ts'

/**
 * True when this tab plausibly hosts the user action behind a state change.
 * The effects below diff state without knowing its origin, so a peer tab's
 * write (a HYDRATE merge) moves XP/level/quests here too — but a celebration
 * sound must never play in a background tab the user never touched. A hidden
 * tab is certainly not where the tap landed, and a tab with no user
 * activation cannot even resume its AudioContext. Defaults open (?? true) on
 * browsers without navigator.userActivation. The toast/chip still render:
 * sound never carries information alone, so suppressing it loses nothing.
 */
function likelyLocalAction(): boolean {
  return (
    document.visibilityState === 'visible' &&
    (navigator.userActivation?.hasBeenActive ?? true)
  )
}

export function useRewards(state: AppState): { toast: string | null; xpGain: number | null } {
  // Toasts QUEUE instead of overwrite: completing the final quest can cross a
  // level boundary in the same commit, and both effects below then announce
  // in one batch — a bare setToast would let the later (quest) effect stomp
  // the level-up before the live region ever carried it, leaving the fanfare
  // to announce the level alone, which sound must never do. The head of the
  // queue is the visible toast; the dismiss timer shifts to the next.
  const [toastQueue, setToastQueue] = useState<string[]>([])
  const toast = toastQueue.length > 0 ? toastQueue[0] : null
  function pushToast(message: string) {
    setToastQueue((q) => [...q, message])
  }

  // Level-up fanfare/toast as a reaction to xp changes. The same effect
  // derives the transient +XP chip from the totalXp delta, so every grant —
  // whatever action produced it — gets a visible moment.
  const [xpGain, setXpGain] = useState<{ amount: number; at: number } | null>(null)
  const prevXp = useRef(state.xp)
  useEffect(() => {
    const prev = prevXp.current
    prevXp.current = state.xp
    if (state.xp.totalXp > prev.totalXp) {
      // Accumulate into a still-visible chip instead of replacing it: two
      // equal gains in a row would otherwise leave the chip and the sr-only
      // region text literally unchanged ('+5 XP' → '+5 XP'), so neither
      // re-pops nor re-announces — the blip would carry the second grant
      // alone, which sounds must never do. '+5 XP' → '+10 XP' both visibly
      // updates and re-announces. `at` still forces a fresh object per grant
      // so the keyed dismiss timer below resets each time.
      const gained = state.xp.totalXp - prev.totalXp
      setXpGain((cur) => ({ amount: gained + (cur?.amount ?? 0), at: Date.now() }))
    }
    if (state.xp.level > prev.level) {
      if (likelyLocalAction()) sfx.fanfare()
      pushToast(`Level ${state.xp.level} — ${levelTitle(state.xp.level)}!`)
    }
  }, [state.xp])

  // Chip dismissal owns its own timer, keyed on the gain (same pattern and
  // rationale as the toast timer below).
  useEffect(() => {
    if (xpGain === null) return
    const t = setTimeout(() => setXpGain(null), 1800)
    return () => clearTimeout(t)
  }, [xpGain])

  // Toast dismissal owns its own timer, keyed on the queue. It must NOT live
  // in the XP effect above: any XP gain within 2.6s of a level-up (e.g. +5
  // for logging a purchase) would run that effect's cleanup, cancel the
  // dismiss timer, and strand the toast — and the role="status" live region
  // content — on screen until the next level-up. Shifting (not clearing)
  // lets a queued second message ("All quests complete!") take its own turn
  // in the live region after the current one dismisses.
  useEffect(() => {
    if (toastQueue.length === 0) return
    const t = setTimeout(() => setToastQueue((q) => q.slice(1)), 2600)
    return () => clearTimeout(t)
  }, [toastQueue])

  // Quest-completion sounds, likewise driven by state changes only.
  const prevQuestsDone = useRef(state.quests.filter((q) => q.done).length)
  useEffect(() => {
    const doneCount = state.quests.filter((q) => q.done).length
    const prev = prevQuestsDone.current
    prevQuestsDone.current = doneCount
    if (doneCount > prev) {
      const local = likelyLocalAction()
      if (local) sfx.blip()
      if (state.quests.every((q) => q.done)) {
        // The arpeggio never carries the moment alone: the toast announces it
        // through the live region and QuestCard shows a persistent badge.
        pushToast('All quests complete!')
        if (local) {
          const t = setTimeout(sfx.arpeggio, 180)
          return () => clearTimeout(t)
        }
      }
    }
  }, [state.quests])

  return { toast, xpGain: xpGain?.amount ?? null }
}
