import { useMemo, type ReactNode } from 'react'
import { Monogram } from './Monogram.tsx'
import { Wordmark } from './Wordmark.tsx'
import { ArchiveCard, resistedChipLabel } from './ArchiveCard.tsx'
import { NO_SCORE_LINE } from './HeroCard.tsx'
import { resistedThisMonthDA, WEEK_DAYS } from '../engine/ledger.ts'
import {
  todayISO,
  NOTE_MAX_LEN,
  DECISION_ANSWERS,
  DECISION_MAX,
  CHECK_BACK_ANSWERS,
  CHECK_BACK_DAYS,
} from '../state/store.ts'
import { NOTE_DENOMINATIONS_DA } from '../engine/keypad.ts'
import { CALIBRATION_DAYS } from '../engine/profile.ts'
import { RESIST_LABEL } from './LogCard.tsx'
import { sampleLedgerRows } from '../content/sampleLedger.ts'

/**
 * THE MARKETING SURFACE — the cold-start gate.
 *
 * Shown ONLY to a browser that has never run Ember (see Root.tsx). It is not a
 * second app and not a route: it is the other half of one mutually-exclusive
 * render, so there is never a moment where both this and the app shell exist.
 * Three consequences, all load-bearing:
 *
 *   1. ONE h1. App.test asserts exactly one level-1 heading whose textContent
 *      is 'Ember'. Whichever surface is mounted owns it, and both take it from
 *      the same <Wordmark> (see Wordmark.tsx) so they cannot drift apart.
 *   2. NO LIVE REGIONS EXPOSED HERE. App's two role="status" regions must mount
 *      with the app and stay mounted (announce-on-change). Entering the app
 *      mounts them once and nothing ever unmounts them — this surface is left
 *      behind, not stacked above. The product shot below mounts a real <ArchiveCard>,
 *      which carries a region of its own; the shot sits inside aria-hidden, so
 *      no live region on this page is ever exposed to a screen reader.
 *   3. NO SCORE, NO STAGE, NO READING OF ANYBODY. A stranger has logged
 *      nothing, so there is nothing to report about them, and this page reports
 *      on nobody: no score, no stage, no gauge, no projection. Trust Rule 5.
 *      That is a narrower rule than "no numbers", and the narrowing is
 *      deliberate — see THE PRODUCT SHOT below.
 *
 * VOICE. §7 rule 2 wants sentences under nine words, fragments preferred, and
 * the lede is the split form of the positioning line for that reason: "Runs on
 * your phone. Not on your bank." The metadata surfaces (index.html <title>,
 * og:title, the manifest name, package.json) deliberately keep the unsplit
 * sentence — they arrive with no page around them and have to name the
 * category before they name the differentiator. That is a recorded exemption,
 * not an oversight; it does not need re-litigating on the next voice pass.
 *
 * EVERY CLAIM MAPS TO SHIPPED CODE. The spec-sheet grid names the mechanics
 * that exist today (healthScore.ts, the resist path in reducer.ts + ArchiveCard's
 * resisted chip, simulator.ts, the decision record in store.ts + SimCard,
 * boss.ts, monthToDate + ArchiveCard, and the row note in
 * store.ts/LogCard/ArchiveCard); the rules band restates the Trust Rules the
 * engines already keep. Nothing here is a roadmap item sold as shipped — if a
 * line stops being true, delete the line, not the qualifier. README.test.ts
 * holds the README's copy of this grid to the same source.
 *
 * EVERY CLAIM THAT CAN BE BOUND IS BOUND rather than typed, because those are
 * the ones that rot first — and the list is deliberately not given a COUNT,
 * because the count is itself a typed claim and it was already wrong twice
 * (it read "six" through the check-back's two bindings). Bound today:
 *   · the note-key strip renders FROM NOTE_DENOMINATIONS_DA
 *   · the note's length claim reads NOTE_MAX_LEN
 *   · the record's three answers are DECISION_ANSWERS — the very array
 *     SimCard's buttons render — and its depth reads DECISION_MAX
 *   · the check-back's answers and horizon are CHECK_BACK_ANSWERS /
 *     CHECK_BACK_DAYS
 *   · the grid's count is the length of MECHANICS (stated in the lede AND in
 *     every index label)
 *   · the hand-off above the fold prints its row's index INTO that same grid,
 *     and quotes LogCard's RESIST_LABEL for the button it tells you to press
 *   · the hand-off's one figure is resistedChipLabel(resistedThisMonthDA(…))
 *     over the shot's own rows — the record's line, printed by the record's
 *     code, so the fold and the screenshot under it cannot disagree
 *   · the fold's terms block reads WEEK_DAYS for the window that stands in for
 *     the score, and the grid's first badge reads it too — and that badge
 *     quotes NO_SCORE_LINE, HeroCard's own pre-setup disclosure, verbatim
 *   · the product shot is rendered BY <ArchiveCard> itself
 * Change a denomination, either cap, an answer, a horizon, the roster, that
 * button or that card and this page changes with them.
 *
 * THE PRODUCT SHOT. This page used to argue that no screenshot was possible,
 * on the grounds that the only thing available to show was a demo profile's
 * numbers and that presenting fabricated figures as a product shot inverts
 * Trust Rule 5. Half of that still holds and half of it was too wide. What
 * Trust Rule 5 forbids is projecting CONFIDENCE the app has not earned — a
 * score, a stage, a trend, a verdict about a person. A card holding seven
 * sample rows makes no such claim: it states what the app looks like, it is
 * captioned as sample rows in those words, and it is the surface in the app
 * that reads as pure structure. It is rendered by the real component through
 * the real engines (so it cannot drift), and the card's own scope line
 * ("Totals only. No targets. No averages. No projections.") is IN the shot
 * rather than cropped out of it.
 *
 * THE SHOT GROWS WITH THE PRODUCT, AND THAT IS THE RULE. When a feature is
 * worth claiming here, it gets shown by the shipped component rather than
 * described in a sentence beside it. The month head and the day-grouped ledger
 * used to be two cards and are one now (<ArchiveCard>, one h2, one scope line),
 * so the shot is one frame instead of a stack — the page followed the app, not
 * the other way round. The row note arrived the same way, as data on the sample
 * rows instead of as an adjective in the caption: three of the seven rows carry
 * one, four do not, because the field is optional and a shot where every row
 * had one would advertise a required field.
 *
 * WHERE THAT RULE HAS A LIMIT, STATED. The decision record is claimed in the
 * grid below and is NOT shown, because it cannot be: it lives inside <SimCard>,
 * which always mounts its amount field and Run button (an unanswered row adds
 * three more), and the shot is aria-hidden, where a focusable node is a
 * keyboard trap with no accessible name — Root.test asserts the shot holds
 * none. Splitting the record out to show it would put the engine and the
 * surface that remembers it in two places, which is the thing SimCard exists
 * to avoid. So the claim is bound the other way instead: it prints
 * DECISION_ANSWERS, the array SimCard renders its buttons from.
 *
 * LAYOUT (§5 signature layouts, in order down the page):
 *   A. THE BRICK WALL — full-bleed Flare, one centred container, 60% negative
 *   B. THE SPEC SHEET — the live product shot, then 4-up badges on Espresso
 *   D. THE SHEAR      — one 38° Flare band splitting the canvas
 *   E. THE OBJECT     — the mark alone, hard-lit, dead-centre on flat Flare
 *   C. THE PLATE      — footer as a subway lockup on Marigold, hard keyline
 *
 * CONTRAST (§2.1, computed not assumed — this is the layout constraint, not a
 * checkbox). Bone-on-Flare is 3.01:1 and Graphite-on-Flare is 3.79:1: BOTH
 * FAIL AA for body text. So on a Flare field only the d1 wordmark, the mark and
 * the keylines sit directly on the colour. Every string under 24px on this page
 * sits on a Bone plate (11.4:1), an Espresso ground (13.4:1), a Graphite plate
 * (11.4:1), Sand (9.4:1) or Marigold (6.2:1). That rule is what produces the
 * plate-and-field composition.
 */

/** §5B, captioned with mono index labels (§1 trait 10). The length is the app's
    real mechanic count — the denominator is a count, not a decoration, and the
    section lede reads it too so the word and the grid cannot disagree. */
export const MECHANICS: ReadonlyArray<{ title: string; body: ReactNode }> = [
  {
    title: 'Health score',
    // THE BADGE THAT WENT HALF-TRUE WHEN THE FIRST RUN CHANGED. This row read
    // "Five components. Shrunk for thin data…" and stopped, which described the
    // app AFTER setup and described nothing at all before it. Card 01 no longer
    // prints a stage, a rating or a numeral while `profile` is null — every
    // input would be DEMO_PROFILE's invented income (HeroCard's hasScore) — and
    // prints the last WEEK_DAYS days of the user's own record in its place
    // (weekToDate). A grid row that names only the half a stranger will not
    // reach for weeks is the drift this page's whole discipline is against.
    // WEEK_DAYS is read, like every other number here.
    // THE EVIDENCE FOR THE FOLD'S TERMS BLOCK LIVES HERE, not up there. The
    // disclosure is quoted VERBATIM off HeroCard's own NO_SCORE_LINE — the page
    // prints the app's own words or it prints nothing — and the fold's block
    // states the terms without it, because 62 words above .lp-share pushed the
    // mechanic's lead under the 812px fold and 40 did not (see .lp-grade).
    body: (
      <>
        No score until your own numbers are in. Your last {WEEK_DAYS} days stand
        there, and the card says so: &ldquo;{NO_SCORE_LINE}&rdquo; Then: five
        components, shrunk for thin data. It explains; it never advises.
      </>
    ),
  },
  {
    title: 'The resist',
    // "Never fed into the score" was false: profile.ts counts capped resists
    // and yielded impulses and feeds both to impulseControlScore, one of the
    // five weighted health components. Only the kept-DA TOTAL is excluded
    // (ArchiveCard.tsx). The claim is scoped to the thing that is actually
    // excluded — on a page whose whole subject is the trust boundary, this is
    // the one badge that must not overstate it.
    // "Resisted", not "Kept", matching the chip it describes: the app observed
    // the tap, not the outcome — see the chip in ArchiveCard.tsx.
    body: 'Resisted, not spent. Summed for the month. The total is not a score input.',
  },
  {
    title: 'The simulator',
    body: 'Baseline against scenario. States the tradeoff. Never the verdict.',
  },
  {
    title: 'The record',
    // THE FEATURE THAT LANDED WITHOUT A CLAIM. Every run the simulator makes is
    // now persisted with the exact line it printed, frozen (§12.5 — store.ts
    // never recomputes `line`), and answered later with one of three peer
    // buttons. The labels are READ from DECISION_ANSWERS, like the note cap and
    // the cash keys below: the page prints the app's own words or it prints
    // nothing. So is the CAP: "every run kept" was false — DECISION_MAX bounds
    // the record and canonicalDecisions drops from the oldest end on every
    // write — and a cap is precisely the kind of number this file's own rule
    // says must be read from the code rather than typed beside it.
    // The last clause is the trust boundary, and it is the load-bearing half:
    // SimCard holds no bought-vs-waited tally, so the record cannot become a
    // scoreboard of the user's character (§12.6). "Kept, not scored" would be
    // the overstatement — a resist answered here writes an ordinary capped
    // resist row, which impulseControlScore does read.
    body: (
      <>
        The last {DECISION_MAX} runs kept, with the line each printed.{' '}
        {DECISION_ANSWERS.map((a) => a.label).join(' · ')}. Answers, never a
        tally.
      </>
    ),
  },
  {
    title: 'The check-back',
    // THE ONE MECHANIC IN THE PRODUCT THAT SPANS WEEKS. Every "Bought it" row
    // used to be a dead end; CHECK_BACK_DAYS after it closes, the record asks
    // one factual question about the object and files the answer beside the
    // projection it froze on the day.
    // The labels are READ from CHECK_BACK_ANSWERS, like DECISION_ANSWERS above
    // and the cash keys below: the page prints the app's own words or nothing.
    // So is the horizon — CHECK_BACK_DAYS, not a typed 14.
    // The last clause is the trust boundary and it is the load-bearing half.
    // The obvious version of this feature asks "was it worth it?", which grades
    // a past self (§12.6) — and the obvious follow-on counts the answers, which
    // is a verdict about the user's character one step removed. Neither ships:
    // there is no tally of these three anywhere in the product, and answering
    // pays no XP and touches no health component.
    body: (
      <>
        {CHECK_BACK_DAYS} days after &ldquo;Bought it&rdquo;, one question about
        the object. {CHECK_BACK_ANSWERS.map((a) => a.label).join(' · ')}. Filed,
        never counted.
      </>
    ),
  },
  {
    title: 'The monster',
    // "Last week's spend is its HP" was drift, wrong on both halves. boss.ts
    // makes THIS week's discretionary spend the HP and LAST week's the line to
    // stay under (BossBattle.thisWeekSpend / .lastWeekSpend), and essential
    // categories never feed it unless the row was flagged an impulse. The
    // corrected line is the only claim on this page that changed meaning
    // rather than gaining detail.
    body: "This week's discretionary spend is its HP. Last week's is the line. Beatable, never shaming.",
  },
  {
    title: 'The month so far',
    // Every clause is a field of MonthSoFar (ledger.ts): dayOfMonth /
    // daysInMonth, spentDA, daysLeft, days[]. The two refusals are the card's
    // own scope line, and they are the load-bearing half of the badge: this is
    // exactly the surface where a budget bar tries to appear, and ArchiveCard is
    // never handed the profile, so `budgeted` cannot reach it.
    body: 'Day index, month total, days left, one bar per day. No target line. No projection.',
  },
  {
    title: 'The note',
    // NOTE_MAX_LEN is read, not typed. "Unpaid" is the two-track rule at the
    // smallest scale: logExpense grants +5 whether or not a note was written,
    // asserted at the reducer and through the UI in both directions. "Never
    // asked for twice" is ArchiveCard rendering nothing at all for an empty note —
    // no placeholder, no prompt, no nag.
    // §11: all numerals render in the mono stack, so the one numeral in this
    // sentence is scoped to its own run — the same split .lp-notes-keys and the
    // app's .calibrating make.
    body: (
      <>
        <span className="lp-count">{NOTE_MAX_LEN}</span> characters on any row, in
        your words. Optional, unpaid, never asked for twice.
      </>
    ),
  },
]

/**
 * THE HAND-OFF — the single reason someone forwards this, named as a row of
 * the grid above rather than as a paragraph of its own words.
 *
 * WHY IT IS AN INDEX AND NOT A SENTENCE. The app has had five rounds of
 * engineering and the pitch had one, and the failure mode of a pitch is not
 * that it is dull — it is that it outlives the thing it sells. So the fold's
 * reason is a LOOKUP into MECHANICS: the hero cannot advertise a mechanic the
 * spec sheet does not ship, and deleting `The resist` from that roster leaves
 * `HAND_OFF_ROW` at -1, which Root.test fails on rather than shipping a fold
 * that sells a deleted feature. The printed `02/08` is the same decorative
 * truth-telling as the grid's own labels (§1 trait 10) doing real work: it
 * tells a reader the claim has a spec-sheet row, and where.
 *
 * WHY THE RESIST AND NOT ANOTHER ROW. It is the only mechanic here a
 * bank-linked tracker cannot do AT ALL — a feed sees money that moved, and
 * this row is money that did not. Every other row on the grid is something a
 * competitor could ship next quarter.
 */
const HAND_OFF_TITLE = 'The resist'
const HAND_OFF_ROW = MECHANICS.findIndex((m) => m.title === HAND_OFF_TITLE)

/**
 * The lead sentence, exported because the README prints the same one.
 *
 * The pitch exists in two documents — this page for a stranger, README.md for
 * whoever the repo link reaches — and the second copy of anything is the copy
 * that rots (that is README.test.ts's whole thesis). This is the one sentence
 * both of them lead with, so it is one string, asserted into the README rather
 * than typed there. §7 rule 1: lead with the object.
 */
export const HAND_OFF_LEAD = 'Ember logs the thing you did not buy.'

/** The Trust Rules (§12) as the manifesto they are, in the Fabricator register.
    Each one is enforced somewhere in src/engine — this list is a mirror of the
    code, not a promise about it.

    THE HORIZON IS READ, NOT TYPED, for the reason the header states: every
    claim that CAN be bound is bound, because typed ones rot first. Trust Rule
    5's number is CALIBRATION_DAYS in engine/profile.ts, and HeroCard already
    renders it as "Day N / 90"; this page said "Under 90 days" as a literal, so
    the day the constant moved the poster would have gone on promising the old
    horizon. ReactNode rather than string, the same shape MECHANICS already
    takes, and the key is an id rather than the text so an interpolated line
    still has a stable one. */
const RULES: ReadonlyArray<{ id: string; body: ReactNode }> = [
  {
    id: 'two-tracks',
    body: 'XP measures showing up. The score measures money. One never feeds the other.',
  },
  { id: 'no-pay-to-win', body: 'Nothing is for sale. Every badge and companion is earned.' },
  { id: 'honesty', body: '"I bought it anyway" logs at full XP. Honesty is never punished.' },
  {
    id: 'cold-start',
    // TWO HALVES NOW, BECAUSE THE ENGINE GREW THE FIRST ONE. This rule read
    // only the calibration clause, which is what the app says once a score
    // EXISTS. Before setup there is no score to qualify: HeroCard withholds the
    // stage, the rating and the numeral outright rather than disclaiming them,
    // and HeroShell withholds the same three on the desktop plate so the
    // withholding does not stop at a breakpoint. A rules list is a mirror of
    // the code (see the block comment above); the code moved and this line had
    // not. Both numbers are read, never typed.
    body: (
      <>
        No score until your numbers are in. Under {CALIBRATION_DAYS} days it
        says it is still calibrating.
      </>
    ),
  },
  {
    // TRUST RULE 6, THE CLAUSE THAT HAD NO LINE. The rules band listed the two
    // tracks, the absence of a purchase path, the honesty rule, the cold start
    // and export — and said nothing about the one device every app in this
    // category ships and this one refuses. It is an invariant like the rest:
    // `daysLogged` (weekToDate) is a count and structurally cannot become a
    // run, ArchiveCard refuses a day grid on the same grounds ("a binary grid
    // is a streak calendar in a ledger's coat"), and the one badge that reads
    // days (achievements.ts `streak-7`) is earned off the LONGEST run ever and
    // is never taken back — a badge on the engagement track that nothing can
    // revoke is not a debt the app can collect (Trust Rules 2 and 6).
    // It arrived here from the fold, where it cost 51px of a 812px window
    // (section.lp-wall 1920 -> 1869 in docs/brand/census.json across the move);
    // this is where the invariants are listed, so this is where it belongs.
    //
    // SCOPED, AND THE SCOPE MOVED WITH IT. At the fold this clause read "Days
    // are counted, never chained", under a 20-line note recording that the
    // wording was "scoped on purpose, twice over" because "claiming 'no streak
    // anywhere' would be false". It is: `longestLogStreak` chains consecutive
    // days and `streak-7` is earned on seven of them in a row. A band framed
    // "These are invariants, not intentions" is a stronger frame than a block
    // of terms, and it widened the claim past what the code supports — so the
    // sentence that was only true under its scope is gone and the two that are
    // true of the whole product stay. Nothing here RESETS (the streak is a max
    // over the record, not a live counter) and nothing is TAKEN BACK (badges
    // are earn-only). Do not put the first sentence back without the scope.
    id: 'no-clock',
    body: 'No run to break, no day to lose. Nothing resets and nothing is taken back.',
  },
  { id: 'export', body: 'Full export, always. No account. Your data leaves when you do.' },
]

/**
 * The pad's keys, rendered FROM the engine constant so this page can never
 * advertise a denomination LogCard does not ship.
 *
 * Middot, never a slash. A slash-joined list prints "… 200 / 100", which reads
 * as a score out of a hundred on the one page whose whole job is to promise
 * there is no score on it — and Root.test forbids that shape outright. The
 * facts pill above already joins with the same mark.
 */
const NOTE_STRIP = NOTE_DENOMINATIONS_DA.map((n) => n.toLocaleString()).join(' · ')

export function Landing({ onEnter }: { onEnter: () => void }) {
  // The shot's day. Held for the life of the mount rather than read per render:
  // the day headings are computed against it, and a second clock read mid-life
  // could relabel "Today" while the page is open. Same discipline as the app,
  // where every date in a render comes from useHealthDay's single `today`.
  const today = useMemo(() => todayISO(), [])
  const shotRows = useMemo(() => sampleLedgerRows(today), [today])
  // THE FOLD'S ONE FIGURE, COMPUTED BY THE CARD THAT PRINTS IT, over the very
  // rows the shot renders further down. The hand-off claims a resist "sums for
  // the month"; this is the line that sum lands in, in the app's own words
  // (resistedChipLabel) off the app's own derivation (resistedThisMonthDA). A
  // typed "3,500 DA resisted this month" beside a live screenshot would be the
  // one hand-written number on a page whose whole discipline is that numbers
  // are read from the code — and it would go stale the day the sample changes,
  // silently, while the card beside it printed something else.
  const shotResistedLine = useMemo(
    () => resistedChipLabel(resistedThisMonthDA(shotRows, today)),
    [shotRows, today],
  )
  return (
    <div className="landing">
      <main className="landing-main">
        {/* ── A. THE BRICK WALL ─────────────────────────────────────────── */}
        {/* No aria-labelledby: this section holds the page h1, so naming it
            from the h2 inside it would announce a region whose label is not
            the heading a user just heard. */}
        <section className="lp-wall">
          {/* Mono spec labels in the corners (§8). On Graphite plates, never
              on the field: §2.1 rule 1 names "form help text" specifically,
              and an 11px mono string on a 3.79:1 field is exactly that. */}
          <span className="lp-corner lp-corner-tl" aria-hidden="true">
            EMBER—01
          </span>
          <span className="lp-corner lp-corner-tr" aria-hidden="true">
            LOCAL/FIRST
          </span>

          <div className="lp-wall-inner">
            {/* THE STACK (§9 move 1): mark first, then each wordmark row at a
                70ms stagger, then the plate. Delays are per-element data. */}
            <div className="lp-lockup">
              <Monogram variant="brick" className="lp-brick hero-rise" style={{ animationDelay: '0ms' }} />
              <Wordmark className="lp-wordmark" riseFrom={70} />
            </div>

            {/* The one centred container. Bone, because everything inside it
                is under 24px and therefore illegal on the field. */}
            <div className="lp-plate hero-rise" style={{ animationDelay: '280ms' }}>
              <h2 id="lp-thesis" className="lp-thesis">
                Built flat. Logged in DA.
              </h2>
              <p className="lp-lede">Runs on your phone. Not on your bank.</p>
              {/* THE TERMS THE READER IS ON — third element, and the placement
                  is the argument.

                  WHO THIS BLOCK IS FOR. The person this product is built for is
                  bad with money and slightly ashamed of it, and the thing
                  standing between them and the first log is not a missing
                  feature — it is the expectation that a money app will read
                  their year back to them and find it wanting. Every other block
                  on this plate answers "what can it do". This one answers "what
                  will it do to me", which is the question that gets asked
                  first and, until now, was answered nowhere above the fold.

                  WHY IT PRECEDES THE MECHANIC, given that the round before this
                  one moved the mechanic UP for the opposite reason. The
                  displaced block then was .lp-sub — sixty words of market
                  argument. This is a tag, a lead and four sentences of terms,
                  and it is short by
                  construction: it states absences, and an absence needs no
                  mechanism to explain it. MEASURED at 375x812 BEFORE this block
                  landed: .lp-share ran 452–976 with the fold at 812, so the
                  mechanic's
                  tag, lead and first lines were the last things on screen one.
                  A block of this height moves that run down by its own height
                  and leaves the lead on screen one; the census row
                  landing.375x812.* is where the after is recorded. If a later
                  edit grows this block past the lede tier, the mechanic goes
                  under the fold and the trade stops paying — that is the test
                  to re-run, not a paragraph to re-argue.

                  IT IS NOT REASSURANCE, AND THAT IS THE VOICE CONSTRAINT
                  (§7.1). "It's okay, everyone slips" is the banned register on
                  both counts: it comforts, and it presumes the slip. Every line
                  here is a fact of construction stated flat — the register is
                  dry respect, and the dryness IS the respect.

                  EVERY CLAUSE IS SHIPPED CODE, and the two that can be bound
                  are bound rather than typed:
                    · "No score until you enter your own numbers" — HeroCard's
                      hasScore withholds the stage, the rating and the numeral
                      while `profile` is null, and HeroShell withholds the same
                      three on the desktop plate so it does not stop at a
                      breakpoint.
                    · the last-N-days line reads WEEK_DAYS; the disclosure
                      itself is quoted verbatim from HeroCard's NO_SCORE_LINE on
                      badge 01/08 below, the same binding RESIST_LABEL carries.
                    · "It reads like any other" — Trust Rule 3. LOG_TX pays
                      XP_REWARDS.logExpense whatever the row says, and no
                      surface colours, ranks or compares a day.
                  TWO CLAUSES LEFT THIS BLOCK AND THEIR ARGUMENTS WENT WITH
                  THEM, which is the point of listing only what ships: the
                  no-retention clause is a RULES entry now (see `no-clock`,
                  where the scope note it needs travels with it) and the
                  no-target-line clause is MECHANICS' archive badge ("No target
                  line. No projection.", where `budgeted`'s absent path is
                  argued). A reader checking why a claim is safe must find it
                  argued on the surface still making it.
                  noVerdict.test.ts asserts the whole set against the rendered
                  app rather than against this comment. */}
              <div className="lp-grade">
                <p className="lp-grade-tag">No verdict</p>
                <p className="lp-grade-lead">Nothing here grades you.</p>
                {/* TWO CLAIMS AND A CLOSER, AND THE LENGTH IS A CONSTRAINT
                    RATHER THAN AN EDIT. Measured at 375x812, block height
                    against word count: 357px at 62 words, 229px at 40, 178px at
                    25. .lp-share sits directly under it, so at 62 words the
                    mechanic's LEAD crossed the 812px fold — the exact cost the
                    placement note above says this trade must not pay. The words
                    that came out went to the two surfaces that already own
                    them, rather than being deleted: the EVIDENCE to badge 01/08
                    (which quotes NO_SCORE_LINE verbatim, the same division of
                    labour .lp-share and the product shot run on) and the
                    NO-RETENTION clause to the rules band, where the invariants
                    are listed. And the pixels: at 40 words this block put window
                    @0 at 47.77% field against a 60 target, having found it at
                    66.48 — 229px of Bone inside an 812px window is worth about
                    19pp of field, which is §2.1b's model read backwards. Over
                    all three drafts the trade is about 0.082pp of field per
                    pixel of block height (§2.1b.3's table carries the three
                    points and the same slope). The 25-word form is the one that
                    lands the window near the target rather than overshooting it
                    to the other side.
                    THE HEIGHT IS THE LAW'S NUMBER, NOT A SECOND OPINION: 178 is
                    what §2.1b.3's table records against wall 1869 in
                    docs/brand/census.json (1869 - 1675 = 194 = 178 + the
                    block's 16px margin), and it is what the block measures in
                    Chromium at 375x812 on this tree. It read 175 here for a
                    round, which put two heights for one shipped block in two
                    documents of one commit. */}
                <p className="lp-grade-body">
                  No score until you enter your own numbers. Your last{' '}
                  {WEEK_DAYS} days stand there instead. Log the week you would
                  rather not. It reads like any other.
                </p>
              </div>
              {/* THE HAND-OFF — the reason to send this to someone, above the
                  fold, on the accent bar. See HAND_OFF_TITLE above for why the
                  row is an index into MECHANICS and not a sentence.

                  IT IS THE SECOND THING ON THE PAGE NOW, and the order is the
                  claim. The market argument (.lp-sub below) stood between the
                  lede and this block: sixty words about a cash economy, ahead
                  of the one paragraph anyone would forward. A reader who leaves
                  after two paragraphs must leave holding the mechanic, so the
                  mechanic goes second and the argument for it goes third —
                  where it does its actual job, which is answering the question
                  this block raises ("why am I typing this in?") rather than
                  pre-empting it. Root.test asserts the order for the same
                  reason it asserts the order inside this block.

                  IT NAMES A MECHANIC, NOT A MOOD, and that is the correction.
                  This block used to be four refusals ("no account, no bank
                  login, no card") — true, but a list of things Ember does not
                  do is a reason to TOLERATE an app, never a reason to send it
                  to someone. The refusals moved down one line, where they
                  belong, and the reason took their place.

                  IT NOW LEADS WITH THE OBJECT AND CLOSES WITH THE INSTRUCTION,
                  which is the round-5 sharpening and §7 rule 1 read literally.
                  It ran the other way — "Send it to a friend who overspends"
                  first, the mechanic second — which frames the strongest thing
                  on the page as an errand, and forces the mechanic into the
                  third person ("the thing THEY did not buy") on a page whose
                  reader is the one who has to be convinced. The directive is
                  still here; it is the last line, where a Fabricator puts it.

                  The reason is the resist row, because it is the one thing here
                  that no bank-linked tracker can do at all: a bank feed can
                  only ever see money that moved. Every clause is shipped —
                  LOG_TX writes a row with resistedImpulse (reducer.ts),
                  groupTransactionsByDay adds 0 for it (ledger.ts), ArchiveCard sums
                  the month into the resisted chip, and the shot below renders
                  exactly that pair. The button it names is LogCard's own label,
                  read from RESIST_LABEL, so the instruction cannot send anyone
                  looking for a control that has been renamed. "It logs the
                  same" is Trust Rule 3: an impulse the user gave in to logs at
                  full XP with a quiet, uncoloured marker (see .tx-impulse — a
                  dashed keyline badge in the --spec register; "lowercase" stood
                  here and was simply wrong, the badge is uppercase like the
                  rest of that family) — the app states the fact and stops.

                  Scoped on purpose: full XP is claimed, and a clean score is
                  NOT. profile.ts feeds yielded impulses to impulseControlScore,
                  so "buying is never counted against you" would be false. On a
                  page whose subject is the trust boundary, this is the second
                  claim that must not overstate it. */}
              <div className="lp-share">
                {/* The row's place in the spec sheet below (§1 trait 10). The
                    FRACTION is aria-hidden — "zero two slash zero eight" ahead
                    of the sentence it labels is noise, the same reason
                    .lp-index carries the attribute — and the TITLE is not, so
                    the block still announces the name of the thing it is
                    about. */}
                <p className="lp-share-tag">
                  <span aria-hidden="true">
                    {String(HAND_OFF_ROW + 1).padStart(2, '0')}/
                    {String(MECHANICS.length).padStart(2, '0')}
                    {' · '}
                  </span>
                  {HAND_OFF_TITLE}
                </p>
                <p className="lp-share-lead">{HAND_OFF_LEAD}</p>
                {/* THE PAYOFF IS NAMED, and that is this round's sharpening.
                    The block told a stranger what to PRESS and what the app
                    would not do with it, and stopped one clause short of the
                    thing that makes anyone care: where the money you did not
                    spend ends up. It ends up in one line at the head of the
                    record, and the line is quoted here rather than described —
                    printed by resistedChipLabel over the same sample rows the
                    shot below renders through the real card, so the fold and
                    the screenshot cannot state two different figures.
                    "on the sample rows below" is not a hedge, it is Trust Rule
                    5 at the only place on this page where a figure appears
                    before the caption that disclaims it: nobody is being read
                    here, and a number in a pitch has to say whose it is. */}
                <p className="lp-share-body">
                  Type the amount. Press &ldquo;{RESIST_LABEL}&rdquo; instead of
                  Log. The row keeps what it would have cost. Nothing added to
                  the day. Summed for the month. One line at the head of the
                  record — on the sample rows below,{' '}
                  <span className="lp-quote">{shotResistedLine}</span>. A feed
                  cannot see money that never moved, so this row exists nowhere
                  else. Buy it anyway and it logs the same. Full XP either way.
                </p>
                <p className="lp-share-call">
                  Send it to a friend who overspends.
                </p>
              </div>
              {/* THE POSITION, PLAINLY, AND AS A STRENGTH. Manual-first and
                  DA-denominated is what this product IS, not a limitation it
                  works around, so it is stated above the fold instead of being
                  left for someone to discover in the amount field.

                  IT SITS UNDER THE MECHANIC, NOT OVER IT (see the note on the
                  hand-off), and that repositioning is what lets it open with
                  the strongest sentence available to it: hand entry is the
                  REASON the row above can exist. A feed imports events. Not
                  buying is not an event, so no amount of automation reaches it
                  — the manual product is the only one that can hold that row.
                  That argument was nowhere on the page while the paragraph ran
                  first, because it needs the mechanic in front of it.

                  The rest is a fact about the market, not a consolation: in a
                  cash economy an aggregator's feed is a PARTIAL record by
                  construction, so the "automatic" competitor is the one with
                  the gaps. Every claim here is an absence in src — DA is the
                  only unit the app formats (every amount renders `N DA`, there
                  is no converter and no second unit), and there is no import
                  path, no aggregator, no merchant lookup and no bank call
                  anywhere, which is also why no row is auto-categorised.
                  localFirst.test asserts the absence over the source tree. */}
              <p className="lp-sub">
                Built for Algeria. Every amount in DA, entered by hand. Hand
                entry is what makes the row above possible. A feed imports
                events. Not buying is not an event. And a feed knows only what a
                bank saw — not the cash, not the taxi, not what a friend paid
                back. Nothing here is imported, so nothing is guessed. Every row
                is one you put there.
              </p>
              {/* The refusals, demoted to terms — which is what they are. Each
                  one is a real absence: no auth, no server and no network call
                  in src; nothing reads a bank, which is why logging is manual;
                  and Trust Rule 2 means no purchase path exists, so there is
                  nothing to be sold or cancelled. "A purchase is two taps" is
                  the cash pad plus the log button with the category already
                  defaulted, and App.test performs exactly those two taps to
                  keep the number honest.
                  THE MECHANIC IS NAMED, not just the count: addNote composes
                  additively (keypad.ts), so two taps is the one-denomination,
                  default-category case — 1,500 DA is three. Stated flat, the
                  number was a claim the code only sometimes honours; stated
                  with "one cash key, then Log" it is self-evidently the case it
                  describes, which is how README.md already puts it. */}
              <p className="lp-terms">
                It asks them for nothing. No account, no bank login, no card.
                One cash key, then Log: a purchase is two taps.
              </p>
              <div className="lp-actions">
                {/* The gate. A real button, not a link: it changes what is
                    rendered, it does not navigate. */}
                <button type="button" className="btn btn-flame lp-cta" onClick={onEnter}>
                  Start logging
                </button>
                <a className="btn lp-cta" href="#spec">
                  Spec sheet
                </a>
              </div>
            </div>

            {/* The competitive position, above the fold, on its own ink plate.
                This is the differentiator — it does not get buried. */}
            <p className="lp-facts hero-rise" style={{ animationDelay: '350ms' }}>
              No account · No bank link · Export always
            </p>
          </div>
        </section>

        {/* ── B. THE SPEC SHEET ─────────────────────────────────────────── */}
        {/* tabIndex -1: this is the page's ONLY in-page jump target (the "Spec
            sheet" button above), and it had the exact defect the app fixed on
            all five of its own targets — a fragment link whose target is not
            focusable leaves focus on <body>, so activating it strands the
            keyboard user at the top of the document. Chrome papers over it with
            the sequential-focus navigation starting point; Safari/VoiceOver do
            not. The section already has an accessible name from aria-labelledby,
            so tabIndex alone makes the arrival announce "The spec sheet,
            region". Same construction as LogCard and SimCard — the app's two
            remaining jump targets. This line named a third until that card was
            deleted, and a comment pointing at a component no build renders is
            exactly the drift README.test now scans this file for. */}
        <section id="spec" className="lp-spec" tabIndex={-1} aria-labelledby="lp-spec-h">
          <div className="lp-measure">
            <h2 id="lp-spec-h" className="lp-section-h">
              The spec sheet
            </h2>
            {/* The count is READ, never typed. A word here and a hard-coded
                "04" in the index labels were two places to write the same
                fact, and the grid grew twice while a typed word sat still. */}
            <p className="lp-spec-lede">
              {/* "The card", singular. The shot was two cards until they merged
                  into <ArchiveCard>; a plural left standing here would be the
                  page describing a layout the app no longer has. The count
                  beside it is read, because a NUMBER can be — this cannot, so
                  Root.test asserts the shot frame holds exactly one card. */}
              <span className="lp-count">{MECHANICS.length}</span> mechanics,
              all shipped. The card below is the app's own, running.
            </p>

            {/* ── THE PRODUCT SHOT ────────────────────────────────────────
                Not an image. This is <ArchiveCard>, the component the app
                renders, fed seven sample rows through the same monthToDate and
                groupTransactionsByDay the app uses — so the day index, the
                month total, the strip, the day headings, the day totals, the
                notes, the resist row, the month's resisted chip and the card's
                scope line are all computed here exactly as they are in
                the product. A PNG would need regenerating whenever a card
                changed and would silently rot when nobody did. This cannot.

                THE CARD IS HANDED `transactions` AND `today` AND NOTHING
                ELSE — the same two props the app gives it. It is not handed
                a profile, which is the structural reason no budget line, no
                score and no stage can appear on this page even if one is added
                to that card later.

                ARIA-HIDDEN, AND THAT IS THE HONEST MODEL. A screenshot's
                content belongs in its alt text; the figcaption is that alt
                text. Hiding the subtree also settles three things at once:
                the card's own <h2>The record</h2> and day <h3>s stay out of
                the page outline (a heading list must name the page's sections,
                not a picture's internals), the card's live region is never
                exposed on a surface whose live-region contract belongs to the
                app, and nothing inside can take focus.

                THE LAST POINT IS A CONSTRAINT, NOT A CONVENIENCE: aria-hidden
                over a focusable element is a keyboard trap with no accessible
                name. The sample covers three days precisely because the card
                grows its expand button on the fourth, and Root.test asserts
                the shot holds no focusable node — so the sample cannot quietly
                grow one. */}
            <figure className="lp-shot">
              <div className="lp-shot-frame" aria-hidden="true">
                <ArchiveCard transactions={shotRows} today={today} />
              </div>
              <figcaption className="lp-shot-cap">
                {/* .lp-shot-tag, not .lp-index: that class means "this badge's
                    place in the mechanic grid" and is read as a set. */}
                <span className="lp-shot-tag">Sample rows · nobody's data</span>
                The archive card, as the app stacks it. Above: where you are
                in the month, what it has cost so far, how many days are left,
                and one bar per day. Below: grouped by day. Each day's spend
                sits in its heading. A note sits under the row it belongs to,
                on the rows that have one. The resist under Today shows what it
                avoided and adds nothing to the day. The card states its own
                scope, in one line: totals only, no targets, no averages, no
                projections.
              </figcaption>
            </figure>

            {/* The other half of what logging actually feels like, and the
                second claim on this page bound to code rather than typed: the
                key list comes from NOTE_DENOMINATIONS_DA. */}
            <p className="lp-note-strip">
              {/* "cash", not "banknotes": 100 DA is a coin, and the key list
                  beside this sentence is rendered from the engine constant —
                  see keypad.ts. */}
              Amounts go in as cash.{' '}
              <span className="lp-notes-keys">{NOTE_STRIP} DA</span> — one tap
              each, added to whatever is already in the box. Typing still works,
              and a tap never overwrites it.
            </p>

            <ol className="lp-grid">
              {MECHANICS.map((m, i) => (
                <li className="lp-badge" key={m.title}>
                  {/* Decorative truth-telling (§1 trait 10): the denominator is
                      the real length of this list, so it cannot drift from the
                      grid the way a typed "04" would. aria-hidden — a screen
                      reader reading "zero one slash zero four" before every
                      heading is noise, and the ordered list already conveys
                      position. */}
                  <span className="lp-index" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}/{String(MECHANICS.length).padStart(2, '0')}
                  </span>
                  <h3 className="lp-badge-h">{m.title}</h3>
                  <p className="lp-badge-body">{m.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── D. THE SHEAR ──────────────────────────────────────────────── */}
        <section className="lp-shear" aria-labelledby="lp-rules-h">
          {/* THE ORDER IS THE LAYOUT ON A PHONE, and it is why the band sits
              between these two blocks rather than before both of them. Below
              720px .lp-band-lane is a real box in the flow, so the section
              reads sign → band → plates and the diagonal is what splits the
              two. At ≥720 the lane is `display: contents`, generates no box,
              and the band goes back to being absolutely positioned across the
              whole section — DOM order stops mattering there entirely. Both
              text blocks therefore carry .lp-rules-body (z-index above the
              band), not just the one that used to wrap everything. */}
          <div className="lp-measure lp-rules-body">
            <h2 id="lp-rules-h" className="lp-section-h">
              The rules
            </h2>
            <p className="lp-spec-lede lp-rules-lede">
              {/* The band is aria-hidden decoration, so its sentence is
                  restated here — a screen-reader user must not lose the line
                  the whole section is built around. */}
              Two tracks. Never crossed. These are invariants, not intentions.
            </p>
          </div>
          {/* One 38° Flare band splitting the canvas (§5D), with §5D's "type
              sits parallel to it" carried by a repeated spec index rather than
              by a line of prose. The prose version shipped reading "…VER
              CROSSED." on desktop and as rotated letter fragments at 375px,
              because the plates occlude the band's middle at every width — but
              that is a fact about SENTENCES, which have a middle. An index does
              not. The section's sentence stays real, unrotated text in the lede
              above.
              aria-hidden: a printed mark on a decorative band, not content.
              18 marks is enough to run the full 140% band width at 1440; below
              720px the lane is shorter than the band and CSS caps how many are
              drawn, so the surplus is never rendered into a clip (see
              .lp-band-mark). The count is one number in one place — the cap is
              a function of it, not a second list to keep in sync. */}
          <div className="lp-band-lane">
            <div className="lp-band" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <span className="lp-band-mark" key={i}>
                  38°
                </span>
              ))}
            </div>
          </div>
          <div className="lp-measure lp-rules-body">
            <ul className="lp-rules">
              {RULES.map((r) => (
                <li className="lp-rule" key={r.id}>
                  {r.body}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── E. THE OBJECT ─────────────────────────────────────────────── */}
        {/* The mark alone on flat Flare — no device frame, no shadow, no
            context, cropping the frame (§8: the object is a specimen). The
            specimen here is the MARK and not the UI on purpose, even now that
            a product shot exists: §5E is the layout that carries one hard-lit
            object with no context, the shot needs its caption to stay honest,
            and a captioned object is not that layout. The shot lives in §5B,
            where a spec sheet has always been allowed to show the thing it is
            indexing. */}
        <section className="lp-object" aria-labelledby="lp-object-h">
          <Monogram variant="knockout" className="lp-object-mark" />
          <div className="lp-plate lp-object-plate">
            <h2 id="lp-object-h" className="lp-thesis">
              Nothing to sign up for.
            </h2>
            <p className="lp-lede">Open it. Log one thing. That is the whole setup.</p>
            <div className="lp-actions">
              <button type="button" className="btn btn-flame lp-cta" onClick={onEnter}>
                Start logging
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── C. THE PLATE ───────────────────────────────────────────────── */}
      {/* Horizontal subway lockup on Marigold with a hard keyline. Graphite on
          Marigold is 6.2:1 — the one accent in this palette that carries body
          copy, which is why the footer is the accent surface and the sections
          above are not. */}
      <footer className="lp-foot">
        <div className="lp-foot-inner">
          {/* Knockout, not the full-colour plate variant: the mark's own three
              tones plus the Marigold field would put FOUR colours on one
              surface, and §1 trait 06 caps a surface at three. One-colour
              lockups exist for exactly this (§4 LOCKUP VARIANTS). */}
          <Monogram variant="knockout" className="lp-foot-mark" />
          <p className="lp-signoff">No newsletter. We'll be here.</p>
        </div>
        {/* OUTSIDE THE PLATE, on the section's Espresso field. §5C's plate is
            the LOCKUP — mark plus sign-off — and these two are navigation
            hanging off it, so this is the composition read literally rather
            than a concession. CONSTRAINT §2.1b: accent is capped at 2% of the
            document and the footer is this page's only accent surface, so the
            plate's area IS the budget. Two 48px link targets and their wrap gap
            were about a third of it. Bone on Espresso is 13.4:1 against the
            6.2:1 they had on Marigold, and the focus ring moves with them —
            see .lp-foot-links in landing.css. */}
        <nav className="lp-foot-links" aria-label="Project">
          <a href="https://github.com/Brvetr4ve1er/money-manager-">Source</a>
          <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache-2.0</a>
        </nav>
      </footer>
    </div>
  )
}
