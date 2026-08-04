import type { Stage } from '../engine/healthScore.ts'
import type { PixelPet } from '../engine/achievements.ts'
import { STAGE_META } from './HeroCard.tsx'
import { Monogram } from './Monogram.tsx'
import { Wordmark } from './Wordmark.tsx'
import { Glyph } from './Glyph.tsx'

/**
 * HeroShell — the page header in both of its lives, one DOM.
 *
 * Below 1024px it is a band, above it a full-viewport field — but it is the
 * SAME composition at both, which it was not before: §5 layout A, a full-bleed
 * Flare field with the stacked display lockup centred in it, one 38° shear
 * passing behind, 6% grain over, and mono spec plates in the corners. The
 * pieces a 320px band has no room for (the nav plate, the thesis and CTA, the
 * stage plate, the third corner label) are the only things a media query in
 * app.css adds — one DOM is what keeps the page at exactly one h1 and stops
 * the heading outline forking per breakpoint.
 *
 * The layout it replaces aped a different reference: a giant bottom-anchored
 * wordmark, a floating pill nav and a stage-coloured radial glow. None of the
 * three survives contact with this system — §5 puts the composition in one
 * centred container, §1 trait 01 says nothing floats, and a radial wash is a
 * gradient many times over §2's 8% ceiling.
 *
 * THE STACK (§9 move 1) drives the entrance: the mark, then each wordmark row,
 * then the supporting copy, each dropping 20px top-down on the entrance curve
 * at a 70ms stagger, with the container keyline drawing last (app.css). The
 * delays are inline because they are per-element data, not style.
 */

export function HeroShell({
  stage,
  score,
  pets,
  muted,
  isDemo,
  onToggleMute,
}: {
  stage: Stage
  score: number
  pets: PixelPet[]
  muted: boolean
  /** True while the stage on this plate runs on DEMO_PROFILE, not the user's. */
  isDemo: boolean
  onToggleMute: () => void
}) {
  const meta = STAGE_META[stage]
  // The corner index (§1 trait 10 / §8: caption with mono spec labels in the
  // corners). Rounded to whole points on purpose: it is an index label, not
  // the readout — HeroCard's drawer owns the precise figure.
  const index = Math.round(score)
  return (
    <header className="topbar">
      <div className="hero-frame">
        {/* THE PLATE (§5 layout C), not the pill that used to hang here: an
            ink plate with a hard keyline, touching the frame's top edge —
            the one place per layout where the container meets the frame (§8).
            Plain anchors to the card ids, so it works with keyboard, AT and
            no JS scroll handling; hidden on mobile, where a single column
            needs no jump points. */}
        <nav className="hero-nav" aria-label="Sections">
          {/* The mark, knocked out to one colour because it sits on the ink
              plate. Decorative — the h1 below carries the name. */}
          <Monogram variant="knockout" className="hero-nav-mark" />
          <a href="#log">Log</a>
          <a href="#quests">Quests</a>
          <a href="#simulator">Simulator</a>
          <a href="#codex">Codex</a>
          <a href="#badges">Badges</a>
        </nav>

        {/* Corner spec labels. Both sit on an ink plate rather than directly
            on the Flare field: §2.1 rule 1 is absolute — 11px mono may not sit
            on a 3.79:1 field, and a spec label is exactly the "form help text"
            that rule names. On the plate it reads at 11.4:1 (light) / 13.4:1
            (dark). */}
        <span
          className="hero-spec hero-spec-tl hero-rise"
          style={{ animationDelay: '420ms' }}
          aria-hidden="true"
        >
          EMB—00
        </span>

        <div className="hero-grid">
          {/* THE single centred container. Bone, so the display type inside it
              is 11.4:1 rather than the 3.79:1 it would be straight on Flare,
              and so the shear passes BEHIND it — centre everything, then break
              it once with a diagonal (§8). */}
          <div className="hero-word-col">
            <div className="hero-lockup">
              {/* §4: the brick is the visual lockup; the full word stays the
                  h1 for assistive tech. Both are here, which is the whole
                  point of that sentence. */}
              <Monogram
                variant="brick"
                className="hero-brick hero-rise"
                style={{ animationDelay: '0ms' }}
              />
              {/* The page's single h1 (App.test heading structure) — shared
                  with the cold-start landing, which owns the same one h1 when
                  IT is the surface on screen (see Wordmark.tsx / Root.tsx).
                  riseFrom 70: one row after the mark, 70ms stagger — §9 move
                  1's cadence, rows dropping top-down. */}
              <Wordmark riseFrom={70} />
            </div>
            <div className="hero-side">
              {/* §7.3: the old thesis ("Build financial instincts") named a
                  faculty the app cannot measure and does not train — an
                  adjectivised claim, and close enough to a behavioural-change
                  promise to graze §12.4. These three fragments name what the
                  app literally does instead, and the last one is the product
                  commitment the simulator's no-verdict rule already keeps. */}
              <p className="hero-thesis hero-rise" style={{ animationDelay: '210ms' }}>
                Log the spend. Read the numbers. No verdicts.
              </p>
              <a
                className="hero-cta hero-rise"
                style={{ animationDelay: '280ms' }}
                href="#log"
              >
                Start logging
                <span className="hero-cta-chip" aria-hidden="true">
                  {/* Inline arrow — no icon dependency; currentColor keeps it
                      on the chip's theme-stable palette. */}
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Stage readout, cornered as a plate. The hero owns it at this width
            (HeroCard sheds its duplicate — see app.css), and the pets ride
            beside the badge exactly as they do on the card: cosmetic loot
            beside the score's mark, never inside it. */}
        <div className="hero-stage-line hero-rise" style={{ animationDelay: '350ms' }}>
          <span
            className="hero-stage-badge"
            style={{ background: meta.field, color: meta.ink }}
          >
            <Glyph name="flame" />
          </span>
          {/* An h2, not a span. At ≥1024px app.css hides .hero-card .hero-main
              — which is where HeroCard's stage <h2> and its rating live — so a
              span here made the heading outline gain a level-2 heading on
              mobile and lose it on desktop, the exact per-breakpoint fork this
              file's one-DOM rule exists to prevent. The .hero-stage-name rule
              carries the plate-scale treatment, so nothing changes visually.
              Only one of the two is ever in the tree: the other side of the
              breakpoint has display:none, which removes it from it. */}
          <h2 className="hero-stage-name">{meta.label}</h2>
          {/* The rating had no desktop equivalent at all, so assistive tech
              lost it entirely above 1024px. Same wrapper and same label as
              HeroCard's — role="img" because a generic element cannot take an
              accessible name, and the marks are drawn glyphs (§8). */}
          <span className="stars" role="img" aria-label={`${meta.stars} of 4 stars`}>
            {Array.from({ length: meta.stars }, (_, i) => (
              <Glyph name="star" key={i} />
            ))}
          </span>
          {/* Whose numbers. At ≥1024 the hero is the full viewport, so this
              plate carries the stage above the fold and HeroCard's disclosure
              is a scroll away — the one width where the loudest claim can be
              read without the sentence that qualifies it. Inside the plate,
              not on the field beside it: .hero-stage-line is Bone with
              Graphite type (11.4:1), and an 11px string on the Flare field
              would break §2.1 rule 1. The line is display:none below 1024,
              where HeroCard's copy is the only one on screen. */}
          {isDemo && <span className="hero-stage-note mono">Placeholder until setup</span>}
          {pets.length > 0 && (
            <span
              className="hero-pets"
              role="img"
              aria-label={`Companions: ${pets.map((p) => p.name).join(', ')}`}
            >
              {/* .mark: §1 trait 01 — badges, not loose glyphs, exactly as the
                  mobile pet strip renders them. */}
              {pets.map((p) => (
                <span className="mark" key={p.name} aria-hidden="true">
                  <Glyph name={p.glyph} />
                </span>
              ))}
            </span>
          )}
        </div>

        {/* The live health index as a corner spec label — `62/100`, the §1
            trait 10 fractional label doing real work. aria-hidden, and that is
            a change: HeroCard's readout used to be display:none at ≥1024, so
            this was the score's only exposure there and had to stay in the
            tree. The card keeps its readout at every width now (it is the
            drawer's subject), so this goes back to being what it looks like —
            a printed corner index, rounded to whole points, beside the card's
            precise figure. One live source for the number, one printed one. */}
        <span
          className="hero-spec hero-spec-bl mono hero-rise"
          style={{ animationDelay: '420ms' }}
          aria-hidden="true"
        >
          {/* INDEX ROLL (§9 move 4) on the numeral only: the label beside it is
              not a numeral, and hero-rise already owns this element's
              `animation`. The key is the rendered value, so a changed score
              remounts the span and re-runs the stepped index. */}
          Health <span className="index-roll" key={index}>{index}</span>/100
        </span>

        <button
          className="btn hero-mute"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label="Mute sound"
        >
          {/* The button's own label and pressed state are the alternative —
              the glyph is decorative (§8 retired the speaker emoji). */}
          <Glyph name={muted ? 'muted' : 'sound'} />
        </button>
      </div>
    </header>
  )
}
