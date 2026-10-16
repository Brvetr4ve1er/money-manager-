import { useState, type Dispatch } from 'react'
import { BRANCHES } from '../../content/curriculum.ts'
import { LEARN_XP, questionById, reviewDue, topSuggested } from '../../engine/learn.ts'
import type { AppState } from '../../state/store.ts'
import type { AppAction } from '../../state/reducer.ts'
import { QuestionBlock } from './QuestionBlock.tsx'

const nowISO = () => new Date().toISOString()

/**
 * "Learn one thing today": the top suggested lantern, plus spaced review
 * when Leitner cards are due. No streak, no countdown — the card simply
 * says what would be good next, and a done marker once today's quest lands.
 */
export function TodayCard({
  state,
  today,
  dispatch,
  onOpen,
}: {
  state: AppState
  today: string
  dispatch: Dispatch<AppAction>
  onOpen: (id: string) => void
}) {
  const top = topSuggested(state.learn)
  const due = reviewDue(state.learn, today)
  const questDone = state.quests.some((q) => q.id === 'lesson' && q.done)
  const [reviewing, setReviewing] = useState(false)
  const branch = top ? BRANCHES.find((b) => b.id === top.branch)! : null

  return (
    <section className="card learn-today" aria-labelledby="learn-today-h">
      <div className="lesson-head">
        <h2 id="learn-today-h">Learn one thing today</h2>
        {questDone && <span className="lesson-collected">Done today ✓</span>}
      </div>
      {reviewing ? (
        <ReviewPanel state={state} today={today} dispatch={dispatch} onDone={() => setReviewing(false)} />
      ) : (
        <>
          {top && branch ? (
            <>
              <p className="learn-today-branch">
                <span aria-hidden="true">{branch.emoji}</span> {branch.title}
              </p>
              <h3 className="lesson-title">{top.title}</h3>
              <p className="lesson-body">{top.objective}</p>
              <div className="learn-actions">
                <button type="button" className="btn btn-flame" onClick={() => onOpen(top.id)}>
                  Start: {top.title}
                </button>
              </div>
            </>
          ) : (
            <p className="lesson-body">Every lantern on the path is lit. Review keeps them bright.</p>
          )}
          {due.length > 0 && (
            <div className="learn-review-cta">
              <p className="learn-review-line">
                {due.length === 1 ? 'One card is' : `${due.length} cards are`} ready for a quick look back.
              </p>
              <button type="button" className="btn btn-teal" onClick={() => setReviewing(true)}>
                Review {due.length} {due.length === 1 ? 'card' : 'cards'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Spaced review: one due card at a time. The FIRST pick on a card is what
 * moves its Leitner box (right → up a box, wrong → back to box 1, due
 * tomorrow — nothing else). Later picks just let the learner find the answer.
 */
function ReviewPanel({
  state,
  today,
  dispatch,
  onDone,
}: {
  state: AppState
  today: string
  dispatch: Dispatch<AppAction>
  onDone: () => void
}) {
  const due = reviewDue(state.learn, today)
  // Pin the card on screen: answering moves it out of the due list, but the
  // learner should still see its explanation until they choose "Next card".
  const [currentId, setCurrentId] = useState<string | null>(due[0]?.questionId ?? null)
  const [reviewed, setReviewed] = useState(0)
  const entry = currentId ? questionById(currentId) : undefined
  const remaining = due.filter((c) => c.questionId !== currentId)

  if (!entry) {
    return (
      <div className="learn-review-done" role="status">
        <p className="lesson-body">
          {reviewed > 0 ? `Reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}. ` : ''}
          Nothing else is due — the next cards come back on their own.
        </p>
        <button type="button" className="btn" onClick={onDone}>Back</button>
      </div>
    )
  }

  return (
    <div className="learn-review">
      <p className="learn-today-branch">From “{entry.node.title}”</p>
      <QuestionBlock
        key={entry.question.id}
        question={entry.question}
        label={`Review card${remaining.length > 0 ? ` · ${remaining.length} more after this` : ''}`}
        onAnswer={(correct, first) => {
          if (!first) return
          dispatch({ type: 'LEARN_REVIEW', questionId: entry.question.id, correct, today, nowISO: nowISO() })
          setReviewed((n) => n + 1)
        }}
        next={
          <button
            type="button"
            className="btn btn-flame"
            onClick={() => setCurrentId(remaining[0]?.questionId ?? null)}
          >
            {remaining.length > 0 ? 'Next card' : 'Finish review'}
          </button>
        }
      />
      <p className="learn-apply-note">A right first answer pays +{LEARN_XP.reviewDone} XP once a day. A miss just brings the card back tomorrow.</p>
      <button type="button" className="btn learn-back" onClick={onDone}>Stop for now</button>
    </div>
  )
}
