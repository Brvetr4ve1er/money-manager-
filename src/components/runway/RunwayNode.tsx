import { useId, useState, type FormEvent } from 'react'
import { fmtDA, fmtMoney, toDA, type ObligationView } from '../../engine/money.ts'
import { shortDay } from '../../engine/dates.ts'
import type { Account } from '../../state/slices/money.ts'
import { RoomObject } from '../RoomObject.tsx'
import {
  RATE_MESSAGE,
  dueLabel,
  objectKindFor,
  objectStateFor,
  statusLabel,
} from './runwayModel.ts'

export interface PayRequest {
  amount: number
  accountId: string
}

interface Props {
  view: ObligationView
  today: string
  fx: number | null
  accounts: Account[]
  /** Unpaid cycles due on or before payday (weekly bills can hit twice). */
  cyclesBeforePayday: number
  /** This node was just paid: bloom + Undo. */
  justPaid: boolean
  onPay: (req: PayRequest) => void
  onUndo: () => void
  onEdit: () => void
}

/** One light on the thread: the object, what it is, when, and what to do. */
export function RunwayNode({ view, today, fx, accounts, cyclesBeforePayday, justPaid, onPay, onUndo, onEdit }: Props) {
  const ob = view.obligation
  const uid = useId()
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const state = objectStateFor(view, today)
  const late = view.status === 'late'
  const done = view.status === 'done'
  const usd = ob.currency === 'USD'
  const estimateDA = usd ? toDA(view.estimate, 'USD', fx) : null
  const variable = ob.kind === 'variable'
  const missingRate = usd && fx === null

  function openPay() {
    setAmount(String(view.estimate))
    const live = accounts.some((a) => a.id === ob.accountId)
    setAccountId(live && ob.accountId ? ob.accountId : '')
    setError(missingRate ? RATE_MESSAGE : null)
    setPaying(true)
  }

  function confirm(ev: FormEvent) {
    ev.preventDefault()
    if (missingRate) {
      setError(RATE_MESSAGE)
      return
    }
    const n = variable ? Number(amount) : view.estimate
    if (amount.trim() === '' || !Number.isFinite(n) || n <= 0) {
      setError('The amount needs to be a number above 0.')
      return
    }
    setError(null)
    setPaying(false)
    onPay({ amount: n, accountId })
  }

  const progress =
    ob.installment && view.installmentPaid !== null ? { paid: view.installmentPaid, total: ob.installment.total } : undefined
  const histMax = Math.max(1, ...view.history)

  return (
    <li className={`rw-node st-${view.status}${justPaid ? ' is-bloom' : ''}`} data-obligation={ob.id}>
      <span className="rw-knot">
        <RoomObject kind={objectKindFor(ob)} state={state} progress={progress} size={44} className={justPaid ? 'is-bloom' : undefined} />
      </span>
      <div className="rw-body">
        <div className="rw-row">
          <h3 className="rw-name">{ob.name}</h3>
          <span className="rw-amt mono">
            {variable && !done ? 'about ' : ''}
            {fmtMoney(view.estimate, ob.currency)}
            {usd && estimateDA !== null && <small> ≈ {fmtDA(estimateDA)}</small>}
            {usd && estimateDA === null && <small> · no DA rate yet</small>}
          </span>
        </div>
        <div className="rw-row rw-meta">
          <span>
            {view.nextDue !== null ? (
              <>
                {shortDay(view.nextDue)} · {dueLabel(view.daysUntil)}
                {cyclesBeforePayday > 1 && ` · ${cyclesBeforePayday}× before payday`}
              </>
            ) : (
              dueLabel(null)
            )}
          </span>
          <span className={`rw-pill pill-${state}`}>{statusLabel(view, today)}</span>
        </div>
        {ob.nextStep && !done && (
          <p className="rw-step"><span className="sr-only">Next step: </span>{ob.nextStep}</p>
        )}
        {progress && (
          <p className="rw-sub">
            {progress.paid} of {progress.total} paid
            {progress.total > progress.paid && ` · ${progress.total - progress.paid} to go`}
          </p>
        )}
        {variable && view.history.length > 0 && (
          <div className="rw-hist">
            <span className="rw-bars" aria-hidden="true">
              {view.history.map((h, i) => (
                <em key={i} style={{ height: `${6 + (h / histMax) * 18}px` }} />
              ))}
            </span>
            <span className="rw-sub">
              Last {view.history.length === 1 ? 'one' : view.history.length === 2 ? 'two' : 'three'}:{' '}
              {view.history.map((h) => fmtMoney(h, ob.currency)).join(' · ')}
            </span>
          </div>
        )}
        {variable && view.history.length === 0 && !done && (
          <p className="rw-sub">An estimate for now — the real amount lands when you pay.</p>
        )}

        {justPaid && (
          <div className="undo-strip rw-undo">
            <span>Lit — {ob.name} paid.</span>
            <button type="button" className="btn undo-btn" onClick={onUndo}>Undo</button>
          </div>
        )}

        {!done && !paying && !justPaid && (
          <div className="rw-actions">
            <button
              type="button"
              className={`btn ${late ? 'btn-flame' : 'btn-gold'} rw-pay`}
              onClick={openPay}
              aria-label={late ? `Relight? Pay ${ob.name}` : `Pay ${ob.name}`}
            >
              {late ? 'Relight?' : 'Pay'}
            </button>
            <button type="button" className="btn rw-quiet" onClick={onEdit} aria-label={`Edit ${ob.name}`}>Edit</button>
          </div>
        )}
        {done && (
          <div className="rw-actions">
            <button type="button" className="btn rw-quiet" onClick={onEdit} aria-label={`Edit ${ob.name}`}>Edit</button>
          </div>
        )}

        {paying && (
          <form className="rw-confirm rw-pay-form" onSubmit={confirm} aria-label={`Pay ${ob.name}`} noValidate>
            <p className="rw-sub">
              Paying the {shortDay(view.nextDue as string)} cycle, dated today.
            </p>
            <div className="rw-pay-grid">
              <div className="field-wrap">
                <label className="field-label" htmlFor={`${uid}-amt`}>
                  Amount ({ob.currency}){variable ? ' — what the bill says' : ''}
                </label>
                <input
                  id={`${uid}-amt`}
                  className="field mono"
                  inputMode="decimal"
                  value={amount}
                  readOnly={!variable}
                  aria-readonly={!variable || undefined}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={error !== null && !missingRate ? true : undefined}
                  aria-describedby={error ? `${uid}-err` : undefined}
                />
              </div>
              {accounts.length > 0 ? (
                <div className="field-wrap">
                  <label className="field-label" htmlFor={`${uid}-acc`}>Paid from</label>
                  <select id={`${uid}-acc`} className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="">Not chosen</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="rw-sub">No accounts yet — it lands in the ledger unassigned.</p>
              )}
            </div>
            {error && (
              <p className="field-error" id={`${uid}-err`} role="alert">{error}</p>
            )}
            <div className="log-actions">
              <button type="submit" className="btn btn-flame" disabled={missingRate}>
                Confirm payment
              </button>
              <button type="button" className="btn" onClick={() => { setPaying(false); setError(null) }}>
                Not now
              </button>
            </div>
          </form>
        )}
      </div>
    </li>
  )
}

