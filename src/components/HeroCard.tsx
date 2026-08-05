import { useState } from 'react'
import type { ComponentKey, Stage } from '../engine/healthScore.ts'
import type { PixelPet } from '../engine/achievements.ts'
import { CALIBRATION_DAYS } from '../engine/profile.ts'
import { WEEK_DAYS, type WeekSoFar } from '../engine/ledger.ts'
import { Glyph } from './Glyph.tsx'

/** Stage → badge mapping, shared with the desktop HeroShell so the two hero
    badges can never disagree about a stage's colour.

    Each entry is a CHECKED foreground/field pair (design system §2.1 rule 3 —
    every new pair is computed before it ships), which is why the glyph colour
    travels with the field instead of being set in CSS:
      ember   Graphite on Flare     3.79:1  — non-text glyph, over the 3:1 min
      hearth  Graphite on Marigold  6.2:1
      bonfire Graphite on Acid      9.7:1
      beacon  Flare on Espresso     4.41:1
    The ramp brightens as the flame grows, then the top tier inverts to the
    dark ground with a Flare mark — a beacon reads against the night. Espresso
    is a structural neutral, not an accent, so §2.1 rule 2 (--on-accent is
    always Graphite) does not bind it; Graphite on Cobalt or Moss would be
    ~1.5:1 and ~1.1:1, so neither is usable as a fill here. */
export const STAGE_META: Record<Stage, { label: string; stars: number; field: string; ink: string }> = {
  ember: { label: 'Ember', stars: 1, field: 'var(--flare)', ink: 'var(--on-accent)' },
  hearth: { label: 'Hearth-fire', stars: 2, field: 'var(--marigold)', ink: 'var(--on-accent)' },
  bonfire: { label: 'Bonfire', stars: 3, field: 'var(--acid)', ink: 'var(--on-accent)' },
  beacon: { label: 'Beacon', stars: 4, field: 'var(--espresso)', ink: 'var(--flare)' },
}

/**
 * WHAT CARD 01 SAYS WHILE IT IS WITHHOLDING THE SCORE.
 *
 * A constant rather than a literal because the LANDING PAGE quotes it. The
 * marketing surface tells a stranger that this product prints no rating off
 * numbers that are not theirs, and the page's rule is that it prints the app's
 * own words or it prints nothing — the same binding RESIST_LABEL and
 * resistedChipLabel already carry (see Landing.tsx). Reword the disclosure and
 * the pitch rewords itself; Root.test asserts the two ends are one string.
 *
 * CONSTRAINT Trust Rule 6: it names the absence and what supplies it, and it
 * never says the user is late, behind or missing something.
 */
export const NO_SCORE_LINE = 'No score yet. Your numbers turn it on.'

/** Display order and names for the explainability drawer. */
const COMPONENT_ROWS: Array<{ key: ComponentKey; label: string }> = [
  { key: 'SR', label: 'Savings rate' },
  { key: 'BA', label: 'Budget' },
  { key: 'EF', label: 'Emergency fund' },
  { key: 'DT', label: 'Debt trend' },
  { key: 'IC', label: 'Impulse control' },
]

/**
 * Achievement loot: cosmetic companions, earned on the ENGAGEMENT track.
 *
 * Extracted because it has to survive the score being withheld. Every pet
 * reachable in week one — first-log, first-resist, first-sim, ten-logs — is
 * reachable BEFORE setup, so a shelf that lived only inside the stage badge's
 * column would hide the badges a pre-setup user actually earned, which is the
 * one thing Trust Rule 2 ("every cosmetic is earned") makes unacceptable: the
 * app may not take back what it paid.
 *
 * `loose` is the standalone placement — no badge to sit under, so the strip
 * takes the card's measure instead of the badge's 96px column.
 */
function PetStrip({ pets, loose }: { pets: PixelPet[]; loose?: boolean }) {
  return (
    // role="img" names them for AT the same way the stars are named — a bare
    // div takes no accessible name and a screen reader would read the raw
    // marks, or nothing.
    <div
      className={loose ? 'pet-strip is-loose' : 'pet-strip'}
      role="img"
      aria-label={`Companions: ${pets.map((p) => p.name).join(', ')}`}
    >
      {/* .mark: §1 trait 01 — every glyph sits in a container, so the
          companions are badges on the strip, not loose marks. */}
      {pets.map((p) => (
        <span className="mark" key={p.name} aria-hidden="true">
          <Glyph name={p.glyph} />
        </span>
      ))}
    </div>
  )
}

/**
 * THE WEEK BLOCK — what card 01 prints while it has no score to print.
 *
 * Every figure here is a sum over rows the user typed, in a window bounded at
 * both ends (see weekToDate). Nothing is projected, nothing is averaged,
 * nothing is compared to a target, and nothing is graded: the repeats are
 * ordered by total and the copy never calls the first one biggest, because
 * ordering is not a verdict (Trust Rules 3 and 6).
 *
 * IT IS NOT A STREAK AND CANNOT BECOME ONE. `daysLogged` is a count of days
 * with rows on them, not a run: five empty days between two logged ones cost
 * nothing and are not mentioned. There is no day grid here for the same reason
 * ArchiveCard refuses one — "a binary grid is a streak calendar in a ledger's
 * coat" — and the derivation hands over no per-day array to draw one from.
 *
 * THE REPEATS ARE THE POINT. Days and totals are arithmetic the user could do;
 * "Food, 4 rows, 1,920 DA" is the one thing in week one the record knows and
 * the person does not, and it is the app applying its own invisible-category
 * lesson to the user's own rows instead of to a hypothetical coffee.
 */
function WeekBlock({ week }: { week: WeekSoFar }) {
  return (
    // CONSTRAINT §2.1b — the block takes the counter plate, which is what
    // .stage-info carried before it: the head of the phone stack is 300px of
    // Flare topbar and a card, and a plate is the ground's OPPOSITE so one
    // block moves both themes the right way at once. See .counter-plate in
    // tokens.css, and docs/brand/census.json for what it measures.
    // role="group" + a label: a bare div takes no accessible name, so the
    // window this block is about would be a loose run of numbers to AT.
    // aria-LABEL, NOT aria-labelledby, AND THAT IS THE HOUSE PATTERN. Pointing
    // the label at the visible <p> below made this the only group in the tree
    // that names itself from one of its own rendered children: AT announced
    // "LAST 7 DAYS" on entry and then read the identical string again as the
    // group's first content. Every other group here uses a non-visible label
    // (LogCard, SimCard twice). It also stops the accessible name inheriting
    // the text-transform: uppercase Chrome bakes into a name computed from
    // .week-head. The string is built from WEEK_DAYS, the same constant the
    // paragraph prints, so the two cannot drift.
    <div className="week-block counter-plate" role="group" aria-label={`Last ${WEEK_DAYS} days`}>
      {/* The window names itself. "Last 7 days", not "this week": the window
          is rolling and always WEEK_DAYS long (see weekToDate), and calling a
          rolling window a calendar week is the kind of imprecision §7 rule 3
          exists to stop. */}
      <p className="week-head mono">Last {WEEK_DAYS} days</p>
      {week.daysLogged === 0 ? (
        // §7's empty-state register, and Trust Rule 5 taken literally: state
        // what the record holds, which is nothing, and stop. NO NUMERALS — a
        // "0 / 7" or an empty bar here would draw a target the user is short
        // of, which is the punitive framing Trust Rule 6 forbids and the
        // streak device this step is specifically not allowed to build.
        <p className="week-empty">Nothing logged in the last {WEEK_DAYS} days.</p>
      ) : (
        <>
          {/* Same shape and same register as .month-facts on the archive: a
              flex row of stated figures, INDEX ROLL (§9 move 4) on each one a
              log moves. "logged", not "spent" — every amount in Ember is typed
              by hand, so the honest claim is what the user recorded. */}
          <p className="week-facts">
            <span className="week-days mono index-roll" key={week.daysLogged}>
              Logged on {week.daysLogged} {week.daysLogged === 1 ? 'day' : 'days'}
            </span>
            <span className="week-spend mono index-roll" key={week.spentDA}>
              {week.spentDA.toLocaleString()} DA logged
            </span>
            {/* Only when there is one, mirroring the archive's resisted chip:
                a "0 DA resisted" line reports a user who resisted nothing as
                having failed at something. Resists are a separate bucket from
                spend and never enter it (Trust Rule 1's discipline applied to
                a money figure — see weekToDate). */}
            {week.resistedDA > 0 && (
              <span className="week-resisted mono index-roll" key={week.resistedDA}>
                {week.resistedDA.toLocaleString()} DA resisted
              </span>
            )}
          </p>
          {week.repeats.length > 0 && (
            <>
              <ul className="week-repeats">
                {week.repeats.map((r) => (
                  <li className="week-repeat" key={r.category}>
                    <span className="week-cat">{r.category}</span>
                    {/* No plural branch: a repeat is two rows or more by
                        construction (weekToDate), so "1 rows" cannot happen. */}
                    <span className="week-rows mono">{r.rows} rows</span>
                    <span className="week-total mono index-roll" key={r.totalDA}>
                      {r.totalDA.toLocaleString()} DA
                    </span>
                  </li>
                ))}
              </ul>
              {/* What a repeat IS, stated once. A definition, not a verdict:
                  it says how the rows were selected and stops — no adjective,
                  no "biggest", no suggestion about what to do next. The
                  no-verdict rule the simulator keeps, kept here. */}
              <p className="week-note">Categories with more than one row.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}

export function HeroCard({
  stage,
  score,
  pets,
  components,
  historyDays,
  isDemo,
  week,
}: {
  stage: Stage
  score: number
  pets: PixelPet[]
  /** Per-component shrunk scores from computeHealthScore — absent = excluded. */
  components: Partial<Record<ComponentKey, number>>
  /** Days of logged history behind the score (engine/profile historyDays). */
  historyDays: number
  /** True while the score runs on DEMO_PROFILE rather than the user's numbers. */
  isDemo: boolean
  /** The last seven days of the record. Printed only while there is no score. */
  week: WeekSoFar
}) {
  const meta = STAGE_META[stage]
  // Explainability drawer: the engine exposes its component breakdown "for
  // explainability UI" — this renders it. Cause-effect visibility is what
  // makes the score trainable instead of mystical; the copy explains the
  // parts, it never advises (no-verdict rule).
  const [open, setOpen] = useState(false)
  /**
   * TRUST RULE 5, TAKEN LITERALLY RATHER THAN DISCLOSED.
   *
   * Before setup every input to this card is DEMO_PROFILE's — a 90,000 DA
   * income, a 45,000 DA fund, a 12,000 -> 9,500 DA paydown — so a fresh install
   * rendered "Bonfire", three of four stars and "Health 59.0" at the h1 tier
   * about a person who does not exist. Round 6 added the sentence that says so;
   * a disclaimer under a fabricated number is an admission, not a fix, and the
   * two readings a person can take from it are both bad: believe the number, or
   * conclude the flagship figure is decoration.
   *
   * So the readout is WITHHELD, not qualified. No stage badge, no stage name,
   * no rating, no numeral — on this card and on the desktop hero plate, because
   * app.css re-homes the stage above 1024 and a withholding that stops at a
   * breakpoint leaves the fiction standing at one width.
   *
   * The drawer goes with it. Its five bars are the same demo arithmetic one tap
   * further in, and "Why this stage?" names a stage that is not on screen —
   * keeping it would move the fabrication behind a disclosure instead of
   * removing it. Everything returns the moment PROFILE_SET lands.
   */
  const hasScore = !isDemo
  // Belt and braces: nothing can press the toggle while the score is withheld,
  // but a card whose SHAPE says "expanded" with no drawer under it is a
  // contradiction the reader would have to resolve. One source of truth.
  const expanded = open && hasScore
  return (
    // is-open drives CONTAINER MORPH (§9 move 6): the card re-cuts its
    // superellipse from n 4.2 to 2.8 while the drawer is out, rather than
    // scaling. A class, not :has(), so the state that changes the shape is the
    // same state that renders the drawer — one source of truth.
    <section className={expanded ? 'card hero-card is-open' : 'card hero-card'}>
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">HLT—01</span>
      {/* The card names what it measures, not what the measurement currently
          says. It used to title itself with the stage label — which the hero
          plate ALSO renders as an h2 at ≥1024, so the outline carried
          "Bonfire" twice, one of them at 13px. This is the section heading the
          explainability drawer below hangs off; the stage name is a line
          inside the readout now, not a second heading. */}
      {/* CONSTRAINT §2.1b: the title takes the counter plate so the head of
          the stack is not one unbroken ground for a whole viewport (see
          .counter-plate in tokens.css). The readout below it keeps the reading
          ground — .stage-badge is a persistent accent fill with mandatory
          Graphite ink, and that is the one thing a counter plate may not
          carry. */}
      <h2 className="counter-plate">Health score</h2>
      {/* THE SWAP. One of these two is on screen, never both: a score the app
          has earned, or the record it actually holds. See `hasScore` above.
          THE MONEY BLOCK LEADS AND THE LOOT FOLLOWS, which is the two-track
          rule as reading order: the card's subject is the record, and the
          companions are decoration the user earned on the other track. They
          are rendered here at all — rather than only beside a stage badge that
          is not on screen — because a badge earned before setup must not
          vanish until setup (Trust Rule 2). At ≥1024 app.css hides
          .hero-card .stage-col, so this strip is deliberately NOT inside it. */}
      {!hasScore && (
        <>
          <WeekBlock week={week} />
          {pets.length > 0 && <PetStrip pets={pets} loose />}
        </>
      )}
      {hasScore && (
      <div className="hero-main">
        <div className="stage-col">
          {/* No elevation (§5): the badge is a flat field with a 2px keyline.
              Both halves of the checked pair arrive together so the glyph can
              never end up on a field it fails contrast against. */}
          <div className="stage-badge" style={{ background: meta.field, color: meta.ink }}>
            {/* Drawn glyph, not an emoji (§8): the flame inherits meta.ink, so
                it lands on a foreground/field pair that was checked above
                instead of arriving in a vendor's own colours. The stage name
                beside it is its text alternative. */}
            <Glyph name="flame" className="stage-flame" />
          </div>
          {/* Achievement loot: cosmetic companions BESIDE the stage badge, never
              inside it — the badge's color/stars stay a pure function of
              financial health (the two-track rule), and the pets are earned
              engagement decoration riding along. */}
          {pets.length > 0 && <PetStrip pets={pets} />}
        </div>
        {/* CONSTRAINT §2.1b — the readout column takes the counter plate too.
            The h2 alone left window @0 at 80.40% field / 11.67% Bone in dark —
            a counterfactual, measured during round 6 on the tree committed as
            12bbf5e with only the two title plates live, so it is in no
            committed artifact and can only be re-derived by re-running the
            census with this plate removed. 300px of Flare topbar
            and an Espresso card is one ground for a whole viewport. This is the
            hero's only accent-free block — .stage-col beside it holds the stage
            badge, a persistent accent fill. See .counter-plate in tokens.css. */}
        <div className="stage-info counter-plate">
          <p className="stage-name">{meta.label}</p>
          {/* role="img": a generic div prohibits accessible naming, so without
              it the aria-label may be ignored and screen readers read the raw
              marks — or nothing. Drawn stars, not '★' (§8): the character got
              emoji-presentation substitution on several Android and Windows
              font stacks, which put the mark in a vendor's colour and made the
              contrast pair measured in app.css fiction. */}
          <div className="stars" role="img" aria-label={`${meta.stars} of 4 stars`}>
            {Array.from({ length: meta.stars }, (_, i) => (
              <Glyph name="star" key={i} />
            ))}
          </div>
          {/* THE readout, at §3's h1 tier (see .score-value — h1 rather than a
              display tier because this is a Grotesk 700 numeral, and d1/d2 are
              BLOKFORM's stacked-wordmark tiers). This is
              the most important number the product computes and it rendered at
              13px in the quiet ink — smaller than the card's own title. At
              ≥1024 it is also the only thing left on this card above the
              drawer, which is what gives the five explainability bars a
              subject to be a breakdown OF.

              The label and the numeral are separate spans because they take
              different tiers, and the numeral alone carries INDEX ROLL (§9
              move 4): a numeral indexes, a word does not. The key is the
              rendered value, so a changed score remounts the span and re-runs
              the stepped index.

              The split is TYPOGRAPHIC ONLY, so it must not reach the
              accessibility tree: a label and a numeral announced as two
              separate runs is a worse readout than the one sentence it
              replaces. The visible halves are aria-hidden and the sr-only line
              carries "Health 63.7" whole — one string for AT, two tiers for
              the eye. */}
          <p className="mono score-line">
            <span className="sr-only">Health {score.toFixed(1)}</span>
            <span className="score-label" aria-hidden="true">Health</span>
            <span
              className="score-value index-roll"
              aria-hidden="true"
              key={score.toFixed(1)}
            >
              {score.toFixed(1)}
            </span>
          </p>
        </div>
      </div>
      )}
      {/* Trust Rule 5, said out loud, in its two halves.
          WHAT IS MISSING (isDemo) comes first, because it is the bigger claim.
          Before setup SR/BA/EF/DT are computed from DEMO_PROFILE's invented
          90,000 DA income and 45,000 DA fund, so this card used to render
          "Health 59.0 / Bonfire / 3 of 4 stars" at the h1 tier off numbers no
          user ever entered. The readout is withheld now (see hasScore), so
          this half no longer qualifies a number — it names the absence and
          what ends it, and the block above prints what the record does hold.
          Then HOW MUCH HISTORY (historyDays) — the original line, and it now
          waits for a score to qualify (see the clause's own note below). It
          used to be keyed independently of the swap, which left it printing
          "Day 0 / 90" beside a numeral this card had just withheld. Setup can
          still land on day 3 and the clock still runs on logged history; what
          changed is that the sentence only appears where the thing it
          disclaims does.
          Deliberately not the words "demo profile": SimCard owns that phrase
          and a second copy of it would make the app say "demo" twice about
          two different things.
          OUTSIDE .hero-main on purpose: the ≥1024px block re-homes the stage
          badge, name and rating on the hero plate, and a disclosure that
          moved with them would blink out at a breakpoint. Live text, never
          aria-hidden: it is the disclosure. */}
      {/* CONSTRAINT §2.1b — THE CARD'S FOOT TAKES THE COUNTER PLATE, and this is
          the head of the stack, which is the half of the phone the plates had
          not reached. The census COMMITTED AT 12bbf5e — the carrier commit, not
          the sha in its tree field, which names its dirty parent — read
          app.375x812.dark.seeded window @0 at 74.65% field / 16.91% Bone: 276px
          of Flare topbar and a 463px Espresso card, with only the title and the
          readout carrying a plate between them. Its light twin read 52.95 /
          36.19 on the same DOM — the two themes as exact mirrors, one 14.65pp
          over the 60 target and the other 7.05 under. A plate is the ground's
          OPPOSITE, so one block moves both the right way at once, and it did:
          66.01 / 25.28 in dark, 59.41 / 30.30 in light (the artifact committed
          at 80f643d, and unchanged at dc529fb). The figures are copied out of
          the artifact rather than off a --diff console line — the earlier
          53.00 / 36.24 and 66.03 / 25.30 were in no file anybody could check.
          THE DISCLOSURE AND THE CONTROL ARE ONE BLOCK because they are one
          thought — what this card is still missing, and the control that ends
          it. Which control that is depends on which side of setup the reader
          is on: before it, the thing missing is the user's numbers and the
          control goes to the card that takes them; after it, the thing missing
          is an explanation and the control opens the breakdown. The drawer
          stays OUTSIDE: it is conditional and it is the answer, not the
          question.
          The plate holds no accent (§2.1 rule 2 — see .counter-plate in
          tokens.css); .stage-col above it holds the only one on this card.
          A plate is a ground and a ground has to be there in every state, so
          this box is unconditional even when the disclosure inside it is not —
          a user past calibration gets the plate around the control alone. */}
      <div className="hero-foot counter-plate">
        {(isDemo || (hasScore && historyDays < CALIBRATION_DAYS)) && (
          <p className="calibrating">
            {/* NAMES THE ABSENCE, NOT A FAULT (Trust Rule 6). It states what
                the card has not got and what supplies it, in two fragments,
                and it never says the user is late, behind or missing
                something — nothing here is owed and no day was lost. It is
                also said EXACTLY ONCE per surface: this is the whole of the
                app's pre-setup ask on card 01, and it does not repeat, escalate
                or return. */}
            {isDemo && `${NO_SCORE_LINE} `}
            {/* THE CALIBRATION CLAUSE QUALIFIES A SCORE, SO IT WAITS FOR ONE
                (`hasScore`). The two halves used to be keyed independently, on
                the argument that "the 90-day clock runs on logged history
                either way, so it is a fact about the record on both sides of
                setup". That argument was written while this card still printed
                a demo-derived readout; the swap withheld the badge, the stage,
                the rating and the numeral, and it left this clause qualifying
                a quantity that is no longer on screen. Before setup the card
                then read "No score yet. Your numbers turn it on. Score still
                calibrating. Day 0 / 90" — a 0-of-90 progress readout for a
                number the same card has just refused to render, which is the
                exact device WeekBlock four elements up refuses to draw on
                Trust Rule 6 grounds ("an empty bar here would draw a target
                the user is short of"). Trust Rule 5 is carried before setup by
                NO_SCORE_LINE, which is the stronger form of it: the app is not
                projecting confidence it has not earned, it is printing no
                score at all. The clause is unchanged the moment PROFILE_SET
                lands, on day 3 or on day 89. */}
            {hasScore && historyDays < CALIBRATION_DAYS && (
              <>
                {/* Grotesk for the sentence, mono only for the index — the same
                    split .sim-note makes, and §11's "all numerals render in the
                    mono stack" applied to exactly the numerals. */}
                Score still calibrating.{' '}
                <span className="mono">
                  Day {historyDays} / {CALIBRATION_DAYS}
                </span>
              </>
            )}
          </p>
        )}
        {/* THE CONTROL, AND IT IS AN ANCHOR ON PURPOSE. Below 1024px app.css
            hides .hero-nav, .hero-side and .hero-stage-line wholesale, so on
            the 375px phone this product is built for there was no in-page
            navigation at all — every card was reached by scrolling. This is a
            plain <a> to the card that takes the numbers: keyboard-reachable,
            focusable, no JS scroll handling, and it lands focus on a
            tabIndex -1 labelled <section> rather than on <body> (the failure
            HeroShell's comment names, which is why ProfileCard grew the id and
            the label in the same change). Styled as a .btn because it is the
            card's one control; it grants nothing and pays nothing. */}
        {isDemo ? (
          <a className="btn hero-setup" href="#numbers">Set up my numbers</a>
        ) : (
          <button
            type="button"
            className="btn hero-why"
            aria-expanded={open}
            // aria-controls names the drawer this button owns. Held unconditional
            // rather than gated on `open`: with aria-expanded="false" beside it,
            // the relationship is the point even while the target is unmounted —
            // it is what lets AT jump from the trigger to what it opens.
            aria-controls="health-breakdown"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide the breakdown' : 'Why this stage?'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="health-breakdown" id="health-breakdown">
          <ul className="health-bars">
            {COMPONENT_ROWS.map(({ key, label }) => {
              const value = components[key]
              return (
                <li key={key} className="health-bar-row">
                  <span className="health-bar-label">{label}</span>
                  {value === undefined ? (
                    // Structurally excluded (no data behind it): shown as a
                    // neutral status, matching the profile card's "Not
                    // entered" — exclusion is honest, never a failure state.
                    <span className="health-unset">no data yet — not counted</span>
                  ) : (
                    <>
                      {/* Decorative bar (aria-hidden, like the boss HP track):
                          the mono value beside it carries the number, and a
                          progressbar role here would collide with the XP
                          bar's — these are readouts, not progress. */}
                      <div className="health-track" aria-hidden="true">
                        {value > 0 && (
                          <div
                            className="health-fill"
                            style={{ width: `${Math.min(100, value)}%` }}
                          />
                        )}
                      </div>
                      <span className="mono health-val index-roll" key={Math.round(value)}>
                        {Math.round(value)}
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {/* Fragmented to §7 rule 2, but the last clause is untouchable:
              "never counts against you" is Trust 6 stated to the one user who
              needs it — the one looking at a bar that isn't there. Cutting it
              for length would leave an absence looking like a penalty. */}
          <p className="health-note">
            Each bar reads one part, 0–100. Thin history pulls a bar toward 50.
            No data yet: left out of the score. It never counts against you.
          </p>
        </div>
      )}
    </section>
  )
}
