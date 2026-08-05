/**
 * Emits the shipped brand assets in public/ from the SAME geometry the app
 * renders its mark with (src/components/monogramGeometry.ts, §4).
 *
 *   public/icon.svg           the favicon — the EMB badge, 1:1
 *   public/icon-maskable.svg  the Android maskable icon — the badge inside a
 *                             full-bleed Flare field, mark held in the safe zone
 *   public/og.png             the 1200x630 social card — §5E, THE OBJECT
 *   public/apple-touch-icon.png  the iOS home-screen icon, 180x180
 *   docs/brand/og.svg         the same card as §5A, THE BRICK WALL — README's
 *                             header, and NOT a served asset (see DOCS below)
 *
 * WHY A SCRIPT AND NOT HAND-DRAWN SVG. Every previous Ember brand asset was
 * drawn by hand and every one of them drifted: the old favicon was a gold flame
 * on #ff4b2b with a #141414 stroke, which is neither the mark §4 specifies nor
 * a colour in §2's palette. Generating them means the favicon and the share
 * card cannot disagree with the mark in the app, ever — they are literally the
 * same path data.
 *
 * NOT A RUNTIME DEPENDENCY AND NOT A BUILD STEP. It runs on bare Node's type
 * stripping (`npm run brand`, Node >= 22.6 — --experimental-strip-types first
 * shipped in 22.6.0, which is why package.json's `engines` floor is 22.6 and
 * not 22) over Node built-ins only — the two
 * PNGs go through scripts/raster.ts, which is a scan converter and a PNG
 * writer in about 400 lines rather than a native rasteriser package. Nothing
 * in the app or the build imports any of it. The outputs are committed and
 * byte-stable; re-run it only when the mark or the card copy changes.
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
import { bandPath } from '../src/components/shape.ts'
import {
  createSurface,
  encodePng,
  fillPath,
  grain,
  strokePath,
  type Surface,
} from './raster.ts'
import type { Buffer } from 'node:buffer'

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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Served assets. Everything written here is fetched by a real client — the
    manifest, the favicon, the touch icon, the crawler's card. */
const OUT = join(ROOT, 'public')
/** Documentation assets. og.svg lives here, NOT in public/, because nothing on
    the web ever requests it: index.html points every crawler at og.png (they
    reject SVG) and the manifest points at the two icons. Its only reader is
    README's header, which GitHub resolves against the repo, not the origin — so
    shipping it in public/ put 6.5 KB of never-fetched bytes in every deploy. */
const DOCS = join(ROOT, 'docs', 'brand')

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

/* ── The two rasters ──────────────────────────────────────────────────────
   og.png and apple-touch-icon.png cannot be SVG: every social crawler that
   matters rejects SVG, and Safari ignores SVG touch icons. Both were drawn by
   hand before the design system existed and both had drifted — the card still
   read "BUILD FINANCIAL INSTINCTS", a claim HeroShell deleted from the product
   for naming a faculty the app cannot measure (§12.4). They are generated from
   the same GEOMETRY as everything above now, so they cannot drift again.

   scripts/raster.ts does the scan conversion in Node built-ins only; see its
   header for why no rasteriser package was taken. It has no font engine, which
   is the one real constraint on what these can be — so the card drops from §5
   layout A (og.svg, which keeps it, because README renders the SVG where a
   font engine exists) to §5 layout E, THE OBJECT: "single hard-lit product on
   flat Flare, centered, no shadow, no context". No type on it at all. The
   words live in og:title and og:description, which every crawler renders as
   text beside the image anyway — and §7's brief is to say less than you want
   to. The landing page already ships this exact composition as .lp-object. */

/** The mark, painted into a surface. Mirrors markBody's layer order exactly:
    field, ink, counters, the one diagonal, then the keyline outside the clip
    (a clipped stroke loses its outer half). */
function paintMark(
  s: Surface,
  variant: 'badge' | 'brick',
  place: { tx: number; ty: number; k: number },
): void {
  const g = GEOMETRY[variant]
  const clip = g.container
  fillPath(s, g.container, FLARE, place)
  for (const d of g.ink) fillPath(s, d, GRAPHITE, place, { clip })
  for (const d of g.counters) fillPath(s, d, BONE, place, { clip })
  fillPath(s, g.band, BONE, place, { clip })
  // 2px in OUTPUT pixels, not scaled by `place.k` — the raster equivalent of
  // the SVGs' vector-effect="non-scaling-stroke" (§5: always 2px, never 1px,
  // and it does not grow with the artwork).
  strokePath(s, g.keyline, GRAPHITE, 2, place)
}

function ogPng(): Buffer {
  const W = 1200
  const H = 630
  const brick = GEOMETRY.brick
  const s = createSurface(W, H, FLARE)
  // THE SHEAR — the one 38° diagonal (§1 trait 09), full-bleed and BEHIND the
  // object, so the mark is what breaks it. Overshoot the box diagonal so it
  // always reaches both edges.
  fillPath(s, bandPath(W / 2, H / 2, Math.hypot(W, H) * 1.4, 8, -38), GRAPHITE)
  // The object, dead-centre, at 80% of the frame height — macro-tight, the way
  // §8 frames a specimen. Clearspace is 25% of container width (§4) = 60px;
  // there is 480px of field on each side, so the ~60% negative field §5 asks
  // for is comfortably there.
  const k = (H * 0.8) / brick.h
  paintMark(s, 'brick', { tx: (W - brick.w * k) / 2, ty: (H - brick.h * k) / 2, k })
  grain(s)
  return encodePng(s)
}

/* The iOS touch icon. Same construction as maskable() above: a full-bleed
   field with the badge held at 62%, because iOS applies its own corner mask
   and only the centre survives a crop. 180x180 is the size iOS asks for. */
function touchIconPng(): Buffer {
  const S = 180
  const badge = GEOMETRY.badge
  const s = createSurface(S, S, FLARE)
  const k = (S * 0.62) / badge.w
  paintMark(s, 'badge', { tx: (S - badge.w * k) / 2, ty: (S - badge.h * k) / 2, k })
  return encodePng(s)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

mkdirSync(OUT, { recursive: true })
mkdirSync(DOCS, { recursive: true })
for (const [dir, label, name, body] of [
  [OUT, 'public', 'icon.svg', icon()],
  [OUT, 'public', 'icon-maskable.svg', maskable()],
  [DOCS, 'docs/brand', 'og.svg', og()],
] as const) {
  writeFileSync(join(dir, name), body + '\n')
  console.log(`[ember] wrote ${label}/${name}`)
}
for (const [name, body] of [
  ['og.png', ogPng()],
  ['apple-touch-icon.png', touchIconPng()],
] as const) {
  writeFileSync(join(OUT, name), body)
  console.log(`[ember] wrote public/${name}`)
}
