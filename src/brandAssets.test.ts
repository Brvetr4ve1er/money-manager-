import { describe, it, expect } from 'vitest'
/* From disk, like design.test.ts, localFirst.test.ts and shareCard.test.ts: the
   subject is a shipped FILE, not anything a module exports. A .ts file, not
   .tsx — jsdom would give import.meta.url an http:// URL that readFileSync
   rejects, and nothing here needs a DOM. */
import { readFileSync, readdirSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { stripHtmlComments } from '../scripts/htmlComments.ts'

/**
 * THE DEPLOYED PAYLOAD, AS ASSERTIONS.
 *
 * Everything under public/ is fetched by somebody — a crawler, a home-screen
 * install, a favicon request — and none of it is exercised by a render test, so
 * it is exactly where waste accumulates unseen. Two kinds of waste had:
 *
 *   BYTES NOBODY NEEDED. og.png shipped as 8-bit truecolour at 105,639 B. It
 *   resolves to 206 distinct colours (flat §2 hexes, §8's four-level grain, and
 *   one mark's antialiased edges), so an indexed PNG stores every one of them
 *   EXACTLY at a third of the bytes: 74,779 B, pixel-for-pixel identical. That
 *   file is the growth surface's own payload — every WhatsApp, Facebook and
 *   Telegram unfurl fetches it, some under a preview-size ceiling.
 *
 *   FILES NOBODY FETCHED. og.svg sat in public/ and was referenced by exactly
 *   one thing: README's header, which GitHub resolves against the repo and not
 *   against the origin. 6.5 KB in every deploy, requested by nobody. It lives
 *   in docs/brand/ now, and the audit below is what stops the next one landing.
 */

const PUBLIC = new URL('../public/', import.meta.url)

/* ── A minimal PNG reader. Enough to prove the writer's output is a real PNG
      and that its pixels are the composition, not garbage indices. ────────── */

interface Png {
  bytes: number
  w: number
  h: number
  /** 2 = truecolour, 3 = palette. */
  colorType: number
  paletteEntries: number
  /** Decoded RGB, three bytes per pixel, filter type 0 assumed (the writer
      emits nothing else — see scripts/raster.ts). */
  rgb: Uint8Array
}

function readPng(name: string): Png {
  const bytes = readFileSync(new URL(name, PUBLIC))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let at = 8
  let ihdr: Uint8Array | undefined
  let plte: Uint8Array | undefined
  const idat: Uint8Array[] = []
  let sawPlteBeforeIdat = false
  while (at < bytes.length) {
    const len = view.getUint32(at)
    const type = String.fromCharCode(...bytes.slice(at + 4, at + 8))
    const body = bytes.slice(at + 8, at + 8 + len)
    if (type === 'IHDR') ihdr = body
    if (type === 'PLTE') {
      plte = body
      sawPlteBeforeIdat = idat.length === 0
    }
    if (type === 'IDAT') idat.push(body)
    at += 12 + len
  }
  if (ihdr === undefined) throw new Error(`${name}: no IHDR`)
  const head = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength)
  const w = head.getUint32(0)
  const h = head.getUint32(4)
  const colorType = ihdr[9]
  expect(ihdr[8]).toBe(8) // bit depth
  // PNG spec 4.1.2: PLTE is required for colour type 3 and must precede IDAT.
  if (colorType === 3) expect(`${name} PLTE before IDAT: ${sawPlteBeforeIdat}`).toBe(`${name} PLTE before IDAT: true`)

  const merged = new Uint8Array(idat.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of idat) {
    merged.set(c, o)
    o += c.length
  }
  const raw = inflateSync(merged)
  const stride = colorType === 3 ? w : w * 3
  const rgb = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    const row = y * (stride + 1)
    expect(raw[row]).toBe(0) // filter type 0 on every row
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 3
      if (colorType === 3 && plte !== undefined) {
        const i = raw[row + 1 + x] * 3
        rgb[p] = plte[i]
        rgb[p + 1] = plte[i + 1]
        rgb[p + 2] = plte[i + 2]
      } else {
        rgb[p] = raw[row + 1 + x * 3]
        rgb[p + 1] = raw[row + 1 + x * 3 + 1]
        rgb[p + 2] = raw[row + 1 + x * 3 + 2]
      }
    }
  }
  return { bytes: bytes.length, w, h, colorType, paletteEntries: (plte?.length ?? 0) / 3, rgb }
}

const at = (p: Png, x: number, y: number): [number, number, number] => {
  const o = (y * p.w + x) * 3
  return [p.rgb[o], p.rgb[o + 1], p.rgb[o + 2]]
}

/** §2 Flare, darkened somewhere between 0% and 6% by §8's grain (multiply
    only — see scripts/raster.ts `grain`, and the same reasoning in app.css). */
function isGrainedFlare([r, g, b]: [number, number, number]): boolean {
  const flare = [0xf9, 0x3e, 0x06]
  return [r, g, b].every((c, i) => c <= flare[i] && c >= Math.floor(flare[i] * 0.94) - 1)
}

describe('the share card is a palette PNG, and stays inside its budget', () => {
  const og = readPng('og.png')

  it('ships indexed colour, not truecolour', () => {
    // The whole 31 KB saving is this byte. A regression here is silent —
    // the card still renders, it just costs a third more on every unfurl.
    expect(`colour type ${og.colorType}`).toBe('colour type 3')
    expect(og.paletteEntries).toBeGreaterThan(0)
    expect(og.paletteEntries).toBeLessThanOrEqual(256)
  })

  it('is the 1200x630 card every crawler is told to expect', () => {
    // index.html states these in og:image:width/height. A card whose real
    // dimensions disagree with its meta tags gets cropped or dropped.
    expect(`${og.w}x${og.h}`).toBe('1200x630')
  })

  it('stays under the share-preview budget', () => {
    // Not a golden byte count — the mark may legitimately change. A CEILING,
    // because some share clients refuse to fetch a large preview at all, and
    // because per-pixel noise once took this file to 360 KB (raster.ts `grain`
    // documents that measurement). 85 KB leaves headroom over today's 74,779.
    expect(og.bytes).toBeLessThanOrEqual(85_000)
  })

  it('still paints the composition — §5E, the object on a flat Flare field', () => {
    // Proves the indices resolve through PLTE to the right colours: all four
    // corners are field (the object is centred, the 38° shear passes through
    // the middle), and the centre is NOT field, because the mark is there.
    for (const [x, y] of [
      [0, 0],
      [og.w - 1, 0],
      [0, og.h - 1],
      [og.w - 1, og.h - 1],
    ]) {
      expect(`${x},${y}: ${isGrainedFlare(at(og, x, y))}`).toBe(`${x},${y}: true`)
    }
    expect(isGrainedFlare(at(og, og.w / 2, og.h / 2))).toBe(false)
  })
})

describe('the iOS touch icon', () => {
  const icon = readPng('apple-touch-icon.png')

  it('is 180x180 and indexed, like the card', () => {
    // 180x180 is the size iOS asks for; index.html links it as
    // apple-touch-icon because Safari ignores SVG touch icons.
    expect(`${icon.w}x${icon.h} type ${icon.colorType}`).toBe('180x180 type 3')
    expect(icon.bytes).toBeLessThanOrEqual(4_000)
  })
})

describe('public/ carries nothing nobody fetches', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const manifest = readFileSync(new URL('manifest.webmanifest', PUBLIC), 'utf8')

  it('names every served file from index.html or the manifest', () => {
    // THE RULE: public/ is the served directory, so a file in it that no
    // document references is dead weight in every deploy — invisible, because
    // nothing fails when it is there. Documentation assets belong in docs/.
    const referenced = `${html}\n${manifest}`
    for (const name of readdirSync(PUBLIC)) {
      // The manifest is referenced by index.html itself; everything else has
      // to be named by one of the two.
      expect(`${name} referenced: ${referenced.includes(name)}`).toBe(`${name} referenced: true`)
    }
  })

  it('keeps og.svg out of the served tree', () => {
    // It is README's header — GitHub resolves that against the repo, never
    // against the origin, so shipping it served 6.5 KB to nobody.
    expect(readdirSync(PUBLIC)).not.toContain('og.svg')
    expect(readFileSync(new URL('../docs/brand/og.svg', import.meta.url), 'utf8')).toContain('<svg')
  })
})

describe('the shipped document carries no repo documentation', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

  it('strips every comment from the real index.html', () => {
    // 4.7 KB of the 8.7 KB source document is comment — ~2.1 KB gzipped on
    // every first paint, on the phone this product is built for.
    expect(html).toContain('<!--')
    expect(stripHtmlComments(html)).not.toContain('<!--')
  })

  it('keeps everything that is not a comment', () => {
    const out = stripHtmlComments(html)
    for (const keep of [
      '<title>', // the SERP line and every unfurl headline
      'og:image', // the share card
      'rel="manifest"', // add-to-home-screen, the distribution channel
      'Ember needs JavaScript', // the noscript plate
      '.ns-plate h1', // the noscript plate's inline <style>, comment-free
      '/src/main.tsx', // the module entry vite rewrites
    ]) {
      expect(`${keep}: ${out.includes(keep)}`).toBe(`${keep}: true`)
    }
  })

  it('leaves a comment-free document alone', () => {
    const plain = '<!doctype html><html><body><p>a --> b</p></body></html>'
    expect(stripHtmlComments(plain)).toBe(plain)
  })
})
