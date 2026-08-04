/**
 * A PNG DECODER, in Node built-ins only — the inverse of scripts/raster.ts's
 * encodePng.
 *
 * WHY IT EXISTS. The census counts pixels, and the only thing CDP will hand
 * back is a base64 PNG. Decoding it is the whole measurement, so the decoder
 * IS the instrument: a wrong unfilter would not crash, it would quietly shift
 * every percentage in docs/brand/census.json.
 *
 * CONSTRAINT (repo-wide): no new dependency, runtime or build-time. `node:zlib`
 * is the entire import list, exactly as raster.ts's writer is. That pairing is
 * also the test strategy — census.test.ts encodes a surface with the shipped
 * writer, decodes it with this reader, and asserts pixel identity. Both halves
 * get tested with no fixture to keep in sync.
 *
 * WHAT IT DELIBERATELY REFUSES. Interlaced (Adam7) and 16-bit images throw
 * rather than being approximated. Chrome emits neither; a silent
 * mis-parse of one would be indistinguishable from a real palette change,
 * which is the precise failure mode this whole tool exists to make impossible.
 *
 * Colour types supported: 2 (truecolour) and 6 (truecolour+alpha, what Chrome
 * emits) and 3 (indexed, what encodePng emits for a ≤256-colour composition).
 * Alpha is dropped, not composited: every screenshot the census takes is fully
 * opaque because the app paints a ground on <html>, and a census that
 * composited against an assumed backdrop would be inventing pixels.
 */

import { inflateSync } from 'node:zlib'

export interface DecodedPng {
  width: number
  height: number
  /** Row-major RGB, three bytes per pixel, no alpha. */
  rgb: Uint8Array
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
}

/** Paeth predictor, PNG spec 9.4. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error('decodePng: not a PNG (bad signature)')
  }

  let width = 0
  let height = 0
  let bitDepth = 0
  let colourType = -1
  let palette: Uint8Array | null = null
  // Multi-IDAT is normal — Chrome splits large images across chunks, and the
  // zlib stream is the CONCATENATION of them, not one stream per chunk.
  const idat: Uint8Array[] = []

  let at = 8
  let sawIend = false
  while (at + 8 <= bytes.length && !sawIend) {
    const len = u32(bytes, at)
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    const data = bytes.subarray(at + 8, at + 8 + len)
    at += 12 + len // length + type + data + CRC
    if (type === 'IHDR') {
      width = u32(data, 0)
      height = u32(data, 4)
      bitDepth = data[8]
      colourType = data[9]
      if (data[12] !== 0) throw new Error('decodePng: interlaced PNGs are not supported')
      if (bitDepth !== 8) throw new Error(`decodePng: bit depth ${bitDepth} is not supported (8 only)`)
      if (colourType !== 2 && colourType !== 3 && colourType !== 6) {
        throw new Error(`decodePng: colour type ${colourType} is not supported (2, 3, 6 only)`)
      }
    } else if (type === 'PLTE') {
      palette = data.slice()
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      sawIend = true
    }
  }
  if (colourType === -1) throw new Error('decodePng: no IHDR')
  if (idat.length === 0) throw new Error('decodePng: no IDAT')
  if (colourType === 3 && palette === null) throw new Error('decodePng: indexed PNG with no PLTE')

  const channels = colourType === 3 ? 1 : colourType === 2 ? 3 : 4
  const stride = width * channels
  const raw = new Uint8Array(inflateSync(concat(idat)))
  if (raw.length < (stride + 1) * height) {
    throw new Error(`decodePng: truncated image data (${raw.length} bytes, need ${(stride + 1) * height})`)
  }

  // Unfilter in place into a contiguous scanline buffer. `prev` is the already
  // reconstructed row above, which is why filtering has to run top-down and
  // cannot be parallelised per row.
  const lines = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    const up = dst - stride
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i]
      const a = i >= channels ? lines[dst + i - channels] : 0
      const b = y > 0 ? lines[up + i] : 0
      const c = y > 0 && i >= channels ? lines[up + i - channels] : 0
      let v: number
      if (filter === 0) v = x
      else if (filter === 1) v = x + a
      else if (filter === 2) v = x + b
      else if (filter === 3) v = x + ((a + b) >> 1)
      else if (filter === 4) v = x + paeth(a, b, c)
      else throw new Error(`decodePng: unknown filter type ${filter} on row ${y}`)
      lines[dst + i] = v & 255
    }
  }

  const rgb = new Uint8Array(width * height * 3)
  if (colourType === 3) {
    const plte = palette as Uint8Array
    for (let i = 0; i < width * height; i++) {
      const p = lines[i] * 3
      rgb[i * 3] = plte[p]
      rgb[i * 3 + 1] = plte[p + 1]
      rgb[i * 3 + 2] = plte[p + 2]
    }
  } else {
    for (let i = 0; i < width * height; i++) {
      const s = i * channels
      rgb[i * 3] = lines[s]
      rgb[i * 3 + 1] = lines[s + 1]
      rgb[i * 3 + 2] = lines[s + 2]
    }
  }
  return { width, height, rgb }
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
