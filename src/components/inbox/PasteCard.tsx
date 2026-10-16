import { useId, useState } from 'react'
import type { Dispatch } from 'react'
import type { AppAction } from '../../state/reducer.ts'
import { newId } from '../../state/store.ts'
import { planAdd, type InboxCandidate, type InboxState } from '../../state/slices/inbox.ts'
import { parseMany } from '../../engine/inbox/parse.ts'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Paste → parse → pending slips. Reports exactly what landed in the tray. */
export function PasteCard({ inbox, dispatch }: { inbox: InboxState; dispatch: Dispatch<AppAction> }) {
  const [text, setText] = useState('')
  const [from, setFrom] = useState('')
  const [note, setNote] = useState<{ kind: 'ok' | 'miss'; text: string } | null>(null)
  const textId = useId()
  const fromId = useId()

  const read = () => {
    const nowISO = new Date().toISOString()
    const { candidates, messages } = parseMany(text, { from, receivedAt: nowISO })
    if (candidates.length === 0) {
      setNote({
        kind: 'miss',
        text:
          messages === 0
            ? 'Paste something first — a receipt, an email or an SMS.'
            : "Couldn't find an amount in that. Ember reads DA and USD amounts like “2 500,00 DA” or “USD 12.49”. Nothing was saved.",
      })
      return
    }
    const rows: InboxCandidate[] = candidates.map((c) => ({
      ...c,
      id: newId(),
      status: 'pending',
      txId: null,
      cleared: false,
      updatedAt: nowISO,
    }))
    const plan = planAdd(inbox, rows, nowISO)
    dispatch({ type: 'inbox/add', candidates: rows, nowISO })
    const parts = [`Read ${plural(messages, 'message')}`]
    const skipped = messages - candidates.length
    if (plan.added > 0) parts.push(`${plural(plan.added, 'slip')} to review`)
    if (plan.merged > 0) parts.push(`${plural(plan.merged, 'message')} matched a purchase already in the tray`)
    if (skipped > 0) parts.push(`${plural(skipped, 'message')} had no amount`)
    setNote({ kind: 'ok', text: `${parts.join(' · ')}. Nothing is logged until you confirm.` })
    setText('')
  }

  return (
    <form
      className="inbox-paste"
      onSubmit={(e) => {
        e.preventDefault()
        read()
      }}
    >
      <label className="field-label" htmlFor={textId}>
        Paste a receipt, email or SMS
      </label>
      <textarea
        id={textId}
        className="field inbox-text"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Card transaction: USD 12.49 at STEAMGAMES.COM\n---\nVotre compte a été débité de 2 500,00 DA …'}
      />
      <p className="inbox-hint">Several at once? Separate them with a blank line or “---”.</p>
      <div className="log-row">
        <label className="field-wrap" htmlFor={fromId}>
          <span className="field-label">From (optional)</span>
          <input
            id={fromId}
            className="field"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="RedotPay, BaridiMob, orders@jumia.dz…"
            autoComplete="off"
          />
        </label>
        <button type="submit" className="btn btn-flame">
          Read it
        </button>
      </div>
      <p className={`inbox-note${note?.kind === 'miss' ? ' is-miss' : ''}`} role="status" aria-live="polite">
        {note?.text ?? ''}
      </p>
    </form>
  )
}
