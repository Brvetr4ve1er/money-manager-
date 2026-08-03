/**
 * Emits the shipped brand assets in public/ from the SAME geometry the app
 * renders its mark with (src/components/monogramGeometry.ts, §4).
 *
 *   public/icon.svg           the favicon — the EMB badge, 1:1
 *   public/icon-maskable.svg  the Android maskable icon — the badge inside a
 *                             full-bleed Flare field, mark held in the safe zone
 *   public/og.svg             the 1200x630 social card — §5A, THE BRICK WALL
 *
 * WHY A SCRIPT AND NOT HAND-DRAWN SVG. Every previous Ember brand asset was
 * drawn by hand and every one of them drifted: the old favicon was a gold flame
 * on #ff4b2b with a #141414 stroke, which is neither the mark §4 specifies nor
 * a colour in §2's palette. Generating them means the favicon and the share
 * card cannot disagree with the mark in the app, ever — they are literally the
 * same path data.
 *
 * NOT A RUNTIME DEPENDENCY AND NOT A BUILD STEP. It runs on bare Node's type
 * stripping (`npm run brand`, Node >= 22), produces plain text, and nothing in
 * the app or the build imports it. The outputs are committed; re-run it only
 * when the mark or the card copy changes.
 *
 * COLOURS ARE INLINE HEXES HERE, which is the one place in this repo that is
 * allowed. These files are loaded OUTSIDE the document — a favicon and an
 * og:image get no cascade, so a var(--brand-field) reference in them resolves
 * to nothing and the mark renders blank. The hexes are read from the §2 table
 * below and must stay identical to tokens.css.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GEOMETRY } from '../src/components/monogramGeometry.ts'

/** §2 CORE. The only three tones the mark is built from (§4). */
const FLARE = '#F93E06'
const GRAPHITE = '#2A2D2C'
const BONE = '#F5E6E0'

/** §3 tiers. Self-hosted or system-stacked only — no CDN reference may appear
    in a shipped asset, and an og:image is rasterised by a stranger's crawler
    with no network of ours available at all. */
const DISPLAY = "'Archivo Black','Arial Black','Helvetica Neue',Helvetica,sans-serif"
const UI = "'Space Grotesk','Archivo',Helvetica,Arial,sans-serif"
const MONO = "'JetBrains Mono','Martian Mono',ui-monospace,Menlo,Consolas,monospace"

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** The mark, as SVG elements in its own viewBox coordinates. `keyline` is
    drawn outside any clip — a clipped stroke loses its outer half. */
function markBody(variant: 'badge' | 'brick', idPrefix: string): string {
  const g = GEOMETRY[variant]
  return [
    `<clipPath id="${idPrefix}c"><path d="${g.container}"/></clipPath>`,
    `<g clip-path="url(#${idPrefix}c)">`,
    `<path d="${g.container}" fill="${FLARE}"/>`,
    ...g.ink.map((d) => `<path d="${d}" fill="${GRAPHITE}"/>`),
    ...g.counters.map((d) => `<path d="${d}" fill="${BONE}"/>`),
    // The one 38° diagonal (§4), in the counter colour so it reads THROUGH the
    // ink instead of disappearing into it.
    `<path d="${g.band}" fill="${BONE}"/>`,
    `</g>`,
    // 2px non-scaling: §5 has exactly one border width and it does not scale
    // with the artwork, so the keyline holds at 16px and at 512px alike.
    `<path d="${g.keyline}" fill="none" stroke="${GRAPHITE}" stroke-width="2" vector-effect="non-scaling-stroke"/>`,
  ].join('')
}

/* ── The favicon ──────────────────────────────────────────────────────────
   The BADGE variant (1:1), not the brick: §4 lists badge as the avatar lockup,
   and at 16-32px a 1:2.1 portrait brick letterboxes into a sliver while a
   square fills the tab. §4's minimum size (32px) is honest about the floor —
   below it the three rows read as texture, which is still the mark's silhouette
   and still unmistakably not a generic globe. */
function icon(): string {
  const g = GEOMETRY.badge
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.w} ${g.h}" width="${g.w}" height="${g.h}">` +
    `<title>Ember</title>` +
    markBody('badge', 'i') +
    `</svg>`
  )
}

/* ── The Android maskable icon ────────────────────────────────────────────
   A maskable icon is cropped by the launcher to whatever shape the OS wants
   (circle, squircle, teardrop), and only the central 80% is guaranteed to
   survive. So the field bleeds to all four edges and the mark is held at 62%
   of the box, centred — comfortably inside the safe circle at any crop. */
function maskable(): string {
  const g = GEOMETRY.badge
  const S = 0.62
  const off = (g.w * (1 - S)) / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.w} ${g.h}" width="${g.w}" height="${g.h}">` +
    `<title>Ember</title>` +
    `<rect width="${g.w}" height="${g.h}" fill="${FLARE}"/>` +
    `<g transform="translate(${round(off)} ${round(off)}) scale(${S})">${markBody('badge', 'm')}</g>` +
    `</svg>`
  )
}

/* ── The social card ──────────────────────────────────────────────────────
   §5A, THE BRICK WALL: full-bleed Flare, one centred lockup, ~60% negative
   field, one 38° shear, mono spec labels in the corners.

   CONTRAST (§2.1) is the layout here exactly as it is on the landing page.
   Bone on Flare is 3.01:1 and Graphite on Flare is 3.79:1 — both FAIL AA for
   body text. So the only thing on the field is the 132px wordmark (large text,
   legal) and the mark itself; every string under 24px sits on a Bone or
   Graphite plate. That is why the card has a plate across its foot rather than
   copy floating on the orange.

   1200x630 is the dimension pair in index.html's og:image:width/height. */
function og(): string {
  const W = 1200
  const H = 630
  const brick = GEOMETRY.brick
  // The lockup: mark + stacked word, sized together and centred as one unit.
  const brickH = 270
  const brickW = (brick.w / brick.h) * brickH
  const rowW = 316 /* the common measure both wordmark rows are set to (§4) */
  const gap = 44
  const lockX = (W - (brickW + gap + rowW)) / 2
  const lockY = 104
  // Two rows at 0.78 leading (§3 d1), optically centred against the brick.
  const rowH = 132 * 0.78
  const wordX = lockX + brickW + gap
  const baseline = lockY + (brickH - 2 * rowH) / 2 + 132 * 0.74

  const specPlate = (x: number, y: number, w: number, text: string, anchor: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="40" rx="12" fill="${GRAPHITE}"/>` +
    `<text x="${anchor === 'end' ? x + w - 18 : x + 18}" y="${y + 26}" text-anchor="${anchor}" ` +
    `font-family="${MONO}" font-size="17" letter-spacing="2.4" fill="${BONE}">${text}</text>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<title>Ember — a money app that runs on your phone, not on your bank</title>` +
    // §8's fine offset-print grain at 6%, the only texture on this surface.
    `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter>` +
    `<clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>` +
    `<g clip-path="url(#frame)">` +
    `<rect width="${W}" height="${H}" fill="${FLARE}"/>` +
    // THE SHEAR — one 38° diagonal cuts the composition (§1 trait 09). Behind
    // the lockup and the plate, so the containers are what break it.
    `<rect x="-200" y="${H / 2 - 4}" width="${W + 400}" height="8" fill="${GRAPHITE}" ` +
    `transform="rotate(-38 ${W / 2} ${H / 2})"/>` +
    `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.06" style="mix-blend-mode:overlay"/>` +
    // Corner spec labels (§8), on Graphite plates — 17px mono may not sit on a
    // 3.79:1 field (§2.1 rule 1), so it sits on 11.4:1 instead.
    specPlate(48, 40, 168, 'EMBER—01', 'start') +
    specPlate(W - 48 - 168, 40, 168, 'LOCAL/FIRST', 'end') +
    // The mark, at its §4 brick aspect. Never stretched — the height drives it.
    `<g transform="translate(${round(lockX)} ${lockY}) scale(${round(brickH / brick.h)})">` +
    markBody('brick', 'o') +
    `</g>` +
    // The word, stacked (§1 trait 03) and Bone straight on the field: 132px is
    // display type, where 3.01:1 clears WCAG's large-text floor. Both rows are
    // set to one common measure via textLength so they carry equal optical
    // mass (§4) — tracked, never scaled, which §4 forbids.
    `<g font-family="${DISPLAY}" font-weight="900" font-size="132" fill="${BONE}">` +
    `<text x="${round(wordX)}" y="${round(baseline)}" textLength="${rowW}" lengthAdjust="spacing">EMB</text>` +
    `<text x="${round(wordX)}" y="${round(baseline + rowH)}" textLength="${rowW}" lengthAdjust="spacing">ER</text>` +
    `</g>` +
    // THE PLATE across the foot. Every string under 24px on this card is in
    // here, at 11.4:1.
    `<rect x="80" y="410" width="${W - 160}" height="180" rx="28" fill="${BONE}" stroke="${GRAPHITE}" stroke-width="2"/>` +
    `<text x="112" y="470" font-family="${DISPLAY}" font-weight="900" font-size="40" letter-spacing="-0.5" fill="${GRAPHITE}">BUILT FLAT. LOGGED IN DA.</text>` +
    `<text x="112" y="512" font-family="${UI}" font-weight="500" font-size="26" fill="${GRAPHITE}">A money app that runs on your phone, not on your bank.</text>` +
    `<text x="112" y="558" font-family="${MONO}" font-size="19" letter-spacing="2.7" fill="${GRAPHITE}">NO ACCOUNT · NO BANK LINK · EXPORT ALWAYS</text>` +
    `</g></svg>`
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

mkdirSync(OUT, { recursive: true })
for (const [name, body] of [
  ['icon.svg', icon()],
  ['icon-maskable.svg', maskable()],
  ['og.svg', og()],
] as const) {
  writeFileSync(join(OUT, name), body + '\n')
  console.log(`[ember] wrote public/${name}`)
}
