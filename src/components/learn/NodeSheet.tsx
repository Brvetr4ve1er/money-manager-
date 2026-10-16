import { useEffect, useRef, useState, type Dispatch } from 'react'
import { BRANCHES, type SkillNode } from '../../content/curriculum.ts'
import {
  APPLY_INFO,
  LEARN_XP,
  isApplied,
  missingPrereqs,
  nodeState,
} from '../../engine/learn.ts'
import { progressFor } from '../../state/slices/learn.ts'
import type { AppState } from '../../state/store.ts'
import type { AppAction } from '../../state/reducer.ts'
import { QuestionBlock } from './QuestionBlock.tsx'

type Step = 'lesson' | 'quiz' | 'try'

const nowISO = () => new Date().toISOString()

/**
 * The node sheet: lesson → quiz → try it. Opens inline above the path map.
 * Nothing is gated: an unsuggested node opens just the same, with a gentle
 * "best after" note pointing at the lessons that make it easier.
 */
export function NodeSheet({
  node,
  state,
  today,
  dispatch,
  onClose,
  onOpenNode,
}: {
  node: SkillNode
  state: AppState
  today: string
  dispatch: Dispatch<AppAction>
  onClose: () => void
  onOpenNode: (id: string) => void
}) {
  const progress = progressFor(state.learn, node.id)
  const passed = progress?.quizPassedAt != null
  const read = progress?.readAt != null
  // Auto-detect: a node already passed opens on its Try-it step, so an
  // apply check that is already true is offered immediately.
  const [step, setStep] = useState<Step>(passed ? 'try' : 'lesson')
  const [qi, setQi] = useState(0)
  /** Set when THIS visit's quiz pass landed — drives the spring moment. */
  const [celebrate, setCelebrate] = useState<null | { firstPass: boolean }>(null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const branch = BRANCHES.find((b) => b.id === node.branch)!
  const missing = missingPrereqs(node, state.learn)
  const ns = nodeState(node, state.learn)

  useEffect(() => {
    headRef.current?.focus()
    headRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [node.id])

  function gotIt() {
    if (!read) dispatch({ type: 'learn/read', nodeId: node.id, today })
    setQi(0)
    setCelebrate(null)
    setStep('quiz')
  }

  // The pass lands the moment the second question is solved — never behind
  // an extra tap the learner might skip.
  function passQuiz() {
    if (celebrate) return
    dispatch({ type: 'LEARN_QUIZ_PASS', nodeId: node.id, today, nowISO: nowISO() })
    setCelebrate({ firstPass: !passed })
  }

  const spark = celebrate && (
    <div className="learn-spark" role="status">
      <span className="learn-spark-flame" aria-hidden="true" />
      <span>
        <b>Lantern lit!</b>{' '}
        {celebrate.firstPass ? `Both answers right — +${LEARN_XP.quizPass} XP.` : 'Both right again — the lantern stays lit.'}
      </span>
    </div>
  )

  return (
    <section className="card wide learn-sheet" aria-labelledby={`sheet-${node.id}`} data-branch={node.branch}>
      <div className="learn-sheet-head">
        <p className="learn-sheet-branch">
          <span aria-hidden="true">{branch.emoji}</span> {branch.title} · {node.order}
        </p>
        <button type="button" className="btn learn-close" onClick={onClose} aria-label={`Close ${node.title}`}>
          Close
        </button>
      </div>
      <h3 className="learn-sheet-title" id={`sheet-${node.id}`} ref={headRef} tabIndex={-1}>
        {node.title}
      </h3>
      <ol className="learn-steps" aria-label="Steps">
        {(['lesson', 'quiz', 'try'] as const).map((s) => (
          <li key={s} className={s === step ? 'is-current' : ''} aria-current={s === step ? 'step' : undefined}>
            {s === 'lesson' ? 'Read' : s === 'quiz' ? 'Quiz' : 'Try it'}
          </li>
        ))}
      </ol>

      {step === 'lesson' && (
        <div className="learn-step">
          {missing.length > 0 && (
            <p className="learn-best-after">
              Best after{' '}
              {missing.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && (i === missing.length - 1 ? ' and ' : ', ')}
                  <button type="button" className="learn-inline-link" onClick={() => onOpenNode(m.id)}>
                    {m.title}
                  </button>
                </span>
              ))}
              {' '}— but it's open now if you're curious.
            </p>
          )}
          <p className="learn-objective">{node.objective}</p>
          {node.lesson.split('\n\n').map((para, i) => (
            <p key={i} className="learn-para">{para}</p>
          ))}
          <div className="learn-actions">
            {!read ? (
              <button type="button" className="btn btn-flame" onClick={gotIt}>Got it</button>
            ) : (
              <button type="button" className="btn btn-flame" onClick={gotIt}>
                {passed ? 'Take the quiz again' : 'Take the quiz'}
              </button>
            )}
            {passed && (
              <button type="button" className="btn" onClick={() => setStep('try')}>Go to Try it</button>
            )}
          </div>
        </div>
      )}

      {step === 'quiz' && (
        <div className="learn-step">
          <QuestionBlock
            key={node.quiz[qi].id}
            question={node.quiz[qi]}
            label={`Question ${qi + 1} of 2`}
            onAnswer={(correct) => {
              if (correct && qi === 1) passQuiz()
            }}
            next={
              qi === 0 ? (
                <button type="button" className="btn btn-flame" onClick={() => setQi(1)}>Next question</button>
              ) : (
                <>
                  {spark}
                  <button type="button" className="btn btn-flame" onClick={() => setStep('try')}>Continue to Try it</button>
                </>
              )
            }
          />
          <button type="button" className="btn learn-back" onClick={() => setStep('lesson')}>Back to the lesson</button>
        </div>
      )}

      {step === 'try' && (
        <div className="learn-step">
          <h4 className="learn-try-h">Try it</h4>
          <p className="learn-para">{node.tryIt}</p>
          <ApplyStatus node={node} state={state} today={today} dispatch={dispatch} mastered={ns === 'mastered'} />
          <div className="learn-actions">
            <button type="button" className="btn" onClick={() => setStep('lesson')}>Re-read the lesson</button>
          </div>
        </div>
      )}
    </section>
  )
}

function ApplyStatus({
  node,
  state,
  today,
  dispatch,
  mastered,
}: {
  node: SkillNode
  state: AppState
  today: string
  dispatch: Dispatch<AppAction>
  mastered: boolean
}) {
  if (node.apply === null) {
    return (
      <p className="learn-apply is-done" role="status">
        <span aria-hidden="true">🔥 </span>
        Mastered — this one lives in your life, not in the app. Passing the quiz lights it fully.
      </p>
    )
  }
  const info = APPLY_INFO[node.apply]
  const ok = isApplied(node.apply, state, today)
  if (mastered) {
    return (
      <p className="learn-apply is-done" role="status">
        <span aria-hidden="true">🔥 </span>Mastered ✓ — {info.done}.
      </p>
    )
  }
  if (ok) {
    return (
      <div className="learn-apply is-ready" role="status">
        <p>Done ✓ — {info.done}.</p>
        <button
          type="button"
          className="btn btn-flame"
          onClick={() => dispatch({ type: 'LEARN_APPLY', nodeId: node.id, today })}
        >
          Mark mastered (+{LEARN_XP.nodeApplied} XP)
        </button>
      </div>
    )
  }
  return (
    <div className="learn-apply is-todo" role="status">
      <p>Not yet — {info.todo}.</p>
      {info.href !== '#/learn' && (
        <a className="btn btn-gold" href={info.href}>Open {info.room}</a>
      )}
      <p className="learn-apply-note">No rush: this lantern stays lit while you get to it.</p>
    </div>
  )
}
