import { useEffect, useMemo, useRef, useState } from 'react'
import * as sfx from '../audio/chiptune.ts'
import { NOTE_MAX_LEN, type Transaction } from '../state/store.ts'
import { addNote, NOTE_DENOMINATIONS_DA } from '../engine/keypad.ts'
import { useAnnouncer } from '../hooks/useAnnouncer.ts'

/** Exported for the tests only: the landing surface's product shot renders
    sample rows through the real <ArchiveCard>, and sampleLedger.test asserts every
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

/**
 * The resist button's label, minus the XP suffix the cap swaps out.
 *
 * EXPORTED BECAUSE THE PITCH QUOTES IT. Landing.tsx's hand-off — the reason
 * anyone forwards this product — tells a stranger which button to press, and
 * this file's rule for the marketing surface is that it prints the app's own
 * words or it prints nothing (same discipline as NOTE_DENOMINATIONS_DA,
 * DECISION_ANSWERS and NOTE_MAX_LEN). Rename the button and the sentence above
 * the fold renames itself; there is no second copy to forget.
 */
export const RESIST_LABEL = 'I resisted an impulse'

export function LogCard({
  transactions,
  onLog,
  onUndo,
  resistXpCapped,
  prefill,
}: {
  transactions: Transaction[]
  /** Logs the entry and returns the new transaction's id (for Undo). */
  onLog: (
    amountDA: number,
    category: string,
    resisted: boolean,
    impulseFlagged: boolean,
    note?: string,
  ) => string
  onUndo: (id: string) => void
  resistXpCapped: boolean
  /** An amount handed over from another card — today, the decision record's
   *  "Bought it". `seq` is what makes a repeat of the SAME amount arrive: the
   *  value alone would compare equal and the effect would never re-run. */
  prefill?: { amountDA: number; seq: number } | null
}) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  // "What was it?" — the row's memory. Optional, unpaid, and asked about the
  // OBJECT: never "why", never "was this necessary" (§12.3 / §7.1 — the
  // Fabricator names the thing and stops). A blank one is not a deficiency
  // and is never flagged as one.
  const [what, setWhat] = useState('')
  // "I bought it anyway": the only UI that sets Transaction.impulseFlagged —
  // the yielded side of the Impulse Control ratio. Honesty is still logging,
  // so a flagged purchase pays the same +5 and the same blip as any log:
  // reporting against yourself is never punished (non-punitive rule).
  const [impulse, setImpulse] = useState(false)
  // seq, not a bare string: a live alert announces a text CHANGE, and pressing
  // "Log purchase" twice on an empty field reconciles the identical message
  // into the identical node — measured silent on the second press, leaving the
  // denial blip to carry it alone (§10 forbids that outright). The seq is the
  // element's key, so an identical repeat REMOUNTS the role="alert" and is
  // announced on insertion. Same shape in SimCard and ProfileCard.
  const [error, setError] = useState<{ text: string; seq: number } | null>(null)
  const [lastLog, setLastLog] = useState<{
    id: string
    text: string
    /** What the removal announces — built at log time, when the amount is known. */
    undone: string
  } | null>(null)
  // Mounted-empty live region content for the note pad (see the region below).
  // A pad tap changes an input's value programmatically, and a programmatic
  // value change is announced by nothing — without this the pad is a
  // sighted-only input method.
  const [padNote, announcePad] = useAnnouncer()
  // The undo affordance's own region. The strip is a bare <div> outside every
  // live region, so the words "Logged 2,000 DA" and "Undo" only ever reached a
  // screen reader by accident, if the user happened to tab past them inside
  // the grace window. Worded as an affordance, not a receipt.
  const [logStatus, announceLog] = useAnnouncer()
  // True while keyboard focus sits inside the undo strip. See the expiry
  // effect: this is the pause that keeps the window off a hard clock.
  const [undoHeld, setUndoHeld] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  // A handover from another card (the decision record's "Bought it"). Three
  // things have to happen together or the move is worse than not making it:
  //
  //  · the amount lands in the field — the card the user came from already
  //    knew it, and retyping it is the friction this app exists to remove;
  //  · FOCUS follows it. The button that was pressed unmounts in the same
  //    commit, and an unmounting focused element drops focus to <body>
  //    silently. This is the other half of SimCard's hand-off (§12.8);
  //  · the region says so. Setting an input's value from code announces
  //    nothing at all, so without this the whole transfer is sighted-only.
  //
  // It fills the field and STOPS. Nothing is logged: the app did not observe a
  // purchase, the user reported one, and the confirmation is theirs to make.
  useEffect(() => {
    if (!prefill) return
    setAmount(String(prefill.amountDA))
    setError(null)
    amountRef.current?.focus()
    announcePad(`Amount ${prefill.amountDA.toLocaleString()} DA. Ready to log.`)
  }, [prefill, announcePad])

  // Mis-taps are the number-one anxiety of manual logging: every log opens a
  // short Undo window (UNDO_TX removes the row AND its XP grant, so the grace
  // costs nothing in game economy). Timer keyed on the entry so a second log
  // restarts the window for the new row.
  //
  // CONSTRAINT: WCAG 2.2.1 (Level A). A 5s hard clock with no pause, extension
  // or warning is a timing failure, and nothing about a mis-tap grace window
  // makes the limit "essential". Holding focus inside the strip PAUSES the
  // window; it restarts in full when focus leaves. That also removes the
  // second defect the sweep measured here: the timer used to unmount the
  // focused Undo button, dropping keyboard focus to <body> — precisely what
  // the `disabled` ban in QuestCard/LessonCard exists to prevent, done on a
  // timer instead of on a click.
  useEffect(() => {
    if (lastLog === null) {
      // Re-arm the pause. Browsers do NOT fire blur when a focused element is
      // simply removed from the document — focus goes to <body> silently — so
      // if the hand-off below ever fails to run, a stale `held` would pin the
      // NEXT log's strip open forever. React bails out of a setState that
      // lands on the identical value, so this costs a render only when stuck.
      if (undoHeld) setUndoHeld(false)
      return
    }
    if (undoHeld) return
    const t = setTimeout(() => {
      // Belt and braces for the pointer path, where focus can land in the
      // strip without a focus event this component sees: hand focus back to
      // the submit button rather than let the unmount drop it to <body>.
      if (stripRef.current?.contains(document.activeElement)) submitRef.current?.focus()
      setLastLog(null)
      // The affordance is gone, so its announcement no longer describes
      // anything. Emptying a region is silent, and it re-arms the region for
      // the next log of the same amount (see useAnnouncer).
      announceLog('')
    }, UNDO_WINDOW_MS)
    return () => clearTimeout(t)
  }, [lastLog, undoHeld, announceLog])

  // Repeat chips: the user's own recent (amount, category) pairs become the
  // input method — the daily coffee/bus/bread log collapses to one 48px tap.
  // Pure derivation over the recent log, no persisted state. Resists carry no
  // spend and flagged impulses must not be re-logged unflagged by a habit
  // chip, so both are skipped. Ties keep recency order (Map insertion order
  // is newest-first and the sort is stable), so the derivation is
  // deterministic for a given ledger.
  //
  // The note rides along only when EVERY scanned row of the pair carries the
  // same one. A pair logged once as "bread" and once as "phone credit" has no
  // single answer to "what was it", so its chip logs noteless rather than
  // stamping one of the two onto a purchase the user never described that
  // way. '' means "no note to carry" and covers both cases — all-noteless and
  // conflicting — because both must behave identically: log the money, assert
  // no memory.
  const chips = useMemo(() => {
    const byPair = new Map<
      string,
      { amountDA: number; category: string; n: number; note: string }
    >()
    for (const t of transactions.slice(0, CHIP_SCAN)) {
      if (t.resistedImpulse || t.impulseFlagged || t.amountDA <= 0) continue
      const key = `${t.amountDA}|${t.category}`
      const entry = byPair.get(key)
      const note = t.note ?? ''
      if (entry) {
        entry.n += 1
        if (entry.note !== note) entry.note = ''
      } else byPair.set(key, { amountDA: t.amountDA, category: t.category, n: 1, note })
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
  // as the avoided amount (the archive shows "N DA avoided"), because the
  // price of what you didn't buy may be the app's most motivating stat.
  // Clearing the field while recording 0 would silently imply capture.
  function fail(text: string) {
    // Bumping seq remounts the alert, so the SECOND identical failure is
    // announced too (see the error state above).
    setError((cur) => ({ text, seq: (cur?.seq ?? 0) + 1 }))
    sfx.deny()
  }

  function submit(resisted: boolean) {
    const amt = parseFloat(amount)
    const validAmt = Number.isFinite(amt) && amt > 0
    if (!validAmt && (!resisted || amount.trim() !== '')) {
      fail('Enter an amount first.')
      return
    }
    setError(null)
    // The flag only rides on purchases: a resisted impulse was not yielded to,
    // and deriveHealthInputs counts yielded as flagged-and-not-resisted anyway.
    const id = onLog(validAmt ? amt : 0, category, resisted, !resisted && impulse, what)
    const money = `${(validAmt ? amt : 0).toLocaleString()} DA`
    openUndo(
      id,
      resisted ? 'Resist logged' : `Logged ${money}`,
      resisted ? 'Removed. Resist undone.' : `Removed. ${money} log undone.`,
    )
    setAmount('')
    setImpulse(false)
    // Cleared with the amount, never carried into the next log: the note
    // describes ONE purchase, and a sticky one would silently label the next
    // row with the last row's object.
    setWhat('')
    // The field is empty again, so the pad's announcement no longer describes
    // anything. Clearing it also keeps the NEXT identical composition audible:
    // a live region announces text CHANGES, so leaving "Amount 1,500 DA"
    // parked here would silence the second identical purchase of the day.
    // Emptying a region announces nothing, so the reset itself is silent.
    announcePad('')
  }

  /** Opens the grace window AND says so — the two used to be separable. */
  function openUndo(id: string, text: string, undone: string) {
    setLastLog({ id, text, undone })
    // An affordance, not a receipt: "Logged 2,000 DA" alone tells a screen
    // reader user nothing about the control that just appeared under it.
    announceLog(`${text}. Undo available.`)
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
      fail('Clear the amount first.')
      return
    }
    setError(null)
    setAmount(next)
    announcePad(`Amount ${Number(next).toLocaleString()} DA`)
  }

  function clearAmount() {
    // Guarded no-op behind aria-disabled, the pattern every inert control in
    // the app uses: the `disabled` attribute would drop keyboard focus to
    // <body> the moment the field empties under the user's own finger.
    if (amount === '') {
      // …but an inert control that does nothing and says nothing is a dead
      // key to anyone who could not see it go inert. One line into the region
      // already mounted for this pad — no second region, no error state, and
      // no denial blip: nothing failed, there was simply nothing to do.
      announcePad('Nothing to clear.')
      return
    }
    setAmount('')
    setError(null)
    announcePad('Amount cleared.')
  }

  function quickLog(amountDA: number, chipCategory: string, chipNote: string) {
    // Chips are habitual repeats, never impulse reports — the checkbox flag
    // stays a deliberate per-entry choice on the form.
    setError(null)
    // '' → undefined: a chip with nothing to carry logs a noteless row, it
    // does not write an empty note (see the chip derivation above).
    const id = onLog(amountDA, chipCategory, false, false, chipNote || undefined)
    const money = `${amountDA.toLocaleString()} DA`
    openUndo(id, `Logged ${money}`, `Removed. ${money} log undone.`)
  }

  return (
    // id: hero nav / CTA anchor target (desktop).
    // tabIndex -1 + aria-labelledby: the hero's six in-page links and its CTA
    // are the only jump mechanism on a 900px-tall full-viewport hero, and the
    // sweep measured focus landing on <body> after activating one — the target
    // sections were not focusable (tabIndex -1 is the non-focusable DEFAULT
    // when read back, not an authored value). Chrome papers over this with the
    // sequential-focus navigation starting point; Safari/VoiceOver do not.
    // Same trick App.tsx already uses on <main>. The label makes the arrival
    // announce the section by name instead of a bare "region".
    <section className="card" id="log" tabIndex={-1} aria-labelledby="log-title">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">LOG—02</span>
      {/* CONSTRAINT §2.1b — see .counter-plate in tokens.css. The form below
          stays on the reading ground: it carries .btn-flame and .btn-gold. */}
      <h2 id="log-title" className="counter-plate">Log it</h2>
      {chips.length > 0 && (
        <div className="chip-row" role="group" aria-label="Repeat a recent purchase">
          {chips.map((c) => (
            <button
              key={`${c.amountDA}|${c.category}`}
              type="button"
              className="btn chip"
              onClick={() => quickLog(c.amountDA, c.category, c.note)}
            >
              {/* The label states everything the tap will write, note
                  included — a chip that silently carried a note the button
                  did not name would be logging a claim the user never read. */}
              {c.amountDA.toLocaleString()} DA · {c.category}
              {c.note !== '' && ` · ${c.note}`}
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
              ref={amountRef}
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
                // (useAnnouncer now makes the identical-repeat case audible
                // anyway; the clear stays because a region describing an
                // amount the user just edited by hand is stale, not silent.)
                announcePad('')
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
            group role and its name come free, and AT reads "Cash, DA" before
            each key instead of five bare numerals.
            "Cash", not "Notes", and the distinction is load-bearing rather than
            pedantic: keypad.ts records that the Bank of Algeria's circulating
            NOTE series is 2000/1000/500/200 DA — 100 DA has been a coin for
            decades — so this legend mislabelled one of its own five keys on a
            product whose stated differentiator is "Built for Algeria". Both
            marketing surfaces were corrected to "cash" already (Landing's
            "Amounts go in as cash", README's "Logging takes cash, not digits");
            this is the one surface a user reads while logging. It also
            disambiguates against the "What was it?" row note one field below,
            which is the other thing in this form called a note. */}
        {/* CONSTRAINT §2.1b: the keypad is the one panel in this form with no
            accent control on it, so it is where LogCard's field ground goes
            (see .counter-plate in tokens.css).
            THE PLATE IS ON .note-keys, NOT ON THE <fieldset> — moved, because a
            first-child <legend> is the UA's RENDERED LEGEND and the fieldset's
            background therefore starts at the legend's vertical MIDDLE. "CASH
            (DA)" shipped cut in half for several rounds: top half Graphite on
            the card's Bone, bottom half Graphite on the plate's Espresso at
            1.16:1, i.e. a label with an invisible lower edge (§2.1). Putting
            the ground on the box inside leaves the legend on the paper at
            11.4:1 and needs no UA-behaviour workaround — floating the legend
            was measured and took the document to 446px wide on a 375px phone.
            See app.css's plates'-box list. */}
        <fieldset className="note-pad">
          <legend className="field-label">Cash (DA)</legend>
          <div className="note-keys counter-plate">
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
        {/* The row's memory, and the reason it sits HERE rather than beside
            Category: the cash pad above is a shortcut for the Amount box
            directly over it, so a text field wedged between them would break
            the one field/one input-method pair on the card and put a keyboard
            user's tab stop in the middle of it. Amount, then its pad, then
            what it was.
            A visible <label>, never placeholder-only (§12.8, WCAG 3.3.2) —
            the placeholder is an EXAMPLE and disappears on the first
            keystroke. maxLength mirrors the sanitizer's cap so the limit is
            visible at the keyboard instead of silently applied at reload. */}
        <label className="field-wrap">
          <span className="field-label">What was it?</span>
          <input
            className="field"
            type="text"
            maxLength={NOTE_MAX_LEN}
            placeholder="bread, bus fare"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
          />
        </label>
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
          // key: see the error state — an identical repeat must remount the
          // alert, or the second press of an already-failing button is silent.
          <p className="field-error" id="log-error" role="alert" key={error.seq}>
            {error.text}
          </p>
        )}
        <div className="log-actions">
          <button type="submit" className="btn btn-flame" ref={submitRef}>
            Log purchase (+5 XP)
          </button>
          {/* The label must not promise XP the capped grant won't pay —
              resists past the daily cap still log, they just earn nothing. */}
          <button type="button" className="btn btn-gold" onClick={() => submit(true)}>
            {resistXpCapped
              ? `${RESIST_LABEL} (XP capped today)`
              : `${RESIST_LABEL} (+50 XP)`}
          </button>
        </div>
      </form>
      {/* The undo affordance's live region, mounted empty and mounted OUTSIDE
          the strip — the strip unmounts, and a region that unmounts announces
          nothing on the way out. Separate from "Amount entered" above: that
          one describes the field's contents and is cleared on every keystroke,
          this one describes a control with a grace window on it. */}
      <p className="sr-only" role="status" aria-label="Log status">{logStatus}</p>
      {lastLog && (
        <div
          className="undo-strip"
          ref={stripRef}
          // Focus capture on the CONTAINER, not the button: it pauses the
          // window for anything focusable the strip ever grows, and the
          // blur/focus pair batches into one render when focus moves between
          // two controls inside it. See the expiry effect (WCAG 2.2.1).
          onFocusCapture={() => setUndoHeld(true)}
          onBlurCapture={() => setUndoHeld(false)}
        >
          <span>{lastLog.text}</span>
          <button
            type="button"
            className="btn undo-btn"
            onClick={() => {
              // Focus moves FIRST: this button unmounts on the next commit,
              // and the sweep measured focus landing on <body> when it did.
              // ProfileCard's save does the same hand-off for the same reason.
              submitRef.current?.focus()
              onUndo(lastLog.id)
              // …and the removal is otherwise silent: the row vanishes and
              // useRewards only announces XP going UP, so a blind user
              // pressing Undo had no way to know whether it worked.
              announceLog(lastLog.undone)
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
