/**
 * An obligation seen as an object in the room — a lantern, a window, a plant
 * or an installment ring — ported from the Hearth prototype. Pure inline SVG;
 * the state is carried by a class so room-object.css can light, dim, flicker
 * or extinguish it. Decorative only (aria-hidden): every caller states the
 * same meaning in text next to it, so nothing is conveyed by light alone.
 */

import { useId } from 'react'
import './room-object.css'

export type ObjectKind = 'lantern' | 'window' | 'plant' | 'ring'
export type ObjectState = 'lit' | 'dim' | 'flicker' | 'out' | 'hazy'

export interface RoomObjectProps {
  kind: ObjectKind
  state: ObjectState
  /** Installment ring progress (kind 'ring'); ignored for other kinds. */
  progress?: { paid: number; total: number }
  size?: number
  className?: string
}

const RING_R = 29
const RING_CIRC = 2 * Math.PI * RING_R

export function RoomObject({ kind, state, progress, size = 56, className }: RoomObjectProps) {
  const id = useId().replace(/:/g, '')
  const frac = progress && progress.total > 0 ? Math.max(0, Math.min(1, progress.paid / progress.total)) : 0
  return (
    <svg
      className={`obj obj-${kind} is-${state}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      data-state={state}
    >
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor="#ffb46b" stopOpacity=".75" />
          <stop offset=".5" stopColor="#ff8a4c" stopOpacity=".25" />
          <stop offset="1" stopColor="#ff8a4c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="obj-glow" cx="32" cy="34" r="30" fill={`url(#${id})`} />
      {kind === 'window' && (
        <g className="obj-body">
          <rect className="obj-flame" x="14" y="12" width="36" height="40" rx="5" />
          <rect x="12" y="10" width="40" height="44" rx="6" />
          <path d="M32 10v44M12 32h40" />
        </g>
      )}
      {kind === 'plant' && (
        <g className="obj-body">
          <path className="obj-leaf" d="M32 42c-2-14-12-21-19-21 2 13 9 19 19 21z" />
          <path className="obj-leaf" d="M32 42c2-14 12-21 19-21-2 13-9 19-19 21z" />
          <path d="M32 44V22" />
          <path d="M19 44h26l-3 12H22z" />
        </g>
      )}
      {(kind === 'lantern' || kind === 'ring') && (
        <g className="obj-body">
          <path d="M32 6v6" />
          <path d="M22 14h20l-3-4H25z" />
          <rect x="19" y="14" width="26" height="32" rx="8" />
          <path className="obj-flame" d="M32 22c-5 8-8 12-8 17a8 8 0 0 0 16 0c0-5-3-9-8-17z" />
          <rect x="23" y="46" width="18" height="5" rx="2" />
        </g>
      )}
      {kind === 'ring' && (
        <g className="obj-ring" transform="rotate(-90 32 32)">
          <circle className="ring-track" cx="32" cy="32" r={RING_R} />
          <circle
            className="ring-fill"
            cx="32"
            cy="32"
            r={RING_R}
            strokeDasharray={RING_CIRC}
            strokeDashoffset={RING_CIRC * (1 - frac)}
          />
        </g>
      )}
    </svg>
  )
}
