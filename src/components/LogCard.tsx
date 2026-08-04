import { useEffect, useMemo, useState } from 'react'
import * as sfx from '../audio/chiptune.ts'
import type { Transaction } from '../state/store.ts'
import { addNote, NOTE_DENOMINATIONS_DA } from '../engine/keypad.ts'

/** Exported for the tests only: the landing surface's product shot renders
    sample rows through the real <Ledger>, and sampleLedger.test asserts every
    one of their categories is a category this picker can actually produce — a
    shot showing a category the app cannot log is a mockup. */
export const CATEGORIES = ['Food', 'Transport', 'Fun', 'Bills', 'Health', 'Other']

/** Rows the repeat-chip derivation scans (most recent first). */
const CHIP_SCAN = 30
/** A pair must repeat before it earns a chip — one-offs are not habits. */
const CHIP_MIN_REPEATS = 2
const CHIP_MAX = 3

/** How long the post-log Undo affordance stays available. */
const UNDO_WINDOW_MS = 5_000

export function LogCard({
  transactions,
  onLog,
  onUndo,
  resistXpCapped,
}: {
  transactions: Transaction[]
  /** Logs the entry and returns the new transaction's id (for Undo). */
  onLog: (amountDA: number, category: string, resisted: boolean, impulseFlagged: boolean) => string
  onUndo: (id: string) => void
  resistXpCapped: boolean
}) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  // "I bought it anyway": the only UI that sets Transaction.impulseFlagged —
  // the yielded side of the Impulse Control ratio. Honesty is still logging,
  // so a flagged purchase pays the same +5 and the same blip as any log:
  // reporting against yourself is never punished (non-punitive rule).
  const [impulse, setImpulse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLog, setLastLog] = useState<{ id: string; text: string } | null>(null)
  // Mounted-empty live region content for the note pad (see the region below).
  // A pad tap changes an input's value programmatically, and a programmatic
  // value change is announced by nothing — without this the pad is a
  // sighted-only input method.
  const [padNote, setPadNote] = useState('')

  // Mis-taps are the number-one anxiety of manual logging: every log opens a
  // short Undo window (UNDO_TX removes the row AND its XP grant, so the grace
  // costs nothing in game economy). Timer keyed on the entry so a second log
  // restarts the window for the new row.
  useEffect(() => {
    if (lastLog === null) return
    const t = setTimeout(() => setLastLog(null), UNDO_WINDOW_MS)
    return () => clearTimeout(t)
  }, [lastLog])

  // Repeat chips: the user's own recent (amount, category) pairs become the
  // input method — the daily coffee/bus/bread log collapses to one 48px tap.
  // Pure derivation over the recent log, no persisted state. Resists carry no
  // spend and flagged impulses must not be re-logged unflagged by a habit
  // chip, so both are skipped. Ties keep recency order (Map insertion order
  // is newest-first and the sort is stable), so the derivation is
  // deterministic for a given ledger.
  const chips = useMemo(() => {
    const byPair = new Map<string, { amountDA: number; category: string; n: number }>()
    for (const t of transactions.slice(0, CHIP_SCAN)) {
      if (t.resistedImpulse || t.impulseFlagged || t.amountDA <= 0) continue
      const key = `${t.amountDA}|${t.category}`
      const entry = byPair.get(key)
      if (entry) entry.n += 1
      else byPair.set(key, { amountDA: t.amountDA, category: t.category, n: 1 })
    }
    return [...byPair.values()]
      .filter((e) => e.n >= CHIP_MIN_REPEATS)
      .sort((a, b) => b.n - a.n)
      .slice(0, CHIP_MAX)
  }, [transactions])

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
    // The flag only rides on purchases: a resisted impulse was not yielded to,
    // and deriveHealthInputs counts yielded as flagged-and-not-resisted anyway.
    const id = onLog(validAmt ? amt : 0, category, resisted, !resisted && impulse)
    setLastLog({
      id,
      text: resisted ? 'Resist logged' : `Logged ${(validAmt ? amt : 0).toLocaleString()} DA`,
    })
    setAmount('')
    setImpulse(false)
    // The field is empty again, so the pad's announcement no longer describes
    // anything. Clearing it also keeps the NEXT identical composition audible:
    // a live region announces text CHANGES, so leaving "Amount 1,500 DA"
    // parked here would silence the second identical purchase of the day.
    // Emptying a region announces nothing, so the reset itself is silent.
    setPadNote('')
  }

  // A pad tap is an input method, not a log: it writes into the field and
  // stops. No XP, no transaction, no sound of its own — the field changing and
  // the live region below are the feedback, and §10 forbids a cue that carries
  // information alone. The denial cue on a refusal rides with a visible error,
  // exactly like submit()'s.
  function tapNote(noteDA: number) {
    const next = addNote(amount, noteDA)
    if (next === null) {
      // Typed input is never discarded to make room for a tap. The message
      // names the adjacent control that fixes it rather than diagnosing the
      // user's typing (§7.1: state the fact, never editorialise).
      setError('Clear the amount first.')
      sfx.deny()
      return
    }
    setError(null)
    setAmount(next)
    setPadNote(`Amount ${Number(next).toLocaleString()} DA`)
  }

  function clearAmount() {
    // Guarded no-op behind aria-disabled, the pattern every inert control in
    // the app uses: the `disabled` attribute would drop keyboard focus to
    // <body> the moment the field empties under the user's own finger.
    if (amount === '') return
    setAmount('')
    setError(null)
    setPadNote('Amount cleared.')
  }

  function quickLog(amountDA: number, chipCategory: string) {
    // Chips are habitual repeats, never impulse reports — the checkbox flag
    // stays a deliberate per-entry choice on the form.
    setError(null)
    const id = onLog(amountDA, chipCategory, false, false)
    setLastLog({ id, text: `Logged ${amountDA.toLocaleString()} DA` })
  }

  return (
    // id: hero nav / CTA anchor target (desktop).
    <section className="card" id="log">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">LOG—03</span>
      <h2>Log it</h2>
      {chips.length > 0 && (
        <div className="chip-row" role="group" aria-label="Repeat a recent purchase">
          {chips.map((c) => (
            <button
              key={`${c.amountDA}|${c.category}`}
              type="button"
              className="btn chip"
              onClick={() => quickLog(c.amountDA, c.category)}
            >
              {c.amountDA.toLocaleString()} DA · {c.category}
            </button>
          ))}
        </div>
      )}
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
                // Same reason submit() and clearAmount() empty it: a live
                // region announces CHANGES. Backspacing the field by hand and
                // then re-tapping the same note writes the identical string,
                // React reconciles to the same text node, no mutation fires
                // and the tap is silent — sighted-only input, which is the
                // one thing this region exists to prevent. Emptying a region
                // announces nothing, so the reset itself costs no noise.
                setPadNote('')
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
        {/* Cash-note pad. Below the field, not above it: the tab order should
            reach the typed input first, because typing is the faster path for
            anyone already on a keyboard, and the pad is the shortcut for the
            box directly above it.
            A real <fieldset>/<legend>, like ProfileCard's groups — the native
            group role and its name come free, and AT reads "Notes, DA" before
            each key instead of five bare numerals. */}
        <fieldset className="note-pad">
          <legend className="field-label">Notes (DA)</legend>
          <div className="note-keys">
            {NOTE_DENOMINATIONS_DA.map((n) => (
              // §7.4: the key is a numeral. No "Add 1000 DA!", no emoji. The
              // unit lives in the accessible name (which contains the visible
              // string, per WCAG 2.5.3) and in the legend.
              <button
                key={n}
                type="button"
                className="btn note-key mono"
                aria-label={`Add ${n.toLocaleString()} DA`}
                onClick={() => tapNote(n)}
              >
                {n.toLocaleString()}
              </button>
            ))}
            {/* Clearing is the one destructive thing on this card, so it is
                its own deliberate press — never a side effect of tapping a
                note. Inert (not absent) while there is nothing to clear: a
                control that appears and disappears under the thumb moves the
                whole key row. */}
            <button
              type="button"
              className="btn note-clear"
              aria-disabled={amount === ''}
              onClick={clearAmount}
            >
              Clear
            </button>
          </div>
        </fieldset>
        {/* Permanently mounted and mounted EMPTY, for the same reason as the
            toast and the ledger's range region: screen readers announce text
            changes inside an EXISTING region, so one that arrives already
            holding its message is silent. Setting an input's value from code
            fires no announcement of its own, so without this the composed
            amount only exists for people who can see the field. */}
        <p className="sr-only" role="status" aria-label="Amount entered">{padNote}</p>
        {/* "I bought it anyway" — the string Trust Rule 3 names, and the
            string Landing.tsx and README already quote as the app's phrasing.
            What shipped here was "This was an impulse I gave in to": a
            concession verb about the user, which is the failure framing §7.1
            forbids ("blunt is fine; blame is not") and the one place in the
            product where the user is asked to editorialise about themselves.
            Four words, leads with the object, states the fact and stops. */}
        <label className="impulse-check">
          <input
            type="checkbox"
            checked={impulse}
            onChange={(e) => setImpulse(e.target.checked)}
          />
          <span>I bought it anyway</span>
        </label>
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
      {lastLog && (
        <div className="undo-strip">
          <span>{lastLog.text}</span>
          <button
            type="button"
            className="btn undo-btn"
            onClick={() => {
              onUndo(lastLog.id)
              setLastLog(null)
            }}
          >
            Undo
          </button>
        </div>
      )}
    </section>
  )
}
