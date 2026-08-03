import { useId, type CSSProperties } from 'react'
import { bandPath, boxPath, dotPath, segPath, starPath } from './shape.ts'

/**
 * The glyph set (§8): flat vector marks on squircle geometry, replacing the
 * emoji that used to carry the stage flame, the companions, the boss, the
 * ledger shield, the medal and the mute state. §8 retires emoji as UI
 * iconography outright, and emoji were never neutral here anyway — they are a
 * different vendor's illustration on every device, they render in colours
 * nothing in this palette can answer for, and their contrast is unmeasurable.
 *
 * Construction, per §8: flat vector only, two colours, squircle-based,
 * geometric, front-facing, symmetrical, slightly menacing in a friendly way.
 * No line-art, no gradient, no third tone.
 *
 * The two colours are currentColor and whatever is behind — every counter is
 * cut out rather than filled, so a glyph inherits the ink of the box it sits
 * in and cannot invent a foreground/field pair that nobody checked against
 * §2.1. That is why the eyes are holes: it keeps the whole set legal on the
 * four surfaces these marks land on (--field, --sunken, the Marigold
 * achievement tile, the stage badge's four checked fields).
 *
 * TEXT ALTERNATIVES. Every glyph is aria-hidden, and every call site carries
 * the meaning in real text — the emoji were doing that job and it does not
 * get dropped:
 *   flame          → the stage name beside it (HeroCard / HeroShell)
 *   star           → role="img" + "N of 4 stars" on the rating row
 *   check          → the quest's own label ("… — done") on the row button
 *   pets           → role="img" + "Companions: …" on the strip
 *   monster        → "The Impulse Monster" in the sentence it prefixes
 *   shield         → the word "Resisted" beside it (Ledger)
 *   medal          → the .sr-only "Earned: " prefix + badge name + date
 *   sound / muted  → the mute button's own aria-label + aria-pressed
 * A glyph added without one of those is a regression, not a style choice.
 */

export type GlyphName =
  | 'flame'
  | 'star'
  | 'check'
  | 'monster'
  | 'shield'
  | 'medal'
  | 'sound'
  | 'muted'
  | 'kit'
  | 'sabr'
  | 'nahla'
  | 'hakim'
  | 'jamra'
  | 'farasha'
  | 'dib'
  | 'mishmish'
  | 'sultan'

/**
 * Three ordered layers, painted into a mask: `ink` is the form, `cut` are the
 * counters taken back out of it, `mark` is ink returned INSIDE a counter (a
 * pupil in an eye, a tooth in a mouth). Masking rather than path winding
 * because the forms overlap on purpose — a reversed subpath cancels ink only
 * where ink already is, and it paints where there is none.
 */
interface GlyphShape {
  ink: string[]
  cut?: string[]
  mark?: string[]
}

const GLYPHS: Record<GlyphName, GlyphShape> = {
  // Stage mark. A squircle body with a peak and one counter — the flame reads
  // as its gap, not its outline (trait 02).
  flame: {
    ink: [boxPath(7, 11, 18, 18, 9), boxPath(12, 2, 8, 12, 4)],
    cut: [boxPath(12, 17, 8, 9, 4)],
  },
  // The stage rating mark. Was '★'.repeat(n) — a character, which §8 retires
  // as UI iconography, and specifically U+2605, which several Android and
  // Windows stacks substitute with an emoji-presentation glyph in a vendor's
  // own yellow. That made the measured "Flare on card field, 3.02:1" pair
  // fiction on those machines. Drawn, it is currentColor and the ink is
  // whatever the row was measured at. Every vertex radiused, outer points and
  // inner notches alike (§1 trait 04).
  star: {
    ink: [starPath(16, 16.5, 14.5, 6.4, 5, 2.4)],
  },
  // The completion mark, likewise: was '✓'. Two bars with dot caps, so the
  // terminals are soft-serve rather than mitred.
  check: {
    ink: [
      segPath(7, 16.5, 13.5, 23, 5),
      segPath(13.5, 23, 25, 8.5, 5),
      dotPath(7, 16.5, 2.5),
      dotPath(13.5, 23, 2.5),
      dotPath(25, 8.5, 2.5),
    ],
  },
  // The Impulse Monster. Horns and a squared grin: beatable, never a threat —
  // Trust Rule 6 lives in the drawing as well as the copy.
  monster: {
    ink: [boxPath(3, 8, 26, 20, 8), boxPath(3, 2, 7, 9, 3), boxPath(22, 2, 7, 9, 3)],
    cut: [boxPath(8, 13, 6, 5, 2), boxPath(18, 13, 6, 5, 2), boxPath(9, 21, 14, 4, 2)],
    mark: [boxPath(12, 21, 2.4, 3, 0.8), boxPath(17.6, 21, 2.4, 3, 0.8)],
  },
  shield: {
    ink: [boxPath(5, 3, 22, 17, 7), boxPath(10, 15, 12, 13, 6)],
    cut: [boxPath(10, 8, 12, 8, 3.5)],
  },
  medal: {
    ink: [boxPath(8, 2, 5, 12, 2), boxPath(19, 2, 5, 12, 2), boxPath(7, 11, 18, 18, 9)],
    cut: [boxPath(13, 17, 6, 6, 3)],
  },
  sound: {
    ink: [
      boxPath(3, 12, 8, 8, 3),
      boxPath(8, 7, 8, 18, 4),
      boxPath(19, 10, 3, 12, 1.5),
      boxPath(24, 13, 3, 6, 1.5),
    ],
  },
  // Muted is the same speaker with the composition's one diagonal struck
  // through it — 38°, like every other shear in the system.
  muted: {
    // The bar stands where the waves are in `sound`, clear of the speaker: a
    // slash laid ACROSS the form would need a gutter cut through it, and at
    // 24px that severs the speaker into unreadable pieces.
    ink: [boxPath(3, 12, 8, 8, 3), boxPath(8, 7, 8, 18, 4), bandPath(23, 16, 15, 3.2, -38)],
  },

  // ── Companions ──────────────────────────────────────────────────────────
  // Same skull-and-two-counters chassis across the shelf, differentiated by
  // silhouette (ears, horns, shell, wings) rather than by detail: they render
  // at 16px inside a .mark badge, where detail is noise.
  kit: {
    ink: [boxPath(6, 9, 20, 18, 9), boxPath(13.5, 2, 5, 8, 2.4), boxPath(13, 23, 6, 7, 3)],
    cut: [boxPath(10.5, 14, 4.5, 4.5, 2.2), boxPath(17, 14, 4.5, 4.5, 2.2)],
  },
  sabr: {
    ink: [
      boxPath(3, 9, 26, 15, 7),
      boxPath(12.5, 2, 7, 9, 3.5),
      boxPath(3, 21, 7, 6, 2.5),
      boxPath(22, 21, 7, 6, 2.5),
    ],
    cut: [
      boxPath(13.6, 4.6, 2.2, 2.2, 1.1),
      boxPath(16.2, 4.6, 2.2, 2.2, 1.1),
      boxPath(8, 12, 7, 6, 3),
      boxPath(17, 12, 7, 6, 3),
      boxPath(12.5, 18, 7, 4, 2),
    ],
  },
  nahla: {
    ink: [boxPath(0.5, 6, 10.5, 10, 5), boxPath(21, 6, 10.5, 10, 5), boxPath(9, 7, 14, 21, 6)],
    cut: [
      boxPath(10.6, 14, 10.8, 3, 1.4),
      boxPath(10.6, 20, 10.8, 3, 1.4),
      boxPath(11.5, 10, 3, 3, 1.5),
      boxPath(17.5, 10, 3, 3, 1.5),
    ],
  },
  hakim: {
    ink: [boxPath(4, 6, 24, 23, 10), boxPath(4, 2, 8, 8, 3), boxPath(20, 2, 8, 8, 3)],
    cut: [boxPath(7, 12, 8, 8, 4), boxPath(17, 12, 8, 8, 4), boxPath(14.5, 22, 3, 4, 1.4)],
    mark: [boxPath(9.5, 15, 3, 3, 1.5), boxPath(19.5, 15, 3, 3, 1.5)],
  },
  jamra: {
    ink: [
      boxPath(4, 9, 24, 15, 7),
      boxPath(2, 2, 8, 9, 3.5),
      boxPath(22, 2, 8, 9, 3.5),
      boxPath(10, 17, 12, 11, 5),
    ],
    cut: [
      boxPath(7.5, 12.5, 7, 3.6, 1.7),
      boxPath(17.5, 12.5, 7, 3.6, 1.7),
      boxPath(12.5, 21, 2.6, 2.6, 1.3),
      boxPath(16.9, 21, 2.6, 2.6, 1.3),
    ],
  },
  farasha: {
    ink: [
      boxPath(0.5, 4, 14.3, 10, 5),
      boxPath(17.2, 4, 14.3, 10, 5),
      boxPath(2.5, 15, 12.3, 11, 5),
      boxPath(17.2, 15, 12.3, 11, 5),
      boxPath(14, 5, 4, 22, 2),
    ],
    cut: [
      boxPath(3.5, 6.5, 6, 4.6, 2.3),
      boxPath(22.5, 6.5, 6, 4.6, 2.3),
      boxPath(5.5, 17.5, 5, 5, 2.5),
      boxPath(21.5, 17.5, 5, 5, 2.5),
    ],
  },
  dib: {
    ink: [
      boxPath(5, 8, 22, 15, 7),
      boxPath(3.5, 1.5, 8, 10, 3.5),
      boxPath(20.5, 1.5, 8, 10, 3.5),
      boxPath(11, 16, 10, 12, 5),
    ],
    cut: [
      boxPath(8, 12, 6, 3.4, 1.6),
      boxPath(18, 12, 6, 3.4, 1.6),
      boxPath(13.5, 19, 5, 3, 1.4),
      boxPath(13, 23.6, 6, 1.6, 0.8),
    ],
  },
  mishmish: {
    ink: [boxPath(4, 7, 24, 19, 9), boxPath(4.5, 2, 7, 7, 2.6), boxPath(20.5, 2, 7, 7, 2.6)],
    cut: [
      boxPath(9.5, 12, 4.5, 6, 2.2),
      boxPath(18, 12, 4.5, 6, 2.2),
      boxPath(14.2, 20, 3.6, 2.6, 1.2),
    ],
  },
  // The mane is the whole glyph: one ring, with the face returned inside it.
  sultan: {
    ink: [boxPath(1, 2, 30, 28, 14)],
    cut: [boxPath(8, 9, 16, 15, 7)],
    mark: [
      boxPath(11, 13, 3.6, 3.6, 1.7),
      boxPath(17.4, 13, 3.6, 3.6, 1.7),
      boxPath(12, 18, 8, 4.6, 2.2),
    ],
  },
}

export function Glyph({
  name,
  className,
  style,
}: {
  name: GlyphName
  className?: string
  style?: CSSProperties
}) {
  // React's useId contains colons, which are legal in an id but break the
  // url(#…) reference when it is parsed as CSS — strip them.
  const uid = useId().replace(/:/g, '')
  const g = GLYPHS[name]
  return (
    <svg
      viewBox="0 0 32 32"
      className={className === undefined ? 'glyph' : `glyph ${className}`}
      style={style}
      // Decorative by construction — see the call-site table above.
      aria-hidden="true"
      focusable="false"
    >
      {/* #fff/#000 here are mask luminance values, not palette colours:
          nothing on screen is painted either of them, and the visible ink is
          currentColor. */}
      <mask id={uid} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect x="0" y="0" width="32" height="32" fill="#000" />
        {g.ink.map((d, i) => (
          <path key={i} d={d} fill="#fff" />
        ))}
        {g.cut?.map((d, i) => (
          <path key={i} d={d} fill="#000" />
        ))}
        {g.mark?.map((d, i) => (
          <path key={i} d={d} fill="#fff" />
        ))}
      </mask>
      <rect x="0" y="0" width="32" height="32" fill="currentColor" mask={`url(#${uid})`} />
    </svg>
  )
}
