import { useEffect, useRef, useState, type Dispatch } from 'react'
import { BRANCHES, NODES } from '../../content/curriculum.ts'
import { LESSONS, lessonForDay } from '../../content/lessons.ts'
import { nodeState, pathOrder } from '../../engine/learn.ts'
import type { AppState } from '../../state/store.ts'
import type { AppAction } from '../../state/reducer.ts'

/**
 * The codex: every mastered lantern, plus the 30 original daily lessons as
 * bonus cards. Uncollected bonus cards are silhouettes (no title spoiler)
 * that open on a tap — nothing is ever bought or timed. Collecting one is
 * "learning one thing", so it completes the daily lesson quest too (the
 * quest's own guard pays it once a day).
 */
export function LearnCodex({
  state,
  today,
  dispatch,
  onOpenNode,
}: {
  state: AppState
  today: string
  dispatch: Dispatch<AppAction>
  onOpenNode: (id: string) => void
}) {
  const collected = new Set(state.lessonsSeen.map((e) => e.id))
  const bonusCount = LESSONS.filter((l) => collected.has(l.id)).length
  const mastered = pathOrder().filter((n) => nodeState(n, state.learn) === 'mastered')
  const todays = lessonForDay(today, state.lessonsSeen)
  const [openBonus, setOpenBonus] = useState<string | null>(null)
  const lesson = LESSONS.find((l) => l.id === openBonus) ?? null
  const readerRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (openBonus !== null) readerRef.current?.focus()
  }, [openBonus])

  function collect(id: string) {
    if (collected.has(id)) return
    dispatch({ type: 'READ_LESSON', id, date: today })
    dispatch({ type: 'COMPLETE_QUEST', id: 'lesson' })
  }

  return (
    // id: hero nav anchor target (desktop), and the full-width grid row.
    <section className="card learn-codex" id="codex" aria-labelledby="learn-codex-h">
      <div className="codex-head">
        <h2 id="learn-codex-h">Codex</h2>
        <span className="codex-count mono">{mastered.length} / {NODES.length} mastered</span>
      </div>

      <h3 className="learn-codex-sub">Mastered lanterns</h3>
      {mastered.length === 0 ? (
        <p className="learn-codex-empty">Your first mastered lesson lands here — read it, pass its quiz, try it for real.</p>
      ) : (
        <ul className="codex-grid">
          {mastered.map((n) => {
            const b = BRANCHES.find((x) => x.id === n.branch)!
            return (
              <li key={n.id}>
                <button type="button" className="codex-tile learn-codex-node" onClick={() => onOpenNode(n.id)}>
                  <span className="codex-tile-title">
                    <span aria-hidden="true">{b.emoji} </span>{n.title}
                  </span>
                  <span className="codex-tile-line">{n.objective}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="learn-codex-bonus-head">
        <h3 className="learn-codex-sub">Bonus cards</h3>
        <span className="codex-count mono">{bonusCount} / {LESSONS.length} collected</span>
      </div>
      {!collected.has(todays.id) && openBonus !== todays.id && (
        <button type="button" className="btn btn-gold learn-bonus-today" onClick={() => setOpenBonus(todays.id)}>
          Open today's bonus card
        </button>
      )}
      {lesson && (
        <div className="learn-bonus-reader" role="region" aria-labelledby="learn-bonus-title">
          <h4 className="lesson-title" id="learn-bonus-title" ref={readerRef} tabIndex={-1}>{lesson.title}</h4>
          <p className="lesson-body">{lesson.body}</p>
          <div className="learn-actions">
            {/* Inert after collecting via aria-disabled (never `disabled`,
                which would drop focus to <body>) — same as the old card. */}
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => collect(lesson.id)}
              aria-disabled={collected.has(lesson.id)}
              aria-label={collected.has(lesson.id) ? `${lesson.title} — collected` : `Got it: ${lesson.title}`}
            >
              {collected.has(lesson.id) ? 'Collected' : 'Got it'}
            </button>
            <button type="button" className="btn" onClick={() => setOpenBonus(null)}>Close card</button>
          </div>
        </div>
      )}
      <ul className="codex-grid">
        {LESSONS.map((l) =>
          collected.has(l.id) ? (
            <li key={l.id}>
              <button type="button" className="codex-tile learn-codex-node" onClick={() => setOpenBonus(l.id)}>
                <span className="codex-tile-title">{l.title}</span>
                <span className="codex-tile-line">{l.oneLiner}</span>
              </button>
            </li>
          ) : (
            /* Silhouette: no title spoiler. The "?" is decoration; the
               accessible name names the state without leaking the lesson. */
            <li key={l.id}>
              <button
                type="button"
                className="codex-tile codex-locked"
                aria-label="Uncollected bonus card"
                onClick={() => setOpenBonus(l.id)}
              >
                <span className="codex-tile-title" aria-hidden="true">?</span>
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
