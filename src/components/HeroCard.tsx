import type { Stage } from '../engine/healthScore.ts'

const STAGE_META: Record<Stage, { label: string; stars: number; color: string; colorSh: string }> = {
  ember: { label: 'Ember', stars: 1, color: 'var(--flame)', colorSh: 'var(--flame-sh)' },
  hearth: { label: 'Hearth-fire', stars: 2, color: 'var(--gold)', colorSh: 'var(--gold-sh)' },
  bonfire: { label: 'Bonfire', stars: 3, color: 'var(--pink)', colorSh: 'var(--pink-sh)' },
  beacon: { label: 'Beacon', stars: 4, color: 'var(--violet)', colorSh: 'var(--violet-sh)' },
}

export function HeroCard({ stage, score }: { stage: Stage; score: number }) {
  const meta = STAGE_META[stage]
  return (
    <section className="card hero-card">
      <div
        className="stage-badge"
        style={{ background: meta.color, boxShadow: `6px 6px 0 ${meta.colorSh}` }}
      >
        <span className="stage-flame" aria-hidden="true">🔥</span>
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
    </section>
  )
}
