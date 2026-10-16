import { useState } from 'react'
import type { Dispatch } from 'react'
import type { AppAction } from '../../state/reducer.ts'
import type { Currency } from '../../state/slices/money.ts'
import { newId } from '../../state/store.ts'
import type { BreathingRoom } from '../../engine/money.ts'
import { fmtDA } from '../../engine/money.ts'
import { shortDay } from '../../engine/dates.ts'
import { friendlyDA, tankLevel, vsUsualDay } from '../../engine/numberLight.ts'
import './money.css'

/**
 * The one number the app exists to answer: what is free to spend before
 * payday. Before any account exists it is a two-field onboarding instead —
 * a balance you type is enough; no bank link, ever.
 */
export function BreathingCard({
  room,
  dispatch,
  numberLight = false,
  usualPerDay = 0,
}: {
  room: BreathingRoom
  dispatch: Dispatch<AppAction>
  /** Rounded figures + a tank instead of the arithmetic (see numberLight.ts). */
  numberLight?: boolean
  /** The user's own usual daily spend, for number-light comparisons. */
  usualPerDay?: number
}) {
  if (!room.hasAccounts) return <FirstAccount dispatch={dispatch} />
  const tight = room.room < 0
  if (numberLight) {
    const level = tankLevel(room.room, room.holdingsDA)
    const vs = vsUsualDay(room.perDay, usualPerDay)
    return (
      <section className="card breathing wide" aria-labelledby="breathing-title">
        <h2 id="breathing-title">Breathing room</h2>
        <div
          className="tank"
          role="img"
          aria-label={`${Math.round(level * 100)} percent of what you hold is free until payday`}
        >
          <span className="tank-fill" style={{ height: `${Math.round(level * 100)}%` }} />
        </div>
        <p className="breathing-num is-light">{tight ? 'Tight until payday' : friendlyDA(room.room)}</p>
        <p className="breathing-sub">
          {tight ? 'Bills before payday need more than is free right now.' : <>{friendlyDA(Math.max(0, room.perDay))} a day{vs ? ` — ${vs}` : ''}</>}
          <br />
          {room.days} {room.days === 1 ? 'day' : 'days'} to payday
        </p>
      </section>
    )
  }
  return (
    <section className="card breathing wide" aria-labelledby="breathing-title">
      <h2 id="breathing-title">Breathing room · a forecast, not a verdict</h2>
      <p className={`breathing-num mono${tight ? ' is-tight' : ''}`}>{fmtDA(room.room)}</p>
      <p className="breathing-sub">
        {tight ? (
          <>Bills before payday are bigger than what is free right now — worth a look at the runway.</>
        ) : (
          <>
            about <strong>{fmtDA(Math.max(0, room.perDay))}</strong> a day ·{' '}
            <strong>{room.days}</strong> {room.days === 1 ? 'day' : 'days'} to payday ({shortDay(room.payday)})
          </>
        )}
      </p>
      {/* The arithmetic, always one glance away: every number explainable. */}
      <dl className="breathing-math">
        <div>
          <dt>You hold</dt>
          <dd className="mono">{fmtDA(room.holdingsDA)}</dd>
        </div>
        <div>
          <dt>− in jars</dt>
          <dd className="mono">{fmtDA(room.jarsDA)}</dd>
        </div>
        <div>
          <dt>− due before payday</dt>
          <dd className="mono">{fmtDA(room.dueDA)}</dd>
        </div>
      </dl>
      {room.missingFx && (
        <p className="breathing-note" role="note">
          Some dollar amounts are left out until you set your DA/USD rate below.
        </p>
      )}
    </section>
  )
}

function FirstAccount({ dispatch }: { dispatch: Dispatch<AppAction> }) {
  const [name, setName] = useState('Cash & CCP')
  const [currency, setCurrency] = useState<Currency>('DA')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  function submit() {
    const n = Number(balance)
    if (balance.trim() === '' || !Number.isFinite(n) || n < 0) {
      setError('Type roughly what you have right now — a rough number is fine.')
      return
    }
    if (name.trim() === '') {
      setError('Give it a short name, like "Cash".')
      return
    }
    const now = new Date().toISOString()
    dispatch({
      type: 'money/account-upsert',
      account: { id: newId(), name: name.trim(), currency, anchorBalance: n, anchorAt: now, archived: false, updatedAt: now },
    })
  }
  return (
    <section className="card breathing wide" aria-labelledby="first-account-title">
      <h2 id="first-account-title">Start with what you have</h2>
      <p className="support-lead">
        Type what is in your pocket or account right now. Ember works out what is free until payday — no bank
        link, nothing leaves this device.
      </p>
      <form
        className="log-row"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="field-wrap">
          <span className="field-label">Account name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field-wrap">
          <span className="field-label">Currency</span>
          <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="DA">DA</option>
            <option value="USD">USD (e.g. RedotPay)</option>
          </select>
        </label>
        <label className="field-wrap">
          <span className="field-label">Balance now</span>
          <input
            className="field mono"
            inputMode="decimal"
            placeholder="0"
            value={balance}
            onChange={(e) => {
              setBalance(e.target.value)
              setError(null)
            }}
            aria-invalid={error !== null}
          />
        </label>
        <button type="submit" className="btn btn-flame">
          Light the hearth
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
