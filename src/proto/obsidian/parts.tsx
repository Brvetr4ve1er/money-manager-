/** Obsidian console primitives: instrument hooks, reactor gauge, bracketed panels. */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Instrument-style tween: counts from the previous value to `target` in `duration` ms. */
export function useCountUp(target: number, duration = 600): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(() => (reduced ? target : 0))
  const current = useRef(reduced ? target : 0)
  useEffect(() => {
    if (reduced) {
      current.current = target
      setValue(target)
      return
    }
    const from = current.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      current.current = from + (target - from) * eased
      setValue(current.current)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduced])
  return value
}

export function Panel({
  title,
  meta,
  children,
  className = '',
}: {
  title?: string
  meta?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`ob-panel ${className}`}>
      <i className="ob-c ob-c-tl" aria-hidden="true" />
      <i className="ob-c ob-c-tr" aria-hidden="true" />
      <i className="ob-c ob-c-bl" aria-hidden="true" />
      <i className="ob-c ob-c-br" aria-hidden="true" />
      {title && (
        <header className="ob-panel-h">
          <h2>{title}</h2>
          {meta && <span className="ob-panel-meta">{meta}</span>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Keycap({
  children,
  onClick,
  tone = 'default',
  className = '',
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'default' | 'cyan' | 'amber'
  className?: string
  ariaLabel?: string
}) {
  return (
    <button type="button" className={`ob-key ob-key-${tone} ${className}`} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  )
}

export function StatusDot({ tone = 'cyan', blink = false }: { tone?: 'cyan' | 'amber' | 'red' | 'dim'; blink?: boolean }) {
  return <i className={`ob-dot ob-dot-${tone} ${blink ? 'ob-blink' : ''}`} aria-hidden="true" />
}

/* ---------------- reactor gauge ---------------- */

const CX = 120
const CY = 120
const R = 96
const SWEEP = 270 // degrees, from -135 to +135 (0 = 12 o'clock)

function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)]
}
function arcPath(r: number): string {
  const [x0, y0] = polar(-SWEEP / 2, r)
  const [x1, y1] = polar(SWEEP / 2, r)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const TICKS = Array.from({ length: 55 }, (_, i) => -SWEEP / 2 + i * 5)

/** Breathing room as a reactor: fraction of holdings still free. Needle sweeps, core glows amber. */
export function ReactorGauge({ value, max, reduced }: { value: number; max: number; reduced: boolean }) {
  const frac = Math.max(0, Math.min(1, max > 0 ? value / max : 0))
  const needle = -SWEEP / 2 + SWEEP * frac
  const pct = Math.round(frac * 100)
  return (
    <svg className="ob-gauge" viewBox="0 -14 240 254" role="img" aria-label={`Reactor at ${pct} percent: ${Math.round(value)} of ${Math.round(max)} DA free`}>
      <defs>
        <radialGradient id="ob-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd48a" stopOpacity="1" />
          <stop offset="45%" stopColor="#ffb547" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
        </radialGradient>
        <filter id="ob-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {TICKS.map((deg, i) => {
        const major = i % 9 === 0
        const [x0, y0] = polar(deg, R + (major ? 14 : 9))
        const [x1, y1] = polar(deg, R + 4)
        return <line key={deg} x1={x0} y1={y0} x2={x1} y2={y1} className={major ? 'ob-tick-major' : 'ob-tick'} />
      })}
      {[0, 25, 50, 75, 100].map((p) => {
        const [x, y] = polar(-SWEEP / 2 + (SWEEP * p) / 100, R + 24)
        return (
          <text key={p} x={x} y={y + 3} textAnchor="middle" className="ob-gauge-num">
            {p}
          </text>
        )
      })}
      <path d={arcPath(R)} className="ob-arc-track" />
      <path d={arcPath(R)} className="ob-arc-fill" pathLength={100} strokeDasharray={`${frac * 100} 100`} />
      <circle cx={CX} cy={CY} r={44} className={`ob-core-glow ${reduced ? '' : 'ob-core-breathe'}`} fill="url(#ob-core)" filter="url(#ob-glow)" opacity={0.25 + frac * 0.75} />
      <circle cx={CX} cy={CY} r={18} fill="url(#ob-core)" opacity={0.5 + frac * 0.5} />
      <circle cx={CX} cy={CY} r={58} className="ob-core-ring" />
      <g className="ob-needle" style={{ transform: `rotate(${needle}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
        <line x1={CX} y1={CY - 60} x2={CX} y2={CY - R - 2} />
        <circle cx={CX} cy={CY - R - 2} r={2.5} />
      </g>
      <text x={CX} y={CY + 88} textAnchor="middle" className="ob-gauge-pct">
        {pct}% FREE
      </text>
    </svg>
  )
}

/* ---------------- small helpers ---------------- */

export const dayOf = (iso: string) => parseInt(iso.slice(8), 10)
export const fmtDay = (iso: string) => `${iso.slice(8)} OCT`
export const pad2 = (n: number) => String(Math.abs(n)).padStart(2, '0')

export function Icon({ name }: { name: 'home' | 'runway' | 'review' | 'log' }) {
  const d = {
    home: 'M3 12 L12 4 L21 12 M6 10 V20 H18 V10',
    runway: 'M2 12 H22 M6 9 V15 M12 7 V17 M18 9 V15',
    review: 'M3 5 H21 V19 H3 Z M3 9 H21 M8 9 V19',
    log: 'M4 6 H20 M4 12 H14 M4 18 H17',
  }[name]
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={d} />
    </svg>
  )
}
