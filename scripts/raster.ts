/**
 * A path rasteriser and a PNG writer, in Node built-ins only.
 *
 * WHY THIS EXISTS. Two shipped assets have to be PNG and cannot be SVG:
 * public/og.png, because every social crawler that matters (WhatsApp,
 * Facebook, Telegram) rejects SVG outright, and public/apple-touch-icon.png,
 * because Safari ignores SVG touch icons. Both were hand-drawn before
 * docs/brand/DESIGN-SYSTEM.md existed and both drifted from the mark — the og
 * card still read "BUILD FINANCIAL INSTINCTS", a claim the product itself
 * deleted for grazing §12.4. The fix is the same one brand-assets.ts already
 * applies to the SVGs: generate them from src/components/monogramGeometry.ts,
 * so a shipped asset cannot disagree with the mark in the app.
 *
 * NOT A DEPENDENCY. `node:zlib` and `node:buffer` are the whole import list.
 * Ember takes no runtime dependency and no build-time one either; a rasteriser
 * package (sharp, resvg, canvas — all native) would have been both.
 *
 * WHAT IT DELIBERATELY CANNOT DO: type. There is no font engine here and
 * shipping one is not proportionate, so the assets this writes are the layouts
 * that carry no type — §5 layout E (THE OBJECT) for the card, the maskable
 * badge for the touch icon. Everything with a typeset line stays SVG.
 *
 * Coverage antialiasing is by supersampling: paths are scan-converted at SS×
 * and box-filtered down, so an edge resolves in SS² steps. SS = 4 gives 17
 * levels, which is past the point where banding is visible on a flat fill.
 */

import { deflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'

const SS = 4

/** translate-then-scale. §4 forbids rotation and stretching, so there is no
    parameter for either — one uniform factor, never two. */
export interface Placement {
  tx: number
  ty: number
  k: number
}

export const IDENTITY: Placement = { tx: 0, ty: 0, k: 1 }

export interface Surface {
  /** Output size, in CSS pixels. */
  w: number
  h: number
  /** RGB at SS× — three bytes per subpixel, no alpha: every surface here is
      opaque, and an alpha channel would only be a fourth byte of the same
      background colour. */
  px: Uint8Array
}

type Point = [number, number]
type Subpath = Point[]

export function createSurface(w: number, h: number, bg: string): Surface {
  const [r, g, b] = hex(bg)
  const px = new Uint8Array(w * SS * h * SS * 3)
  for (let i = 0; i < px.length; i += 3) {
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
  }
  return { w, h, px }
}

/** #rrggbb → bytes. The three §2 hexes are the only callers. */
function hex(s: string): [number, number, number] {
  const n = parseInt(s.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * SVG path data → flattened subpaths, in device (SS×) coordinates.
 *
 * M/L/C/Q/Z only, which is the whole vocabulary shape.ts emits — it builds
 * every form from a superellipse polygon, a squircle rounded-rect and a band,
 * so there is no arc, no smooth-shorthand and no relative command anywhere in
 * the geometry this file rasterises. An unknown command is a bug in shape.ts,
 * not a case to guess at, so it throws.
 */
function parsePath(d: string, p: Placement): Subpath[] {
  const X = (x: number) => (p.tx + x * p.k) * SS
  const Y = (y: number) => (p.ty + y * p.k) * SS
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const out: Subpath[] = []
  let cur: Subpath = []
  let cx = 0
  let cy = 0
  let i = 0
  const num = (): number => Number(tokens[i++])
  const push = (): void => {
    if (cur.length > 2) out.push(cur)
    cur = []
  }
  while (i < tokens.length) {
    const cmd = tokens[i++]
    switch (cmd) {
      case 'M': {
        push()
        cx = num()
        cy = num()
        cur.push([X(cx), Y(cy)])
        break
      }
      case 'L': {
        cx = num()
        cy = num()
        cur.push([X(cx), Y(cy)])
        break
      }
      case 'C': {
        const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()]
        flatten(cur, [X(cx), Y(cy)], [X(x1), Y(y1)], [X(x2), Y(y2)], [X(x3), Y(y3)])
        cx = x3
        cy = y3
        break
      }
      case 'Q': {
        const [x1, y1, x2, y2] = [num(), num(), num(), num()]
        // A quadratic is the cubic with both controls at 2/3 toward the apex.
        flatten(
          cur,
          [X(cx), Y(cy)],
          [X(cx + (2 / 3) * (x1 - cx)), Y(cy + (2 / 3) * (y1 - cy))],
          [X(x2 + (2 / 3) * (x1 - x2)), Y(y2 + (2 / 3) * (y1 - y2))],
          [X(x2), Y(y2)],
        )
        cx = x2
        cy = y2
        break
      }
      case 'Z':
        push()
        break
      default:
        throw new Error(`raster: unsupported path command ${cmd}`)
    }
  }
  push()
  return out
}

/** Uniform subdivision, stepped off the control polygon's length so a corner
    fillet on a 16px icon and the same fillet on a 440px card both land under a
    third of a device pixel of chord error. */
function flatten(into: Subpath, p0: Point, p1: Point, p2: Point, p3: Point): void {
  const len =
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
    Math.hypot(p3[0] - p2[0], p3[1] - p2[1])
  const n = Math.min(64, Math.max(4, Math.ceil(len / 2)))
  for (let s = 1; s <= n; s++) {
    const t = s / n
    const u = 1 - t
    into.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
}

/** Half-open x-intervals covering the inside of `subs` on scanline `yc`, under
    the NONZERO winding rule — SVG's default, and the rule shape.ts's `ccw`
    flag is written against. */
function spans(subs: Subpath[], yc: number): Array<[number, number]> {
  const hits: Array<[number, number]> = []
  for (const sp of subs) {
    for (let i = 0; i < sp.length; i++) {
      const [x0, y0] = sp[i]
      const [x1, y1] = sp[(i + 1) % sp.length]
      if (y0 === y1) continue
      // Half-open in y so a vertex shared by two edges is counted once.
      if (y0 <= yc && y1 > yc) hits.push([x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0), 1])
      else if (y1 <= yc && y0 > yc) hits.push([x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0), -1])
    }
  }
  hits.sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  let wind = 0
  for (let i = 0; i < hits.length - 1; i++) {
    wind += hits[i][1]
    if (wind !== 0) out.push([hits[i][0], hits[i + 1][0]])
  }
  return out
}

export interface FillOptions {
  /** Restrict the fill to the inside of this path — the container clip the
      mark is drawn inside (see markBody in brand-assets.ts). */
  clip?: string
}

export function fillPath(
  s: Surface,
  d: string,
  color: string,
  place: Placement = IDENTITY,
  opts: FillOptions = {},
): void {
  const subs = parsePath(d, place)
  const clip = opts.clip === undefined ? undefined : parsePath(opts.clip, place)
  const [r, g, b] = hex(color)
  const W = s.w * SS
  const H = s.h * SS
  let ymin = Infinity
  let ymax = -Infinity
  for (const sp of subs) {
    for (const [, y] of sp) {
      if (y < ymin) ymin = y
      if (y > ymax) ymax = y
    }
  }
  const y0 = Math.max(0, Math.floor(ymin))
  const y1 = Math.min(H - 1, Math.ceil(ymax))
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5
    let row = spans(subs, yc)
    if (clip !== undefined) {
      const cs = spans(clip, yc)
      const cut: Array<[number, number]> = []
      for (const [a, z] of row) {
        for (const [ca, cz] of cs) {
          const lo = Math.max(a, ca)
          const hi = Math.min(z, cz)
          if (hi > lo) cut.push([lo, hi])
        }
      }
      row = cut
    }
    for (const [a, z] of row) {
      const xa = Math.max(0, Math.ceil(a - 0.5))
      const xz = Math.min(W - 1, Math.floor(z - 0.5))
      for (let x = xa; x <= xz; x++) {
        const o = (y * W + x) * 3
        s.px[o] = r
        s.px[o + 1] = g
        s.px[o + 2] = b
      }
    }
  }
}

/**
 * Stroke a closed path as a chain of quads plus a square at each vertex.
 *
 * `width` is in OUTPUT pixels and is NOT multiplied by `place.k`, which is the
 * raster equivalent of the SVG assets' vector-effect="non-scaling-stroke":
 * §5 has exactly one border width and it does not grow with the artwork, so
 * the keyline holds at 2px on a 180px icon and on a 1200px card alike.
 */
export function strokePath(
  s: Surface,
  d: string,
  color: string,
  width: number,
  place: Placement = IDENTITY,
): void {
  const w = (width * SS) / 2
  for (const sp of parsePath(d, place)) {
    for (let i = 0; i < sp.length; i++) {
      const [x0, y0] = sp[i]
      const [x1, y1] = sp[(i + 1) % sp.length]
      const len = Math.hypot(x1 - x0, y1 - y0)
      if (len === 0) continue
      const [nx, ny] = [(-(y1 - y0) / len) * w, ((x1 - x0) / len) * w]
      quad(s, color, [
        [x0 + nx, y0 + ny],
        [x1 + nx, y1 + ny],
        [x1 - nx, y1 - ny],
        [x0 - nx, y0 - ny],
      ])
      // The join. At 64 vertices per contour the turn is a fraction of a
      // degree, so a square the width of the stroke closes it invisibly and
      // costs nothing — a mitre calculation would be precision nobody sees.
      quad(s, color, [
        [x0 - w, y0 - w],
        [x0 + w, y0 - w],
        [x0 + w, y0 + w],
        [x0 - w, y0 + w],
      ])
    }
  }
}

function quad(s: Surface, color: string, pts: Point[]): void {
  const [r, g, b] = hex(color)
  const W = s.w * SS
  const H = s.h * SS
  const ys = pts.map((p) => p[1])
  const y0 = Math.max(0, Math.floor(Math.min(...ys)))
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)))
  for (let y = y0; y <= y1; y++) {
    for (const [a, z] of spans([pts], y + 0.5)) {
      const xa = Math.max(0, Math.ceil(a - 0.5))
      const xz = Math.min(W - 1, Math.floor(z - 0.5))
      for (let x = xa; x <= xz; x++) {
        const o = (y * W + x) * 3
        s.px[o] = r
        s.px[o + 1] = g
        s.px[o + 2] = b
      }
    }
  }
}

/**
 * §8's fine offset-print grain, the first of the two textures the system
 * allows. MULTIPLY only — it darkens and never lightens, for the same reason
 * the CSS grain layers do: the one pair under a grain with no headroom is
 * Bone-on-Flare at 3.01:1, and a texture that can lift the local field pushes
 * it under the 3:1 large-text floor. Deterministic, so the committed PNG is
 * byte-stable across runs and a re-run produces no diff noise.
 *
 * TILED at 120px, which is the tile size the CSS grain layers already use — and
 * here it is also what keeps the file shippable. Per-pixel noise is maximum
 * entropy: it defeats deflate outright and took the 1200x630 card from 8 KB to
 * 360 KB, past the preview-fetch ceiling some share clients apply. A repeating
 * tile gives LZ77 a period to match on, and at 120px nobody reads the repeat as
 * a pattern on a flat field.
 */
export function grain(s: Surface, amount = 0.06, tile = 120): void {
  const W = s.w * SS
  const H = s.h * SS
  for (let y = 0; y < H; y++) {
    const oy = (y / SS) | 0
    for (let x = 0; x < W; x++) {
      // Indexed in OUTPUT pixels, not subpixels: every subsample inside one
      // output pixel then shares a factor, so the box filter cannot smear the
      // tile into a continuum and the file stays compressible.
      const ox = (x / SS) | 0
      // Integer hash, not Math.random: same input, same card, every time.
      let n = ((ox % tile) * 374761393 + (oy % tile) * 668265263) | 0
      n = (n ^ (n >>> 13)) * 1274126177
      // Four levels, not 1024: the grain is a 6% texture, and its only job is
      // to break a flat field. Quantising it is what keeps the PNG small —
      // per-pixel continuous noise is maximum entropy and defeats deflate.
      const f = 1 - amount * (((n >>> 16) & 3) / 3)
      const o = (y * W + x) * 3
      s.px[o] = s.px[o] * f
      s.px[o + 1] = s.px[o + 1] * f
      s.px[o + 2] = s.px[o + 2] * f
    }
  }
}

/** Box-filter SS×SS down to one output pixel — the antialiasing step. */
function resolve(s: Surface): Uint8Array {
  const out = new Uint8Array(s.w * s.h * 3)
  const W = s.w * SS
  const n = SS * SS
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * W + x * SS + dx) * 3
          r += s.px[o]
          g += s.px[o + 1]
          b += s.px[o + 2]
        }
      }
      const p = (y * s.w + x) * 3
      out[p] = Math.round(r / n)
      out[p + 1] = Math.round(g / n)
      out[p + 2] = Math.round(b / n)
    }
  }
  return out
}

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = CRC[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length)
  const tagged = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(tagged))
  return Buffer.concat([len, tagged, crc])
}

/** The PNG spec's own ceiling on an 8-bit palette. Past it the image has to be
    truecolour, and this writer says so rather than quantising: these are brand
    assets, and a silent lossy path is how a mark drifts. */
const PALETTE_MAX = 256

/**
 * PNG, filter type 0 on every row — palette (colour type 3) when the image has
 * ≤256 distinct colours, 8-bit truecolour (colour type 2) when it does not.
 *
 * WHY PALETTE, MEASURED. These compositions are flat §2 hexes plus §8's grain,
 * which is quantised to four levels ON PURPOSE (see `grain`), plus the
 * antialiased edges of one mark. og.png resolves to 206 distinct colours —
 * every one of them exactly preserved by an index, so this is LOSSLESS, not a
 * quantisation. It is the compression win the byte budget actually had:
 *
 *     1200x630 og.png   truecolour 105,639 B  ->  palette 74,743 B   (-29%)
 *
 * The IDAT is a third of the input bytes (one index per pixel instead of three
 * channel bytes) and deflate's 32 KB window then reaches ~3x further back in
 * the image, so it matches the grain tile's 120px horizontal period across many
 * more rows. That asset is the growth surface's own payload — every WhatsApp,
 * Facebook and Telegram unfurl fetches it, some under a preview-size ceiling —
 * so 31 KB off it is worth more than 31 KB off anything else this repo emits.
 *
 * Still no per-row filter heuristic, and now there is a measurement rather than
 * an assertion behind that: on the palette image Up filtering came out WORSE
 * (93,148 B vs 74,092 B for the IDAT), because the grain's vertical period is
 * 120 rows and every row within deflate's window differs from its neighbour.
 * Sub on truecolour was worse still (133,470 B). Filter 0 is the right one here
 * and the numbers are in the commit that added this comment.
 *
 * Palette order is FIRST APPEARANCE in scan order — deterministic, so the
 * committed PNGs stay byte-stable across runs and a re-run on an unchanged mark
 * produces no diff (README's deploy checklist promises exactly that).
 */
export function encodePng(s: Surface): Buffer {
  const rgb = resolve(s)
  const n = s.w * s.h
  // First-appearance palette build. Keyed on the packed 24-bit colour, so the
  // lookup is one integer compare rather than three.
  const index = new Map<number, number>()
  const palette: number[] = []
  const idx = new Uint8Array(n)
  let paletted = true
  for (let i = 0; i < n; i++) {
    const key = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2]
    let at = index.get(key)
    if (at === undefined) {
      if (palette.length === PALETTE_MAX) {
        paletted = false
        break
      }
      at = palette.length
      palette.push(key)
      index.set(key, at)
    }
    idx[i] = at
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(s.w, 0)
  ihdr.writeUInt32BE(s.h, 4)
  ihdr[8] = 8 /* bit depth: 8, indices or channel bytes alike */
  ihdr[9] = paletted ? 3 : 2 /* colour type: indexed / truecolour */

  const stride = paletted ? s.w : s.w * 3
  const raw = Buffer.alloc((stride + 1) * s.h)
  for (let y = 0; y < s.h; y++) {
    raw[y * (stride + 1)] = 0 /* filter type 0 — see above */
    const row = paletted
      ? Buffer.from(idx.buffer, y * stride, stride)
      : Buffer.from(rgb.buffer, y * stride, stride)
    row.copy(raw, y * (stride + 1) + 1)
  }

  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
  ]
  if (paletted) {
    // PLTE must precede IDAT (PNG spec 4.1.2), and for colour type 3 it is
    // required, not optional.
    const plte = Buffer.alloc(palette.length * 3)
    palette.forEach((c, i) => {
      plte[i * 3] = (c >> 16) & 255
      plte[i * 3 + 1] = (c >> 8) & 255
      plte[i * 3 + 2] = c & 255
    })
    chunks.push(chunk('PLTE', plte))
  }
  chunks.push(chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(chunks)
}
