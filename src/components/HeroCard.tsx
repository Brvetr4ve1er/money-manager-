import { useState } from 'react'
import type { ComponentKey, Stage } from '../engine/healthScore.ts'
import type { PixelPet } from '../engine/achievements.ts'
import { CALIBRATION_DAYS } from '../engine/profile.ts'
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

/** Display order and names for the explainability drawer. */
const COMPONENT_ROWS: Array<{ key: ComponentKey; label: string }> = [
  { key: 'SR', label: 'Savings rate' },
  { key: 'BA', label: 'Budget' },
  { key: 'EF', label: 'Emergency fund' },
  { key: 'DT', label: 'Debt trend' },
  { key: 'IC', label: 'Impulse control' },
]

export function HeroCard({
  stage,
  score,
  pets,
  components,
  historyDays,
}: {
  stage: Stage
  score: number
  pets: PixelPet[]
  /** Per-component shrunk scores from computeHealthScore — absent = excluded. */
  components: Partial<Record<ComponentKey, number>>
  /** Days of logged history behind the score (engine/profile historyDays). */
  historyDays: number
}) {
  const meta = STAGE_META[stage]
  // Explainability drawer: the engine exposes its component breakdown "for
  // explainability UI" — this renders it. Cause-effect visibility is what
  // makes the score trainable instead of mystical; the copy explains the
  // parts, it never advises (no-verdict rule).
  const [open, setOpen] = useState(false)
  return (
    // is-open drives CONTAINER MORPH (§9 move 6): the card re-cuts its
    // superellipse from n 4.2 to 2.8 while the drawer is out, rather than
    // scaling. A class, not :has(), so the state that changes the shape is the
    // same state that renders the drawer — one source of truth.
    <section className={open ? 'card hero-card is-open' : 'card hero-card'}>
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">HLT—01</span>
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
              engagement decoration riding along. role="img" names them for AT
              the same way the stars are named. */}
          {pets.length > 0 && (
            <div
              className="pet-strip"
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
          )}
        </div>
        <div className="stage-info">
          <h2>{meta.label}</h2>
          {/* role="img": a generic div prohibits accessible naming, so without
              it the aria-label may be ignored and screen readers read the raw
              glyphs ("black star black star…") — or nothing. */}
          <div className="stars" role="img" aria-label={`${meta.stars} of 4 stars`}>
            <span aria-hidden="true">{'★'.repeat(meta.stars)}</span>
          </div>
          {/* INDEX ROLL (§9 move 4). The key is the rendered value, so a
              changed score remounts the readout and re-runs the stepped
              index; the class stays on the element that already holds the
              whole string — splitting the number into its own wrapper would
              be an invisible change here but a real one for anything reading
              the readout as a single run of text. */}
          <div className="mono score-line index-roll" key={score.toFixed(1)}>
            Health {score.toFixed(1)}
          </div>
        </div>
      </div>
      {/* Trust Rule 5, said out loud. Under 90 days of logged history the app
          states that the score is still calibrating instead of projecting
          confidence it hasn't earned — the shrink toward 50 was doing that
          work silently, and a silent hedge is not a disclosure.
          OUTSIDE .hero-main on purpose: at ≥1024px the hero shell owns the
          stage readout and app.css hides .hero-main, which would take this
          line with it — the calibration state must not blink out at a
          breakpoint. Live text, never aria-hidden: it is the disclosure. */}
      {historyDays < CALIBRATION_DAYS && (
        <p className="calibrating">
          {/* Grotesk for the sentence, mono only for the index — the same
              split .sim-note makes, and §11's "all numerals render in the
              mono stack" applied to exactly the numerals. */}
          Score still calibrating.{' '}
          <span className="mono">
            Day {historyDays} / {CALIBRATION_DAYS}
          </span>
        </p>
      )}
      <button
        type="button"
        className="btn hero-why"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide the breakdown' : 'Why this stage?'}
      </button>
      {open && (
        <div className="health-breakdown">
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
