import { useState } from 'react'
import type { Dispatch } from 'react'
import type { AppAction } from '../../state/reducer.ts'
import type { Iou, IouDirection, SocialState } from '../../state/slices/social.ts'
import { newId } from '../../state/store.ts'
import { dueLabel, iouTotals, type IouView } from '../../engine/social.ts'
import { fmtDA } from '../../engine/money.ts'
import { isValidDayKey } from '../../engine/dates.ts'
import { Field } from './TontinesCard.tsx'
import { nowISO, parseDA } from './parse.ts'

/**
 * IOUs with friends and family — no interest, no scores. Two columns:
 * what's coming back to me and what I'm giving back. Due dates are said
 * gently ("was due 3 days ago"), because the person matters more than the
 * date.
 */
export function IousCard({
  social,
  today,
  dispatch,
}: {
  social: SocialState
  today: string
  dispatch: Dispatch<AppAction>
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const totals = iouTotals(social, today)
  const editingIou = editing && editing !== 'new' ? social.ious.find((x) => x.id === editing) : undefined

  return (
    <section className="card ious wide" aria-labelledby="ious-title">
      <h2 id="ious-title">Lent &amp; borrowed</h2>
      <p className="support-lead">
        Lending to friends and family is about the relationship — these notes are just for your memory, never a
        scorecard and never a reason for guilt, on either side.
      </p>
      <div className="iou-cols">
        <IouColumn
          title="Owed to me"
          total={totals.owedToMe}
          views={totals.lent}
          empty="Nothing out on loan."
          today={today}
          dispatch={dispatch}
          onEdit={setEditing}
          editing={editing}
        />
        <IouColumn
          title="I owe"
          total={totals.iOwe}
          views={totals.borrowed}
          empty="Nothing to give back."
          today={today}
          dispatch={dispatch}
          onEdit={setEditing}
          editing={editing}
        />
      </div>
      {editing !== null ? (
        <IouForm
          initial={editingIou}
          today={today}
          onDone={(iou) => {
            if (iou) dispatch({ type: 'social/iou-upsert', iou })
            setEditing(null)
          }}
        />
      ) : (
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          Add lent or borrowed
        </button>
      )}
    </section>
  )
}

function IouColumn({
  title,
  total,
  views,
  empty,
  today,
  dispatch,
  onEdit,
  editing,
}: {
  title: string
  total: number
  views: IouView[]
  empty: string
  today: string
  dispatch: Dispatch<AppAction>
  onEdit: (id: string) => void
  editing: string | null
}) {
  const headingId = `iou-col-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section className="iou-col" aria-labelledby={headingId}>
      <h3 id={headingId} className="iou-col-title">
        {title} <span className="mono iou-col-total">{fmtDA(total)}</span>
      </h3>
      {views.length === 0 ? (
        <p className="social-empty">{empty}</p>
      ) : (
        <ul className="iou-list">
          {views
            .filter((v) => v.iou.id !== editing)
            .map((v) => (
              <IouRow key={v.iou.id} view={v} today={today} dispatch={dispatch} onEdit={() => onEdit(v.iou.id)} />
            ))}
        </ul>
      )}
    </section>
  )
}

function IouRow({
  view,
  today,
  dispatch,
  onEdit,
}: {
  view: IouView
  today: string
  dispatch: Dispatch<AppAction>
  onEdit: () => void
}) {
  const [settling, setSettling] = useState(false)
  const [landed, setLanded] = useState(false)
  const { iou } = view
  return (
    <li className={`iou-row${view.fullySettled ? ' is-settled' : ''}${landed ? ' is-sprung' : ''}`}>
      <div className="iou-head">
        <span className="iou-person">{iou.person}</span>
        <span className="iou-amount mono">{view.fullySettled ? 'settled' : fmtDA(view.outstanding)}</span>
      </div>
      <p className="iou-meta">
        {view.settled > 0 && !view.fullySettled && <>{fmtDA(view.settled)} of {fmtDA(iou.amount)} back · </>}
        {view.fullySettled ? `all ${fmtDA(iou.amount)} back` : dueLabel(view.daysUntilDue)}
        {iou.note && <> · {iou.note}</>}
      </p>
      {settling ? (
        <SettleForm
          view={view}
          today={today}
          onDone={(amount, date) => {
            if (amount !== null) {
              dispatch({
                type: 'social/settlement-add',
                settlement: { id: newId(), iouId: iou.id, amount, date },
              })
              setLanded(true)
            }
            setSettling(false)
          }}
        />
      ) : (
        <div className="log-actions">
          {!view.fullySettled && (
            <button type="button" className="btn undo-btn" onClick={() => setSettling(true)}>
              Add a repayment{' '}<span className="sr-only">for {iou.person}</span>
            </button>
          )}
          <button type="button" className="btn undo-btn" onClick={onEdit}>
            Edit{' '}<span className="sr-only">{iou.person}</span>
          </button>
          <button
            type="button"
            className="btn undo-btn"
            onClick={() => dispatch({ type: 'social/iou-archive', id: iou.id, nowISO: nowISO() })}
          >
            Archive{' '}<span className="sr-only">{iou.person}</span>
          </button>
        </div>
      )}
    </li>
  )
}

function SettleForm({
  view,
  today,
  onDone,
}: {
  view: IouView
  today: string
  onDone: (amount: number | null, date: string) => void
}) {
  const [amount, setAmount] = useState(String(view.outstanding))
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const id = `settle-${view.iou.id}`
  return (
    <form
      className="log-row iou-settle"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const n = parseDA(amount)
        if (n === null || n <= 0) return setError('Type how much came back, in DA.')
        if (n > view.outstanding) return setError(`That's more than the ${fmtDA(view.outstanding)} still open.`)
        if (!isValidDayKey(date)) return setError('Pick the day it happened.')
        onDone(n, date)
      }}
    >
      <Field id={`${id}-amount`} label="Repayment (DA)" error={error ?? undefined}>
        <input
          id={`${id}-amount`}
          className="field mono"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setError(null)
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-amount-err` : undefined}
          autoFocus
        />
      </Field>
      <Field id={`${id}-date`} label="Repaid on">
        <input id={`${id}-date`} className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <button type="submit" className="btn btn-flame">
        Save repayment
      </button>
      <button type="button" className="btn" onClick={() => onDone(null, date)}>
        Cancel
      </button>
    </form>
  )
}

interface IouErrors {
  person?: string
  amount?: string
  date?: string
  dueDate?: string
}

function IouForm({
  initial,
  today,
  onDone,
}: {
  initial: Iou | undefined
  today: string
  onDone: (iou: Iou | null) => void
}) {
  const [person, setPerson] = useState(initial?.person ?? '')
  const [direction, setDirection] = useState<IouDirection>(initial?.direction ?? 'lent')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [date, setDate] = useState(initial?.date ?? today)
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [errors, setErrors] = useState<IouErrors>({})
  const fid = initial ? `iou-${initial.id}` : 'iou-new'

  const submit = () => {
    const e: IouErrors = {}
    const p = person.trim()
    if (p === '') e.person = 'Who is it with?'
    const n = parseDA(amount)
    if (n === null || n <= 0) e.amount = 'Type the amount, in DA.'
    if (!isValidDayKey(date)) e.date = 'Pick the day it happened.'
    if (dueDate !== '' && !isValidDayKey(dueDate)) e.dueDate = 'Pick a day, or leave it empty.'
    else if (dueDate !== '' && isValidDayKey(date) && dueDate < date) e.dueDate = 'The due day comes after the loan day.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    onDone({
      id: initial?.id ?? newId(),
      person: p,
      direction,
      amount: n as number,
      date,
      note: note.trim(),
      dueDate: dueDate === '' ? null : dueDate,
      archived: false,
      updatedAt: nowISO(),
    })
  }

  return (
    <form
      className="social-form"
      aria-label={initial ? `Edit ${initial.person}` : 'New lent or borrowed'}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault()
        submit()
      }}
    >
      <fieldset className="iou-dir">
        <legend className="field-label">Which way</legend>
        <div className="chip-row">
          {(['lent', 'borrowed'] as const).map((d) => (
            <label key={d} className={`chip-check${direction === d ? ' on' : ''}`}>
              <input
                type="radio"
                name={`${fid}-dir`}
                value={d}
                checked={direction === d}
                onChange={() => setDirection(d)}
              />
              {d === 'lent' ? 'I lent' : 'I borrowed'}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="log-row">
        <Field id={`${fid}-person`} label="Person" error={errors.person}>
          <input
            id={`${fid}-person`}
            className="field"
            value={person}
            placeholder="Karim"
            onChange={(e) => setPerson(e.target.value)}
            aria-invalid={!!errors.person}
            aria-describedby={errors.person ? `${fid}-person-err` : undefined}
          />
        </Field>
        <Field id={`${fid}-amount`} label="How much (DA)" error={errors.amount}>
          <input
            id={`${fid}-amount`}
            className="field mono"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? `${fid}-amount-err` : undefined}
          />
        </Field>
      </div>
      <div className="log-row">
        <Field id={`${fid}-date`} label="On" error={errors.date}>
          <input
            id={`${fid}-date`}
            className="field"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? `${fid}-date-err` : undefined}
          />
        </Field>
        <Field id={`${fid}-due`} label="Back by (optional)" error={errors.dueDate}>
          <input
            id={`${fid}-due`}
            className="field"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-invalid={!!errors.dueDate}
            aria-describedby={errors.dueDate ? `${fid}-due-err` : undefined}
          />
        </Field>
      </div>
      <Field id={`${fid}-note`} label="Note (optional)">
        <input
          id={`${fid}-note`}
          className="field"
          value={note}
          placeholder="for the car repair"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="log-actions">
        <button type="submit" className="btn btn-flame">
          {initial ? 'Save changes' : 'Save'}
        </button>
        <button type="button" className="btn" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
