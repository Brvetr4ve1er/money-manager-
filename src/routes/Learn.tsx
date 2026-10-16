import { lessonForDay } from '../content/lessons.ts'
import { resolveProfile } from '../engine/profile.ts'
import { LessonCard } from '../components/LessonCard.tsx'
import { SimCard } from '../components/SimCard.tsx'
import { CodexCard } from '../components/CodexCard.tsx'
import { AchievementsCard } from '../components/AchievementsCard.tsx'
import type { RouteProps } from './types.ts'

/**
 * Learn room. Owns everything on the knowledge track: today's lesson, the
 * decision simulator, the codex and the badge shelf. The skill tree (Phase 2)
 * replaces the daily lesson here; the cards below keep their DOM contract.
 */
export function LearnRoute({ state, dispatch, today }: RouteProps) {
  // Same profile resolution useHealthDay applies, so the simulator and the
  // score never speak from different numbers.
  const { profile, isDemo } = resolveProfile(state.profile)
  // Deterministic pick for the day — same lesson on every render, reload and
  // tab, and stable across "Got it" (lessonForDay keeps today's own entry).
  const todayLesson = lessonForDay(today, state.lessonsSeen)
  const lessonReadToday = state.quests.some((q) => q.id === 'lesson' && q.done)

  function readLesson() {
    // Two dispatches, one tap: READ_LESSON collects into the codex (no XP),
    // and the verified lesson quest carries the readLesson grant through
    // COMPLETE_QUEST's atomic double-grant guard.
    dispatch({ type: 'READ_LESSON', id: todayLesson.id, date: today })
    dispatch({ type: 'COMPLETE_QUEST', id: 'lesson' })
  }

  return (
    <>
      <LessonCard lesson={todayLesson} readToday={lessonReadToday} onRead={readLesson} />
      {/* Running a simulation genuinely completes the verified sim quest. */}
      <SimCard profile={profile} isDemo={isDemo} onRun={() => dispatch({ type: 'COMPLETE_QUEST', id: 'sim' })} />
      <CodexCard collectedIds={new Set(state.lessonsSeen.map((e) => e.id))} />
      <AchievementsCard unlocks={state.achievements} />
    </>
  )
}
