import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { QuizQuestion } from '../../content/curriculum.ts'

/**
 * One scenario question: four large option buttons, an immediate
 * explanation from the option's `why`, and unlimited retries. A wrong pick
 * explains and leaves every other option open — it never costs anything.
 *
 * `onAnswer` fires on every pick with whether it was the learner's FIRST
 * pick on this question (spaced review scores only the first; the quiz
 * only cares that the question ends up solved). `next` renders once the
 * question is solved and receives focus, so keyboard users land on it.
 */
export function QuestionBlock({
  question,
  label,
  onAnswer,
  next,
}: {
  question: QuizQuestion
  /** "Question 1 of 2", "Review card" … */
  label: string
  onAnswer?: (correct: boolean, first: boolean) => void
  next?: ReactNode
}) {
  const id = useId()
  const [picks, setPicks] = useState<number[]>([])
  const last = picks.length > 0 ? picks[picks.length - 1] : null
  const solved = last !== null && question.options[last].correct
  const nextRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!solved) return
    nextRef.current?.querySelector<HTMLElement>('button, a')?.focus()
  }, [solved])

  function pick(i: number) {
    if (solved) return
    const first = picks.length === 0
    setPicks((p) => [...p, i])
    onAnswer?.(question.options[i].correct, first)
  }

  return (
    <div className="lq" role="group" aria-labelledby={`${id}-p`}>
      <p className="lq-label">{label}</p>
      <p className="lq-prompt" id={`${id}-p`}>{question.prompt}</p>
      <ul className="lq-options">
        {question.options.map((o, i) => {
          const tried = picks.includes(i)
          const cls = [
            'lq-option',
            tried && !o.correct ? 'is-wrong' : '',
            solved && o.correct ? 'is-right' : '',
          ].join(' ')
          return (
            <li key={i}>
              {/* aria-disabled, never `disabled`: disabling the button the
                  learner just pressed would drop focus to <body>. */}
              <button
                type="button"
                className={cls}
                onClick={() => pick(i)}
                aria-disabled={solved && !o.correct ? true : undefined}
              >
                <span className="lq-letter" aria-hidden="true">{'ABCD'[i]}</span>
                <span className="lq-text">{o.text}</span>
                {tried && !o.correct && <span className="sr-only"> (tried)</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {/* Mounted empty so the first explanation is announced as a change. */}
      <div className={`lq-why${last === null ? '' : solved ? ' is-right' : ' is-wrong'}`} role="status" aria-live="polite">
        {last === null
          ? ''
          : solved
            ? `Yes — ${question.options[last].why}`
            : `Not quite. ${question.options[last].why} Try another answer.`}
      </div>
      {solved && next && <div className="lq-next" ref={nextRef}>{next}</div>}
    </div>
  )
}
