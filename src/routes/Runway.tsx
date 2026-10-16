import { useEffect, useState } from 'react'
import * as sfx from '../audio/chiptune.ts'
import { cyclesDueBy, fmtDA, liveAccounts, nextPayday, obligationViews, toDA, type ObligationView } from '../engine/money.ts'
import { daysBetween, shortDay } from '../engine/dates.ts'
import { newId, type Transaction } from '../state/store.ts'
import type { Obligation, Payment } from '../state/slices/money.ts'
import { ObligationForm } from '../components/runway/ObligationForm.tsx'
import { RunwayNode, type PayRequest } from '../components/runway/RunwayNode.tsx'
import { RecurringAudit } from '../components/runway/RecurringAudit.tsx'
import { auditSummary, dueBeforePayday, plural, timelineItems } from '../components/runway/runwayModel.ts'
import { socialRunwayItems } from '../engine/social.ts'
import '../components/runway/runway.css'
import type { RouteProps } from './types.ts'

/** How long the post-payment Undo stays offered. */
export const UNDO_MS = 5000

interface JustPaid {
  obligationId: string
  paymentId: string
}

/**
 * Runway room: a thread of light from today to payday. Every obligation is
 * an object on it — paying a cycle lights it (a real ledger row, category
 * Bills), a late one has simply gone out and can be relit. Numbers here are
 * forecasts; the copy never grades the user.
 */
export function RunwayRoute({ state, dispatch, today }: RouteProps) {
  const money = state.money
  const fx = money.settings.fxDaPerUsd
  const views = obligationViews(money, today)
  const payday = nextPayday(money.settings, today)
  const daysToPayday = daysBetween(today, payday)
  const accounts = liveAccounts(money)
  const due = dueBeforePayday(views, payday, fx)
  const audit = auditSummary(money, today)
  const items = timelineItems(views, today, payday)
  const isEmpty = views.length === 0

  // null = closed; 'new' = adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null)
  const [justPaid, setJustPaid] = useState<JustPaid | null>(null)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    if (!justPaid) return
    const t = window.setTimeout(() => setJustPaid(null), UNDO_MS)
    return () => window.clearTimeout(t)
  }, [justPaid])

  const editingOb: Obligation | null =
    editing !== null && editing !== 'new' ? (money.obligations.find((o) => o.id === editing) ?? null) : null
  const formOpen = isEmpty || editing === 'new' || editingOb !== null

  function save(ob: Obligation) {
    dispatch({ type: 'money/obligation-upsert', obligation: ob })
    setAnnounce(editingOb ? `Saved ${ob.name}.` : `${ob.name} is on the runway.`)
    setEditing(null)
    sfx.blip()
  }

  function archive(ob: Obligation) {
    dispatch({ type: 'money/obligation-upsert', obligation: ob })
    setAnnounce(`${ob.name} archived.`)
    setEditing(null)
    sfx.blip()
  }

  function pay(view: ObligationView, req: PayRequest) {
    const ob = view.obligation
    if (view.nextDue === null) return
    const amountDA = toDA(req.amount, ob.currency, fx)
    // The node already blocks this with the rate message; never log a 0.
    if (amountDA === null) return
    const nowISO = new Date().toISOString()
    const txId = newId()
    const payment: Payment = {
      id: newId(),
      obligationId: ob.id,
      due: view.nextDue,
      paidOn: today,
      amount: req.amount,
      currency: ob.currency,
      txId,
      void: false,
      updatedAt: nowISO,
    }
    const tx: Transaction = {
      id: txId,
      amountDA,
      category: 'Bills',
      note: ob.name,
      date: today,
      at: nowISO,
      ...(req.accountId ? { accountId: req.accountId } : {}),
      ...(ob.currency === 'USD' ? { original: { amount: req.amount, currency: 'USD' as const } } : {}),
    }
    dispatch({ type: 'OBLIGATION_PAY', payment, tx })
    setJustPaid({ obligationId: ob.id, paymentId: payment.id })
    setAnnounce(`${ob.name} paid — ${fmtDA(amountDA)} logged under Bills. Undo is available for a few seconds.`)
    sfx.sparkle()
  }

  function undo() {
    if (!justPaid) return
    dispatch({ type: 'OBLIGATION_UNPAY', paymentId: justPaid.paymentId, nowISO: new Date().toISOString() })
    setJustPaid(null)
    setAnnounce('Payment undone.')
    sfx.blip()
  }

  const social = socialRunwayItems(state.social, today, payday)

  return (
    <>
      <section className="card wide rw-head" id="runway" aria-labelledby="rw-title">
        <h2 id="rw-title">Runway</h2>
        {isEmpty ? (
          <>
            <p className="rw-lede">A thread of light from today to payday.</p>
            <p className="support-lead">
              Add the things that come round again — rent, Idoom, the phone, a Netflix on the card, an installment.
              Each becomes a light on the thread: it glows when paid, flickers when close, and if one slips past
              its day it just goes out until you relight it. Nothing here is a grade.
            </p>
          </>
        ) : (
          <>
            <div className="rw-stats">
              <p className="rw-stat">
                <span className="rw-stat-num mono">{daysToPayday}</span>
                <span className="rw-stat-label">
                  {plural(daysToPayday, 'day', 'days')} to payday · {shortDay(payday)}
                </span>
              </p>
              <p className="rw-stat">
                <span className="rw-stat-num mono">{fmtDA(due.totalDA)}</span>
                <span className="rw-stat-label">likely to go out before then</span>
              </p>
            </div>
            {due.missingRate > 0 && (
              <p className="rw-note">
                Missing rate: {due.missingRate} USD {plural(due.missingRate, 'bill isn’t', 'bills aren’t')} counted
                yet. Set the DA rate on Home to fold {plural(due.missingRate, 'it', 'them')} in.
              </p>
            )}
            {!formOpen && (
              <div className="log-actions">
                <button type="button" className="btn btn-gold" onClick={() => setEditing('new')}>
                  Add something that repeats
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {formOpen && (
        <section className={`card rw-form-card${isEmpty ? ' wide' : ''}`} aria-labelledby="rw-form-title">
          <h2 id="rw-form-title">{editingOb ? `Edit ${editingOb.name}` : 'Add something that repeats'}</h2>
          <ObligationForm
            key={editingOb?.id ?? 'new'}
            editing={editingOb}
            accounts={accounts}
            today={today}
            autoFocus={!isEmpty}
            onSave={save}
            onCancel={isEmpty ? null : () => setEditing(null)}
            onArchive={archive}
          />
        </section>
      )}

      {!isEmpty && (
        <section className="card wide rw-thread-card" aria-labelledby="rw-thread-title">
          <h2 id="rw-thread-title">The thread</h2>
          <ol className="rw-thread">
            {items.map((it) =>
              it.type === 'node' ? (
                <RunwayNode
                  key={it.view.obligation.id}
                  view={it.view}
                  today={today}
                  fx={fx}
                  accounts={accounts}
                  cyclesBeforePayday={cyclesDueBy(it.view, payday).length}
                  justPaid={justPaid?.obligationId === it.view.obligation.id}
                  onPay={(req) => pay(it.view, req)}
                  onUndo={undo}
                  onEdit={() => setEditing(it.view.obligation.id)}
                />
              ) : (
                <li key={it.type} className={`rw-marker rw-marker-${it.type}`}>
                  <i aria-hidden="true" />
                  <span>{it.type === 'today' ? `Today · ${shortDay(it.date)}` : `Payday · ${shortDay(it.date)}`}</span>
                </li>
              ),
            )}
          </ol>
        </section>
      )}

      <RecurringAudit summary={audit} />

      <p className="sr-only" role="status" aria-label="Runway updates">{announce}</p>
      {social.length > 0 && (
        <section className="card rw-social" aria-labelledby="rw-social-title">
          <h2 id="rw-social-title">Family &amp; friends before payday</h2>
          <ul className="rw-social-list">
            {social.map((it) => (
              <li key={it.id} className={it.amountDA < 0 ? 'is-out' : 'is-in'}>
                <span>{it.label}</span>
                <span className="mono">
                  {it.amountDA < 0 ? '−' : '+'}
                  {fmtDA(Math.abs(it.amountDA))} · {shortDay(it.date)}
                </span>
              </li>
            ))}
          </ul>
          <p className="support-lead">
            Money going out here is counted in your breathing room. Money coming in is not counted until it
            arrives.
          </p>
        </section>
      )}
    </>
  )
}
