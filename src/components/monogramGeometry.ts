/**
 * THE MARK (§4) — the three-letter stack EMB in a superellipse container, as
 * pure geometry.
 *
 * Split out of Monogram.tsx so that BOTH consumers draw the identical mark:
 * the React component that renders it in the app, and scripts/brand-assets.ts,
 * which emits the favicon and the social card from these same numbers. A
 * hand-drawn favicon is how a brand's mark drifts from its own spec — this
 * module makes that impossible, because there is only one construction and
 * every surface reads it.
 *
 * Construction, transcribed from §4 and computed rather than drawn so every
 * number in that block is checkable against this file:
 *
 *   CONTAINER  superellipse n = 4.2, aspect 1:2.1 (brick) · 1:1 (badge) ·
 *              2.6:1 (plate)
 *   KEYLINE    outer contour offset by 6%, SAME colour as the letterforms
 *   PADDING    8%, uniform
 *   ROWS       3, stacked, gutters 5% of container height
 *   INK        the three row blocks fill 89.2% of the inner area — §4's
 *              "88% (±3)". The counters cut INTO that block are the negative
 *              space trait 02 asks to read; measuring the coverage after the
 *              counters would put §4's own numbers out of reach of any legible
 *              letterform (an 88%-after-counters E has 1.5-unit slots, which
 *              vanish below ~1px at the §4 minimum size).
 *   DIAGONAL   exactly one, 38°, traversing the full stack, in the counter
 *              colour so it reads through the ink instead of disappearing
 *              into it
 *   COLOUR     field FLARE · strokes GRAPHITE · counters BONE, and all three
 *              are pinned in both themes (--brand-*, see tokens.css): the mark
 *              is not a themed surface, and §2.2 keeps those three hexes fixed
 *              anyway.
 *
 * §4 forbids rotation, a third colour, gradients and stretching. There is no
 * parameter for any of them — the variants differ only in container aspect,
 * and `knockout` differs only in being one colour.
 */

import { bandPath, boxPath, superellipsePath } from './shape.ts'

export type MonogramVariant = 'brick' | 'badge' | 'plate' | 'knockout'

/** §4 container aspects. `knockout` is the brick geometry in one colour —
    §4 lists it as a lockup variant, but it is a colour mode, not a shape. */
const BOX: Record<MonogramVariant, { w: number; h: number }> = {
  brick: { w: 100, h: 210 },
  knockout: { w: 100, h: 210 },
  badge: { w: 100, h: 100 },
  plate: { w: 260, h: 100 },
}

/** Letter proportions, taken off the brick and held constant across variants
    so a badge is the same mark at a different aspect, never a redrawn one. */
const BAR = 12 / 57.67 /** arm thickness ÷ row height */
const STEM = 20 / 84 /** E/M stem width ÷ stack width */
const CLOSE = 12 / 84 /** B's closing right stem ÷ stack width */

export interface Geometry {
  w: number
  h: number
  container: string
  keyline: string
  ink: string[]
  counters: string[]
  band: string
}

function geometry(variant: MonogramVariant): Geometry {
  const { w, h } = BOX[variant]
  // §4 gives padding and the keyline offset as percentages OF THE WIDTH,
  // which is written for a portrait brick where width is the short side. On
  // the 2.6:1 plate the same 8% of width would inset 21% of the height and
  // eat the stack, so both are taken off the SHORT side — the intent is a
  // uniform inset, and on the brick (and badge) the two readings are equal.
  const short = Math.min(w, h)
  const pad = 0.08 * short
  const gutter = 0.05 * h
  const innerH = h - 2 * pad
  const rowH = (innerH - 2 * gutter) / 3
  // Rows span the padded width — except on the plate, where that would draw
  // 13:1 letters. There the stack keeps the brick's inner aspect (84:194) and
  // sits at the padded left edge, and the rest of the plate is field: §5
  // layout C is a subway lockup, i.e. a mark on a long plate, not a mark
  // smeared across one.
  const stackW = variant === 'plate' ? innerH / 2.31 : w - 2 * pad
  const x = pad
  const rowY = [0, 1, 2].map((i) => pad + i * (rowH + gutter))
  const bar = rowH * BAR
  const gap = (rowH - 3 * bar) / 2
  const stem = stackW * STEM
  const close = stackW * CLOSE
  const rowR = stackW * 0.07
  const slotR = Math.min(gap, stem) * 0.35

  const [yE, yM, yB] = rowY as [number, number, number]
  // Every letter is one full row block with counters cut out of it — trait 02,
  // read the gaps not the strokes. E and B share an arm rhythm; M is squared
  // (two bottom-open slots, no diagonal stroke) because §4 allows the stack
  // exactly ONE 38° diagonal and that one is the shear below.
  const ink = [
    boxPath(x, yE, stackW, rowH, rowR),
    boxPath(x, yM, stackW, rowH, rowR),
    boxPath(x, yB, stackW, rowH, rowR),
  ]
  const mSlot = (stackW - 3 * stem) / 2
  const counters = [
    // E — two right-open slots between the three arms.
    boxPath(x + stem, yE + bar, stackW - stem, gap, slotR),
    boxPath(x + stem, yE + 2 * bar + gap, stackW - stem, gap, slotR),
    // M — two bottom-open slots either side of the centre stem.
    boxPath(x + stem, yM + bar, mSlot, rowH - bar, slotR),
    boxPath(x + 2 * stem + mSlot, yM + bar, mSlot, rowH - bar, slotR),
    // B — two enclosed bowls, closed on the right by the `close` stem.
    boxPath(x + stem, yB + bar, stackW - stem - close, gap, slotR),
    boxPath(x + stem, yB + 2 * bar + gap, stackW - stem - close, gap, slotR),
  ]

  return {
    w,
    h,
    container: superellipsePath(w / 2, h / 2, w / 2, h / 2),
    // Offset by 6% of the short side, applied as an equal inset on both radii
    // so the keyline stays the same curve family as the contour it follows.
    keyline: superellipsePath(
      w / 2,
      h / 2,
      w / 2 - 0.06 * short,
      h / 2 - 0.06 * short,
    ),
    ink,
    counters,
    // Centred on the STACK, not on the container: on the plate the stack sits
    // left, and the one diagonal has to traverse the letters (§4) rather than
    // the empty field beside them. Length overshoots the diagonal of the box
    // so it always reaches both edges; the container clip trims it.
    band: bandPath(
      x + stackW / 2,
      h / 2,
      Math.hypot(w, h) * 1.8,
      0.11 * short,
      -38,
    ),
  }
}

/** Evaluated once at module scope — the four variants are constants, not
    per-render work. */
export const GEOMETRY: Record<MonogramVariant, Geometry> = {
  brick: geometry('brick'),
  badge: geometry('badge'),
  plate: geometry('plate'),
  knockout: geometry('knockout'),
}
