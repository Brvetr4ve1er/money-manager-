import { useState } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { AppAction } from '../../state/reducer.ts'
import type { SocialState, Tontine, TontineCadence } from '../../state/slices/social.ts'
import { MAX_TONTINE_MEMBERS } from '../../state/slices/social.ts'
import { newId } from '../../state/store.ts'
import { liveTontines, tontineView, type TontineView } from '../../engine/social.ts'
import { fmtDA } from '../../engine/money.ts'
import { isValidDayKey, shortDay } from '../../engine/dates.ts'
import { TontineRing } from './TontineRing.tsx'
import { nowISO, parseDA, relDays } from './parse.ts'

/**
 * Tontines — jam'iyya / daret. Everyone puts in the same amount each round;
 * one member takes the whole pot each round, in turn. Ember only keeps the
 * user's side of it: their contributions and their payout day.
 */
export function TontinesCard({
  social,
  today,
  dispatch,
}: {
  social: SocialState
  today: string
  dispatch: Dispatch<AppAction>
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [justPaid, setJustPaid] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null)
  const views = liveTontines(social).map((t) => tontineView(t, social, today))
  const editingTontine = editing && editing !== 'new' ? social.tontines.find((t) => t.id === editing) : undefined

  return (
    <section className="card tontines" aria-labelledby="tontines-title">
      <h2 id="tontines-title">Tontines</h2>
      <p className="support-lead">
        Jam&rsquo;iyya, daret — saving in turn with people you trust. Track your rounds and see when the pot comes to
        you.
      </p>
      {views.length === 0 && editing === null && (
        <p className="social-empty">No circle yet. If you&rsquo;re in one, add it to see your rounds ahead.</p>
      )}
      <ul className="tontine-list">
        {views.map((v) =>
          editing === v.tontine.id ? null : (
            <li key={v.tontine.id} className="tontine-row">
              <TontineBody
                view={v}
                sprung={justPaid === v.tontine.id}
                onPay={() => {
                  if (v.nextRound === null) return
                  dispatch({
                    type: 'social/contribution-add',
                    contribution: { id: newId(), tontineId: v.tontine.id, round: v.nextRound, date: today, paid: true },
                  })
                  setJustPaid(v.tontine.id)
                }}
              />
              <div className="log-actions">
                <button type="button" className="btn undo-btn" onClick={() => setEditing(v.tontine.id)}>
                  Edit{' '}<span className="sr-only">{v.tontine.name}</span>
                </button>
                {confirmArchive === v.tontine.id ? (
                  <>
                    <button
                      type="button"
                      className="btn undo-btn"
                      onClick={() => {
                        dispatch({ type: 'social/tontine-archive', id: v.tontine.id, nowISO: nowISO() })
                        setConfirmArchive(null)
                      }}
                    >
                      Yes, archive{' '}<span className="sr-only">{v.tontine.name}</span>
                    </button>
                    <button type="button" className="btn undo-btn" onClick={() => setConfirmArchive(null)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn undo-btn" onClick={() => setConfirmArchive(v.tontine.id)}>
                    Archive{' '}<span className="sr-only">{v.tontine.name}</span>
                  </button>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {editing !== null ? (
        <TontineForm
          initial={editingTontine}
          today={today}
          onDone={(t) => {
            if (t) dispatch({ type: 'social/tontine-upsert', tontine: t })
            setEditing(null)
          }}
        />
      ) : (
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          Add a tontine
        </button>
      )}
    </section>
  )
}

function TontineBody({ view, sprung, onPay }: { view: TontineView; sprung: boolean; onPay: () => void }) {
  const { tontine: t } = view
  const cadenceWord = t.cadence === 'weekly' ? 'week' : 'month'
  return (
    <div className="tontine-body">
      <TontineRing key={view.paidRounds.length} view={view} sprung={sprung} />
      <div className="tontine-facts">
        <h3 className="tontine-name">{t.name}</h3>
        <p className="tontine-meta">
          {fmtDA(t.contribution)} a {cadenceWord} · {view.rounds} people
        </p>
        <dl className="tontine-dl">
          <div>
            <dt>Next contribution</dt>
            <dd>
              {view.nextRound === null || view.nextContributionDate === null ? (
                'All your rounds are paid'
              ) : (
                <>
                  <span className="mono">{fmtDA(t.contribution)}</span> · {shortDay(view.nextContributionDate)} (
                  {view.nextInDays !== null && view.nextInDays < 0
                    ? `round ${view.nextRound} was due ${relDays(view.nextInDays)}`
                    : `round ${view.nextRound}, ${relDays(view.nextInDays ?? 0)}`}
                  )
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>{view.payoutReached ? 'Your pot (round ' + t.myTurn + ')' : 'Your pot comes'}</dt>
            <dd>
              <span className="mono">{fmtDA(view.pot)}</span> · {shortDay(view.myPayoutDate)}
              {view.payoutReached ? ' — your turn has come' : ` (round ${t.myTurn})`}
            </dd>
          </div>
          <div>
            <dt>Rounds</dt>
            <dd>
              {view.roundsDue === 0
                ? `${view.paidRounds.length} paid ahead · starts ${shortDay(view.roundDates[0])}`
                : `${view.roundsPaidOfDue} of ${view.roundsDue} so far paid`}
            </dd>
          </div>
        </dl>
        {view.nextRound !== null && (
          <button type="button" className={`btn btn-flame tontine-pay${sprung ? ' is-sprung' : ''}`} onClick={onPay}>
            Mark this round paid{' '}
            <span className="sr-only">
              (round {view.nextRound}, {t.name})
            </span>
          </button>
        )}
        {sprung && (
          <p className="tontine-sprung" role="status">
            Round logged — {view.complete ? 'every round is paid. Well kept.' : 'one step closer around the circle.'}
          </p>
        )}
      </div>
    </div>
  )
}

interface TontineErrors {
  name?: string
  contribution?: string
  startDate?: string
  members?: string
  myTurn?: string
}

function TontineForm({
  initial,
  today,
  onDone,
}: {
  initial: Tontine | undefined
  today: string
  onDone: (t: Tontine | null) => void
}) {
  const others = initial ? initial.members.filter((_, i) => i !== initial.myTurn - 1) : []
  const [name, setName] = useState(initial?.name ?? '')
  const [contribution, setContribution] = useState(initial ? String(initial.contribution) : '')
  const [cadence, setCadence] = useState<TontineCadence>(initial?.cadence ?? 'monthly')
  const [startDate, setStartDate] = useState(initial?.startDate ?? today)
  const [members, setMembers] = useState(others.join(', '))
  const [myTurn, setMyTurn] = useState(initial ? String(initial.myTurn) : '1')
  const [errors, setErrors] = useState<TontineErrors>({})
  const formId = initial ? `tontine-${initial.id}` : 'tontine-new'

  const submit = () => {
    const e: TontineErrors = {}
    const n = name.trim()
    if (n === '') e.name = 'Give it a name you’ll recognise.'
    const amount = parseDA(contribution)
    if (amount === null || amount <= 0) e.contribution = 'Type what you put in each round, in DA.'
    if (!isValidDayKey(startDate)) e.startDate = 'Pick the day of round 1.'
    const list = members
      .split(/[,\n]/)
      .map((m) => m.trim())
      .filter((m) => m !== '')
    const total = list.length + 1
    if (list.some((m) => m.toLowerCase() === 'me')) e.members = 'You’re already in the circle as “Me”.'
    else if (new Set(list.map((m) => m.toLowerCase())).size !== list.length)
      e.members = 'Each name once — add a surname or initial to tell two people apart.'
    else if (list.length < 1) e.members = 'A tontine needs at least 2 people — add the others in your circle.'
    else if (total > MAX_TONTINE_MEMBERS) e.members = `Up to ${MAX_TONTINE_MEMBERS} people.`
    const turn = Number(myTurn)
    if (!e.members && (!Number.isInteger(turn) || turn < 1 || turn > total))
      e.myTurn = `Your turn is a round from 1 to ${total}.`
    else if (e.members && (!Number.isInteger(turn) || turn < 1)) e.myTurn = 'Your turn is a round number, from 1.'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    const order = [...list]
    order.splice(turn - 1, 0, 'Me')
    onDone({
      id: initial?.id ?? newId(),
      name: n,
      contribution: amount as number,
      cadence,
      startDate,
      members: order,
      myTurn: turn,
      archived: false,
      updatedAt: nowISO(),
    })
  }

  return (
    <form
      className="social-form"
      aria-label={initial ? `Edit ${initial.name}` : 'New tontine'}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault()
        submit()
      }}
    >
      <div className="log-row">
        <Field id={`${formId}-name`} label="Tontine name" error={errors.name}>
          <input
            id={`${formId}-name`}
            className="field"
            value={name}
            placeholder="Family daret"
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${formId}-name-err` : undefined}
          />
        </Field>
        <Field id={`${formId}-amount`} label="Each round (DA)" error={errors.contribution}>
          <input
            id={`${formId}-amount`}
            className="field mono"
            inputMode="decimal"
            value={contribution}
            placeholder="5000"
            onChange={(e) => setContribution(e.target.value)}
            aria-invalid={!!errors.contribution}
            aria-describedby={errors.contribution ? `${formId}-amount-err` : undefined}
          />
        </Field>
      </div>
      <div className="log-row">
        <Field id={`${formId}-cadence`} label="How often">
          <select
            id={`${formId}-cadence`}
            className="field"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as TontineCadence)}
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
        <Field id={`${formId}-start`} label="Round 1 date" error={errors.startDate}>
          <input
            id={`${formId}-start`}
            className="field"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-invalid={!!errors.startDate}
            aria-describedby={errors.startDate ? `${formId}-start-err` : undefined}
          />
        </Field>
      </div>
      <Field
        id={`${formId}-members`}
        label="Other members, in payout order"
        hint="Comma-separated. You're added as “Me” at your turn."
        error={errors.members}
      >
        <input
          id={`${formId}-members`}
          className="field"
          value={members}
          placeholder="Amina, Yacine, Sara"
          onChange={(e) => setMembers(e.target.value)}
          aria-invalid={!!errors.members}
          aria-describedby={`${formId}-members-hint${errors.members ? ` ${formId}-members-err` : ''}`}
        />
      </Field>
      <div className="log-row">
        <Field id={`${formId}-turn`} label="My turn (round)" error={errors.myTurn}>
          <input
            id={`${formId}-turn`}
            className="field mono"
            inputMode="numeric"
            value={myTurn}
            onChange={(e) => setMyTurn(e.target.value)}
            aria-invalid={!!errors.myTurn}
            aria-describedby={errors.myTurn ? `${formId}-turn-err` : undefined}
          />
        </Field>
      </div>
      <div className="log-actions">
        <button type="submit" className="btn btn-flame">
          {initial ? 'Save changes' : 'Save tontine'}
        </button>
        <button type="button" className="btn" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Label + optional hint + inline error, wired by id. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="field-wrap">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="social-hint">
          {hint}
        </span>
      )}
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
