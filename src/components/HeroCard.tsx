import { useState } from 'react'
import type { ComponentKey, Stage } from '../engine/healthScore.ts'
import type { PixelPet } from '../engine/achievements.ts'
import { Ember } from './Ember.tsx'

/** Stage → label/stars/glow, shared with the desktop HeroShell so the hero
    glow and this card can never disagree about a stage. The ember's warmth
    is the stage's real visual (see Ember.tsx); `color` only tints the glow. */
export const STAGE_META: Record<Stage, { label: string; stars: number; color: string; colorSh: string }> = {
  ember: { label: 'Ember', stars: 1, color: 'rgba(255, 122, 69, 0.55)', colorSh: 'var(--flame-sh)' },
  hearth: { label: 'Hearth-fire', stars: 2, color: 'rgba(255, 180, 107, 0.6)', colorSh: 'var(--gold-sh)' },
  bonfire: { label: 'Bonfire', stars: 3, color: 'rgba(255, 210, 166, 0.65)', colorSh: 'var(--pink-sh)' },
  beacon: { label: 'Beacon', stars: 4, color: 'rgba(255, 243, 220, 0.7)', colorSh: 'var(--violet-sh)' },
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
  puff = false,
}: {
  stage: Stage
  score: number
  pets: PixelPet[]
  /** Per-component shrunk scores from computeHealthScore — absent = excluded. */
  components: Partial<Record<ComponentKey, number>>
  /** True while a reward is landing: the ember squishes once (Clay spring). */
  puff?: boolean
}) {
  const meta = STAGE_META[stage]
  // Explainability drawer: the engine exposes its component breakdown "for
  // explainability UI" — this renders it. Cause-effect visibility is what
  // makes the score trainable instead of mystical; the copy explains the
  // parts, it never advises (no-verdict rule).
  const [open, setOpen] = useState(false)
  return (
    <section className="card hero-card">
      <div className="hero-main">
        <div className="stage-col">
          {/* The hearth: the one place the health stage is shown as light.
              Warmth is a pure function of the stage (STAGE_WARMTH), so the
              fire can never be bought with XP. */}
          <div className="stage-badge">
            <Ember stage={stage} size={150} puff={puff} />
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
              {pets.map((p) => (
                <span key={p.name} aria-hidden="true">{p.emoji}</span>
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
          <div className="mono score-line">
            Health {score.toFixed(1)}
          </div>
        </div>
      </div>
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
                      <span className="mono health-val">{Math.round(value)}</span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="health-note">
            Each bar reads one part of the picture, 0–100. Thin history pulls a
            bar toward the middle (50); a part with no data yet is left out of
            the score entirely — it never counts against you.
          </p>
        </div>
      )}
    </section>
  )
}
