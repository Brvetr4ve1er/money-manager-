import { useState } from 'react'
import * as sfx from '../audio/chiptune.ts'

const CATEGORIES = ['Food', 'Transport', 'Fun', 'Bills', 'Health', 'Other']

export function LogCard({
  onLog,
  resistXpCapped,
}: {
  onLog: (amountDA: number, category: string, resisted: boolean) => void
  resistXpCapped: boolean
}) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [error, setError] = useState<string | null>(null)

  // The app's most-used action must never fail silently: invalid input gets
  // an inline error (plus a denial blip reinforcing it, never replacing it).
  // isFinite, not !isNaN: '1e999' parses to Infinity, which would log a
  // nonsense row that JSON round-trips as null and silently vanishes on
  // reload — XP granted, record lost.
  // A resist needs no amount — but a typed one is never thrown away: it logs
  // as the avoided amount (the Ledger shows "N DA avoided"), because the
  // price of what you didn't buy may be the app's most motivating stat.
  // Clearing the field while recording 0 would silently imply capture.
  function submit(resisted: boolean) {
    const amt = parseFloat(amount)
    const validAmt = Number.isFinite(amt) && amt > 0
    if (!validAmt && (!resisted || amount.trim() !== '')) {
      setError('Enter an amount first.')
      sfx.deny()
      return
    }
    setError(null)
    onLog(validAmt ? amt : 0, category, resisted)
    setAmount('')
  }

  return (
    <section className="card">
      <h2>Log it</h2>
      {/* A real <form> so Enter / the mobile keyboard's done key submits. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
      >
        <div className="log-row">
          {/* Visible captions (WCAG 3.3.2): the placeholder was the only
              visual label and vanished on the first keystroke, and the select
              never had one — its value read as a bare word. The wrapping
              <label>s name both fields for AT and sighted users alike.
              type="text" + inputMode="decimal", not type="number": the numeric
              keyboard still comes up on mobile, without number-input quirks
              (scroll-wheel value changes, silent clearing on non-numeric
              paste). Validation happens in submit(), where it can explain
              itself. */}
          <label className="field-wrap">
            <span className="field-label">Amount (DA)</span>
            <input
              className="field mono"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
              aria-invalid={error !== null}
              aria-describedby={error ? 'log-error' : undefined}
            />
          </label>
          <label className="field-wrap">
            <span className="field-label">Category</span>
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="field-error" id="log-error" role="alert">{error}</p>
        )}
        <div className="log-actions">
          <button type="submit" className="btn btn-flame">
            Log purchase (+5 XP)
          </button>
          {/* The label must not promise XP the capped grant won't pay —
              resists past the daily cap still log, they just earn nothing. */}
          <button type="button" className="btn btn-gold" onClick={() => submit(true)}>
            {resistXpCapped
              ? 'I resisted an impulse (XP capped today)'
              : 'I resisted an impulse (+50 XP)'}
          </button>
        </div>
      </form>
    </section>
  )
}
