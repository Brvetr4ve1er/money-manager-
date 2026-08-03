import { Monogram } from './Monogram.tsx'
import { Wordmark } from './Wordmark.tsx'

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
 *   2. NO LIVE REGIONS HERE. App's two role="status" regions must mount with
 *      the app and stay mounted (announce-on-change). Entering the app mounts
 *      them once and nothing ever unmounts them — this surface is left behind,
 *      not stacked above.
 *   3. NO SCORE, NO DEMO DATA. A stranger has logged nothing, so there is
 *      nothing honest to show them. Every number on this page is either an
 *      index label or a rule of the product. Trust Rule 5.
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
 * kept stat, simulator.ts, boss.ts); the rules band restates the Trust Rules
 * the engines already keep. Nothing here is a roadmap item sold as shipped —
 * if a line stops being true, delete the line, not the qualifier.
 *
 * LAYOUT (§5 signature layouts, in order down the page):
 *   A. THE BRICK WALL — full-bleed Flare, one centred container, 60% negative
 *   B. THE SPEC SHEET — 4-up badges on Espresso, mono index captions
 *   D. THE SHEAR      — one 38° Flare band, display type parallel to it
 *   E. THE OBJECT     — the mark alone, hard-lit, dead-centre on flat Flare
 *   C. THE PLATE      — footer as a subway lockup on Marigold, hard keyline
 *
 * CONTRAST (§2.1, computed not assumed — this is the layout constraint, not a
 * checkbox). Bone-on-Flare is 3.01:1 and Graphite-on-Flare is 3.79:1: BOTH
 * FAIL AA for body text. So on a Flare field only the d1 wordmark, the ≥24px
 * shear line, the mark and the keylines sit directly on the colour. Every
 * string under 24px on this page sits on a Bone plate (11.4:1), an Espresso
 * ground (13.4:1), a Graphite plate (11.4:1), Sand (9.4:1) or Marigold
 * (6.2:1). That rule is what produces the plate-and-field composition.
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
    body: 'Kept, not spent. Summed for the month. The total is not a score input.',
  },
  {
    title: 'The simulator',
    body: 'Baseline against scenario. States the tradeoff. Never the verdict.',
  },
  {
    title: 'The monster',
    body: "Last week's spend is its HP. Beatable. Never shaming.",
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

export function Landing({ onEnter }: { onEnter: () => void }) {
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
              <p className="lp-sub">
                Manual logging in dinars. Everything stays in this browser.
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
            <p className="lp-spec-lede">Four mechanics. All of them shipped.</p>
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
          {/* One 38° Flare band with the type parallel to it. The line is set
              at --fs-h2 (24px floor, bold) so Graphite-on-Flare's 3.79:1 lands
              inside §2.1's large-text allowance. Shrinking this text makes the
              band illegal — it is not a stylistic size. */}
          <p className="lp-band" aria-hidden="true">
            <span className="lp-band-text">Two tracks. Never crossed.</span>
          </p>
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
            context, cropping the frame (§8: the object is a specimen). There
            is no product screenshot here on purpose: the only screenshot this
            repo could show a stranger is a demo profile's numbers, and
            presenting fabricated figures as a product shot is Trust Rule 5 in
            reverse. */}
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
