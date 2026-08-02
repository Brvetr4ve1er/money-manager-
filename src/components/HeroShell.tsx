import type { Stage } from '../engine/healthScore.ts'
import type { PixelPet } from '../engine/achievements.ts'
import { STAGE_META } from './HeroCard.tsx'

/**
 * HeroShell — the page header in both of its lives. On mobile it renders as
 * the compact topbar (wordmark + mute button, unchanged look); at ≥1024px the
 * SAME DOM becomes a full-viewport hero: giant bottom-anchored wordmark,
 * pill nav, thesis + CTA column, stage-colored glow (all media-queried in
 * app.css). One element serves both so the page keeps exactly one h1 and the
 * heading outline never forks per breakpoint.
 */

// Letter spans are the pull-up animation units. Split once at module scope —
// the word never changes, and per-render splitting would remount the spans
// and restart the load animation on every state change.
const WORDMARK_LETTERS = 'Ember'.split('')

export function HeroShell({
  stage,
  score,
  pets,
  muted,
  onToggleMute,
}: {
  stage: Stage
  score: number
  pets: PixelPet[]
  muted: boolean
  onToggleMute: () => void
}) {
  const meta = STAGE_META[stage]
  return (
    <header className="topbar">
      <div className="hero-frame">
        {/* Desktop-only section nav: plain anchors to the card ids, so it
            works with keyboard, AT, and no JS scroll handling. Hidden on
            mobile where the single column needs no jump points. */}
        <nav className="hero-nav" aria-label="Sections">
          <a href="#log">Log</a>
          <a href="#quests">Quests</a>
          <a href="#simulator">Simulator</a>
          <a href="#codex">Codex</a>
          <a href="#badges">Badges</a>
        </nav>
        {/* Stage-colored glow behind the wordmark — the desktop counterpart
            of the stage badge's fill, driven by the same STAGE_META so the
            hero can never glow a color the health engine didn't assign.
            Decorative: aria-hidden here, pointer-events: none in CSS. */}
        <div
          className="hero-glow"
          aria-hidden="true"
          style={{ background: `radial-gradient(circle, ${meta.color} 0%, transparent 62%)` }}
        />
        <div className="hero-grid">
          <div className="hero-word-col">
            {/* The stage badge rides above the wordmark on desktop — the
                hero owns the stage readout at this width (HeroCard sheds its
                duplicate, see app.css). Pets follow the badge exactly as on
                the mobile card: cosmetic loot beside, never inside. */}
            <div className="hero-stage-line hero-rise" style={{ animationDelay: '400ms' }}>
              <span
                className="hero-stage-badge"
                style={{ background: meta.color, boxShadow: `4px 4px 0 ${meta.colorSh}` }}
              >
                <span aria-hidden="true">🔥</span>
              </span>
              <span className="hero-stage-name">{meta.label}</span>
              {pets.length > 0 && (
                <span
                  className="hero-pets"
                  role="img"
                  aria-label={`Companions: ${pets.map((p) => p.name).join(', ')}`}
                >
                  {pets.map((p) => (
                    <span key={p.name} aria-hidden="true">{p.emoji}</span>
                  ))}
                </span>
              )}
            </div>
            {/* The wordmark is the page's single h1 (see App.test heading
                structure). aria-label carries the name whole; the per-letter
                spans (the staggered pull-up units) are aria-hidden so screen
                readers never spell E-m-b-e-r letter by letter. */}
            <h1 className="wordmark" aria-label="Ember">
              {WORDMARK_LETTERS.map((ch, i) => (
                <span
                  key={i}
                  className="wm-letter hero-rise"
                  aria-hidden="true"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {ch}
                </span>
              ))}
            </h1>
          </div>
          <div className="hero-side">
            <p className="hero-thesis hero-rise" style={{ animationDelay: '480ms' }}>
              Don&rsquo;t teach budgeting. Build financial instincts.
            </p>
            {/* Live readout, not a slogan: same score/stage every card
                renders from, so the hero and the drawer below always agree. */}
            <p className="hero-health mono hero-rise" style={{ animationDelay: '560ms' }}>
              Health {score.toFixed(1)} · {meta.label}
            </p>
            <a className="hero-cta hero-rise" style={{ animationDelay: '640ms' }} href="#log">
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
        <button
          className="btn hero-mute"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label="Mute sound"
        >
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>
    </header>
  )
}
