import { useMemo, useState } from 'react'
import type { Transaction } from '../state/store.ts'
import { groupTransactionsByDay } from '../engine/ledger.ts'
import { Glyph } from './Glyph.tsx'

/**
 * Days rendered before the expand control. Whole DAYS, never a row count: a
 * part-rendered day would print a total its visible rows do not add up to.
 */
const WINDOW_DAYS = 3

/* No historyDays prop, deliberately: the scope line below is a permanent
   property of this card, not a countdown, so nothing here reads the
   calibration clock. Trust Rule 5's 90-day threshold covers the SCORE — see
   HeroCard — and a day total is an exact fact from day one. */
export function Ledger({
  transactions,
  today,
}: {
  transactions: Transaction[]
  today: string
}) {
  const [expanded, setExpanded] = useState(false)
  // Mounted-empty live region content (see the region below). State, not
  // derived: the announcement is about the ACT of expanding, so it must change
  // exactly when the user toggles and never on an unrelated re-render.
  const [rangeNote, setRangeNote] = useState('')
  // "Kept, not spent": resisted amounts finally compound into one visible
  // number instead of scattering per-row. Current calendar month, resists
  // with a typed amount only. A motivational mirror over self-reported data —
  // deliberately NOT a Health Score input (the two-track rule): the score
  // reads financial reality, this line reads the user's own resist story.
  //
  // Both derivations below walk the ENTIRE ledger to render at most eight
  // rows, and App re-renders this card on every toast/XP-chip timer tick as
  // well as on real changes — so they are memoised on the only two inputs
  // they read. Nothing about the output changes; the scan just stops
  // repeating for renders that changed neither.
  const month = today.slice(0, 7)
  const keptDA = useMemo(
    () =>
      transactions
        .filter((t) => t.resistedImpulse && t.amountDA > 0 && t.date.slice(0, 7) === month)
        .reduce((s, t) => s + t.amountDA, 0),
    [transactions, month],
  )
  const days = useMemo(() => groupTransactionsByDay(transactions, today), [transactions, today])
  const hiddenDays = Math.max(0, days.length - WINDOW_DAYS)
  const shown = expanded ? days : days.slice(0, WINDOW_DAYS)
  return (
    <section className="card ledger-card">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">LDG—09</span>
      <div className="ledger-head">
        <h2>Recent</h2>
        {/* INDEX ROLL (§9 move 4): the kept total clicks up with each resist. */}
        {/* "resisted", not "kept": the verb names the user's ACTION, which the
            app observed — the tap happened. "Kept" asserts an outcome nothing
            here can verify, since this sums the prices of things the user says
            they did not buy, and the chip's accent plate makes it the loudest
            number on a card whose measured figures sit in plain ink. Same
            vocabulary as the landing's figcaption ("shows what it avoided").
            The styling is not the fix; the noun was. */}
        {keptDA > 0 && (
          <span className="kept-chip mono index-roll" key={keptDA}>
            {keptDA.toLocaleString()} DA resisted this month
          </span>
        )}
      </div>
      {/* Permanently mounted, and mounted EMPTY: screen readers announce text
          changes inside an existing live region, so a region that appears
          already holding its message is silent. Expanding is otherwise a
          purely visual event — aria-expanded flips, but the rows that arrived
          below the fold are never announced. */}
      <p className="sr-only" role="status" aria-label="Ledger range">{rangeNote}</p>
      {days.length === 0 ? (
        <p className="empty">Nothing logged yet. First log is +5 XP.</p>
      ) : (
        <>
          {/* Nested lists, not a flat run of rows: the day is the structure,
              so it is a list of days each owning a list of its own rows
              (§12.8 — real structure, announced as such). */}
          <ul className="ledger-days" id="ledger-days">
            {shown.map((day) => (
              <li key={day.date} className="ledger-day">
                {/* h3, under the card's own h2 — the page keeps its single h1
                    wordmark and the outline gains a real day level. The total
                    sits INSIDE the heading on purpose: a screen-reader user
                    jumping by heading hears "Today, spent 1,500 DA" and has
                    the answer without reading the rows. */}
                <h3 className="day-head">
                  {/* The space between the two spans is load-bearing for
                      assistive tech and free for the eye: without it the
                      heading's text is "TodaySpent 650 DA", and a whitespace-
                      only run creates no flex item, so the layout gap is
                      unaffected. */}
                  <span className="day-label">{day.label}</span>{' '}
                  {/* A day total is a fact and stops there (§12.3/§12.6): no
                      red/green, no budget comparison, no "high day". §12.5:
                      no average, no "vs your usual", no trend arrow — those
                      need history the user does not have yet, which is
                      exactly the unearned confidence Trust Rule 5 forbids.
                      INDEX ROLL (§9 move 4) on the changed value. */}
                  <span className="day-total mono index-roll" key={day.spentDA}>
                    Spent {day.spentDA.toLocaleString()} DA
                  </span>
                </h3>
                <ul className="tx-list">
                  {day.rows.map((t) => (
                    <li key={t.id} className="tx">
                      <span>
                        {/* aria-hidden mark, matching the mute button and stage
                            flame — screen readers must not read "shield Resisted";
                            the word beside it is the alternative. It is also why
                            a resist is distinguished by the WORD and never by
                            colour alone (§12.8). */}
                        {t.resistedImpulse ? (
                          <>
                            {/* .mark: §1 trait 01 — the shield sits in a keyline
                                badge instead of floating in the row. */}
                            <span className="mark" aria-hidden="true">
                              <Glyph name="shield" />
                            </span>{' '}
                            Resisted
                          </>
                        ) : (
                          <>
                            {t.category}
                            {/* Yielded-impulse marker: factual, lowercase, never a
                                shame color — the row already paid its normal XP. */}
                            {t.impulseFlagged && <span className="tx-impulse">impulse</span>}
                          </>
                        )}
                      </span>
                      {/* INDEX ROLL (§9 move 4): a new row's amount indexes in. */}
                      <span className="mono index-roll">
                        {/* A resist logged with a typed amount records what the tap
                            avoided spending — shown, not silently dropped. */}
                        {t.resistedImpulse
                          ? t.amountDA > 0
                            ? `${t.amountDA.toLocaleString()} DA avoided`
                            : '—'
                          : `${t.amountDA.toLocaleString()} DA`}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {hiddenDays > 0 && (
            // A real focusable button, never a click-handling div, and the
            // SAME element across both states: swapping it for a different
            // control would unmount the node holding focus and strand the
            // keyboard user on <body>.
            <button
              type="button"
              className="btn ledger-more"
              aria-expanded={expanded}
              aria-controls="ledger-days"
              onClick={() => {
                const next = !expanded
                setExpanded(next)
                setRangeNote(
                  next
                    ? `Showing all ${days.length} days.`
                    : `Showing ${WINDOW_DAYS} of ${days.length} days.`,
                )
              }}
            >
              {expanded
                ? 'Show fewer days'
                : hiddenDays === 1
                  ? 'Show 1 earlier day'
                  : `Show ${hiddenDays} earlier days`}
            </button>
          )}
          {/* The card's SCOPE, not a calibration state — and the difference is
              why this line changed. It used to read "Nothing averaged yet."
              beside a "Day n / 90" index, which promises averages on day 90.
              None are coming: App.test asserts this card's text never matches
              /on average|your usual|trend|compared/, so the copy was
              advertising a feature the suite forbids. A day total is also an
              exact fact from day 1, so a 90-day counter on it made accurate
              figures look provisional — CALIBRATION_DAYS is Trust Rule 5's
              threshold for the SCORE, and the ledger is not scoring anything.
              Stated as a permanent property, it needs no threshold gate
              either; it rides with the list, and there is nothing to scope
              while nothing is logged. */}
          <p className="calibrating">Totals only. No averages, no comparisons.</p>
        </>
      )}
    </section>
  )
}
