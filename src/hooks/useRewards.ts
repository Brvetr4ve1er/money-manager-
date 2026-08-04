/**
 * XP/toast/sound reaction effects, extracted from App so the ordering
 * invariants documented below stay behind one module boundary. Everything
 * here reacts to state changes — never fires inside a state transition
 * (StrictMode double-invokes reducers in dev).
 */

import { useEffect, useRef, useState } from 'react'
import { levelTitle } from '../engine/xp.ts'
import { achievementById } from '../engine/achievements.ts'
import { LESSONS } from '../content/lessons.ts'
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

/**
 * TOAST VOICE (§7.4, hard ban on exclamation marks). Every message pushed
 * below is a two-fragment spec statement — the §7 success exemplar is
 * "Done. Batch 07 confirmed.", not a cheer. These land in the permanently
 * mounted role="status" region, so the punctuation is not decoration: a
 * screen reader gets the same flat, factual sentence a sighted user reads.
 *
 * The engagement/financial split (Trust Rule 1) constrains the wording too.
 * A boss win is stated about the monster, never re-framed as praise of the
 * user — "You beat the Impulse Monster" would put an engagement event in the
 * register the Health Score speaks in.
 */
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

  // One fanfare per moment, shared by the level-up and boss-victory effects:
  // a boss win's +150 XP usually crosses a level boundary in the same commit,
  // and both effects firing sfx.fanfare 0ms apart would stack every note into
  // doubled gain. Only the SOUND dedupes — both toasts still queue, so each
  // moment keeps its visible announcement.
  const lastFanfareAt = useRef(0)
  function playFanfare() {
    if (!likelyLocalAction()) return
    const now = Date.now()
    if (now - lastFanfareAt.current < 500) return
    lastFanfareAt.current = now
    sfx.fanfare()
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
      playFanfare()
      pushToast(`Level ${state.xp.level}. ${levelTitle(state.xp.level)}.`)
    }
  }, [state.xp])

  // Weekly boss victories land as xpLog grants (deterministic `boss:{week}`
  // ids — see the BOSS_VICTORY reducer path), so diffing the grant count is
  // origin-agnostic like every effect here: a peer tab's claim still toasts,
  // while the ref initializer keeps long-persisted wins from re-celebrating
  // on every mount. The fanfare (its doc comment reserves "boss defeated")
  // never carries the win alone: the toast announces it through the live
  // region and BossCard shows the persistent beaten chip.
  const prevBossWins = useRef(state.xpLog.filter((g) => g.action === 'weeklyBoss').length)
  useEffect(() => {
    const n = state.xpLog.filter((g) => g.action === 'weeklyBoss').length
    const prev = prevBossWins.current
    prevBossWins.current = n
    if (n > prev) {
      pushToast('Impulse Monster beaten. Lighter week than last.')
      playFanfare()
    }
  }, [state.xpLog])

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
  // lets a queued second message ("All quests complete.") take its own turn
  // in the live region after the current one dismisses.
  useEffect(() => {
    if (toastQueue.length === 0) return
    const t = setTimeout(() => setToastQueue((q) => q.slice(1)), 2600)
    return () => clearTimeout(t)
  }, [toastQueue])

  // Codex collection milestones — every 5 lessons gets the rare-pull shimmer.
  // The toast is the sparkle's visible counterpart (sound never carries the
  // moment alone), and the CodexCard count is its persistent one.
  const prevLessons = useRef(state.lessonsSeen.length)
  useEffect(() => {
    const n = state.lessonsSeen.length
    const prev = prevLessons.current
    prevLessons.current = n
    // Floor-crossing, not n % 5 === 0: a multi-lesson jump (a peer-tab merge
    // landing several collected lessons at once) must still celebrate the
    // milestone it crossed instead of skipping it.
    if (n > prev && Math.floor(n / 5) > Math.floor(prev / 5)) {
      pushToast(`Codex: ${n} / ${LESSONS.length} lessons collected.`)
      if (likelyLocalAction()) sfx.sparkle()
    }
  }, [state.lessonsSeen])

  // Achievement unlocks — the rare-pull shimmer with its visible counterpart:
  // one toast PER badge names it and its pet (the queue takes turns in the
  // live region), and AchievementsCard/the pet strip are the persistent
  // state, so the sparkle never carries the moment alone. Diffing persisted
  // ids keeps this origin-agnostic (a peer tab's unlock still toasts here)
  // while the ref initializer keeps long-held badges from re-celebrating on
  // every mount. One sparkle per batch — a merge landing several badges at
  // once must not stack the shimmer into doubled gain.
  const prevAchievements = useRef(new Set(state.achievements.map((a) => a.id)))
  useEffect(() => {
    const prev = prevAchievements.current
    const added = state.achievements.filter((a) => !prev.has(a.id))
    prevAchievements.current = new Set(state.achievements.map((a) => a.id))
    if (added.length === 0) return
    for (const u of added) {
      const a = achievementById(u.id)
      // Name only: the companion's mark is a drawn glyph now (§8), and an
      // announcement is text — a live region cannot read a vector.
      if (a) pushToast(`${a.name} earned. ${a.pet.name} joins you.`)
    }
    if (likelyLocalAction()) sfx.sparkle()
  }, [state.achievements])

  // Quest completions, likewise driven by state changes only.
  //
  // Diffed by ID, not by count: the count form missed a rollover commit that
  // resets the day's quests and completes one in the same change, and it could
  // not name which quest landed. Naming it is the point — the sweep measured
  // a single completion announcing as "+10 XP" and nothing else, with the
  // whole signal carried by the focused button's accessible name changing
  // under the user (NVDA announces that, VoiceOver frequently does not, JAWS
  // is inconsistent). The toast QUEUE is the right home for it: it is the one
  // mechanism here that serialises two announcements landing in one commit.
  const prevQuestsDone = useRef(new Set(state.quests.filter((q) => q.done).map((q) => q.id)))
  useEffect(() => {
    const prev = prevQuestsDone.current
    const landed = state.quests.filter((q) => q.done && !prev.has(q.id))
    prevQuestsDone.current = new Set(state.quests.filter((q) => q.done).map((q) => q.id))
    if (landed.length > 0) {
      const local = likelyLocalAction()
      if (local) sfx.blip()
      const allDone = state.quests.every((q) => q.done)
      // The all-complete toast SUBSUMES the per-quest one for the completion
      // that finishes the set: two writes to one polite region inside a single
      // tick is exactly the shape that makes a live region interrupt itself,
      // and "All quests complete." already says the last quest is done.
      if (!allDone) {
        for (const q of landed) pushToast(`Quest done. ${q.text}`)
      }
      if (allDone) {
        // The arpeggio never carries the moment alone: the toast announces it
        // through the live region and QuestCard shows a persistent badge.
        pushToast('All quests complete.')
        if (local) {
          const t = setTimeout(sfx.arpeggio, 180)
          return () => clearTimeout(t)
        }
      }
    }
  }, [state.quests])

  return { toast, xpGain: xpGain?.amount ?? null }
}
