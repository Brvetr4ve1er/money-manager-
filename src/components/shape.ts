/**
 * Vector geometry for the mark (§4) and the glyph set (§8). Pure functions
 * over numbers, evaluated once at module scope: the path data is computed in
 * TypeScript instead of pasted in as opaque strings, so the construction rules
 * stay readable and a change to the superellipse exponent is one edit.
 *
 * Nothing here is a runtime dependency and nothing rasterises — every caller
 * ships plain <svg> elements.
 */

/** §4 container: superellipse, n = 4.2. Same exponent as --se-42 in tokens.css. */
export const SE_N = 4.2

/**
 * A superellipse |x/rx|^n + |y/ry|^n = 1, sampled as a closed polygon.
 *
 * 64 vertices, not a Bézier fit: the chord error peaks at 0.06% of the radius
 * (well under a tenth of a pixel at the §4 minimum size of 32px), and a
 * polygon cannot drift from the curve the way a hand-tuned Bézier does. The
 * parametrisation is x = sign(cos t)·|cos t|^(2/n), y likewise on sin — which
 * satisfies the implicit equation exactly, since |cos|² + |sin|² = 1.
 */
export function superellipsePath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  steps = 64,
): string {
  const pts: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = cx + Math.sign(c) * Math.abs(c) ** (2 / SE_N) * rx
    const y = cy + Math.sign(s) * Math.abs(s) ** (2 / SE_N) * ry
    pts.push(`${round(x)} ${round(y)}`)
  }
  return `M${pts.join('L')}Z`
}

/**
 * The squircle primitive: a rounded rect whose corners are superellipse-ish
 * rather than circular (§1 trait 04 — soft-serve terminals, squircle logic,
 * no sharp miters anywhere). One cubic per corner with its control points at
 * 0.22r from the corner apex; a circular arc would place them at 0.448r, so
 * pulling them in fills the corner out toward the square — the same visual
 * move corner-shape: superellipse() makes on a CSS box.
 *
 * `ccw` reverses the winding. Under the default nonzero fill rule a
 * counter-clockwise subpath drawn INSIDE a clockwise one cancels it to zero
 * and becomes a hole — that is how every glyph counter is cut, with no mask
 * and no second colour. A ccw subpath drawn where there is no ink underneath
 * would paint (winding −1 ≠ 0), so counters must stay strictly inside a form.
 */
export function boxPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  ccw = false,
): string {
  const rad = Math.min(r, w / 2, h / 2)
  const c = rad * 0.22
  const [x0, y0, x1, y1] = [x, y, x + w, y + h]
  if (ccw) {
    return (
      `M${round(x0 + rad)} ${round(y0)}` +
      `C${round(x0 + c)} ${round(y0)} ${round(x0)} ${round(y0 + c)} ${round(x0)} ${round(y0 + rad)}` +
      `L${round(x0)} ${round(y1 - rad)}` +
      `C${round(x0)} ${round(y1 - c)} ${round(x0 + c)} ${round(y1)} ${round(x0 + rad)} ${round(y1)}` +
      `L${round(x1 - rad)} ${round(y1)}` +
      `C${round(x1 - c)} ${round(y1)} ${round(x1)} ${round(y1 - c)} ${round(x1)} ${round(y1 - rad)}` +
      `L${round(x1)} ${round(y0 + rad)}` +
      `C${round(x1)} ${round(y0 + c)} ${round(x1 - c)} ${round(y0)} ${round(x1 - rad)} ${round(y0)}Z`
    )
  }
  return (
    `M${round(x0 + rad)} ${round(y0)}` +
    `L${round(x1 - rad)} ${round(y0)}` +
    `C${round(x1 - c)} ${round(y0)} ${round(x1)} ${round(y0 + c)} ${round(x1)} ${round(y0 + rad)}` +
    `L${round(x1)} ${round(y1 - rad)}` +
    `C${round(x1)} ${round(y1 - c)} ${round(x1 - c)} ${round(y1)} ${round(x1 - rad)} ${round(y1)}` +
    `L${round(x0 + rad)} ${round(y1)}` +
    `C${round(x0 + c)} ${round(y1)} ${round(x0)} ${round(y1 - c)} ${round(x0)} ${round(y1 - rad)}` +
    `L${round(x0)} ${round(y0 + rad)}` +
    `C${round(x0)} ${round(y0 + c)} ${round(x0 + c)} ${round(y0)} ${round(x0 + rad)} ${round(y0)}Z`
  )
}

/**
 * The 38° diagonal (§1 trait 09) as a four-corner band. Built from the angle
 * rather than from percentage coordinates so the shear stays 38° whatever the
 * container's aspect — a percentage polygon would shear with the box.
 * Negative degrees run up to the right in SVG's y-down space.
 */
export function bandPath(
  cx: number,
  cy: number,
  len: number,
  w: number,
  deg: number,
): string {
  const a = (deg * Math.PI) / 180
  const [ux, uy] = [Math.cos(a) * (len / 2), Math.sin(a) * (len / 2)]
  const [px, py] = [(-Math.sin(a) * w) / 2, (Math.cos(a) * w) / 2]
  // Wound clockwise, matching boxPath: a band that merges with other ink under
  // the nonzero rule must not arrive with the opposite winding, or the overlap
  // cancels to a hole.
  const corners: Array<[number, number]> = [
    [cx - ux + px, cy - uy + py],
    [cx - ux - px, cy - uy - py],
    [cx + ux - px, cy + uy - py],
    [cx + ux + px, cy + uy + py],
  ]
  return `M${corners.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`
}

/** Two decimals: at the §4 minimum size one unit of a 100-wide viewBox is a
    third of a pixel, so more precision only inflates the bundle. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}
