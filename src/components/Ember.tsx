import { useId, type CSSProperties } from 'react'
import type { Stage } from '../engine/healthScore.ts'

/** How much light each stage gives off — the ember's only input is the
    health stage, so warmth can never be bought with XP (two-track rule). */
export const STAGE_WARMTH: Record<Stage, number> = {
  ember: 0.3,
  hearth: 0.55,
  bonfire: 0.8,
  beacon: 1,
}

/**
 * The hearth itself: a breathing ember whose halo grows with the stage.
 * Pure SVG, decorative (aria-hidden) — the stage name and score beside it
 * carry the meaning. `puff` fires the Clay-style squish once per change.
 */
export function Ember({ stage, size = 160, puff = false }: { stage: Stage; size?: number; puff?: boolean }) {
  const id = useId().replace(/:/g, '')
  const warmth = STAGE_WARMTH[stage]
  const r = 56 + warmth * 40
  const style = { '--warm': warmth, width: size, height: size } as CSSProperties
  return (
    <svg
      className={`ember${puff ? ' is-puff' : ''}`}
      viewBox="0 0 320 320"
      aria-hidden="true"
      style={style}
      data-stage={stage}
    >
      <defs>
        <radialGradient id={`${id}h`}>
          <stop offset="0" stopColor="#ff8a4c" stopOpacity=".55" />
          <stop offset=".45" stopColor="#ffb46b" stopOpacity=".16" />
          <stop offset="1" stopColor="#ffb46b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}c`} cx=".5" cy=".55" r=".5">
          <stop offset="0" stopColor="#fff3dc" />
          <stop offset=".35" stopColor="#ffd2a6" />
          <stop offset=".7" stopColor="#ff7a45" stopOpacity=".9" />
          <stop offset="1" stopColor="#ff7a45" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}s`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id={`${id}w`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <circle className="ember-halo" cx="160" cy="186" r={r * 1.75} fill={`url(#${id}h)`} />
      <circle className="ember-glow" cx="160" cy="186" r={r} fill={`url(#${id}c)`} filter={`url(#${id}s)`} />
      <g className="ember-flame" filter={`url(#${id}w)`}>
        <path d="M160 92c-26 42-50 70-50 104a50 50 0 0 0 100 0c0-34-24-62-50-104z" fill="#ff7a45" opacity=".92" />
        <path d="M160 142c-12 22-26 36-26 56a26 26 0 0 0 52 0c0-20-14-34-26-56z" fill="#ffd2a6" />
        <path d="M160 178c-6 10-12 18-12 28a12 12 0 0 0 24 0c0-10-6-18-12-28z" fill="#fff8ec" />
      </g>
      <g className="sparks" fill="#ffd2a6">
        <circle cx="138" cy="120" r="2" />
        <circle cx="186" cy="104" r="1.6" />
        <circle cx="172" cy="80" r="1.3" />
      </g>
      <ellipse cx="160" cy="254" rx="92" ry="9" fill="rgba(0,0,0,.22)" />
      <path d="M86 248c20-10 128-10 148 0" stroke="#ffb46b" strokeOpacity=".35" strokeWidth="1.5" fill="none" />
    </svg>
  )
}
