import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { JarView } from '../../engine/money.ts'
import { fmtDA } from '../../engine/money.ts'
import { shortDay } from '../../engine/dates.ts'
import { fillLevel, parseAmount } from './helpers.ts'

export type JarPanel = 'add' | 'take' | 'cover'

export const JAR_TONES = ['butter', 'peach', 'mint', 'lilac', 'sky', 'rose'] as const

interface Props {
  view: JarView
  tone: number
  /** Other live jars, for picking a cover source. */
  others: JarView[]
  panel: JarPanel | null
  onPanel: (p: JarPanel | null) => void
  onMove: (signedAmount: number) => void
  onCover: (fromJarId: string, amount: number) => void
  onEdit: () => void
}

function Bow({ pop }: { pop: boolean }) {
  return (
    <svg className={`jar-bow${pop ? ' -pop' : ''}`} viewBox="0 0 34 24" aria-hidden="true">
      <path d="M17 12 C8 2 0 6 4 13 C7 18 14 15 17 12 Z" fill="#ff8f9c" />
      <path d="M17 12 C26 2 34 6 30 13 C27 18 20 15 17 12 Z" fill="#ff8f9c" />
      <path d="M17 12 L11 23 M17 12 L23 23" stroke="#ff8f9c" strokeWidth="4" strokeLinecap="round" />
      <circle cx="17" cy="12" r="4" fill="#ff6f85" />
    </svg>
  )
}

/** One squishy clay jar on the shelf, with its own inline move panels. */
export function JarCard({ view, tone, others, panel, onPanel, onMove, onCover, onEdit }: Props) {
  const { jar, balance, perMonth, onTrack, reached, overspent } = view
  const headingId = useId()
  const level = fillLevel(view)

  // Clay springs: squish when a move lands; the bow pops only when the jar
  // becomes full while you watch (a jar that was already full just wears it).
  const prevBalance = useRef(balance)
  const prevReached = useRef(reached)
  const [squish, setSquish] = useState(false)
  const [bowPop, setBowPop] = useState(false)
  useEffect(() => {
    if (prevBalance.current !== balance) setSquish(true)
    if (!prevReached.current && reached) setBowPop(true)
    prevBalance.current = balance
    prevReached.current = reached
  }, [balance, reached])

  return (
    <article
      className={`jar-clay -${JAR_TONES[tone % JAR_TONES.length]}${squish ? ' -squish' : ''}${overspent ? ' -low' : ''}`}
      aria-labelledby={headingId}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setSquish(false)
      }}
    >
      <div className="jar-lid" aria-hidden="true" />
      {reached && <Bow pop={bowPop} />}
      <div
        className="jar-glass"
        role="img"
        aria-label={view.progress !== null ? `${Math.round(view.progress * 100)}% of target` : `${fmtDA(Math.max(0, balance))} inside`}
      >
        <div className="jar-fill" style={{ height: `${Math.round(level * 100)}%` }} />
        <span className="jar-emoji" aria-hidden="true">{jar.emoji}</span>
      </div>

      <div className="jar-text">
        <h3 id={headingId} className="jar-name">
          {jar.name}
          {jar.locked && <span className="jar-lock" title="Soft lock on">🔒<span className="sr-only"> (locked)</span></span>}
        </h3>
        <p className="jar-balance mono">{fmtDA(balance)}</p>
        {jar.target !== null && <p className="jar-sub">of {fmtDA(jar.target)}</p>}
        {reached && <p className="jar-sub">Target reached. Lovely.</p>}
        {perMonth !== null && jar.targetDate !== null && (
          <>
            <p className="jar-sub">
              <span className="mono">{fmtDA(perMonth)}</span>/month to reach by {shortDay(jar.targetDate)}
            </p>
            <span className={`jar-pill ${onTrack ? '-on' : '-off'}`}>{onTrack ? 'on track' : 'not on track yet'}</span>
          </>
        )}
        {jar.target !== null && jar.targetDate === null && !reached && (
          <p className="jar-sub">Add a date to see a monthly pace.</p>
        )}
      </div>

      {overspent && panel !== 'cover' && (
        <div className="jar-cover-cta">
          <p>Spent {fmtDA(-balance)} past this jar. Move a little in from another jar?</p>
          <button type="button" className="jar-btn -cover" onClick={() => onPanel('cover')}>
            Cover it
          </button>
        </div>
      )}

      {panel === null && (
        <div className="jar-actions">
          <button type="button" className="jar-btn" onClick={() => onPanel('add')} aria-label={`Add to ${jar.name}`}>
            Add
          </button>
          <button type="button" className="jar-btn" onClick={() => onPanel('take')} aria-label={`Take out of ${jar.name}`}>
            Take out
          </button>
          <button type="button" className="jar-btn -quiet" onClick={onEdit} aria-label={`Edit ${jar.name}`}>
            Edit
          </button>
        </div>
      )}

      {(panel === 'add' || panel === 'take') && (
        <MovePanel
          mode={panel}
          jarName={jar.name}
          locked={jar.locked}
          onCancel={() => onPanel(null)}
          onDone={(n) => {
            onMove(panel === 'add' ? n : -n)
            onPanel(null)
          }}
        />
      )}

      {panel === 'cover' && (
        <CoverPanel
          deficit={-balance}
          jarName={jar.name}
          sources={others.filter((o) => o.balance > 0)}
          onCancel={() => onPanel(null)}
          onDone={(from, n) => {
            onCover(from, n)
            onPanel(null)
          }}
        />
      )}
    </article>
  )
}

function MovePanel({
  mode,
  jarName,
  locked,
  onCancel,
  onDone,
}: {
  mode: 'add' | 'take'
  jarName: string
  locked: boolean
  onCancel: () => void
  onDone: (amount: number) => void
}) {
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const id = useId()
  const label = mode === 'add' ? `Amount to add to ${jarName}` : `Amount to take out of ${jarName}`

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = parseAmount(raw)
    if (n === null) {
      setError('Type an amount in DA, like 2000.')
      return
    }
    if (mode === 'take' && locked) {
      setConfirming(n)
      return
    }
    onDone(n)
  }

  if (confirming !== null) {
    return (
      <div className="jar-panel" role="group" aria-label={`Confirm taking out of ${jarName}`}>
        <p className="jar-confirm">You locked this jar on purpose. Take out anyway?</p>
        <div className="jar-actions">
          <button type="button" className="jar-btn -strong" onClick={() => onDone(confirming)} autoFocus>
            Yes, take out {fmtDA(confirming)}
          </button>
          <button type="button" className="jar-btn" onClick={onCancel}>
            Keep it locked
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="jar-panel" onSubmit={submit} noValidate>
      <label className="jar-field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="jar-input mono"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DA"
        value={raw}
        autoFocus
        onChange={(e) => {
          setRaw(e.target.value)
          setError(null)
        }}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && <p className="jar-error" id={`${id}-err`}>{error}</p>}
      <div className="jar-actions">
        <button type="submit" className="jar-btn -strong">{mode === 'add' ? 'Put it in' : 'Take it out'}</button>
        <button type="button" className="jar-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function CoverPanel({
  deficit,
  jarName,
  sources,
  onCancel,
  onDone,
}: {
  deficit: number
  jarName: string
  sources: JarView[]
  onCancel: () => void
  onDone: (fromJarId: string, amount: number) => void
}) {
  const best = sources.find((s) => s.balance >= deficit) ?? sources[0]
  const [from, setFrom] = useState(best?.jar.id ?? '')
  const [raw, setRaw] = useState(String(deficit))
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  if (sources.length === 0) {
    return (
      <div className="jar-panel">
        <p className="jar-confirm">
          No other jar has spare money right now. When income lands, a top-up here settles it — nothing is wrong, it is just waiting.
        </p>
        <div className="jar-actions">
          <button type="button" className="jar-btn" onClick={onCancel}>Okay</button>
        </div>
      </div>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = parseAmount(raw)
    const src = sources.find((s) => s.jar.id === from)
    if (n === null || !src) {
      setError('Pick a jar and an amount in DA.')
      return
    }
    if (n > src.balance) {
      setError(`${src.jar.name} holds ${fmtDA(src.balance)} — try that much or less.`)
      return
    }
    onDone(src.jar.id, n)
  }

  return (
    <form className="jar-panel" onSubmit={submit} noValidate aria-label={`Cover ${jarName}`}>
      <label className="jar-field-label" htmlFor={`${id}-from`}>Cover from</label>
      <select id={`${id}-from`} className="jar-input" value={from} onChange={(e) => { setFrom(e.target.value); setError(null) }}>
        {sources.map((s) => (
          <option key={s.jar.id} value={s.jar.id}>
            {s.jar.emoji} {s.jar.name} · {fmtDA(s.balance)}
          </option>
        ))}
      </select>
      <label className="jar-field-label" htmlFor={`${id}-amt`}>Amount to move</label>
      <input
        id={`${id}-amt`}
        className="jar-input mono"
        inputMode="numeric"
        autoComplete="off"
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setError(null) }}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && <p className="jar-error" id={`${id}-err`}>{error}</p>}
      <div className="jar-actions">
        <button type="submit" className="jar-btn -strong">Move it over</button>
        <button type="button" className="jar-btn" onClick={onCancel}>Not now</button>
      </div>
    </form>
  )
}
