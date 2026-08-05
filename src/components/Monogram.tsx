import { useId, type CSSProperties } from 'react'
import { GEOMETRY, type MonogramVariant } from './monogramGeometry.ts'

/**
 * THE MARK (§4) — the three-letter stack EMB in a superellipse container.
 *
 * The construction (container aspects, keyline offset, padding, row gutters,
 * ink coverage, the one 38° diagonal) lives in monogramGeometry.ts, which
 * scripts/brand-assets.ts also reads to emit the favicon and the social card.
 * One set of numbers, every surface — the mark on a share card can never drift
 * from the mark in the app.
 *
 * CRISP AT 32px: the keyline is a non-scaling 2px stroke, so it stays exactly
 * the §5 border width at every size instead of thinning to a hairline when the
 * mark is small; the letterform slots are ~2 units on a 100-unit box, which
 * resolve at the §4 minimum (32px tall brick / 32px badge).
 */

export type { MonogramVariant }

export function Monogram({
  variant = 'brick',
  className,
  style,
}: {
  variant?: MonogramVariant
  className?: string
  style?: CSSProperties
}) {
  // React's useId contains colons, which are legal in an id but break the
  // url(#…) reference when it is parsed as CSS — strip them.
  const uid = useId().replace(/:/g, '')
  const g = GEOMETRY[variant]
  const knockout = variant === 'knockout'
  return (
    <svg
      viewBox={`0 0 ${g.w} ${g.h}`}
      className={className === undefined ? 'monogram' : `monogram ${className}`}
      style={style}
      // Decorative: the page h1 carries the word EMBER, and §4 is explicit
      // that the brick is the visual lockup for that name, not a second one.
      aria-hidden="true"
      focusable="false"
    >
      {knockout ? (
        // One colour. The counters and the shear cannot be knocked out by
        // winding here — the shear crosses the gutters, where there is no ink
        // to cancel and a reversed subpath would paint instead of cut — so the
        // knockout is masked. #fff/#000 are mask luminance values, not palette
        // colours: nothing on screen is painted either of them.
        <>
          <mask id={`m${uid}`}>
            {g.ink.map((d, i) => (
              <path key={i} d={d} fill="#fff" />
            ))}
            {g.counters.map((d, i) => (
              <path key={i} d={d} fill="#000" />
            ))}
            <path d={g.band} fill="#000" />
          </mask>
          <rect
            x="0"
            y="0"
            width={g.w}
            height={g.h}
            fill="currentColor"
            mask={`url(#m${uid})`}
          />
        </>
      ) : (
        <>
          <clipPath id={`c${uid}`}>
            <path d={g.container} />
          </clipPath>
          <g clipPath={`url(#c${uid})`}>
            <path d={g.container} fill="var(--brand-field)" />
            {g.ink.map((d, i) => (
              <path key={i} d={d} fill="var(--brand-form)" />
            ))}
            {g.counters.map((d, i) => (
              <path key={i} d={d} fill="var(--brand-counter)" />
            ))}
            <path d={g.band} fill="var(--brand-counter)" />
          </g>
        </>
      )}
      {/* The keyline is outside the clip: a clipped stroke loses its outer
          half. 2px non-scaling — §5 has exactly one border width and it does
          not scale with the artwork. */}
      <path
        d={g.keyline}
        fill="none"
        stroke={knockout ? 'currentColor' : 'var(--brand-form)'}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
