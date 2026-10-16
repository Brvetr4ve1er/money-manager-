import { forwardRef, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { Jar } from '../../state/slices/money.ts'
import { isValidDayKey } from '../../engine/dates.ts'
import { fmtDA } from '../../engine/money.ts'
import { JAR_PRESETS, parseAmount } from './helpers.ts'

interface Draft {
  name: string
  emoji: string
  target: string
  targetDate: string
  locked: boolean
}

const EMPTY: Draft = { name: '', emoji: '🫙', target: '', targetDate: '', locked: false }

function fromJar(j: Jar): Draft {
  return {
    name: j.name,
    emoji: j.emoji,
    target: j.target === null ? '' : String(j.target),
    targetDate: j.targetDate ?? '',
    locked: j.locked,
  }
}

interface Props {
  today: string
  /** Jar being edited, or null for a new jar. */
  editing: Jar | null
  editingBalance: number
  onSave: (fields: Pick<Jar, 'name' | 'emoji' | 'target' | 'targetDate' | 'locked'>) => void
  onArchive: () => void
  onDoneEditing: () => void
  empty: boolean
}

/** Create / edit a jar. Presets fill the fields in one tap; all editable. */
export const JarForm = forwardRef<HTMLElement, Props>(function JarForm(
  { today, editing, editingBalance, onSave, onArchive, onDoneEditing, empty },
  ref,
) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (editing) {
      setDraft(fromJar(editing))
      setOpen(true)
      setPreset(null)
      setError(null)
      setConfirmArchive(false)
      setSaved(null)
    }
  }, [editing?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editing && open) nameRef.current?.focus()
  }, [editing, open])

  function pick(key: string | null) {
    const p = JAR_PRESETS.find((x) => x.key === key)
    setDraft(
      p
        ? { name: p.name, emoji: p.emoji, target: p.target === null ? '' : String(p.target), targetDate: p.targetDate(today) ?? '', locked: p.key === 'emergency' }
        : EMPTY,
    )
    setPreset(key ?? 'custom')
    setOpen(true)
    setError(null)
    setSaved(null)
  }

  function reset() {
    setDraft(EMPTY)
    setOpen(false)
    setPreset(null)
    setError(null)
    setConfirmArchive(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const name = draft.name.trim()
    if (name === '') {
      setError('Give the jar a name — what is this money for?')
      return
    }
    let target: number | null = null
    if (draft.target.trim() !== '') {
      target = parseAmount(draft.target)
      if (target === null) {
        setError('Target should be an amount in DA, like 30000 — or leave it empty.')
        return
      }
    }
    const targetDate = draft.targetDate === '' ? null : draft.targetDate
    if (targetDate !== null && !isValidDayKey(targetDate)) {
      setError('That date does not look right — pick one from the calendar.')
      return
    }
    onSave({ name, emoji: draft.emoji.trim() || '🫙', target, targetDate, locked: draft.locked })
    setSaved(editing ? `Saved ${name}.` : `${name} is on the shelf.`)
    if (editing) onDoneEditing()
    reset()
  }

  const hint = JAR_PRESETS.find((p) => p.key === preset)?.hint

  return (
    <section className="card jars-new" ref={ref} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{editing ? `Edit ${editing.name}` : 'New jar'}</h2>
      {!editing && (
        <>
          <p className="support-lead">
            {empty ? 'Pick a jar to start — one tap fills it in, and you can change anything.' : 'Give more dinars a job.'}
          </p>
          <div className="chip-row" role="group" aria-label="Jar presets">
            {JAR_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`btn chip${preset === p.key ? ' is-picked' : ''}`}
                aria-pressed={preset === p.key}
                onClick={() => pick(p.key)}
              >
                <span aria-hidden="true">{p.emoji}</span> {p.name}
              </button>
            ))}
            <button
              type="button"
              className={`btn chip${preset === 'custom' ? ' is-picked' : ''}`}
              aria-pressed={preset === 'custom'}
              onClick={() => pick(null)}
            >
              <span aria-hidden="true">✏️</span> Custom
            </button>
          </div>
        </>
      )}
      {hint && <p className="support-lead">{hint}</p>}

      {open && (
        <form onSubmit={submit} noValidate className="jars-form">
          <div className="log-row">
            <div className="field-wrap jars-emoji-wrap">
              <label className="field-label" htmlFor={`${id}-emoji`}>Emoji</label>
              <input id={`${id}-emoji`} className="field jars-emoji-field" value={draft.emoji} maxLength={8} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} />
            </div>
            <div className="field-wrap">
              <label className="field-label" htmlFor={`${id}-name`}>Jar name</label>
              <input id={`${id}-name`} ref={nameRef} className="field" value={draft.name} maxLength={40} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setError(null) }} />
            </div>
          </div>
          <div className="log-row">
            <div className="field-wrap">
              <label className="field-label" htmlFor={`${id}-target`}>Target DA (optional)</label>
              <input id={`${id}-target`} className="field mono" inputMode="numeric" autoComplete="off" value={draft.target} onChange={(e) => { setDraft({ ...draft, target: e.target.value }); setError(null) }} />
            </div>
            <div className="field-wrap">
              <label className="field-label" htmlFor={`${id}-date`}>Target date (optional)</label>
              <input id={`${id}-date`} type="date" className="field" min={today} value={draft.targetDate} onChange={(e) => { setDraft({ ...draft, targetDate: e.target.value }); setError(null) }} />
            </div>
          </div>
          <label className="impulse-check">
            <input type="checkbox" checked={draft.locked} onChange={(e) => setDraft({ ...draft, locked: e.target.checked })} />
            <span>Soft lock — ask me before I take money out</span>
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="log-actions">
            <button type="submit" className="btn btn-flame">{editing ? 'Save changes' : 'Put it on the shelf'}</button>
            <button type="button" className="btn" onClick={() => { reset(); if (editing) onDoneEditing() }}>Cancel</button>
            {editing && !confirmArchive && (
              <button type="button" className="btn" onClick={() => setConfirmArchive(true)}>Archive jar</button>
            )}
          </div>
          {editing && confirmArchive && (
            <div className="jars-archive" role="group" aria-label="Confirm archive">
              <p>
                Archive {editing.name}?{' '}
                {editingBalance > 0 ? `Its ${fmtDA(editingBalance)} stops being earmarked and goes back to breathing room.` : 'Its history stays.'}
              </p>
              <div className="log-actions">
                <button type="button" className="btn btn-gold" onClick={() => { onArchive(); reset(); onDoneEditing() }}>Yes, archive it</button>
                <button type="button" className="btn" onClick={() => setConfirmArchive(false)}>Keep it</button>
              </div>
            </div>
          )}
        </form>
      )}
      <p className="sr-only" role="status">{saved ?? ''}</p>
    </section>
  )
})
