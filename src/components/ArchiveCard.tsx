import { useMemo, useRef, useState } from 'react'
import type { Transaction } from '../state/store.ts'
import { dayLabel, ledgerWindow, monthToDate, resistedThisMonthDA } from '../engine/ledger.ts'
import { Glyph } from './Glyph.tsx'

/**
 * THE RECORD — the month so far and the days inside it, one archive surface.
 *
 * It was two cards (MTD—09, LDG—10), adjacent, standing on the same §5B spec
 * sheet, reading the same rows under the same rule (resists add 0 — written
 * once in monthToDate and once in groupTransactionsByDay, on purpose), and each
 * printing a near-identical scope disclosure one scroll apart: "Totals only. No
 * target, no projection." over "Totals only. No averages, no comparisons." Two
 * containers, two headings and two promises for one idea. One head, one scope
 * line, one card.
 *
 * WHAT IS ABSENT IS STILL THE DESIGN. No target line, no average, no run-rate,
 * no "at this pace", no colour scale, no verdict:
 *  - §12.5 — a month-to-date total and a day total are exact from day one; a
 *    projection off twelve days is confidence the app has not earned.
 *  - §12.3 / §12.6 — `UserProfile.budgeted` is real and must not surface here.
 *    This component is not given the profile, which is the structural half of
 *    that guarantee; the assertions in App.test are the other half.
 *  - §12.1 — nothing here reads XP, level, quests or badges. It is a money
 *    surface. That is also why the month strip is money-height and not a
 *    logged/not-logged grid: a binary grid is a streak calendar in a ledger's
 *    coat, and streaks belong to the other track.
 */

/**
 * Days rendered before the expand control. Whole DAYS, never a row count: a
 * part-rendered day would print a total its visible rows do not add up to.
 */
export const WINDOW_DAYS = 3

/**
 * Days ADDED per press of the expand control, and the reason it is a step
 * rather than "all of them".
 *
 * MEASURED at commit 73b9260's tree, jsdom, App mounted with a synthetic
 * ledger of 8 rows per day: one press of the old all-at-once expand rendered
 * 500 rows → 3,179 DOM nodes in 95ms; 2,000 rows → 11,378 nodes in 235ms;
 * 5,000 rows → 27,793 nodes in 625ms. jsdom does no layout or paint, so a
 * mid-range Android phone — the device this product is built for — pays that
 * again in style, layout and raster, from a single tap, with no way back
 * except a second render of the same size. The control invited the cliff:
 * it read "Show 622 earlier days" and meant it.
 *
 * After this change, same harness on THIS tree: 1,887 / 1,886 / 1,886 nodes
 * and 79 / 41 / 31ms — flat in the size of the record, which is the property
 * the old control did not have at any size.
 *
 * NOTHING IS HIDDEN by this. The window grows a run at a time and keeps
 * growing until it holds everything; the live region below names the real
 * total on every press, so the user is never told the record is smaller than
 * it is. A step of 30 is a month of days, which is the unit this card already
 * counts in ("Day 5 / 31").
 *
 * IT BOUNDS DAYS, NOT ROWS, and that is deliberate rather than an oversight —
 * see WINDOW_DAYS above: a part-rendered day would print a total its visible
 * rows do not add up to. A single day holding hundreds of rows still renders
 * whole. That trade is the one this card has always made.
 *
 * EXPORTED, WITH WINDOW_DAYS, BECAUSE THE README DESCRIBES THE DISCLOSURE.
 * A user-visible control that opens on N days and grows by M is two numbers in
 * prose, and this repo's rule is that a number in a claim is read from the code
 * rather than typed beside it (README.test.ts). Neither export is read by the
 * app outside this file.
 */
export const EXPAND_STEP_DAYS = 30

/**
 * Rows a day must EXCEED before its own rows start alternating too.
 *
 * CONSTRAINT §2.1b — "no single ground may run longer than one viewport", one
 * level below the day. The day stripe below breaks the archive's run per
 * `ledger-day`, which is the right unit right up until one day is longer than a
 * screen: the `dense` fixture puts 24 rows on one day, and one day is one
 * plate, so that day was a single ground longer than the viewport
 * (PROVENANCE: HISTORICAL — window @4872 read 24.53% field in light and 80.56%
 * in dark, the SAME window of the same DOM, in the artifact this change
 * replaced; that is the theme-twin check finding one defect twice, and neither
 * figure survives in docs/brand/census.json — @4872 now reads 54.52 / 41.15 and
 * 51.56 / 44.14). The composition walk structurally cannot see it: the day
 * plate is inset inside the card, so it fails the walk's full-bleed test and is
 * no NESTED ground. Only the window reading has it.
 *
 * SO A LONG DAY STRIPES ITS ROWS, in the day's OPPOSITE plate — a plate is the
 * ground's opposite, so one rule moves light and dark the right way at once,
 * which is §2.1b's own argument applied one level down.
 *
 * GATED, AND THE GATE IS MEASURED. An ungated rule fires on days that are not
 * runs — every `seeded` day holds one to four rows — and it adds ground where
 * the day stripe has already done the work. Measured on this tree with the gate
 * removed: `app.375x812.light.dense` goes from ONE band breach to TWO (its mean
 * Bone crosses the 36 limit, so the corridor is simply walked to the other end
 * rather than closed), `app.375x812.light.seeded.breakdown`'s mean deviation
 * goes 9.40 -> 11.14 on a row with no breach at all, and every seeded document
 * grows — 5605 -> 5629, 6816 -> 6842 — because short days are now paying for
 * plate boxes they did not need.
 * 8 is the gate because it is above every day the seeded matrix holds, so the
 * stripe cannot fire on a day that is not a run; and §2.1b's own derivation
 * puts a Bone run's floor at ~605px with the Flare gutters either side, which
 * a nine-row day is the first to reach.
 *
 * THE DUTY CYCLE IS ONE IN TWO, AND IT IS NOT TUNED. The two plates are duals,
 * so any duty cycle that pulls light's mean Bone down pushes dark's up by
 * almost the same amount, and the corridor that satisfies both means at once is
 * about half a point wide. Measured on this tree, both dense rows, with
 * everything else in this change applied:
 *
 *     1 in 2   light mean bone 34.96   dark mean bone 36.59  (dark 0.59 over)
 *     2 in 5   light mean bone 35.97   dark mean bone 35.59  (both inside, by
 *                                                             0.03 and 0.41)
 *
 * 2-in-5 closes one more waiver and it is REFUSED, because 0.03pp is not a
 * margin — it is the width of a re-wrap — and because a duty cycle chosen so a
 * mean lands inside a tolerance is §2.1b.1's forbidden move ("the answer was
 * not to relengthen the wall until the grid sampled somewhere kinder") with a
 * modulus instead of a paragraph. One in two is the stripe a ledger has always
 * had and the same alternation the day groups above already use. The 0.59pp
 * that stays is a DOCUMENT MEAN on a deliberately adversarial fixture, with all
 * nine of that row's windows inside the band; it is waived by name in
 * scripts/census/census.test.ts and the waiver states this trade.
 */
export const LONG_DAY_ROWS = 8

/**
 * The record's resisted line, in the card's own words.
 *
 * EXPORTED BECAUSE THE PITCH QUOTES IT. The landing's hand-off tells a stranger
 * that a resist "sums for the month" and then shows the line that sum lands in;
 * the README makes the same claim to whoever the repo link reaches. Both used to
 * type the sentence out. A control named by label is the one claim a rename
 * breaks in silence, and this string is a control's output — so the two claim
 * surfaces print this function's return value, over the same sample rows the
 * shot renders, and a reword here rewords both or fails README.test/Root.test.
 *
 * "resisted", not "kept": the app observed the tap, not the outcome (see the
 * chip below).
 */
export function resistedChipLabel(totalDA: number): string {
  return `${totalDA.toLocaleString()} DA resisted this month`
}

/* No historyDays prop, deliberately: the scope line below is a permanent
   property of this card, not a countdown, so nothing here reads the
   calibration clock. Trust Rule 5's 90-day threshold covers the SCORE — see
   HeroCard — and a day total is an exact fact from day one. */
export function ArchiveCard({
  transactions,
  today,
}: {
  transactions: Transaction[]
  today: string
}) {
  // How many day groups the window currently holds. POSITIVE_INFINITY once the
  // window is fully out, NOT totalDays: a number frozen at today's count
  // would silently re-collapse the oldest day the moment a new day was logged
  // under a fully-expanded list.
  const [limit, setLimit] = useState<number>(WINDOW_DAYS)
  // Mounted-empty live region content (see the region below). State, not
  // derived: the announcement is about the ACT of expanding, so it must change
  // exactly when the user toggles and never on an unrelated re-render.
  const [rangeNote, setRangeNote] = useState('')
  // Focus hand-off target. The collapse peer below exists only while the window
  // is partly out, so pressing it unmounts the button that was just pressed —
  // and an unmounting focused element drops focus to <body> in silence, the
  // same failure LogCard's undo strip and ProfileCard's save hand off to avoid.
  // Focus moves here first, onto the control that is mounted in every state.
  const moreRef = useRef<HTMLButtonElement>(null)

  // All three derivations below walk the ENTIRE ledger, and App re-renders this
  // card on every toast/XP-chip timer tick as well as on real changes — so each
  // is memoised on the only inputs it reads. Nothing about the output changes;
  // the scan just stops repeating for renders that changed neither.
  const month = useMemo(() => monthToDate(transactions, today), [transactions, today])
  // THE WINDOW IS PUSHED INTO THE DERIVATION, not taken as a slice off a fully
  // materialised record — see ledgerWindow, which carries the measurement. The
  // memo keys on `limit` as well, so growing the window re-scans; that press
  // already renders a run of days and pays far more in DOM than in the scan,
  // while the case this exists for — every logged purchase, and every toast /
  // XP-chip timer render — recomputes at WINDOW_DAYS or not at all.
  const { days: shown, totalDays } = useMemo(
    () => ledgerWindow(transactions, today, limit),
    [transactions, today, limit],
  )
  // "Resisted, not spent": resisted amounts compound into one visible number
  // instead of scattering per-row. Current calendar month, resists with a typed
  // amount only. A motivational mirror over self-reported data — deliberately
  // NOT a Health Score input (the two-track rule): the score reads financial
  // reality, this line reads the user's own resist story.
  // IN THE ENGINE, not inline here, because the landing's hand-off states this
  // figure for its sample rows — see resistedThisMonthDA. Same rule the day
  // totals and the month figures already follow: the marketing surface computes
  // with the app's derivations or it is a second implementation of them.
  const resistedDA = useMemo(
    () => resistedThisMonthDA(transactions, today),
    [transactions, today],
  )

  const hiddenDays = Math.max(0, totalDays - shown.length)
  // "Expanded" is now literally "nothing is left to show", which is what
  // aria-expanded has to mean: a partly-grown window is not a completed
  // disclosure, and reporting it as one would tell AT the list is whole.
  const expanded = hiddenDays === 0
  // What ONE more press adds — the label must promise exactly that and no more.
  const nextRun = Math.min(hiddenDays, EXPAND_STEP_DAYS)

  /** Grow the window by one run, or collapse it back to WINDOW_DAYS. */
  function setWindow(next: number) {
    setLimit(next)
    // Always names the REAL total, so a stepped window never implies the
    // record is smaller than it is.
    setRangeNote(
      next >= totalDays
        ? `Showing all ${totalDays} days.`
        : `Showing ${next} of ${totalDays} days.`,
    )
  }

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
    // spec-sheet: §5 layout B — see .spec-sheet in tokens.css for the field
    // arithmetic. This card is THE read-only surface in the tail now, and it is
    // what moves the page toward §2's 60% field floor. It used to be one of two
    // — the collection sheet stood below it and is deleted.
    <section className="card spec-sheet archive-card">
      {/* §11 corner mark. aria-hidden: printed spec, not content.
          The index is this card's real position in App's stack — App.test
          derives the whole run from render order, so inserting or merging a
          card fails the suite rather than silently printing a lie. */}
      <span className="spec-label" aria-hidden="true">ARC—07</span>
      {/* CONSTRAINT §2.1b — THE MONTH HALF TAKES THE READING PLATE, i.e. the
          opposite ground to the sheet it stands on, exactly as the day groups
          below it do. The day list alone left the archive's HEAD unbroken:
          the census committed at 12bbf5e read app.375x812.dark.seeded
          window @4060 at 45.42% field / 46.88% Bone (the row's worst, deviation
          33.76) and its light twin at 72.11 / 21.33 — the same window, the two
          themes as mirrors, because the first ~227px of this card is one ground
          in whichever theme you are in.
          WHAT IT ACTUALLY BOUGHT, READ OFF THE ARTIFACT COMMITTED AT dc529fb
          RATHER THAN OFF A CONSOLE LINE: that window now reads 67.96 / 25.29 in
          dark and 44.92 / 46.40 in light. The dark half is the result — 45.42
          -> 67.96, the mirror closed from the side that was short of field. The
          light half is not: at 44.92 / 46.40 it is that row's WORST window, at
          deviation 32.80, and it is inside the 35-80 band rather than fixed.
          This comment used to claim 61.04 / 32.50 and 56.83 / 34.91, which are
          in no committed artifact and would have told the next round the defect
          was closed. It is half closed, and the light tail is where the rest of
          it is.
          IT IS NOT PART OF THE DAY ALTERNATION and does not shift its phase:
          this is the card's head, the days are its body. Flipping the days to
          keep a strict head/day/day/day alternation was measured and is worse —
          window @4872 came back at 39.79% field / 53.63% Bone in dark, the
          row's new worst at deviation 47.30, because it halves the plate the
          tail is short of. Head plate then day 0 plate is a 430px field run
          with a 16px seam in it, inside §2.1b's derived ~702px limit.
          The .kept-chip inside is §1 trait 06's event, which a plate may carry
          (see .counter-plate in tokens.css); nothing here is accent-INKED. */}
      <div className="month-block reading-plate">
        <div className="month-head">
          {/* One head for the whole archive. "The record" rather than "This
              month": the card is the month figures AND the days under them, and
              naming it after half of itself is what left the ledger printing a
              second heading and a second promise one scroll down. */}
          <h2>The record</h2>
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
          {/* The resisted mirror moved up here from the ledger's own head when
              the two merged: it is a MONTH figure ("this month" is in its own
              words), so it belongs on the month line rather than over the day
              list. "resisted", not "kept": the verb names the user's ACTION,
              which the app observed — the tap happened. "Kept" asserts an
              outcome nothing here can verify, since this sums the prices of
              things the user says they did not buy. INDEX ROLL on the total. */}
          {resistedDA > 0 && (
            <span className="kept-chip mono index-roll" key={resistedDA}>
              {resistedChipLabel(resistedDA)}
            </span>
          )}
        </p>
        {/* Decoration, and aria-hidden for it — the same call BossCard's HP bar
            and the XP track make. The figures above are the data; a strip of
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
      </div>

      {/* Permanently mounted, and mounted EMPTY: screen readers announce text
          changes inside an existing live region, so a region that appears
          already holding its message is silent. Expanding is otherwise a
          purely visual event — aria-expanded flips, but the rows that arrived
          below the fold are never announced. */}
      <p className="sr-only" role="status" aria-label="Ledger range">{rangeNote}</p>
      {/* ONE EMPTY STATE, and the merge is what makes it one. The month card
          said "No record yet. That's fine." and the ledger said "Nothing logged
          yet. First log is +5 XP." — two lines saying the same thing, on one
          screen, in the totally-empty case (days is empty exactly when there
          are no rows at all, which also makes firstRecord null). The month
          note above is the survivor: it is §7's empty-state register, and the
          line it replaces carried an XP figure onto a money surface, which is
          the one thing App.test holds this card to (§12.1). */}
      {totalDays > 0 && (
        <>
          {/* Nested lists, not a flat run of rows: the day is the structure,
              so it is a list of days each owning a list of its own rows
              (§12.8 — real structure, announced as such).
              The days hang at h3 directly off this card's single h2, which is
              the other half of the merge: dropping the ledger's own "Recent"
              heading is what keeps the outline one level deep instead of
              pushing every day down to h4 for a sub-head that named the same
              rows the card is already about. */}
          <ul className="ledger-days" id="ledger-days">
            {/* CONSTRAINT §2.1b, the tail half of it: the archive is 957px of
                ONE ground (Espresso in light, Sand in dark) and owned two of
                the phone's seven windows outright — 89.12% and 92.09% field in
                light at tree 71b5608. Each day group takes the READING plate,
                the opposite ground to the sheet around it, so the tail
                alternates instead of running flat. Per DAY rather than per
                list: one plate over the whole list is itself a single ground
                running longer than a viewport, which is the defect the window
                band measures — plating every day was measured too and window
                @4872 came back at 59.58% Bone in light against the 55 band,
                87% of its rows being one plate. So the days ALTERNATE, which
                is also the oldest device a ledger has. See .reading-plate in
                tokens.css. */}
            {shown.map((day, i) => {
              /* The day's own ground: plated days are the READING ground, the
                 rest stand on the archive sheet (the counter ground). A row
                 stripe has to be that ground's OPPOSITE or it interrupts
                 nothing — inside a reading plate the opposite is the counter
                 plate, and on the bare sheet it is the reading plate.
                 CONSTRAINT §2.1b — see LONG_DAY_ROWS above for the gate and for
                 the run this breaks. */
              const dayPlated = i % 2 === 0
              const rowPlate = dayPlated ? 'counter-plate' : 'reading-plate'
              const stripeRows = day.rows.length > LONG_DAY_ROWS
              return (
              <li
                key={day.date}
                className={dayPlated ? 'ledger-day reading-plate' : 'ledger-day'}
              >
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
                  {day.rows.map((t, j) => (
                    <li
                      key={t.id}
                      className={stripeRows && j % 2 === 0 ? `tx ${rowPlate}` : 'tx'}
                    >
                      {/* A column, not a single span: the row stacks
                          what-it-was under the category. Both lines are plain
                          text inside the same <li>, so a screen reader reading
                          the row reads "Food, bread from the corner shop,
                          2,000 DA" as one item — the note is part of the row,
                          never a second landmark to navigate to (§12.8). */}
                      <span className="tx-what">
                        <span className="tx-cat">
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
                              {/* Yielded-impulse marker: factual, quiet, never a
                                  shame colour — the row already paid its normal XP.
                                  Uppercase in the dashed --spec badge family
                                  (.tx-impulse), like every other neutral status
                                  mark. */}
                              {t.impulseFlagged && <span className="tx-impulse">impulse</span>}
                            </>
                          )}
                        </span>
                        {/* Rendered only when it exists. No "no note" filler,
                            no prompt to add one, no dimmed placeholder: rows
                            logged before this field shipped are complete rows,
                            and a permanent gap where the note would go is a
                            nag (§12.3, §12.6). Plain ink, no emoji, no second
                            colour — it is the user's own words, not a verdict
                            (§7.4 / §8). */}
                        {t.note && <span className="tx-note">{t.note}</span>}
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
              )
            })}
          </ul>
          {(hiddenDays > 0 || limit > WINDOW_DAYS) && (
            <div className="ledger-controls">
              {/* A real focusable button, never a click-handling div, and the
                  SAME element across both states: swapping it for a different
                  control would unmount the node holding focus and strand the
                  keyboard user on <body>. */}
              <button
                type="button"
                className="btn ledger-more"
                ref={moreRef}
                aria-expanded={expanded}
                aria-controls="ledger-days"
                onClick={() =>
                  // POSITIVE_INFINITY on the press that reaches the end — see
                  // the `limit` state for why the fully-out window must not be
                  // pinned to today's day count.
                  setWindow(
                    expanded
                      ? WINDOW_DAYS
                      : limit + nextRun >= totalDays
                        ? Number.POSITIVE_INFINITY
                        : limit + nextRun,
                  )
                }
              >
                {expanded
                  ? 'Show fewer days'
                  : nextRun === 1
                    ? 'Show 1 earlier day'
                    : `Show ${nextRun} earlier days`}
              </button>
              {/* THE WAY BACK, and it only exists in the middle. With a stepped
                  window the single toggle above cannot offer both moves at
                  once: three runs in, "Show fewer days" is not what the next
                  press does. Without this peer a user who had grown the window
                  could only collapse it by first expanding all the way — i.e.
                  by paying the exact render the step exists to avoid. */}
              {!expanded && limit > WINDOW_DAYS && (
                <button
                  type="button"
                  className="btn ledger-more"
                  onClick={() => {
                    // FOCUS FIRST: this button unmounts on the next commit.
                    moreRef.current?.focus()
                    setWindow(WINDOW_DAYS)
                  }}
                >
                  Show fewer days
                </button>
              )}
            </div>
          )}
        </>
      )}
      {/* ONE SCOPE LINE for the whole archive, and the merge is what makes it
          one: the month card promised "No target, no projection." and the
          ledger promised "No averages, no comparisons." one scroll below, two
          statements of the same commitment that a reader had to assemble.

          It is the card's SCOPE, not a calibration state, so it needs no
          threshold gate and carries no "yet" — the app has committed never to
          average or project, and App.test enforces exactly that with a text
          assertion. It rides permanently rather than with the list, because
          the month figures above it are always rendered. */}
      <p className="calibrating">Totals only. No targets. No averages. No projections.</p>
    </section>
  )
}
