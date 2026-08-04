import { useMemo, type ReactNode } from 'react'
import { Monogram } from './Monogram.tsx'
import { Wordmark } from './Wordmark.tsx'
import { ArchiveCard } from './ArchiveCard.tsx'
import { todayISO, NOTE_MAX_LEN, DECISION_ANSWERS, DECISION_MAX } from '../state/store.ts'
import { NOTE_DENOMINATIONS_DA } from '../engine/keypad.ts'
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
 * SIX CLAIMS ARE MECHANICALLY BOUND rather than typed, because those are the
 * ones that rot first: the note-key strip renders FROM NOTE_DENOMINATIONS_DA,
 * the note's length claim reads NOTE_MAX_LEN, the record's three answers are
 * DECISION_ANSWERS — the very array SimCard's buttons render — the record's
 * depth reads DECISION_MAX, the grid's count is the length of MECHANICS
 * (stated in the lede AND in every index label), and the product shot is
 * rendered BY <ArchiveCard> itself. Change a denomination, either cap, an
 * answer, the roster or that card and this page changes with them.
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
    body: 'Five components. Shrunk for thin data. It explains; it never advises.',
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

/** The Trust Rules (§12) as the manifesto they are, in the Fabricator register.
    Each one is enforced somewhere in src/engine — this list is a mirror of the
    code, not a promise about it. */
const RULES = [
  'XP measures showing up. The score measures money. One never feeds the other.',
  'Nothing is for sale. Every badge and companion is earned.',
  '"I bought it anyway" logs at full XP. Honesty is never punished.',
  'Under 90 days the score says it is still calibrating.',
  'Full export, always. No account. Your data leaves when you do.',
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
              {/* THE POSITION, PLAINLY, AND AS A STRENGTH. Manual-first and
                  DA-denominated is what this product IS, not a limitation it
                  works around, so it is stated in the second paragraph of the
                  page instead of being left for someone to discover in the
                  amount field.

                  The argument is a fact about the market, not a consolation:
                  in a cash economy an aggregator's feed is a PARTIAL record by
                  construction, so the "automatic" competitor is the one with
                  the gaps. Every claim here is an absence in src — DA is the
                  only unit the app formats (every amount renders `N DA`, there
                  is no converter and no second unit), and there is no import
                  path, no aggregator, no merchant lookup and no bank call
                  anywhere, which is also why no row is auto-categorised.
                  localFirst.test asserts the absence over the source tree. */}
              <p className="lp-sub">
                Built for Algeria. Every amount in DA, entered by hand. A bank
                feed knows what a bank saw. Not the cash. Not the taxi. Not
                what a friend paid back. Nothing here is imported, so nothing
                is guessed. Every row is one you put there.
              </p>
              {/* THE HAND-OFF — the reason to send this to someone, above the
                  fold, on the accent bar.

                  IT NAMES A MECHANIC, NOT A MOOD, and that is the correction.
                  This paragraph used to be four refusals ("no account, no bank
                  login, no card") — true, but a list of things Ember does not
                  do is a reason to TOLERATE an app, never a reason to send it
                  to someone. The refusals moved down one line, where they
                  belong, and the reason took their place.

                  The reason is the resist row, because it is the one thing here
                  that no bank-linked tracker can do at all: a bank feed can
                  only ever see money that moved. Every clause is shipped —
                  LOG_TX writes a row with resistedImpulse (reducer.ts),
                  groupTransactionsByDay adds 0 for it (ledger.ts), ArchiveCard sums
                  the month into the resisted chip, and the shot below renders
                  exactly that pair. "The row reads the same" is Trust Rule 3:
                  an impulse the user gave in to logs at full XP with a quiet,
                  uncoloured marker (see .tx-impulse — a dashed keyline badge in
                  the --spec register; "lowercase" stood here and was simply
                  wrong, the badge is uppercase like the rest of that family) —
                  the app states the fact and stops.

                  Scoped on purpose: full XP is claimed, and a clean score is
                  NOT. profile.ts feeds yielded impulses to impulseControlScore,
                  so "buying is never counted against you" would be false. On a
                  page whose subject is the trust boundary, this is the second
                  claim that must not overstate it. */}
              <p className="lp-share">
                Send it to a friend who overspends. Ember logs the thing they
                did not buy. What it would have cost, recorded. Nothing added
                to the day. Summed for the month. Buy it anyway: the row reads
                the same as any other log. Full XP either way. That pair is the
                mechanic.
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
            region". Same construction as LogCard/QuestCard/SimCard/
            CollectionCard. */}
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
            <p className="lp-spec-lede lp-spec-lede-dark">
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
                <li className="lp-rule" key={r}>
                  {r}
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
          <nav className="lp-foot-links" aria-label="Project">
            <a href="https://github.com/Brvetr4ve1er/money-manager-">Source</a>
            <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache-2.0</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
