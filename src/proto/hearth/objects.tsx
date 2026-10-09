/**
 * The light sources of the Hearth prototype: the breathing ember, the room
 * objects (lanterns, a window, a plant, an installment ring) and the little
 * dock icons. Everything here is inline SVG; state is carried by classes so
 * the stylesheet can light, dim, flicker or extinguish an object.
 */

import { useId, type CSSProperties } from 'react'

export type ObjectKind = 'lantern' | 'window' | 'plant' | 'ring'
export type ObjectState = 'lit' | 'dim' | 'flicker' | 'out' | 'hazy'

/** The hearth. `warmth` (0–1) scales the glow: more breathing room, more light. */
export function Ember({ warmth }: { warmth: number }) {
  const id = useId().replace(/:/g, '')
  const r = 56 + warmth * 40
  const style = { '--warm': warmth } as CSSProperties
  return (
    <svg className="ember" viewBox="0 0 320 320" aria-hidden="true" style={style}>
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

interface RoomObjectProps {
  kind: ObjectKind
  state: ObjectState
  progress?: { paid: number; total: number }
  size?: number
}

/** An obligation, seen as an object in the room. */
export function RoomObject({ kind, state, progress, size = 56 }: RoomObjectProps) {
  const id = useId().replace(/:/g, '')
  const circ = 2 * Math.PI * 29
  const frac = progress ? progress.paid / progress.total : 0
  return (
    <svg className={`obj obj-${kind} is-${state}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
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
        <g className="ring" transform="rotate(-90 32 32)">
          <circle className="ring-track" cx="32" cy="32" r="29" />
          <circle className="ring-fill" cx="32" cy="32" r="29" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} />
        </g>
      )}
    </svg>
  )
}

const ICONS: Record<string, string> = {
  home: 'M12 3c-4 6-7 9-7 13a7 7 0 0 0 14 0c0-4-3-7-7-13z',
  runway: 'M3 17c4-9 6 1 9-4s5 1 9-7M3 17h.01M21 6h.01',
  tray: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6M9 12h4',
  log: 'M12 5v14M5 12h14',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  auto: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
  back: 'M15 5l-7 7 7 7',
}

export function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}
