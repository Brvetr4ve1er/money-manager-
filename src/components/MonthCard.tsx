import { useMemo } from 'react'
import type { Transaction } from '../state/store.ts'
import { dayLabel, monthToDate } from '../engine/ledger.ts'

/**
 * THE MONTH SO FAR — the app's time-blindness instrument.
 *
 * Before this card the product had exactly two time structures: the boss's
 * Mon–Sun week and the ledger's day headings. A user knew what today cost and
 * had no idea where they were in the month or what the month had looked like.
 *
 * Three exact facts and a shape, and nothing else:
 *   Day 4 / 31 · 18,400 DA logged · 27 days left
 * plus one cell per calendar day, cell height = that day's spend.
 *
 * What is absent is the design. No target line, no average, no run-rate, no
 * "at this pace", no colour scale, no verdict:
 *  - §12.5 — a month-to-date total is exact from day one; a projection off
 *    twelve days is confidence the app has not earned.
 *  - §12.3 / §12.6 — `UserProfile.budgeted` is real and must not surface here.
 *    This component is not given the profile, so it cannot regress into one.
 *  - §12.1 — nothing here reads XP, level, quests or badges. It is a money
 *    surface. That is also why the strip is money-height and not a
 *    logged/not-logged grid: a binary grid is a streak calendar in a ledger's
 *    coat, and streaks belong to the other track.
 */
export function MonthCard({
  transactions,
  today,
}: {
  transactions: Transaction[]
  today: string
}) {
  // Memoised for the same reason the Ledger's derivations are: App holds the
  // toast queue and the +XP chip in state, so every grant schedules two more
  // renders of this whole tree in which neither input changed — and this one
  // walks the ledger and builds 31 objects.
  const month = useMemo(() => monthToDate(transactions, today), [transactions, today])

  // Singular/plural, and the last day of the month is not "0 days left".
  const left =
    month.daysLeft === 0
      ? 'Last day.'
      : month.daysLeft === 1
        ? '1 day left.'
        : `${month.daysLeft} days left.`

  /* The record window, in words. This is the card's sharpest cold-start
     problem and the fix has to live in the TEXT, not only in the pixels: on
     install day the month is half over, and a strip whose first eleven cells
     are empty reads as "you spent nothing for eleven days" when the truth is
     that Ember was not here. "Blank, not zero" is the whole distinction, so it
     is stated rather than drawn. No note at all once the record covers the
     month — a permanent line about a boundary that has passed is clutter. */
  const firstRecordDay =
    month.firstRecord !== null && month.firstRecord.slice(0, 7) === month.month
      ? Number(month.firstRecord.slice(8, 10))
      : null
  const note =
    month.firstRecord === null
      ? // §7 empty-state voice, and non-punitive: nothing is missing, the app
        // simply has nothing yet.
        "No record yet. That's fine."
      : firstRecordDay !== null && firstRecordDay > 1
        ? `Record starts ${dayLabel(month.firstRecord, today)}. Days before it are blank, not zero.`
        : null

  return (
    // spec-sheet: §5 layout B, extended to the whole archive half of the stack
    // — see .spec-sheet in tokens.css for the field arithmetic. This card and
    // the ledger below it are read-only surfaces like the codex and the badge
    // shelf, and they are what moves the page across §2's 60% field floor.
    <section className="card spec-sheet month-card">
      {/* §11 corner mark. aria-hidden: printed spec, not content.
          The index is this card's real position in App's stack (9th of 12) —
          App.test derives the whole run from the render order, so inserting a
          card fails the suite rather than silently printing a lie. */}
      <span className="spec-label" aria-hidden="true">MTD—09</span>
      <div className="month-head">
        <h2>This month</h2>
        {/* §1 trait 10 — the fractional index as decorative truth-telling,
            except it is not decorative here: "where am I in the month" is
            half the feature. NOT index-rolled: §9 move 4 is for a numeral the
            user's action moves, and this one ticks over at midnight with
            nobody watching. */}
        <span className="month-index mono">Day {month.dayOfMonth} / {month.daysInMonth}</span>
      </div>
      <p className="month-facts">
        {/* "logged", not "spent". Every amount in Ember is typed by hand, so
            the honest claim is what the user recorded — the app cannot see the
            rest and must not imply it did. INDEX ROLL (§9 move 4) on the one
            numeral a log moves; dropped to a plain value change under
            prefers-reduced-motion by the gate on .index-roll. */}
        <span className="month-spend mono index-roll" key={month.spentDA}>
          {month.spentDA.toLocaleString()} DA logged
        </span>
        <span className="month-left">{left}</span>
      </p>
      {/* Decoration, and aria-hidden for it — the same call BossCard's HP bar
          and XpCard's track make. The figures above are the data; a strip of
          31 cells would otherwise add 31 announcements and a second
          progressbar/meter to the page for a quantity AT users already have as
          text. The record-window distinction it draws is carried in words by
          .month-note below, which is why hiding it costs nothing. */}
      <div className="month-strip" aria-hidden="true">
        {month.days.map((d) => (
          <span key={d.date} className={`month-cell is-${d.state}`}>
            {/* Skipped entirely at 0, like .xp-fill and .boss-fill: a
                zero-height box with a border would draw a phantom sliver on a
                day nothing happened. The 6% floor keeps a real but tiny day
                visible — a 40 DA day beside a 40,000 DA one rounds to nothing
                otherwise, and a day that happened must not render as a day
                that did not. */}
            {d.spentDA > 0 && month.maxDayDA > 0 && (
              <span
                className="month-bar"
                style={{ height: `${Math.max(6, (d.spentDA / month.maxDayDA) * 100)}%` }}
              />
            )}
          </span>
        ))}
      </div>
      {note && <p className="month-note">{note}</p>}
      {/* The card's scope, stated as a permanent property — same register and
          same class as the ledger's line, because it is the same promise about
          a different figure. "No target" is the load-bearing half: this card
          is exactly where a budget line would first try to appear. */}
      <p className="calibrating">Totals only. No target, no projection.</p>
    </section>
  )
}
