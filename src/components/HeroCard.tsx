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
  isDemo,
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
      {/* The card names what it measures, not what the measurement currently
          says. It used to title itself with the stage label — which the hero
          plate ALSO renders as an h2 at ≥1024, so the outline carried
          "Bonfire" twice, one of them at 13px. This is the section heading the
          explainability drawer below hangs off; the stage name is a line
          inside the readout now, not a second heading. */}
      <h2>Health score</h2>
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
      {/* Trust Rule 5, said out loud, in its two halves.
          WHOSE numbers (isDemo) comes first, because it is the bigger claim
          and it was missing entirely: before setup, SR/BA/EF/DT are computed
          from DEMO_PROFILE's invented 90,000 DA income and 45,000 DA fund, so
          a fresh install rendered "Health 59.0 / Bonfire / 3 of 4 stars" at
          the d2 tier off numbers no user ever entered — a fabricated score
          presented as fact, which is exactly what the cold-start gate in
          Root.tsx refuses to do one screen earlier. It compounds: the first
          ROLL_DAY persists that stage, and mapToStage's ±3 hysteresis then
          defends it against the user's real numbers. SimCard and ProfileCard
          each say it for their own surface; this is the loudest number the
          product computes and it said nothing.
          Then HOW MUCH HISTORY (historyDays) — the original line. It is
          keyed separately because the two states are independent: setup can
          land on day 3, and a user can log 90 days without ever completing
          setup, in which case the demo half must survive the calibration
          half dropping away.
          Deliberately not the words "demo profile": SimCard owns that phrase
          and a second copy of it would make the app say "demo" twice about
          two different things.
          OUTSIDE .hero-main on purpose: the ≥1024px block re-homes the stage
          badge, name and rating on the hero plate, and a disclosure that
          moved with them would blink out at a breakpoint. Live text, never
          aria-hidden: it is the disclosure. */}
      {(isDemo || historyDays < CALIBRATION_DAYS) && (
        <p className="calibrating">
          {isDemo && 'Placeholder numbers until setup. '}
          {historyDays < CALIBRATION_DAYS && (
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
      {open && (
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
