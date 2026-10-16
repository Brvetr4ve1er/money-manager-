import { useEffect, useState } from 'react'
import { nodeById } from '../content/curriculum.ts'
import { resolveProfile } from '../engine/profile.ts'
import { SimCard } from '../components/SimCard.tsx'
import { AchievementsCard } from '../components/AchievementsCard.tsx'
import { TodayCard } from '../components/learn/TodayCard.tsx'
import { NodeSheet } from '../components/learn/NodeSheet.tsx'
import { PathMap } from '../components/learn/PathMap.tsx'
import { LearnCodex } from '../components/learn/LearnCodex.tsx'
import { HearthMonth } from '../components/learn/HearthMonth.tsx'
import type { RouteProps } from './types.ts'
import '../components/learn/learn.css'

/**
 * Learn room — a cozy, non-punitive learning game. The skill path (eight
 * branch trails of lanterns), one node sheet at a time (lesson → scenario
 * quiz → try it for real), spaced review, the codex, the decision simulator
 * and the badge shelf.
 *
 * House rules: no hearts or lives, no streaks, no timers, no leaderboards,
 * no loot boxes. A wrong answer explains and lets you try again. XP is the
 * engagement track only. Nothing is gated — any lantern opens.
 */
export function LearnRoute({ state, dispatch, today }: RouteProps) {
  // Same profile resolution useHealthDay applies, so the simulator and the
  // score never speak from different numbers.
  const { profile, isDemo } = resolveProfile(state.profile)
  const [openId, setOpenId] = useState<string | null>(() => nodeFromHash(window.location.hash))
  const openNode = openId ? nodeById(openId) : undefined

  // `#/learn?node=<id>` (Hearth Month's lesson links) opens that lantern.
  useEffect(() => {
    const onChange = () => {
      const id = nodeFromHash(window.location.hash)
      if (id) {
        setOpenId(id)
        window.scrollTo?.(0, 0)
      }
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  function close() {
    const id = openId
    setOpenId(null)
    // Hand focus back to the lantern that opened the sheet.
    if (id) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`.lantern[data-node="${id}"]`)?.focus(),
      )
    }
  }

  return (
    <>
      <TodayCard state={state} today={today} dispatch={dispatch} onOpen={setOpenId} />
      {openNode && (
        <NodeSheet
          key={openNode.id}
          node={openNode}
          state={state}
          today={today}
          dispatch={dispatch}
          onClose={close}
          onOpenNode={setOpenId}
        />
      )}
      <PathMap state={state} today={today} openId={openId} onOpen={setOpenId} />
      <HearthMonth />
      {/* Running a simulation genuinely completes the verified sim quest.
          On desktop the room grid packs densely, so this card rises into the
          free column beside the Today card. */}
      <SimCard profile={profile} isDemo={isDemo} onRun={() => dispatch({ type: 'COMPLETE_QUEST', id: 'sim' })} />
      <LearnCodex state={state} today={today} dispatch={dispatch} onOpenNode={setOpenId} />
      <AchievementsCard unlocks={state.achievements} />
    </>
  )
}

/** The node id in a `#/learn?node=<id>` link, if it names a real node. */
export function nodeFromHash(hash: string): string | null {
  const q = hash.split('?')[1]
  if (!q) return null
  const id = new URLSearchParams(q).get('node')
  return id && nodeById(id) ? id : null
}
