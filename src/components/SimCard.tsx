import { useMemo, useRef, useState } from 'react'
import { runSimulation, describeResult } from '../engine/simulator.ts'
import { buildSimProfile, type UserProfile } from '../engine/profile.ts'
import { dayLabel, daysBetween } from '../engine/ledger.ts'
import { useAnnouncer } from '../hooks/useAnnouncer.ts'
import {
  CHECK_BACK_ANSWERS,
  checkBackDueOn,
  checkBackState,
  DECISION_ANSWERS,
  type CheckBackAnswer,
  type Decision,
  type DecisionOutcome,
} from '../state/store.ts'
import * as sfx from '../audio/chiptune.ts'

/* The three answers and their order live in store.ts, beside the type — the
   landing page renders the same words to describe this card, and two hand-kept
   copies of a label is how the description stops matching the button. */
const OUTCOME_LABEL: Record<Exclude<DecisionOutcome, 'open'>, string> =
  Object.fromEntries(DECISION_ANSWERS.map((a) => [a.outcome, a.label])) as Record<
    Exclude<DecisionOutcome, 'open'>,
    string
  >

/* Same rule, same reason, for the check-back's three peers. */
const CHECK_BACK_LABEL: Record<CheckBackAnswer, string> = Object.fromEntries(
  CHECK_BACK_ANSWERS.map((a) => [a.answer, a.label]),
) as Record<CheckBackAnswer, string>

/**
 * "Check back in 6 days." — the app naming a future it will actually keep.
 *
 * Counted from TODAY rather than printing CHECK_BACK_DAYS, so the line stays
 * true as the row ages instead of promising fourteen days forever. Only ever
 * called on a 'scheduled' row, where the due day is strictly after today, so
 * the count is at least 1 and the plural branch is safe.
 */
function scheduleLine(d: Decision, today: string): string {
  const due = checkBackDueOn(d)
  if (due === null) return ''
  const days = daysBetween(today, due)
  return days === 1 ? 'Check back tomorrow.' : `Check back in ${days} days.`
}

/**
 * THE OTHER HALF OF THE HONESTY NOTE: the inputs setup never asked for.
 *
 * "Projected on your numbers." was true of two of the five SimProfile fields
 * and false of three. resolveProfile INVENTS liquidBalance (one month of free
 * cash flow), revolvingApr (ASSUMED_REVOLVING_APR, 0.18) and extraDebtPayment
 * (0) — see engine/profile.ts, where each choice is argued — and ProfileCard
 * collects none of them.
 *
 * They are not cosmetic. A lump purchase is subtracted from the fabricated
 * liquidBalance, and whether that drives the buffer negative is exactly what
 * pauses goal contributions and produces "Your goal slips about N months"; the
 * assumed APR is what produces "Card balance: about N months longer." The
 * per-row "Placeholder numbers" tag next to the record fires only on d.demo,
 * so after setup nothing in the UI disclosed either. That is the gap the
 * card's own honesty comment says this note exists to close.
 *
 * WHY NOT COLLECT THEM INSTEAD: two more setup questions is a real product
 * change and the wrong end of the trade for a five-question setup. Naming the
 * stand-ins costs one sentence and is honest today.
 *
 * The rate is read from the profile rather than restated, so re-pricing
 * ASSUMED_REVOLVING_APR can never leave this line quoting the old number, and
 * the debt clause only appears when there IS a balance — resolveProfile sets
 * revolvingApr to 0 without one, and naming interest on a card the user does
 * not carry would be a new fiction rather than a disclosure of an old one.
 * extraDebtPayment's stand-in is 0, i.e. the app assumes nothing extra is
 * paid; that rides in the same clause as the rate because both only bite on a
 * carried balance. §7: fragments, under nine words, no adjectives.
 */
export function assumptionLine(profile: UserProfile): string {
  const parts = ['a one-month cash buffer']
  if (profile.revolvingApr > 0) {
    parts.push(`${Math.round(profile.revolvingApr * 100)}% on the card balance, with nothing paid extra`)
  }
  return `Assumed, not asked: ${parts.join('; ')}.`
}

export function SimCard({
  profile,
  isDemo,
  today,
  decisions,
  noteById,
  onRun,
  onClose,
  onCheckBack,
}: {
  profile: UserProfile
  /** True while the projection still runs on DEMO_PROFILE (setup incomplete). */
  isDemo: boolean
  /** The app's day, not a fresh clock read — see App: this card stamps the day
   *  a decision was run and labels it back, and a second clock source would let
   *  a row stamped the 4th render as "Today" on the 5th. */
  today: string
  decisions: Decision[]
  /**
   * THE ONLY WAY THIS CARD CAN NAME AN OBJECT: transaction id → the note the
   * user typed on that row. Notes only, and only for rows that have one.
   *
   * The record cannot name what was bought on its own — `txId` lands only when
   * the prefilled amount was logged unedited (App's pendingDecisionRef guards
   * on the amount), and `note` is optional forever. So the check-back degrades
   * honestly rather than inventing a name: the user's own words when they
   * exist, the amount and the day otherwise, and never a guess in either case.
   */
  noteById: ReadonlyMap<string, string>
  /** Persists the run. The line is frozen here and never recomputed (§12.5). */
  onRun: (run: { amountDA: number; line: string }) => void
  onClose: (id: string, outcome: Exclude<DecisionOutcome, 'open'>, amountDA: number) => void
  /** Files the check-back answer. Pays nothing and counts nothing (§12.1). */
  onCheckBack: (id: string, answer: CheckBackAnswer) => void
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

  function answerCheckBack(d: Decision, answer: CheckBackAnswer) {
    // FOCUS FIRST, same hazard as close(): the three buttons unmount on this
    // commit, and an unmounting focused element drops focus to <body> in
    // silence. Nothing hands focus on afterwards here — a check-back answer
    // starts no follow-up action — so it stays on the run button, which is
    // mounted at every state this card can be in.
    submitRef.current?.focus()
    onCheckBack(d.id, answer)
    // Names the object and the answer, and stops (§7.1). No praise on "still
    // using it", no consolation on "never used it" — the record has no
    // opinion about either, and it never says how many of each there are.
    const object = objectOf(d) ?? `${d.amountDA.toLocaleString()} DA`
    announceRecord(`${CHECK_BACK_LABEL[answer]}. ${object}. Recorded.`)
  }

  /** The user's own words for what this decision bought, or undefined. Never
      a fallback string — the callers decide what to say when there is none. */
  function objectOf(d: Decision): string | undefined {
    return d.txId === undefined ? undefined : noteById.get(d.txId)
  }

  // DUE QUESTIONS FIRST. The record reads top-down and this card is sixth in
  // the stack, so a question twenty rows down is a question nobody answers.
  // Array.prototype.sort is stable (ES2019), so inside each group the store's
  // canonical newest-first order is untouched.
  //
  // AND THAT IS THE WHOLE DISCOVERY MECHANISM IN v1, STATED RATHER THAN
  // SOLVED BADLY: a local-first app with no account has no push channel, so a
  // due check-back cannot chase the user. It is found by scrolling, and the
  // due count in the spec strip is the only other signal. Inventing a
  // notification to fix that would be a far bigger change than the mechanic.
  const ordered = useMemo(
    () =>
      [...decisions].sort(
        (a, b) =>
          (checkBackState(a, today) === 'due' ? 0 : 1) -
          (checkBackState(b, today) === 'due' ? 0 : 1),
      ),
    [decisions, today],
  )
  // The accent panel follows the newest RUN, not the top of the rendered list:
  // .sim-result marks the card's current projection, and a due row rising past
  // it must not take the one accent this card is allowed (§1 trait 06).
  const newestId = decisions.length > 0 ? decisions[0].id : null
  // A count of pending QUESTIONS, which is not a tally of ANSWERS — the thing
  // §12.6 forbids is counting what the answers were. Rendered only when there
  // is at least one, so the empty card never prints an "0 / n" index.
  const dueCount = useMemo(
    () => decisions.filter((d) => checkBackState(d, today) === 'due').length,
    [decisions, today],
  )

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
      {/* The due count rides in the spec strip, not in a badge of its own: it
          is wayfinding chrome, and every question it counts renders below with
          its own named group, so nothing is announced only here. */}
      <div className="window-bar mono" aria-hidden="true">
        DECISION_SIM.EXE{dueCount > 0 && ` · ${dueCount} DUE`}
      </div>
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
            : `Projected on your numbers. ${profile.monthlyIncome.toLocaleString()} DA/mo income. ${assumptionLine(profile)} Edit the rest in My numbers.`}
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
              {ordered.map((d) => {
                const money = `${d.amountDA.toLocaleString()} DA`
                const ran = dayLabel(d.date, today)
                const phase = checkBackState(d, today)
                const object = objectOf(d)
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
                    <p className={d.id === newestId ? 'sim-result decision-line' : 'decision-line'}>
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
                    {/* THE CHECK-BACK. Only a 'bought' row reaches any of the
                        three branches below — see checkBackState: waited and
                        resisted bought no object, so there is nothing to be
                        using or not using, and an open row has not said
                        anything happened yet. */}
                    {phase === 'scheduled' && (
                      /* THE HONEST COLD START, and it is the whole mitigation
                         (Trust Rule 5). This mechanic needs one closed
                         purchase plus fourteen days of real elapsed time, so a
                         day-1 user sees nothing — which is correct and must not
                         be papered over with a progress bar or an "0 / n".
                         What the app CAN honestly do is name a future it will
                         actually keep, from the moment the row closes. It says
                         when it will ask. It says nothing about what the answer
                         will tell you, because it does not know. */
                      <p className="decision-schedule">{scheduleLine(d, today)}</p>
                    )}
                    {phase === 'due' && (
                      /* Lead with the object, state the fact, stop (§7 rule 1).
                         There is deliberately no question mark and no verb of
                         judgement in this block: the elapsed count and the
                         object are the whole prompt, and the three peer buttons
                         supply the question. The evaluative version — "was it
                         worth it?" — asks the user to grade a past self, which
                         §12.6 forbids and App.test bans as a literal string. */
                      <div
                        className="decision-checkback"
                        role="group"
                        aria-label={`Check back: ${object ?? money}, bought ${
                          d.outcomeDate !== undefined ? dayLabel(d.outcomeDate, today) : ran
                        }`}
                      >
                        <p className="checkback-head">
                          {d.outcomeDate !== undefined
                            ? `${daysBetween(d.outcomeDate, today)} days on.`
                            : 'Some days on.'}
                        </p>
                        {/* The user's own words, verbatim, or nothing at all.
                            Never an invented name and never a category: the app
                            does not know what it was unless the note says. */}
                        {object !== undefined && (
                          <p className="checkback-object">{object}</p>
                        )}
                        <div className="decision-actions">
                          {CHECK_BACK_ANSWERS.map((a) => (
                            <button
                              key={a.answer}
                              type="button"
                              /* One class for all three — no colour split, no
                                 ✓/✗, no weight difference, and the order is not
                                 best-to-worst (§12.3 / §12.6). */
                              className="btn decision-btn"
                              onClick={() => answerCheckBack(d, a.answer)}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {phase === 'answered' && d.checkBack !== undefined && (
                      /* Filed, and nothing else happens. One class for every
                         answer, so no CSS can ever make one of the three read
                         as the right one. */
                      <p className="decision-checkback-answer">
                        {CHECK_BACK_LABEL[d.checkBack]}
                        {d.checkBackDate !== undefined &&
                          ` · ${dayLabel(d.checkBackDate, today)}`}
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
