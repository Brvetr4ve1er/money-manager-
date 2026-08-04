import { useRef, useState } from 'react'
import { runSimulation, describeResult } from '../engine/simulator.ts'
import { buildSimProfile, type UserProfile } from '../engine/profile.ts'
import { dayLabel } from '../engine/ledger.ts'
import { useAnnouncer } from '../hooks/useAnnouncer.ts'
import { DECISION_ANSWERS, type Decision, type DecisionOutcome } from '../state/store.ts'
import * as sfx from '../audio/chiptune.ts'

/* The three answers and their order live in store.ts, beside the type — the
   landing page renders the same words to describe this card, and two hand-kept
   copies of a label is how the description stops matching the button. */
const OUTCOME_LABEL: Record<Exclude<DecisionOutcome, 'open'>, string> =
  Object.fromEntries(DECISION_ANSWERS.map((a) => [a.outcome, a.label])) as Record<
    Exclude<DecisionOutcome, 'open'>,
    string
  >

export function SimCard({
  profile,
  isDemo,
  today,
  decisions,
  onRun,
  onClose,
}: {
  profile: UserProfile
  /** True while the projection still runs on DEMO_PROFILE (setup incomplete). */
  isDemo: boolean
  /** The app's day, not a fresh clock read — see App: this card stamps the day
   *  a decision was run and labels it back, and a second clock source would let
   *  a row stamped the 4th render as "Today" on the 5th. */
  today: string
  decisions: Decision[]
  /** Persists the run. The line is frozen here and never recomputed (§12.5). */
  onRun: (run: { amountDA: number; line: string }) => void
  onClose: (id: string, outcome: Exclude<DecisionOutcome, 'open'>, amountDA: number) => void
}) {
  const [simAmount, setSimAmount] = useState('')
  // useAnnouncer, not a bare string: running the SAME amount twice produces the
  // same projection line, which reconciles into the same text node, fires no
  // DOM mutation and is never announced — leaving sfx.reveal() as the only
  // feedback for this card's flagship action, i.e. sound carrying information
  // alone (§10 forbids it, and the app's own mute makes it nothing at all).
  // The alternating trailing NBSP makes an identical repeat a real text change.
  // CONSTRAINT: Trust Rule 8 — the region below stays mounted either way.
  const [simText, announceSim] = useAnnouncer()
  // seq, not a bare string: a repeated identical validation message reconciles
  // into the same node, fires no mutation, and is announced exactly once — see
  // LogCard's error state for the measurement. The seq keys the alert so an
  // identical repeat remounts it and is announced on insertion.
  const [error, setError] = useState<{ text: string; seq: number } | null>(null)
  // Mounted-empty region for the CLOSE, which is otherwise a purely visual
  // event: the three buttons vanish and a line of text takes their place, and
  // nothing about that is announced. Separate from the projection region below
  // — that one describes a number, this one describes an act.
  const [recordNote, announceRecord] = useAnnouncer()
  // Focus hand-off target. Closing a decision unmounts the button that was just
  // pressed, and an unmounting focused element drops focus to <body> silently
  // (the same failure LogCard's undo strip and ProfileCard's save hand off to
  // avoid). Focus moves here FIRST, then the row closes.
  const submitRef = useRef<HTMLButtonElement>(null)

  // isFinite, not !isNaN: '1e999' parses to Infinity, and the simulator must
  // never produce confident-sounding copy for a nonsense amount.
  function run() {
    const amt = parseFloat(simAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError((cur) => ({ text: 'Enter an amount first.', seq: (cur?.seq ?? 0) + 1 }))
      sfx.deny()
      return
    }
    setError(null)
    const result = runSimulation(buildSimProfile(profile), { amount: amt, funding: 'lump' })
    const line = describeResult(result)
    sfx.reveal()
    announceSim(line)
    // The output stops here being a render-local string: onRun writes the
    // decision, and the record below renders from state — so a reload shows
    // what the app said, instead of forgetting it ever said anything.
    onRun({ amountDA: amt, line })
  }

  function close(d: Decision, outcome: Exclude<DecisionOutcome, 'open'>) {
    // FOCUS FIRST — see submitRef. The 'bought' branch hands focus on again,
    // to the log field App prefills; the other two leave it here, on a control
    // that is still mounted after this commit.
    submitRef.current?.focus()
    onClose(d.id, outcome, d.amountDA)
    // Names the act and the row it landed on, and stops (§7.1). No praise on
    // 'waited', no consolation on 'bought' — the record does not have opinions.
    announceRecord(`${OUTCOME_LABEL[outcome]}. ${d.amountDA.toLocaleString()} DA. Recorded.`)
  }

  return (
    // id: hero nav anchor target (desktop).
    // tabIndex -1 + aria-labelledby: see LogCard — the hero's jump links
    // landed focus on <body> because the target sections were not focusable.
    <section
      className="card sim-card"
      id="simulator"
      tabIndex={-1}
      aria-labelledby="simulator-title"
    >
      {/* §11 corner mark. Rides in the window bar — this card's top edge is
          the plate, not the reserved strip the other cards use. */}
      <span className="spec-label" aria-hidden="true">SIM—06</span>
      {/* Chrome, not content: the bar is this card's top edge and its label is
          a deadpan spec mark in the §1 trait 10 register. aria-hidden because
          the card now carries a real h2 below it — every other card in the
          stack has one, and without it this section had no accessible name and
          the heading outline skipped it entirely. Announcing both would read
          the card's title twice, once spelled out as an executable. */}
      <div className="window-bar mono" aria-hidden="true">DECISION_SIM.EXE</div>
      <div className="sim-body">
        <h2 id="simulator-title">Decision simulator</h2>
        {/* Honesty gap guard: the result copy speaks in second person, so the
            card must always say whose numbers it projects — the demo profile
            until setup completes, the user's own after. Claiming
            personalization it doesn't have would break the trust rules. */}
        {/* Grotesk, not mono: this is a sentence, not an index label — see
            .sim-note in app.css. */}
        <p className="sim-note">
          {isDemo
            ? `Projected on the demo profile. ${profile.monthlyIncome.toLocaleString()} DA/mo income. Your own numbers arrive with setup.`
            : `Projected on your numbers. ${profile.monthlyIncome.toLocaleString()} DA/mo income. Edit them any time in My numbers.`}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run()
          }}
        >
          <div className="log-row">
            {/* Visible caption (WCAG 3.3.2): a placeholder-as-label vanishes
                on the first keystroke; the wrapping <label> names the field
                for AT and sighted users alike. type="text" +
                inputMode="decimal" for the same reasons as the log amount
                field (see LogCard). */}
            <label className="field-wrap">
              <span className="field-label">Purchase amount (DA)</span>
              <input
                className="field mono"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={simAmount}
                onChange={(e) => {
                  setSimAmount(e.target.value)
                  setError(null)
                }}
                aria-invalid={error !== null}
                aria-describedby={error ? 'sim-error' : undefined}
              />
            </label>
            <button type="submit" className="btn btn-data" ref={submitRef}>
              Run simulation
            </button>
          </div>
          {error && (
            // key: an identical repeat must remount the alert (see the state).
            <p className="field-error" id="sim-error" role="alert" key={error.seq}>
              {error.text}
            </p>
          )}
        </form>
        {/* Permanently mounted sr-only live region (same pattern as the XP
            region in App): screen readers announce text CHANGES inside an
            existing region, so the projection must land in an already-mounted
            element — otherwise "Run simulation" is silent for AT users and
            the reveal sound carries the moment alone. It holds the run's own
            line and is filled by the RUN, never by state: a region that
            mounts already holding a reloaded decision's text is silent, and
            would also re-announce an old projection on every boot. */}
        <p className="sr-only" role="status" aria-label="Simulation result">{simText}</p>
        {/* The close's own region, mounted empty for the same reason. */}
        <p className="sr-only" role="status" aria-label="Decision record">{recordNote}</p>

        <div className="decision-record">
          {/* h3, under this card's h2 — the record is part of the simulator,
              not a thirteenth card. Keeping it inside is the whole point: the
              engine and the surface that remembers it are one thing. */}
          <h3 className="decision-title">Record</h3>
          {decisions.length === 0 ? (
            /* §7's empty-state register, and Trust Rule 5 in its smallest
               form: it states what it has (nothing) and points at the action
               that fills it. No "0 / n", no progress element, no streak, and
               no promise about what the record will be able to tell you —
               that would be exactly the confidence it has not earned. */
            <p className="empty">No decisions recorded. Run one above.</p>
          ) : (
            <ul className="decision-list">
              {decisions.map((d, i) => {
                const money = `${d.amountDA.toLocaleString()} DA`
                const ran = dayLabel(d.date, today)
                return (
                  <li className="decision" key={d.id}>
                    <p className="decision-head">
                      <span className="decision-amount mono">{money}</span>{' '}
                      <span className="decision-when">Ran {ran}</span>
                      {/* WHOSE NUMBERS THIS ROW USED (Trust Rule 5), read from
                          the row and not from the live flag. The note above
                          describes the next run; after setup it says "your
                          numbers" while these frozen lines may have been
                          computed from an invented income and an invented
                          goal. The tag travels with the row so the claim and
                          the line can never drift apart. Deadpan, in the
                          card's own register (§7) — it names the basis and
                          stops. */}
                      {d.demo && <span className="decision-basis">Placeholder numbers</span>}
                    </p>
                    {/* WHAT IT SAID THEN (§12.5). Rendered from the stored
                        string, never re-derived: re-running the model against
                        today's profile would rewrite the app's own past every
                        time the user edits My numbers.
                        The newest row carries .sim-result — the card's one
                        accent panel, where the loudest projection has always
                        been. Older rows drop to plain ink so the card never
                        stacks accents (§1 trait 06). */}
                    <p className={i === 0 ? 'sim-result decision-line' : 'decision-line'}>
                      {d.line}
                    </p>
                    {d.outcome === 'open' ? (
                      // A named group, so AT hears which decision these three
                      // buttons belong to rather than three loose verbs.
                      <div
                        className="decision-actions"
                        role="group"
                        aria-label={`What happened: ${money}, run ${ran}`}
                      >
                        {DECISION_ANSWERS.map((o) => (
                          <button
                            key={o.outcome}
                            type="button"
                            className="btn decision-btn"
                            onClick={() => close(d, o.outcome)}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="decision-outcome">
                        {OUTCOME_LABEL[d.outcome]}
                        {d.outcomeDate !== undefined && ` · ${dayLabel(d.outcomeDate, today)}`}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
