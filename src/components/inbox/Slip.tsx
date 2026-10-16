import { useId, useState } from 'react'
import type { Dispatch } from 'react'
import type { AppAction } from '../../state/reducer.ts'
import { newId, type Transaction } from '../../state/store.ts'
import type { Account } from '../../state/slices/money.ts'
import type { InboxCandidate } from '../../state/slices/inbox.ts'
import { fmtDA, fmtMoney, toDA } from '../../engine/money.ts'
import { shortDay } from '../../engine/dates.ts'
import { INBOX_CATEGORIES } from '../../engine/inbox/parse.ts'

export type Leave = 'warm' | 'fade'

function flagNotes(c: InboxCandidate, logged: boolean): string[] {
  const out: string[] = []
  if (c.flags.includes('duplicate')) {
    out.push(c.sources.length > 2 ? `${c.sources.length} messages, one purchase — stored once` : 'two messages, one purchase — stored once')
  }
  if (c.flags.includes('not_a_charge')) out.push('a renewal notice, not a charge')
  if (c.flags.includes('promo')) out.push('a promotion, nothing was charged')
  if (c.flags.includes('refund')) out.push("a refund — money coming back, so it won't be logged as spending")
  if (logged) out.push('already in your ledger')
  return out
}

function warnReason(c: InboxCandidate, logged: boolean): string | null {
  if (c.flags.includes('not_a_charge')) return 'a renewal notice rather than a charge'
  if (c.flags.includes('promo')) return 'a promotion rather than a charge'
  if (logged) return 'something already in your ledger'
  return null
}

/** What the slip shows — shared by the live slip and its leaving ghost. */
export function SlipFace({ c, fx }: { c: InboxCandidate; fx: number | null }) {
  const pct = Math.round(c.confidence * 100)
  const da = c.currency === 'USD' ? toDA(Math.abs(c.amount), 'USD', fx) : null
  return (
    <>
      <div className="slip-row">
        <strong className="slip-merchant">{c.merchant}</strong>
        <span className="slip-amt mono">
          {c.amount < 0 ? '−' : ''}
          {fmtMoney(Math.abs(c.amount), c.currency)}
          {c.currency === 'USD' && (
            <small>{da === null ? ' · set your rate on Home for DA' : ` ≈ ${fmtDA(da)}`}</small>
          )}
        </span>
      </div>
      <div className="slip-row slip-meta">
        <span>{shortDay(c.date)}</span>
        <span className="slip-conf">
          <span className="slip-conf-track" aria-hidden="true">
            <i style={{ width: `${Math.max(6, pct)}%` }} />
          </span>
          <span>{pct}% sure</span>
        </span>
      </div>
    </>
  )
}

export function Slip({
  c,
  fx,
  accounts,
  logged,
  dispatch,
  onLeave,
}: {
  c: InboxCandidate
  fx: number | null
  accounts: Account[]
  logged: boolean
  dispatch: Dispatch<AppAction>
  onLeave: (c: InboxCandidate, how: Leave) => void
}) {
  const categories: string[] = [...INBOX_CATEGORIES]
  if (!categories.includes(c.suggestedCategory)) categories.push(c.suggestedCategory)
  const [category, setCategory] = useState(c.suggestedCategory)
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.currency === c.currency)?.id ?? '')
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catId = useId()
  const accId = useId()
  const warnId = useId()
  const refund = c.flags.includes('refund')
  const reason = warnReason(c, logged)
  const notes = flagNotes(c, logged)

  const resolve = (status: 'confirmed' | 'rejected', txId: string | null) => {
    dispatch({ type: 'inbox/resolve', id: c.id, status, txId, nowISO: new Date().toISOString() })
    onLeave(c, status === 'confirmed' ? 'warm' : 'fade')
  }

  const confirm = () => {
    if (refund) {
      resolve('confirmed', null)
      return
    }
    if (reason && !armed) {
      setArmed(true)
      return
    }
    // $0 is 0 DA at any rate — no rate needed to log nothing.
    const amountDA = c.amount === 0 ? 0 : toDA(c.amount, c.currency, fx)
    if (amountDA === null) {
      setError('This one is in USD — set your rate on Home first, then confirm.')
      return
    }
    const nowISO = new Date().toISOString()
    const tx: Transaction = {
      id: newId(),
      amountDA,
      category,
      note: 'from inbox',
      date: c.date,
      ...(accountId ? { accountId } : {}),
      ...(c.currency === 'USD' ? { original: { amount: c.amount, currency: 'USD' as const } } : {}),
      at: nowISO,
    }
    dispatch({ type: 'LOG_TX', tx })
    resolve('confirmed', tx.id)
  }

  return (
    <li className={`slip${c.sources.length > 1 ? ' is-merged' : ''}`} aria-label={`${c.merchant}, ${fmtMoney(Math.abs(c.amount), c.currency)}`}>
      <SlipFace c={c} fx={fx} />
      {notes.map((n) => (
        <p key={n} className="slip-flag">
          {n}
        </p>
      ))}
      <div className={`receipts${c.sources.length > 1 ? ' merge' : ''}`}>
        {c.sources.map((s, i) => (
          <figure key={`${i}-${s.text.slice(0, 24)}`} className="receipt">
            <figcaption className="receipt-from">{s.from}</figcaption>
            <blockquote className="receipt-text">{s.text}</blockquote>
          </figure>
        ))}
      </div>
      {!refund && (
        <div className="log-row slip-fields">
          <label className="field-wrap" htmlFor={catId}>
            <span className="field-label">Category</span>
            <select id={catId} className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="field-wrap" htmlFor={accId}>
            <span className="field-label">Paid from</span>
            <select id={accId} className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">No account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {armed && reason && (
        <p id={warnId} className="slip-warn" role="alert">
          This looks like {reason}. Tap “Confirm anyway” to log it.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="slip-actions">
        <button type="button" className="btn btn-flame" onClick={confirm} aria-describedby={armed ? warnId : undefined}>
          {refund ? 'Noted' : armed ? 'Confirm anyway' : 'Confirm'}
        </button>
        <button type="button" className="btn" onClick={() => resolve('rejected', null)}>
          {reason || refund ? 'Not a spend' : 'Reject'}
        </button>
      </div>
    </li>
  )
}
