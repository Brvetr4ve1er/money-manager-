import { useMemo } from 'react'
import { Monogram } from './Monogram.tsx'
import { Wordmark } from './Wordmark.tsx'
import { Ledger } from './Ledger.tsx'
import { todayISO } from '../state/store.ts'
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
 *      behind, not stacked above. The product shot below mounts a real <Ledger>,
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
 * EVERY CLAIM MAPS TO SHIPPED CODE. The spec-sheet grid names four mechanics
 * that exist today (healthScore.ts, the resist path in reducer.ts + Ledger's
 * resisted stat, simulator.ts, boss.ts); the rules band restates the Trust Rules
 * the engines already keep. Nothing here is a roadmap item sold as shipped —
 * if a line stops being true, delete the line, not the qualifier.
 *
 * TWO CLAIMS ARE MECHANICALLY BOUND rather than typed, because those are the
 * two that would rot first: the note-key strip is rendered FROM
 * NOTE_DENOMINATIONS_DA, and the product shot is rendered BY <Ledger> itself.
 * Change the denominations or the card and this page changes with them.
 *
 * THE PRODUCT SHOT. This page used to argue that no screenshot was possible,
 * on the grounds that the only thing available to show was a demo profile's
 * numbers and that presenting fabricated figures as a product shot inverts
 * Trust Rule 5. Half of that still holds and half of it was too wide. What
 * Trust Rule 5 forbids is projecting CONFIDENCE the app has not earned — a
 * score, a stage, a trend, a verdict about a person. A ledger card holding
 * seven sample rows makes no such claim: it states what a card looks like, it
 * is captioned as sample rows in those words, and it is the only surface in
 * the app that reads as pure structure. So the shot shows the ledger and
 * nothing else, it is rendered by the real component through the real grouping
 * engine (so it cannot drift), and the scope line the card states about itself
 * ("Totals only. No averages, no comparisons.") is IN the shot rather than
 * cropped out of it.
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

/** §5B, captioned with mono index labels (§1 trait 10). Four, because the app
    has four mechanics — the denominator is a count, not a decoration. */
const MECHANICS = [
  {
    title: 'Health score',
    body: 'Five components. Shrunk for thin data. It explains; it never advises.',
  },
  {
    title: 'The resist',
    // "Never fed into the score" was false: profile.ts counts capped resists
    // and yielded impulses and feeds both to impulseControlScore, one of the
    // five weighted health components. Only the kept-DA TOTAL is excluded
    // (Ledger.tsx). The claim is scoped to the thing that is actually
    // excluded — on a page whose whole subject is the trust boundary, this is
    // the one badge that must not overstate it.
    // "Resisted", not "Kept", matching the chip it describes: the app observed
    // the tap, not the outcome — see the chip in Ledger.tsx.
    body: 'Resisted, not spent. Summed for the month. The total is not a score input.',
  },
  {
    title: 'The simulator',
    body: 'Baseline against scenario. States the tradeoff. Never the verdict.',
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
              {/* THE POSITION, PLAINLY. Manual-first and DA-denominated is
                  what this product IS, not a limitation it works around, so it
                  is stated in the second paragraph of the page instead of
                  being left for someone to discover in the amount field. The
                  claims: DA is the only unit the app formats (every amount in
                  the product renders `N DA`), and entry is by hand — there is
                  no import path, no aggregator and no bank call anywhere in
                  src. */}
              <p className="lp-sub">
                Built for Algeria. Every amount in DA, entered by hand. Cash
                does not show up in a bank feed. It shows up here.
              </p>
              {/* THE HAND-OFF — the reason to send this to someone, above the
                  fold, on the accent bar.

                  It is the reason and not a slogan: the friend most likely to
                  need this is the one who will not hand a bank login to an
                  app, and every refusal named here is a real absence in the
                  code. No account: there is no auth, no server and no network
                  call in src. No bank login: nothing reads a bank, which is
                  why logging is manual. No card: Trust Rule 2 — no purchase
                  path exists, so there is nothing to be sold or cancelled.
                  "A purchase is two taps" is the note pad plus the log button
                  with the category already defaulted, and App.test performs
                  exactly those two taps to keep the number honest. */}
              <p className="lp-share">
                Send it to a friend. It asks them for nothing. No account, no
                bank login, no card. A purchase is two taps.
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
        <section id="spec" className="lp-spec" aria-labelledby="lp-spec-h">
          <div className="lp-measure">
            <h2 id="lp-spec-h" className="lp-section-h">
              The spec sheet
            </h2>
            <p className="lp-spec-lede">
              Four mechanics. All of them shipped. The card below is the app's
              own, running.
            </p>

            {/* ── THE PRODUCT SHOT ────────────────────────────────────────
                Not an image. This is <Ledger>, the component the app renders,
                fed seven sample rows through the same groupTransactionsByDay
                the app uses — so the day headings, the day totals, the resist
                row, the month's resisted chip and the card's own scope line
                are all computed here exactly as they are in the product.
                A PNG would need regenerating whenever the card changed and
                would silently rot when nobody did. This cannot.

                ARIA-HIDDEN, AND THAT IS THE HONEST MODEL. A screenshot's
                content belongs in its alt text; the figcaption is that alt
                text. Hiding the subtree also settles three things at once:
                the card's own <h2>Recent</h2> and day <h3>s stay out of the
                page outline (a heading list must name the page's sections, not
                a picture's internals), the <Ledger>'s live region is never
                exposed on a surface whose live-region contract belongs to the
                app, and nothing inside can take focus.

                THE LAST POINT IS A CONSTRAINT, NOT A CONVENIENCE: aria-hidden
                over a focusable element is a keyboard trap with no accessible
                name. The sample covers three days precisely because Ledger
                grows its expand button on the fourth, and Root.test asserts
                the shot holds no focusable node — so the sample cannot quietly
                grow one. */}
            <figure className="lp-shot">
              <div className="lp-shot-frame" aria-hidden="true">
                <Ledger transactions={shotRows} today={today} />
              </div>
              <figcaption className="lp-shot-cap">
                {/* .lp-shot-tag, not .lp-index: that class means "this badge's
                    place in the four-mechanic grid" and is read as a set. */}
                <span className="lp-shot-tag">Sample rows · nobody's data</span>
                Grouped by day. Each day's spend sits in its heading. The
                resist under Today shows what it avoided and adds nothing to
                the day. The card states its own scope: totals only.
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
          {/* One 38° Flare band splitting the canvas (§5D), broken once by the
              rule plates in front of it. It carries no type: a rotated line
              centred on the same point as the plates is occluded at its middle
              at every width — the section shipped reading "…VER CROSSED." on
              desktop and as rotated letter fragments in orange slivers at
              375px. See .lp-band in landing.css for why the geometry has no
              lane to move it into. The sentence is real, unrotated text in the
              lede below, where it can be read. */}
          <div className="lp-band" aria-hidden="true" />
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
