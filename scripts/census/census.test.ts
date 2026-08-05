import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
/* The PNG WRITER, imported to test the READER against. No fixture to keep in
   sync, and both halves get covered by the same assertion. */
import { createSurface, encodePng, fillPath, type Surface } from '../raster.ts'
import { decodePng } from './png.ts'
import {
  BUCKETS,
  BUCKET_ORDER,
  SCROLLING_FORM,
  STRAY_DELTA_E,
  TARGETS,
  bucketOf,
  deviation,
  hexToLab,
  makeClassifier,
  parsePalette,
  readDeclaredAccents,
  readPalette,
  rgbToLab,
  type Bucket,
} from './palette.ts'
import {
  MATRIX,
  MATRIX_IDS,
  formatRowId,
  identityOf,
  isMobileViewport,
  parseRowId,
} from './matrix.ts'
import { REPO_ROOT, inputsHash, pixelInputs } from './inputs.ts'
import {
  ARTIFACT_PATH,
  LIVE_REGION_SCRIPT,
  SCHEMA_VERSION,
  censusPixels,
  censusScrollingForm,
  dirtyPaths,
  disagreeingProbe,
  isDirty,
  movedInputs,
  paintedAnnouncements,
  scrollingFormBreaches,
  serialiseCensus,
  windowTops,
  type BucketStat,
  type Census,
  type LiveRegion,
  type WindowStat,
} from './artifact.ts'
import {
  COMPOSITION_NOTE,
  COMPOSITION_SCRIPT,
  censusComposition,
  classifyGrounds,
  compositionBreaches,
  type Ground,
  type RegionStat,
} from './composition.ts'
import {
  CENSUS_EPOCH_MS,
  CENSUS_LOCALE,
  CENSUS_TIMEZONE,
  STORAGE_KEY,
  censusLocalDay,
  determinismScript,
} from './determinism.ts'
import { parseArgs as parseCensusArgs } from './options.ts'
import { defaultState, sanitizeState, type AppState } from '../../src/state/store.ts'
import { newlyEarnedIds } from '../../src/engine/achievements.ts'

/**
 * THE CENSUS, TESTED WITHOUT A BROWSER.
 *
 * Every assertion here is pure Node and runs in the ordinary suite. That is
 * the point: the instrument that decides what colour this app is has to be
 * defended by the same test floor as the app, and the staleness guard at the
 * bottom only works if it runs on every `npm test`.
 *
 * vite.config.ts's `include` gained the scripts glob for this file. A test
 * file nobody collects is the silent-skip failure this pipeline has already
 * shipped twice — see scripts/assert-dom-tests-ran.mjs.
 */

const TOKENS_CSS = readFileSync(new URL('src/styles/tokens.css', REPO_ROOT), 'utf8')
const ARTIFACT_TEXT = readFileSync(new URL(ARTIFACT_PATH, REPO_ROOT), 'utf8')
const ARTIFACT = JSON.parse(ARTIFACT_TEXT) as Census

describe('the palette is parsed from tokens.css, never restated', () => {
  it('finds exactly the twelve raw palette tokens', () => {
    const palette = parsePalette(TOKENS_CSS)
    expect(palette).toHaveLength(12)
    expect(palette.map((t) => t.name)).toEqual([
      'flare',
      'graphite',
      'bone',
      'espresso',
      'sand',
      'fog',
      'void',
      'acid',
      'marigold',
      'cobalt',
      'signal',
      'moss',
    ])
    // Declaration order is the classifier's tie-break, so it is data rather
    // than incidental: assert it is 0..11 in file order.
    expect(palette.map((t) => t.order)).toEqual([...Array(12).keys()])
  })

  it('buckets every token exactly once, and every bucket member exists', () => {
    // THE GUARD THAT KEEPS THE CLASSIFIER FROM DRIFTING FROM §2. Add a
    // thirteenth token to tokens.css without bucketing it and parsePalette
    // throws by name; bucket a token that does not exist and this fails.
    const names = parsePalette(TOKENS_CSS).map((t) => t.name)
    const bucketed = BUCKET_ORDER.flatMap((b) => BUCKETS[b])
    expect([...bucketed].sort()).toEqual([...names].sort())
    expect(new Set(bucketed).size).toBe(bucketed.length)
    for (const name of names) expect(bucketOf(name)).not.toBeNull()
  })

  it('states the 60/30/8/2 ratio law from §2', () => {
    expect(TARGETS).toEqual({ field: 60, bone: 30, graphite: 8, accent: 2 })
    expect(BUCKET_ORDER).toEqual(['field', 'bone', 'graphite', 'accent'])
  })

  it('throws on an unbucketed token however it is spelled', () => {
    /* THE GUARD THE OLD PATTERN DEFEATED. /--([a-z]+):\s*(#[0-9a-f]{6});/ is
       case- and hyphen-intolerant, so a thirteenth token written
       `--deep-moss: #3A5A2A;` inside the raw block matched nothing, never
       reached the throw, and had its pixels absorbed into whichever bucket
       owned the nearest neighbour — the exact silent absorption the header
       says cannot happen. design.test.ts does not catch it either: it strips
       the raw block before scanning for stray hexes. */
    const withToken = (line: string) => `:root { --flare: #f93e06;\n  ${line}\n}`
    expect(() => parsePalette(withToken('--deep-moss: #3a5a2a;'))).toThrow(/--deep-moss/)
    expect(() => parsePalette(withToken('--COBALT2: #16224E;'))).not.toThrow() // uppercase NAME is not a token
    expect(() => parsePalette(withToken('--rust: #B7410E;'))).toThrow(/--rust/)
    // …and a hex spelled in upper case still lands lower-cased, so the
    // artifact's palette block stays byte-stable however tokens.css spells it.
    expect(parsePalette(':root { --flare: #F93E06; }')[0].hex).toBe('#f93e06')
  })
})

describe('the derived quiet register is resolved, not guessed at', () => {
  const palette = readPalette()
  const derived = palette.filter((t) => t.name.includes(':'))

  it('resolves every color-mix tokens.css declares, on every surface', () => {
    /* Six values, because --spec and --spec-sunken re-resolve under each
       surface that re-declares their endpoints: the light ground, the dark
       ground (which inherits the :root mix and swaps --ink/--ground under it),
       the Espresso spec sheet, and the archive's Sand counter sheet. The four
       light/dark values are the ones src/styles/design.test.ts computes
       independently for its contrast table — two implementations of one mix,
       which is the point. */
    expect(derived.map((t) => t.hex).sort()).toEqual([
      '#40413d', // archive counter sheet, 88% graphite -> sand
      '#4e4f49', // archive counter sheet, 80%
      '#535250', // light --spec-sunken
      '#676562', // light --spec
      '#b8aaa4', // dark / spec-sheet --spec
      '#ccbeb8', // dark / spec-sheet --spec-sunken
    ])
  })

  it('books the quiet register to the FORM budget, in both themes', () => {
    // The defect: one semantic role charged to the 2% accent budget in light
    // (#676562 -> moss at ΔE 24.2) and to the 30% Bone budget in dark
    // (#b8aaa4 -> sand at ΔE 17.8), which made the two themes' accent and
    // inkOnPaper figures non-comparable and put body text inside the scarcest
    // budget in the system.
    for (const token of derived) expect(`${token.name}: ${token.bucket}`).toBe(`${token.name}: graphite`)
  })

  it('keys a derived token by name AND value', () => {
    // One role has as many values as it has surfaces. Two of them sharing an
    // artifact key would hide a whole theme's pixels behind the other's
    // percentage.
    expect(new Set(palette.map((t) => t.name)).size).toBe(palette.length)
    expect(derived.map((t) => t.order)).toEqual(derived.map((_, i) => 12 + i))
  })
})

describe('the deviation metric is the one rounds 1-4 used', () => {
  /* Pins the metric to the published record. A refactor that redefined it —
     RMS instead of absolute, or a weighted sum — would still look plausible
     and would silently make every future number incomparable with the four
     rounds of work that produced these three vectors. */
  const cases: Array<[Record<Bucket, number>, number]> = [
    [{ field: 52.9, bone: 40.6, graphite: 4.1, accent: 2.4 }, 22.0],
    [{ field: 69.6, bone: 26.1, graphite: 3.2, accent: 1.0 }, 19.3],
    [{ field: 85.4, bone: 8.9, graphite: 3.3, accent: 2.3 }, 51.5],
  ]
  it.each(cases)('reproduces the published deviation %#', (pct, expected) => {
    expect(deviation(pct)).toBeCloseTo(expected, 5)
  })

  it('is zero exactly at the targets', () => {
    expect(deviation(TARGETS)).toBe(0)
  })
})

describe('the classifier is exact and its ties are stable', () => {
  const palette = readPalette()
  const classify = makeClassifier(palette)

  it('classifies every palette hex to itself at deltaE 0', () => {
    palette.forEach((token, i) => {
      const h = token.hex.replace('#', '')
      const match = classify(
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      )
      expect(`${token.name}: ${match.index}`).toBe(`${token.name}: ${i}`)
      expect(match.deltaE).toBeCloseTo(0, 10)
    })
  })

  it('breaks an exact tie by tokens.css declaration order', () => {
    // Asserted on a synthetic palette holding the SAME colour twice, which is
    // the only way to make the tie exact rather than approximate. An unstable
    // tie-break would let two runs of one tree disagree — the one thing a
    // census may never do.
    const twins = [
      { name: 'alpha', hex: '#123456', order: 0, bucket: 'field' as Bucket },
      { name: 'beta', hex: '#123456', order: 1, bucket: 'bone' as Bucket },
    ]
    expect(makeClassifier(twins)(0x12, 0x34, 0x56).index).toBe(0)
    expect(makeClassifier([...twins].reverse().map((t, i) => ({ ...t, order: i })))(0x12, 0x34, 0x56).index).toBe(0)
  })

  it('memoises without becoming order-sensitive', () => {
    // The cache is keyed on the packed colour; a bug that let an earlier
    // lookup poison a later one would show up as two classifiers disagreeing.
    const fresh = makeClassifier(palette)
    for (const rgb of [[103, 101, 98], [12, 12, 12], [249, 62, 6], [200, 190, 180]]) {
      const a = classify(rgb[0], rgb[1], rgb[2])
      const b = fresh(rgb[0], rgb[1], rgb[2])
      expect(a).toEqual(b)
    }
  })

  it('converts sRGB to Lab against known values', () => {
    // Pure white and pure black anchor the transform; a wrong white point
    // would rotate every hue slightly and silently reassign edge pixels.
    const white = rgbToLab(255, 255, 255)
    expect(white[0]).toBeCloseTo(100, 3)
    expect(white[1]).toBeCloseTo(0, 2)
    expect(white[2]).toBeCloseTo(0, 2)
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 6)
    expect(hexToLab('#f93e06')[0]).toBeGreaterThan(50)
  })
})

describe('counting is lossless', () => {
  const palette = readPalette()

  /** A run of known colours, as raw RGB — one pixel per hex. */
  const surfaceOf = (hexes: string[]): Uint8Array => {
    const out = new Uint8Array(hexes.length * 3)
    hexes.forEach((hex, i) => {
      const h = hex.replace('#', '')
      out[i * 3] = parseInt(h.slice(0, 2), 16)
      out[i * 3 + 1] = parseInt(h.slice(2, 4), 16)
      out[i * 3 + 2] = parseInt(h.slice(4, 6), 16)
    })
    return out
  }

  it('sums bucket pixel counts to the total exactly', () => {
    // 60 flare, 30 bone, 8 graphite, 2 acid — the ratio law, drawn as pixels.
    const result = censusPixels(
      surfaceOf([
        ...Array(60).fill('#f93e06'),
        ...Array(30).fill('#f5e6e0'),
        ...Array(8).fill('#2a2d2c'),
        ...Array(2).fill('#dff205'),
      ]),
      palette,
    )
    expect(result.total).toBe(100)
    // INTEGER identity, not a float tolerance: the counts are the ground truth
    // and every percentage in the artifact is derived from them.
    const summed = BUCKET_ORDER.reduce((n, b) => n + result.buckets[b].pixels, 0)
    expect(summed).toBe(result.total)
    expect(result.deviation).toBe(0)
    expect(result.buckets.field.pct).toBe(60)
    expect(result.strays.pctOverDeltaE12).toBe(0)
    expect(result.strays.top).toEqual([])
  })

  it('keeps the percentages summing to 100', () => {
    // Deliberately awkward counts, so every percentage needs rounding.
    const result = censusPixels(
      surfaceOf([
        ...Array(7).fill('#f93e06'),
        ...Array(11).fill('#2a1e18'),
        ...Array(13).fill('#dfd5bc'),
        ...Array(3).fill('#121312'),
        ...Array(1).fill('#16224e'),
      ]),
      palette,
    )
    // Four independent roundings of at most 0.005pp each, so 0.02 is the
    // tightest honest bound; twelve for the per-token block, so 0.06.
    const buckets = BUCKET_ORDER.reduce((n, b) => n + result.buckets[b].pct, 0)
    expect(Math.abs(buckets - 100)).toBeLessThanOrEqual(0.02)
    const tokens = Object.values(result.tokens).reduce((n, v) => n + v, 0)
    expect(Math.abs(tokens - 100)).toBeLessThanOrEqual(0.06)
  })

  it('reports off-palette colours instead of hiding them', () => {
    // #3f7fbf is no token and nothing near one: a colour this app does not
    // paint, standing in for whatever the next one does. It must be COUNTED
    // (denominator stability) and DISCLOSED.
    const result = censusPixels(
      surfaceOf([...Array(90).fill('#f93e06'), ...Array(10).fill('#3f7fbf')]),
      palette,
    )
    expect(result.total).toBe(100)
    expect(result.strays.top[0].hex).toBe('#3f7fbf')
    expect(result.strays.top[0].pct).toBe(10)
    expect(result.strays.top[0].deltaE).toBeGreaterThan(STRAY_DELTA_E)
    expect(result.strays.pctOverDeltaE12).toBe(10)
    // Still counted in a bucket — dropping strays would change the denominator
    // and break comparability with the figures rounds 1-4 published.
    expect(BUCKET_ORDER.reduce((n, b) => n + result.buckets[b].pixels, 0)).toBe(100)
  })

  it('puts strays in `strays` and antialiasing in `nearMisses`', () => {
    /* THE DEFECT THIS PINS. `top` was filled from every off-EXACT colour, so on
       10 of the 12 rows of the artifact committed before this round every
       entry in it was UNDER the ΔE 12 threshold — the list was saturated by
       Flare antialiasing while the row disclosed 3.48% of its pixels as
       strays and named none of them. Two lists, two questions. */
    const result = censusPixels(
      surfaceOf([
        ...Array(80).fill('#f93e06'),
        ...Array(15).fill('#f83e06'), // one step off Flare: antialiasing
        ...Array(5).fill('#3f7fbf'), // nothing like any token: a stray
      ]),
      palette,
    )
    expect(result.strays.top.map((s) => s.hex)).toEqual(['#3f7fbf'])
    expect(result.strays.nearMisses.map((s) => s.hex)).toEqual(['#f83e06'])
    // The disclosed share counts only the strays, and always did — it was the
    // list beside it that disagreed with it.
    expect(result.strays.pctOverDeltaE12).toBe(5)
  })

  it('classifies the derived quiet register as ink, not as an accent', () => {
    /* THE MISCLASSIFICATION THIS ENDS. --spec is a color-mix, so its resolved
       value is in no palette, and a classifier that knew only the twelve raw
       hexes forced light --spec #676562 onto `moss` at ΔE 24.2 — body text
       charged to the 2% ACCENT budget — and dark --spec #b8aaa4 onto `sand`,
       the same role charged to the 30% Bone budget in the other theme. It was
       visible in the committed artifact: `moss` read 0.27-0.99% on all twelve
       rows although no stylesheet has ever referenced var(--moss). */
    const result = censusPixels(
      surfaceOf([
        ...Array(50).fill('#676562'), // light --spec
        ...Array(50).fill('#b8aaa4'), // dark --spec
      ]),
      palette,
    )
    // Exact, so neither is a stray any more…
    expect(result.strays.pctOverDeltaE12).toBe(0)
    expect(result.strays.top).toEqual([])
    // …and both are ink: the form (§1 trait 06), not a fourth colour.
    expect(result.buckets.graphite.pct).toBe(100)
    expect(result.buckets.accent.pct).toBe(0)
    expect(result.buckets.bone.pct).toBe(0)
  })
})

describe('the PNG decoder round-trips against scripts/raster.ts', () => {
  it('reads back an indexed surface pixel-for-pixel', () => {
    // Few enough colours that encodePng chooses colour type 3 (indexed).
    const s = createSurface(37, 23, '#f93e06')
    fillPath(s, 'M4 4 L30 6 L22 19 L6 16 Z', '#2a2d2c')
    const png = encodePng(s)
    expect(png[25]).toBe(3)
    const decoded = decodePng(png)
    expect(decoded.width).toBe(37)
    expect(decoded.height).toBe(23)
    expect([...decoded.rgb]).toEqual([...boxFilter(s)])
  })

  it('reads back a truecolour surface pixel-for-pixel', () => {
    // Past 256 colours encodePng falls back to colour type 2, so both branches
    // of the writer and both branches of the reader are now covered.
    const s = createSurface(48, 40, '#f5e6e0')
    for (let i = 0; i < s.px.length; i += 3) {
      const n = i / 3
      s.px[i] = n & 255
      s.px[i + 1] = (n >> 5) & 255
      s.px[i + 2] = (n >> 9) & 255
    }
    const png = encodePng(s)
    expect(png[25]).toBe(2)
    const decoded = decodePng(png)
    expect([...decoded.rgb]).toEqual([...boxFilter(s)])
  })

  it('decodes a multi-IDAT stream and a colour-type-6 image', () => {
    // Chrome emits RGBA (type 6) and splits IDAT across chunks. Neither shape
    // comes out of encodePng, so both are synthesised here rather than assumed.
    const decoded = decodePng(
      syntheticRgba(5, 3, [
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
      ]),
    )
    expect(decoded.width).toBe(5)
    expect(decoded.height).toBe(3)
    expect([...decoded.rgb.slice(0, 3)]).toEqual([255, 0, 0])
    expect([...decoded.rgb.slice(15, 18)]).toEqual([0, 255, 0])
    expect([...decoded.rgb.slice(30, 33)]).toEqual([0, 0, 255])
  })

  it('refuses interlaced and 16-bit rather than mis-parsing them', () => {
    // A silent mis-parse would be indistinguishable from a real palette
    // change, which is the exact class of error this whole tool exists to
    // make impossible.
    expect(() => decodePng(brokenIhdr({ interlace: 1 }))).toThrow(/interlaced/)
    expect(() => decodePng(brokenIhdr({ bitDepth: 16 }))).toThrow(/bit depth/)
    expect(() => decodePng(new Uint8Array(32))).toThrow(/signature/)
  })
})

describe('row ids round-trip and the matrix is well formed', () => {
  it('parses back exactly what it formatted', () => {
    for (const row of MATRIX) {
      const identity = identityOf(row)
      expect(parseRowId(formatRowId(identity))).toEqual(identity)
    }
  })

  it('has unique, sorted ids', () => {
    // A colliding id would silently overwrite a row in the artifact's map —
    // the census would report seven rows and look complete.
    expect(new Set(MATRIX_IDS).size).toBe(MATRIX_IDS.length)
    expect(MATRIX_IDS).toEqual([...MATRIX_IDS].sort())
    expect(MATRIX_IDS.length).toBe(MATRIX.length)
  })

  it('derives mobile from the viewport rather than storing it', () => {
    expect(isMobileViewport(375)).toBe(true)
    expect(isMobileViewport(1440)).toBe(false)
  })

  it('rejects malformed ids loudly', () => {
    expect(() => parseRowId('app.375x812.light')).toThrow()
    expect(() => parseRowId('app.375.light.seeded')).toThrow()
    expect(() => parseRowId('kiosk.375x812.light.seeded')).toThrow()
    expect(() => parseRowId('app.375x812.sepia.seeded')).toThrow()
    expect(() => parseRowId('app.375x812.light.museum')).toThrow()
    expect(() => parseRowId('app.375x812.light.seeded.zoomed')).toThrow()
    expect(() => parseRowId('app.375x812.light.seeded.breakdown.x')).toThrow()
  })

  it('spells the default view by omitting it, and refuses the second spelling', () => {
    // The view had to become an identity field the moment an interaction row
    // existed: matrix.ts's own header used to warn that two rows differing only
    // by their action script would collide, and the drawer pair is exactly
    // that. Making it a FIFTH field would have renamed every row this repo has
    // ever committed — and §2.1b's rule is "quote the row id", so every figure
    // ever quoted against one would stop resolving. Hence: `rest` formats to
    // nothing, and the redundant spelling is rejected rather than accepted as a
    // synonym, because one row must have exactly one id.
    const rest = parseRowId('app.375x812.light.seeded')
    expect(rest.view).toBe('rest')
    expect(formatRowId(rest)).toBe('app.375x812.light.seeded')
    const open = parseRowId('app.375x812.light.seeded.breakdown')
    expect(open.view).toBe('breakdown')
    expect(formatRowId(open)).toBe('app.375x812.light.seeded.breakdown')
    expect(() => parseRowId('app.375x812.light.seeded.rest')).toThrow(/written by omission/)
  })

  it('gives every action row a selector and a proof that it landed', () => {
    // A click that silently misses turns an interaction row into a duplicate of
    // its rest twin — same pixels, a different name, and nothing in the file
    // saying so. `then` is what makes that detectable, so a row that drives the
    // page must carry one; and a row with no actions must not claim a view.
    for (const row of MATRIX) {
      const id = formatRowId(identityOf(row))
      expect(`${id}: ${row.actions.length > 0}`).toBe(`${id}: ${row.view !== 'rest'}`)
      for (const action of row.actions) {
        expect(`${id}: ${action.click !== '' && action.then !== ''}`).toBe(`${id}: true`)
      }
    }
  })

  it('covers both themes on every screen it measures', () => {
    // Round 4 measured four rows and nobody had ever censused the landing in
    // dark — the one surface the record called "at law". A claim about a
    // surface measured in one theme is a claim about one theme.
    //
    // `view` joins the match for the same reason it joined the id: without it a
    // light `.breakdown` row would find the dark `rest` row and report a twin
    // it does not have — the assertion passing on a surface nobody paired.
    for (const row of MATRIX) {
      const twin = MATRIX.find(
        (r) =>
          r.screen === row.screen &&
          r.width === row.width &&
          r.state === row.state &&
          r.view === row.view &&
          r.theme !== row.theme,
      )
      expect(`${formatRowId(identityOf(row))} has a twin`).toBe(
        `${formatRowId(identityOf(row))} has a ${twin ? 'twin' : 'GAP'}`,
      )
    }
  })
})

describe('the injected determinism is what it claims to be', () => {
  it('freezes the clock onto a fixed local day', () => {
    // Changing the epoch without noticing would move the lesson of the day,
    // the weekly boss's day-of-week branch and the quest state under every
    // future number at once.
    expect(CENSUS_EPOCH_MS).toBe(Date.parse('2025-03-12T09:00:00+01:00'))
    expect(censusLocalDay()).toBe('2025-03-12')
    // A Wednesday, which is what pins engine/boss.ts's weekStartISO branch.
    expect(new Date(CENSUS_EPOCH_MS).getUTCDay()).toBe(3)
    expect(CENSUS_TIMEZONE).toBe('Africa/Algiers')
    expect(CENSUS_LOCALE).toBe('en-GB')
  })

  it('carries the clock freeze and the storage seed in the script it injects', () => {
    const seeded = determinismScript({ epochMs: CENSUS_EPOCH_MS, storageJson: '{"a":1}' })
    expect(seeded).toContain(String(CENSUS_EPOCH_MS))
    expect(seeded).toContain('Date = FrozenDate')
    expect(seeded).toContain('FrozenDate.now')
    expect(seeded).toContain(`localStorage.setItem("${STORAGE_KEY}"`)
    expect(seeded).toContain('{\\"a\\":1}')

    const fresh = determinismScript({ epochMs: CENSUS_EPOCH_MS, storageJson: null })
    // 'fresh' must REMOVE the key: Root.tsx's cold-start gate reads presence,
    // so a leftover key would put a landing row on the app surface.
    expect(fresh).toContain(`localStorage.removeItem("${STORAGE_KEY}")`)
    expect(fresh).not.toContain('setItem')
  })

  it("uses the store's own key", () => {
    // Duplicated across the bundle boundary out of necessity — the census
    // seeds storage from outside the app, so it cannot import the constant.
    const store = readFileSync(new URL('src/state/store.ts', REPO_ROOT), 'utf8')
    expect(store).toContain(`const KEY = '${STORAGE_KEY}'`)
  })
})

const FIXTURES = ['seeded', 'cold', 'day0', 'dense'] as const

const readFixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`scripts/census/fixtures/${name}.json`, REPO_ROOT), 'utf8'))

describe('the fixtures do not rot', () => {
  /* When AppState gains a field, sanitizeState fills a default the fixture
     does not carry and this fails — instead of the census quietly measuring a
     degraded state and nobody noticing why the numbers moved. */
  it.each(FIXTURES)('%s survives the load path unchanged', (name) => {
    expect(sanitizeState(readFixture(name))).toEqual(readFixture(name))
  })

  it.each(FIXTURES)('%s is a state at rest, not one mid-celebration', (name) => {
    // THE DEFECT THIS EXISTS TO END. The seeded fixture held five achievement
    // unlocks and QUALIFIED for seven, so useAchievements unlocked `streak-7`
    // and `boss-win` on every mount and useRewards queued two toasts — a fixed
    // Flare banner in >=24px caps, 2.6s each. Eight of the matrix's app rows
    // were therefore measured mid-celebration, the census captured inside the
    // first toast's dwell, and §2.1b's worked example in the design system
    // quoted a toast number as the app's reading at rest. The settle check
    // could not see it: it samples 400ms apart and the transient lives 2600ms.
    //
    // The fix is a fixture that has already earned what it qualifies for.
    // Anything a mount would grant belongs IN the fixture, and this is the
    // assertion that says so.
    expect(`${name}: ${newlyEarnedIds(readFixture(name) as AppState).join(',')}`).toBe(`${name}: `)
  })

  it('boots day0 into the app, at day zero, with nothing decided', () => {
    // `fresh` is the LANDING — Root.tsx's gate reads storage, so writing
    // nothing IS the marketing surface — and `cold` is day one with a log.
    // Neither is the screen a real user actually meets first: the app with no
    // profile, no ledger and ProfileCard's setup form open. day0 is literally
    // what App's save effect writes on its first mount past the gate, which is
    // why it is defaultState() verbatim rather than a hand-built state.
    expect(readFixture('day0')).toEqual(defaultState())
  })

  it('puts dense enough rows on ONE day to outrun a viewport', () => {
    // NOT "a big ledger", and the difference is the whole point of the row.
    // ArchiveCard windows to WINDOW_DAYS = 3, so a ledger spread over hundreds
    // of days renders eight rows and a SHORTER document than seeded. The card
    // bounds days and never rows ("a single day holding hundreds of rows still
    // renders whole") and §2.1b's stripe alternates per `ledger-day` — so one
    // dense day is one unbroken ground run, which is the thing the run-length
    // rule was written about.
    const dense = readFixture('dense') as { transactions: Array<{ date: string }> }
    const seeded = readFixture('seeded') as { transactions: Array<{ date: string }> }
    const onDay = dense.transactions.filter((t) => t.date === censusLocalDay()).length
    expect(onDay).toBeGreaterThanOrEqual(24)
    // Everything else is seeded, so the pair differs by the dense day alone —
    // a comparison, not a second unrelated screen.
    expect(dense.transactions.filter((t) => t.date !== censusLocalDay())).toEqual(
      seeded.transactions.filter((t) => t.date !== censusLocalDay()),
    )
  })

  it('dates the fixtures against the frozen epoch', () => {
    // A fixture stamped with a day the frozen clock never reaches would make
    // every relative day label ("Today", "3 days ago") wrong in the shot, and
    // every once-per-day grant id would name a day the app is not on — so the
    // lesson card would shoot as unread on a fixture that has read it.
    for (const name of FIXTURES) {
      const raw = readFixture(name) as unknown as {
        healthDate: string
        transactions: Array<{ date: string }>
        xpLog: Array<{ id: string; date: string }>
      }
      // '' is not a drifted day, it is the ABSENCE of one: day zero has no
      // persisted health snapshot yet, and useHealthDay's first-run branch
      // reads exactly that. Requiring today's date here would have forced day0
      // to claim a rollover that never happened.
      if (raw.healthDate !== '') {
        expect(`${name}: ${raw.healthDate}`).toBe(`${name}: ${censusLocalDay()}`)
      }
      for (const tx of raw.transactions) expect(tx.date <= censusLocalDay()).toBe(true)
      // The per-day grant ids carry their own day, so a drifted date shows up
      // as an id that no longer matches the day it is stamped with.
      for (const g of raw.xpLog) {
        const dayInId = /^(?:lesson|sim):(.+)$/.exec(g.id)
        if (dayInId) expect(`${name} ${g.id}`).toBe(`${name} ${g.id.split(':')[0]}:${g.date}`)
        expect(`${name} ${g.id}`).toBe(g.date <= censusLocalDay() ? `${name} ${g.id}` : 'future')
      }
    }
  })
})

/**
 * THE SECOND READING — §2 over the screens a reader sees, not over the pixels.
 *
 * The finding that produced it, and the reason this exists at all: the
 * document average is the arithmetic mean of regimes that never appear
 * together. app.375x812.light.seeded in docs/brand/census.json reads 56.59
 * field / 34.29 Bone over the whole document, while its seven viewport windows
 * run 58.40, 49.05, 68.84, 53.43, 48.70, 44.92 and 73.98 percent field.
 * Nobody sees 56.59/34.29. So the windows are measured too, and where the two
 * disagree the windows are the truth.
 *
 * WHAT THAT ROW LOOKED LIKE WHEN THIS TOOL FOUND IT, stamped: on the clean tree
 * of commit 71b5608 the same row read 41.70 field / 47.32 Bone over seven
 * windows running 40.92, 15.79, 45.60, 15.46, 21.30, 89.12 and 92.09 — five of
 * the seven outside the band, and the dark row of the same page outside it on
 * all seven while carrying the best document deviation in the matrix.
 *
 * PROVENANCE, because §2.1b makes it binding: those figures are the committed
 * artifact at this tree, and the staleness test at the bottom of this file is
 * what keeps them describing it. They are not the same numbers this paragraph
 * carried a round ago — it quoted a 56.0 document over eight windows, from a
 * tree that had a ninth card, with no stamp saying so.
 */
describe('the window reading measures screens, not documents', () => {
  const palette = readPalette()
  /** A per-token map with exactly one accent painting — the shape §2 permits,
      so the accent-COUNT check below stays silent and the bound under test is
      the only thing that can speak. */
  const oneAccent: Record<string, number> = { acid: 1.5 }
  /** What tokens.css binds to a role today: --reward is Marigold, --data Acid. */
  const DECLARED = readDeclaredAccents()

  /** A page `width` px wide made of horizontal bands of one hex each. */
  const banded = (width: number, bands: [string, number][]): Uint8Array => {
    const height = bands.reduce((n, [, h]) => n + h, 0)
    const out = new Uint8Array(width * height * 3)
    let y = 0
    for (const [hex, h] of bands) {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      for (let row = 0; row < h; row++, y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3
          out[i] = r
          out[i + 1] = g
          out[i + 2] = b
        }
      }
    }
    return out
  }

  it('tiles from the top and anchors the last window to the bottom', () => {
    // Whole number of screens: no overlap, no remainder.
    expect(windowTops(2400, 800)).toEqual([0, 800, 1600])
    // Remainder: the last window is the screen a reader stops on at the
    // bottom, so it overlaps rather than being dropped or counted short.
    expect(windowTops(2000, 800)).toEqual([0, 800, 1200])
    // A page shorter than the viewport is one window, the page itself.
    expect(windowTops(500, 800)).toEqual([0])
    expect(windowTops(800, 800)).toEqual([0])
  })

  it('finds the two regimes a document average hides', () => {
    // The round-5 shape in miniature: a Bone form stack over a Flare index
    // sheet, four windows, each 10px tall on a 10px-wide page.
    const rgb = banded(10, [
      ['#f5e6e0', 20],
      ['#f93e06', 20],
    ])
    const doc = censusPixels(rgb, palette)
    // The DOCUMENT says 50/50, which is a colour the page never shows.
    expect(doc.buckets.field.pct).toBe(50)
    expect(doc.buckets.bone.pct).toBe(50)

    const form = censusScrollingForm(rgb, 10, 40, 10, palette, doc.buckets, doc.tokens, DECLARED)
    expect(form.count).toBe(4)
    expect(form.windows.map((w) => w.pct.field)).toEqual([0, 0, 100, 100])
    // The MEAN of the windows still reads 50 — that is not the point. The
    // point is that the windows are on the record, so a page that is two
    // disjoint regimes can no longer look like a page that is neither.
    expect(form.mean.field).toBe(50)
    expect(form.worst.deviation).toBeGreaterThan(60)
    expect(form.breaches.some((b) => b.includes('over the 85 cap'))).toBe(true)
    expect(form.breaches.some((b) => b.includes('under the 35 band'))).toBe(true)
  })

  it('measures ink over the paper it can be drawn on, not over the document', () => {
    // The constraint this encodes: Graphite is 1.16:1 on Espresso, so every
    // ink pixel must stand on a Bone-family ground — ink and field trade one
    // for one, and an 8%-of-document ink budget cannot coexist with a
    // 60%-of-document field budget. Over the paper the question is answerable.
    const rgb = banded(10, [
      ['#f93e06', 80], // field: no ink can be drawn here at all
      ['#f5e6e0', 15],
      ['#2a2d2c', 5],
    ])
    const doc = censusPixels(rgb, palette)
    expect(doc.buckets.graphite.pct).toBe(5) // 5% of the DOCUMENT: "under budget"
    const form = censusScrollingForm(rgb, 10, 100, 50, palette, doc.buckets, doc.tokens, DECLARED)
    expect(form.inkOnPaper).toBe(25) // 5 / (5 + 15): the paper is well inked
  })

  it('reports one line per bound, and the cap instead of the band it implies', () => {
    const stat = (field: number, bone: number): WindowStat => ({
      top: 0,
      pct: { field, bone, graphite: 0, accent: 0 },
      deviation: 0,
    })
    const stub = (pct: number): BucketStat => ({ pixels: 0, pct })
    const buckets = { field: stub(0), bone: stub(0), graphite: stub(0), accent: stub(1) }
    const atLaw = { field: 60, bone: 30, graphite: 8, accent: 2 }

    // 91% field is over the 85 cap AND over the 80 band. One line, not two —
    // a long page must not look worse than a broken one.
    const over = scrollingFormBreaches([stat(91, 5)], atLaw, 10, buckets, oneAccent, DECLARED)
    expect(over.filter((b) => b.includes('field'))).toEqual([
      'window @0: field 91.00 over the 85 cap',
    ])
    // Inside the caps but outside the bands: the band is what is reported.
    expect(scrollingFormBreaches([stat(82, 12)], atLaw, 10, buckets, oneAccent, DECLARED)).toEqual([
      'window @0: field 82.00 over the 80 band',
      'window @0: bone 12.00 under the 15 band',
    ])
    // A window inside both bands, a mean at target and inked paper: silence.
    expect(scrollingFormBreaches([stat(60, 30)], atLaw, 10, buckets, oneAccent, DECLARED)).toEqual([])
  })

  it('holds the mean and the accent cap to the document, not to a window', () => {
    const stub = (pct: number): BucketStat => ({ pixels: 0, pct })
    const inBand = [
      {
        top: 0,
        pct: { field: 60, bone: 30, graphite: 8, accent: 2 },
        deviation: 0,
      },
    ]
    // Scarcity is a property of the whole run (§2: "a 4th color is an event"),
    // so the accent is judged on the document even though everything else here
    // is judged per screen.
    const loud = { field: stub(0), bone: stub(0), graphite: stub(0), accent: stub(3.75) }
    expect(
      scrollingFormBreaches(inBand, { field: 60, bone: 30, graphite: 8, accent: 2 }, 10, loud, oneAccent, DECLARED),
    ).toEqual([
      'accent 3.75 over the 2 document cap',
    ])
    // The mean tolerance is wide on purpose: a mean is the one number here a
    // single tall card can move without any colour changing.
    const quiet = { field: stub(0), bone: stub(0), graphite: stub(0), accent: stub(1) }
    expect(
      scrollingFormBreaches(inBand, { field: 68, bone: 24, graphite: 8, accent: 2 }, 10, quiet, oneAccent, DECLARED),
    ).toEqual([])
    expect(
      scrollingFormBreaches(inBand, { field: 69, bone: 23, graphite: 8, accent: 2 }, 10, quiet, oneAccent, DECLARED),
    ).toEqual(['mean field 69.00 outside 60±8', 'mean bone 23.00 outside 30±6'])
  })

  it('counts how many accents are painting, not only how much accent', () => {
    /* §2's accent rule has TWO halves and this instrument checked one.
       palette.ts states the other in prose — "the budget is 2% for ONE of them
       per surface, not 2% each" — and §2's banned list ends with "more than one
       accent per surface". A document carrying four accents at 0.4% each summed
       to 1.6 and breached nothing, and every app row the artifact carried
       before this round was exactly that shape.

       COUNTED FROM THE TOKEN GRAPH, not from the percentages alone: nearest-
       token classification gives every accent a tail, and the artifact reads
       `signal` and `moss` at 0.06-0.14% on rows whose stylesheets reference
       neither. A naive count would report four accents on a page that paints
       two, which is the census making a false statement about the product. */
    const stub = (pct: number): BucketStat => ({ pixels: 0, pct })
    const atLaw = [{ top: 0, pct: { field: 60, bone: 30, graphite: 8, accent: 2 }, deviation: 0 }]
    const mean = { field: 60, bone: 30, graphite: 8, accent: 2 }
    const under = { field: stub(0), bone: stub(0), graphite: stub(0), accent: stub(1.6) }
    // Both declared tracks painting, plus two hues nothing binds: two lines,
    // because they are two different questions.
    expect(
      scrollingFormBreaches(atLaw, mean, 10, under, {
        acid: 0.4,
        marigold: 0.4,
        signal: 0.4,
        moss: 0.4,
      }, DECLARED),
    ).toEqual([
      'accents painting: marigold 0.40, acid 0.40 — §2 permits one per surface; the two ' +
        'tracks are Trust Rule 1 (tokens.css --reward/--data) and §12 outranks §2. A third is drift.',
      'accent painting with no role bound to it: signal 0.40, moss 0.40 — either a stylesheet ' +
        'reached past the token graph, or the classifier is absorbing something into it ' +
        '(see palette.ts on the derived tokens)',
    ])
    // One track painting, and the other accents under the floor: silence. The
    // floor is what keeps a classifier tail from reading as a design decision.
    expect(
      scrollingFormBreaches(atLaw, mean, 10, under, { acid: 1.6, marigold: 0.1, signal: 0.14 }, DECLARED),
    ).toEqual([])
  })

  it('reads the declared accents out of tokens.css, never out of a list here', () => {
    // --reward is the engagement track, --data the financial-reality track, and
    // Trust Rule 1 is why they may never be the same hue. Nothing binds
    // cobalt, signal or moss to a role — no stylesheet in the repo references
    // var(--signal), var(--moss) or var(--cobalt) at all — so their pixels are
    // classifier tails, not accents.
    expect(DECLARED).toEqual(['marigold', 'acid'])
    expect(ARTIFACT.law.declaredAccents).toEqual(DECLARED)
  })

  it('states the amended law once, and the artifact carries the same numbers', () => {
    // Three copies kept identical by a test, the same discipline law.buckets
    // already follows: the constant, the artifact, and this assertion.
    expect(SCROLLING_FORM.band).toEqual({ field: [35, 80], bone: [15, 55] })
    expect(SCROLLING_FORM.cap).toEqual({ field: 85, bone: 65 })
    expect(SCROLLING_FORM.meanTolerance).toEqual({ field: 8, bone: 6 })
    const { note, ...bounds } = ARTIFACT.law.scrollingForm
    expect(bounds).toEqual(SCROLLING_FORM)
    // §2 is unamended for anything the eye holds at once. That sentence is the
    // whole scope of this block and it ships inside the artifact.
    expect(note).toMatch(/COMPOSITION law and it is unchanged/)
  })

  it('says the same thing the design system says, in the design system', () => {
    // DESIGN-SYSTEM.md is BINDING and it wins conflicts. A code-only amendment
    // would leave §2 reading 60/30/8/2-of-document and a future round would
    // re-derive this whole finding from scratch — which is round 5 re-running
    // round 3's mistake in a different medium. So §2.1b carries the bounds and
    // this binds them to the constant the tool measures against.
    const doc = readFileSync(new URL('docs/brand/DESIGN-SYSTEM.md', REPO_ROOT), 'utf8')
    expect(doc).toContain('### 2.1b Ratio law — scrolling form')
    const { band, cap, meanTolerance, inkOnPaperMin, accentMax } = SCROLLING_FORM
    expect(doc).toContain(`field ${band.field[0]}–${band.field[1]}%`)
    expect(doc).toContain(`Bone family ${band.bone[0]}–${band.bone[1]}%`)
    expect(doc).toContain(`over ${cap.field}% field or over ${cap.bone}% Bone`)
    expect(doc).toContain(`±${meanTolerance.field} field, ±${meanTolerance.bone} Bone`)
    expect(doc).toContain(`>= ${inkOnPaperMin}%, measured over Bone-family-grounded area only`)
    expect(doc).toContain(`<= ${accentMax}% of the document`)
    // And the scope sentence, which is the half most likely to be dropped: the
    // composition law is not weakened, it is given a second form.
    expect(doc).toMatch(/§2's 60\/30\/8\/2 is a \*\*composition\*\* law\. It is unchanged/)
  })

  it('binds the worked example in the prose to the row it claims to quote', () => {
    // The bounds above were guarded; the MEASUREMENT beside them was not. A row
    // id stays correct forever while the number next to it goes stale — which is
    // round 3's defect at small scale, in the very document that exists to
    // prevent it. §2.1b, the README and the comment on this file's own example
    // all retype the same figures, so all three are bound here: change the
    // pixels without re-running the census and the staleness test goes red;
    // re-run it and get different numbers without updating the prose, and this
    // goes red instead.
    // Prose wraps: the window list straddles a line break in all three files,
    // so match against whitespace-collapsed text rather than pinning the
    // wrapping. Reflowing a paragraph must not fail this test; changing a
    // number must.
    const flat = (p: string) => readFileSync(new URL(p, REPO_ROOT), 'utf8').replace(/\s+/g, ' ')
    const row = ARTIFACT.rows['app.375x812.light.seeded']
    const doc = flat('docs/brand/DESIGN-SYSTEM.md')
    const readme = flat('README.md')
    const self = flat('scripts/census/census.test.ts')

    const field = row.buckets.field.pct.toFixed(2)
    const bone = row.buckets.bone.pct.toFixed(2)
    const windows = row.scrollingForm.windows.map((w) => w.pct.field.toFixed(2))
    // The prose writes the list as "a, b, c, d, e, f and g" — the Oxford-less
    // final "and" is the house style in all three files.
    const spoken = `${windows.slice(0, -1).join(', ')} and ${windows[windows.length - 1]}`

    expect(doc).toContain(`${field}% field / ${bone}% Bone`)
    expect(doc).toContain(spoken)
    // The prose spells the count ("**seven** viewport windows"); the artifact
    // stores it as a number. Accept either spelling so the binding survives an
    // editorial preference, but still catch a count that has actually moved.
    const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
    const n = row.scrollingForm.count
    const spelled = WORDS[n] ?? String(n)
    expect(doc).toMatch(new RegExp(`\\*\\*(${n}|${spelled})\\*\\* viewport windows`))

    expect(readme).toContain(`averages ${field}% field`)
    expect(readme).toContain(spoken)

    expect(self).toContain(`reads ${field}`)
    expect(self).toContain(`field / ${bone} Bone`)
    expect(self).toContain(spoken.replace(/\.00\b/g, ''))
  })

  it("binds §2.1b.3's copy-height table to the rows and files it names", () => {
    // §2.1b.3 IS THE SECTION THAT ESTABLISHES "quote the row id, or stamp the
    // tree", and none of its dozen figures was bound to anything — which is how
    // three of them came to be wrong with a green suite, including a committed
    // artifact relabelled as "a draft that was measured and discarded". The
    // table has three lines from three different files, so each line is checked
    // against the file it names. Two of them are historical and live in git, so
    // this reads them out of git rather than trusting the prose.
    const flat = (s: string) => s.replace(/\s+/g, ' ')
    const doc = flat(readFileSync(new URL('docs/brand/DESIGN-SYSTEM.md', REPO_ROOT), 'utf8'))
    const committed = (sha: string): Census => {
      let raw: string
      try {
        raw = execFileSync('git', ['show', `${sha}:docs/brand/census.json`], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        })
      } catch (err) {
        // A shallow clone reaches none of these commits and git fails with a
        // message about a bad object, which reads like the artifact is missing
        // rather than the history. CI checks out with fetch-depth: 0 for this
        // reason; say so, so the next person debugging a red build is not
        // hunting a file that is present and fine.
        throw new Error(
          `Could not read docs/brand/census.json at ${sha}. This test reads ` +
            `historical artifacts out of git, so it needs full history — a ` +
            `shallow clone (git clone --depth, or actions/checkout without ` +
            `fetch-depth: 0) cannot satisfy it. Underlying error: ${(err as Error).message}`,
        )
      }
      return JSON.parse(raw) as Census
    }

    /** One row of the table: [block height, carrier commit or null for HEAD's artifact]. */
    const TABLE: Array<[string, string | null]> = [
      ['0px', '83c9a9e'],
      ['178px', null],
      ['229px', 'c3c6c3b'],
    ]
    for (const [block, sha] of TABLE) {
      const census = sha === null ? ARTIFACT : committed(sha)
      const row = census.rows['landing.375x812.light.fresh']
      const wall = row.composition.sections.find((s) => s.label === 'section.lp-wall')!
      const at = (top: number) => row.scrollingForm.windows.find((w) => w.top === top)!
      // Whitespace-collapsed so the table's column padding is not part of the
      // assertion; the numbers and their order are.
      expect(`${block} ${doc.includes(
        `${block} ${wall.height} ${at(0).pct.field.toFixed(2)} ${at(4872).pct.field.toFixed(2)}`,
      )}`).toBe(`${block} true`)
      // The carrier line, in the form §2.1b's naming rule requires: the commit
      // the file was committed AT, and the tree it STAMPS, which differ on
      // every census this repo has ever committed.
      if (sha !== null) {
        expect(`${block}: ${doc}`.includes(
          `the census committed at ${sha}, which stamps tree ${census.tree.sha.slice(0, 7)}, dirty`,
        )).toBe(true)
      }
    }
    // The block height the table prices is the one Landing.tsx records as its
    // constraint. Two documents in one commit gave two heights for one shipped
    // block for a round; this is what stops the third.
    const landing = flat(readFileSync(new URL('src/components/Landing.tsx', REPO_ROOT), 'utf8'))
    expect(landing).toContain('178px at')
    expect(doc).toContain('put 178px of terms into `.lp-wall`')
  })

  it("keeps every committed row's window arithmetic self-consistent", () => {
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      const form = row.scrollingForm
      expect(`${id}: ${form.viewportHeight}`).toBe(`${id}: ${row.viewport.height}`)
      expect(`${id}: ${form.count}`).toBe(`${id}: ${form.windows.length}`)
      expect(`${id}: ${form.windows.map((w) => w.top).join()}`).toBe(
        `${id}: ${windowTops(row.dimensions.height, row.viewport.height).join()}`,
      )
      for (const bucket of BUCKET_ORDER) {
        const mean = form.windows.reduce((n, w) => n + w.pct[bucket], 0) / form.count
        expect(`${id} ${bucket}: ${Math.abs(mean - form.mean[bucket]) < 0.02}`).toBe(
          `${id} ${bucket}: true`,
        )
      }
      // The worst window is one of the windows, and it is the worst of them.
      const worst = Math.max(...form.windows.map((w) => w.deviation))
      expect(`${id}: ${form.worst.deviation}`).toBe(`${id}: ${worst}`)
      // Recomputing the breach list from the committed numbers must reproduce
      // it exactly — a hand-edited verdict cannot survive.
      expect(`${id}: ${form.breaches.join(' | ')}`).toBe(
        `${id}: ${scrollingFormBreaches(form.windows, form.mean, form.inkOnPaper, row.buckets, row.tokens, ARTIFACT.law.declaredAccents).join(' | ')}`,
      )
    }
  })

  /**
   * THE BAND, DEFENDED — the one assertion the artifact-wide checks did not
   * make.
   *
   * Everything above RE-DERIVES each row's verdict from that row's own numbers.
   * That catches a hand-edited breach list and nothing else: it is green with
   * any number of honest breaches, and it was green while window band breaches
   * went 0 (9a42bd8, 12 rows) -> 0 (ec3aa0c) -> 14 (83c9a9e, 18 rows) -> 15
   * (c3c6c3b, 20 rows) at every step. The one `toEqual([])` in this file runs on
   * a synthetic banded raster, never on ARTIFACT.rows. So the band was measured
   * and not defended, and "zero band breaches" survived four rounds as a
   * premise after it stopped being true.
   *
   * AN ALLOWLIST, NOT A BARE `toEqual([])`, FOR TWO REASONS. The two-accent
   * advisory is legal and is filtered out by name — Marigold and acid paint one
   * surface because they are the two TRACKS (Trust Rule 1, tokens.css
   * --reward/--data), and §12 outranks §2. And a breach that is argued in the
   * design system is a different object from one nobody has looked at: this
   * list is where the argument is pinned to the exact string. Every entry names
   * the paragraph that disposes of it.
   *
   * IT IS EXACT IN BOTH DIRECTIONS ON PURPOSE. A new breach fails it. So does
   * a waived breach that has been CLOSED, or one whose number has drifted —
   * because a waiver is a claim about a specific measured state, and a stale
   * waiver is the same rot as a stale figure in prose. Closing one means
   * deleting its line here, which is the smallest possible ceremony for the
   * only good news this list can carry.
   */
  const HERO_FRAME = 'section div.hero-frame @0: bone 13.61 under the 15 band'
  const PHONE_APP_ROWS = [
    'app.375x812.dark.cold',
    'app.375x812.dark.day0',
    'app.375x812.dark.dense',
    'app.375x812.dark.seeded',
    'app.375x812.dark.seeded.breakdown',
    'app.375x812.light.cold',
    'app.375x812.light.day0',
    'app.375x812.light.dense',
    'app.375x812.light.seeded',
    'app.375x812.light.seeded.breakdown',
  ]

  /** Window/mean band breaches that are recorded and argued. Row id -> verbatim. */
  const WINDOW_WAIVERS: Record<string, string[]> = {
    // §2.1b.2: before setup ProfileCard's open form is one unbroken ground
    // taller than a viewport, and neither the day list nor the decision record
    // has anything in it to stripe. Named there as a pre-setup structural run,
    // measured on two pairs, and explicitly "not fixed here".
    'app.375x812.light.day0': [
      'window @2436: field 27.13 under the 35 band',
      'window @2436: bone 61.49 over the 55 band',
      'mean field 50.79 outside 60±8',
      'mean bone 39.30 outside 30±6',
    ],
    'app.375x812.dark.day0': [
      'window @3248: bone 14.84 under the 15 band',
      'window @3398: bone 14.23 under the 15 band',
      'mean bone 22.92 outside 30±6',
    ],
    'app.375x812.light.cold': [
      'window @3248: field 27.12 under the 35 band',
      'window @3248: bone 59.80 over the 55 band',
      'mean bone 37.92 outside 30±6',
    ],
    'app.375x812.dark.cold': ['window @3248: bone 8.35 under the 15 band'],
    // §2.1b.2: one dense day is one unbroken ground run — ArchiveCard's stripe
    // alternates per `ledger-day`, so a day with 24 rows in it has nothing to
    // alternate. @4872 is the theme-twin check paying for itself: 24.53% field
    // in light and 80.56% in dark, the same window of the same DOM, one defect.
    'app.375x812.light.dense': [
      'window @4872: field 24.53 under the 35 band',
      'window @4872: bone 69.98 over the 65 cap',
      'mean field 51.51 outside 60±8',
      'mean bone 40.29 outside 30±6',
    ],
    'app.375x812.dark.dense': ['window @4872: field 80.56 over the 80 band'],
  }

  /** Section/run breaches that are recorded and argued. Row id -> verbatim. */
  const COMPOSITION_WAIVERS: Record<string, string[]> = {
    // §2.1b.1's closing paragraph: `.lp-foot` is §5C's PLATE, an approved
    // Marigold + Cobalt + Bone lockup, so its ACCENT bucket is holding the
    // counter's role and the Bone floor is reading the wrong two buckets. No
    // exemption is carved into compositionBreaches — that would need a selector
    // or a heuristic, and the walk holds no per-page knowledge — so the breach
    // stays recorded and the disposition lives in the law and here.
    'landing.375x812.light.fresh': ['section footer.lp-foot @7129: bone 2.85 under the 15 band'],
    'landing.375x812.dark.fresh': ['section footer.lp-foot @7129: bone 2.85 under the 15 band'],
    'landing.1440x900.light.fresh': ['section footer.lp-foot @4718: bone 2.52 under the 15 band'],
    'landing.1440x900.dark.fresh': ['section footer.lp-foot @4718: bone 2.52 under the 15 band'],
    // §2.1b.2's fourth finding: the app's own instance of the hero band §2
    // names, 1.39pp under the floor, identical in both themes. Open, argued,
    // not closed.
    ...Object.fromEntries(PHONE_APP_ROWS.map((id) => [id, [HERO_FRAME]])),
  }

  it('admits no band breach that is not argued in the design system', () => {
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      // The two-accent advisory is filtered by name, not waived per row: it is
      // legal everywhere it appears (§12 over §2) and it is the one entry in
      // this array that is not a band verdict at all.
      const band = row.scrollingForm.breaches.filter((b) => !b.startsWith('accents painting'))
      expect(`${id}: ${band.join(' | ')}`).toBe(
        `${id}: ${(WINDOW_WAIVERS[id] ?? []).join(' | ')}`,
      )
      expect(`${id}: ${row.composition.breaches.join(' | ')}`).toBe(
        `${id}: ${(COMPOSITION_WAIVERS[id] ?? []).join(' | ')}`,
      )
    }
    // A waiver for a row that no longer exists is a waiver nobody is reading.
    for (const id of [...Object.keys(WINDOW_WAIVERS), ...Object.keys(COMPOSITION_WAIVERS)]) {
      expect(`${id}: ${id in ARTIFACT.rows}`).toBe(`${id}: true`)
    }
  })
})

describe('the composition reading measures what the page authored', () => {
  const palette = readPalette()
  const classify = makeClassifier(palette)

  /** A page `width` px wide made of horizontal bands of one hex each. */
  const banded = (width: number, bands: [string, number][]): Uint8Array => {
    const height = bands.reduce((n, [, h]) => n + h, 0)
    const out = new Uint8Array(width * height * 3)
    let y = 0
    for (const [hex, h] of bands) {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      for (let row = 0; row < h; row++, y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3
          out[i] = r
          out[i + 1] = g
          out[i + 2] = b
        }
      }
    }
    return out
  }

  it('separates the page ground from its sections and from what nests inside them', () => {
    // The landing's shape: a Bone page ground wrapping four sections, one of
    // which contains a full-bleed mat.
    const grounds: Ground[] = [
      { label: 'div.landing', top: 0, bottom: 1000, parent: -1 },
      { label: 'section.a', top: 0, bottom: 300, parent: 0 },
      { label: 'section.b', top: 300, bottom: 800, parent: 0 },
      { label: 'div.mat', top: 400, bottom: 700, parent: 2 },
      { label: 'footer.c', top: 800, bottom: 1000, parent: 0 },
    ]
    const { page, sections, nested } = classifyGrounds(grounds, 1000)
    expect(grounds[page].label).toBe('div.landing')
    expect(sections.map((i) => grounds[i].label)).toEqual(['section.a', 'section.b', 'footer.c'])
    // The mat is NOT a composition. §5's note 3: without the depth restriction
    // it splits section.b into three fragments and a 100px strip of section
    // padding gets flagged as an over-field composition nobody designed.
    expect(nested.map((i) => grounds[i].label)).toEqual(['div.mat'])
  })

  it('falls back to top-level grounds when nothing wraps the document', () => {
    // No single ground spans 0..docHeight, so there is no page ground and the
    // top-level grounds ARE the compositions. This is the shape a page has when
    // its sections are siblings under a transparent root — the rule must not
    // silently report zero sections for it.
    const grounds: Ground[] = [
      { label: 'section.a', top: 0, bottom: 400, parent: -1 },
      { label: 'section.b', top: 400, bottom: 900, parent: -1 },
      { label: 'div.inner', top: 500, bottom: 600, parent: 1 },
    ]
    const { page, sections, nested } = classifyGrounds(grounds, 900)
    expect(page).toBe(-1)
    expect(sections.map((i) => grounds[i].label)).toEqual(['section.a', 'section.b'])
    expect(nested.map((i) => grounds[i].label)).toEqual(['div.inner'])
  })

  it('finds the breach no phase of the window grid can see', () => {
    /**
     * THE CASE THAT PRODUCED THIS READING, in miniature, and the fixture is
     * built so the window reading is CLEAN. A 900px page on a 300px viewport,
     * 100px wide: 500px of a 70-field/30-Bone section, then a 200px section
     * that is pure Bone, then 200px back at 70/30.
     *
     * The three grid windows read 70.0, 46.7 and 46.7 percent field and 30.0,
     * 53.3 and 53.3 Bone — all inside the band, no window breach. The middle
     * section is a composition the eye holds ENTIRE and it is 100% Bone: over
     * §2.1b's 65 hard cap and under its 35 field floor. No 300px window can
     * isolate it, because every window that contains it also contains enough of
     * its neighbours to pass. That is exactly why the landing carried
     * `breaches: []` beside `.lp-shear` reading 30.40 / 66.45.
     */
    const mixed = (width: number, bands: [number, string, string, number][]): Uint8Array => {
      const height = bands.reduce((n, b) => n + b[3], 0)
      const out = new Uint8Array(width * height * 3)
      const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      let y = 0
      for (const [split, left, right, rows] of bands) {
        const [lr, lg, lb] = rgbOf(left)
        const [rr, rg, rb] = rgbOf(right)
        for (let row = 0; row < rows; row++, y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 3
            out[i] = x < split ? lr : rr
            out[i + 1] = x < split ? lg : rg
            out[i + 2] = x < split ? lb : rb
          }
        }
      }
      return out
    }
    const rgb = mixed(100, [
      [70, '#f93e06', '#f5e6e0', 500],
      [0, '#f93e06', '#f5e6e0', 200],
      [70, '#f93e06', '#f5e6e0', 200],
    ])
    const doc = censusPixels(rgb, palette)
    const windows = censusScrollingForm(
      rgb, 100, 900, 300, palette, doc.buckets, doc.tokens, readDeclaredAccents(),
    )
    // The window reading is clean: every 300px window straddles the section.
    expect(windows.windows.map((w) => w.top)).toEqual([0, 300, 600])
    expect(windows.windows.map((w) => w.pct.field)).toEqual([70, 46.67, 46.67])
    expect(windows.breaches.filter((b) => b.startsWith('window'))).toEqual([])

    const grounds: Ground[] = [
      { label: 'div.page', top: 0, bottom: 900, parent: -1 },
      { label: 'section.top', top: 0, bottom: 500, parent: 0 },
      { label: 'section.middle', top: 500, bottom: 700, parent: 0 },
      { label: 'section.bottom', top: 700, bottom: 900, parent: 0 },
    ]
    const comp = censusComposition(rgb, 100, 900, 300, palette, grounds, classify)
    expect(comp.pageGround).toBe('div.page')
    expect(comp.sections.map((s) => s.label)).toEqual(['section.top', 'section.middle', 'section.bottom'])
    const middle = comp.sections[1]
    expect(middle.height).toBe(200)
    expect(middle.held).toBe(true)
    expect(middle.pct.bone).toBe(100)
    expect(comp.breaches).toEqual([
      'section section.middle @500: field 0.00 under the 35 band',
      'section section.middle @500: bone 100.00 over the 65 cap',
    ])
    // The 500px section is longer than the viewport, so it is a sequence and
    // the windows own it — no verdict, even though it too is off target.
    expect(comp.sections[0].held).toBe(false)
    // The 200px tail is a held composition inside the band: not every section
    // is a breach, or this reading would say nothing.
    expect(comp.sections[2].held).toBe(true)
    expect(comp.sections[2].pct.field).toBe(70)
  })

  it('exempts a section taller than the viewport — that is a sequence, not a composition', () => {
    // §2 states its own precondition: "anything the eye holds at once". A
    // 400px section on a 300px viewport is read in two goes, and the windows
    // already own it. Same pixels as the case above, one boundary moved.
    const rgb = banded(10, [
      ['#f93e06', 100],
      ['#f5e6e0', 400],
      ['#f93e06', 400],
    ])
    const grounds: Ground[] = [
      { label: 'div.page', top: 0, bottom: 900, parent: -1 },
      { label: 'section.top', top: 0, bottom: 100, parent: 0 },
      { label: 'section.long', top: 100, bottom: 500, parent: 0 },
      { label: 'section.bottom', top: 500, bottom: 900, parent: 0 },
    ]
    const comp = censusComposition(rgb, 10, 900, 300, palette, grounds, classify)
    const long = comp.sections[1]
    expect(long.pct.bone).toBe(100)
    expect(long.held).toBe(false)
    // Its numbers are still recorded — the reading is not suppressed, only the
    // verdict — so a future round can see the shape without re-measuring.
    expect(long.deviation).toBeGreaterThan(100)
    expect(comp.breaches.some((b) => b.includes('section.long'))).toBe(false)
  })

  it('applies the run-length rule to nested grounds only, and by length alone', () => {
    // §2.1b: "No single ground may run longer than one viewport." A section
    // boundary is authored, so scrolling out of a long section lands somewhere
    // the designer chose; a nested ground longer than a viewport is a run with
    // no authored exit. That is the distinction, and it is the whole reason the
    // walk emits two lists.
    const sections: RegionStat[] = [
      {
        label: 'section.long',
        top: 0,
        height: 2000,
        pct: { field: 100, bone: 0, graphite: 0, accent: 0 },
        deviation: 0,
        held: false,
      },
    ]
    const nested: RegionStat[] = [
      {
        label: 'div.mat',
        top: 100,
        height: 1007,
        // Perfectly at law on ratio, and still a breach: the rule is length.
        pct: { field: 60, bone: 30, graphite: 8, accent: 2 },
        deviation: 0,
        held: false,
      },
      {
        label: 'div.short',
        top: 1200,
        height: 400,
        pct: { field: 0, bone: 100, graphite: 0, accent: 0 },
        deviation: 0,
        held: true,
      },
    ]
    const out = compositionBreaches(sections, nested, 812)
    expect(out).toEqual([
      'ground run div.mat @100: 1007px inside a 812px viewport ' +
        '(§2.1b — no single ground may run longer than one viewport)',
    ])
  })

  it('keeps the DOM rule stating the three edges it earned', () => {
    /**
     * THESE ARE NOT STYLE ASSERTIONS. Each guards a case the rule got wrong
     * before it was written down, and each failure mode is silent:
     *
     *  - WITHOUT THE `position` FILTER, the landing's `.lp-band` qualifies (it
     *    is full-bleed and opaque). At 1440 its box is 2880-4203 while its
     *    section is 3229-3856, so it emits a boundary 349px above its own
     *    parent's top and the regions overlap. It is rotated 38° besides, so
     *    its box is not what it paints.
     *  - WITHOUT SKIPPING `body`, body's own Flare spans the document, is taken
     *    as the page ground, and `div.landing` becomes the only section — the
     *    reading collapses to one region and reports nothing.
     *  - WITHOUT THE HEIGHT GUARD, a collapsed opaque wrapper emits an empty
     *    region and the percentage divides by zero.
     */
    expect(COMPOSITION_SCRIPT).toContain("cs.position === 'static' || cs.position === 'relative'")
    expect(COMPOSITION_SCRIPT).toContain("el.tagName !== 'BODY'")
    expect(COMPOSITION_SCRIPT).toContain('bottom > top')
    // And the two that define the ground itself.
    expect(COMPOSITION_SCRIPT).toContain('rect.width >= docWidth - 1')
    expect(COMPOSITION_SCRIPT).toContain('bg !== parentBg')
  })

  it('says the same thing the design system says, in the design system', () => {
    // Same discipline §2.1b's window bounds already follow: a code-only
    // amendment leaves the binding document describing a rule the tool no
    // longer applies, and a future round re-derives the whole finding.
    // Whitespace-collapsed, like the worked-example binding above: the rule
    // block wraps, and reflowing a paragraph must not fail this test.
    const doc = readFileSync(new URL('docs/brand/DESIGN-SYSTEM.md', REPO_ROOT), 'utf8').replace(
      /\s+/g,
      ' ',
    )
    expect(doc).toContain('#### 2.1b.1 The third reading — sections, and the runs inside them')
    // The precondition is the half most likely to be dropped, because it is the
    // half that makes the reading survivable on a long page.
    expect(doc).toMatch(/enforced only where the section is no taller than the viewport/i)
    // And the line that keeps §5C legal.
    expect(doc).toMatch(/accent stays a document property/i)
    // The DOM rule itself, so the document states the boundary it is judging by
    // rather than pointing at a file.
    expect(doc).toContain('PAGE_GROUND := the outermost GROUND whose box spans the whole document')
  })

  it('carries its scope note into the artifact, and re-derives every verdict', () => {
    expect(ARTIFACT.law.composition.note).toBe(COMPOSITION_NOTE)
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      const comp = row.composition
      // Recomputing the verdict from the committed numbers must reproduce it
      // exactly — a hand-edited breach list cannot survive.
      expect(`${id}: ${comp.breaches.join(' | ')}`).toBe(
        `${id}: ${compositionBreaches(comp.sections, comp.nested, row.viewport.height).join(' | ')}`,
      )
      // `held` is a fact about the geometry, not a stored opinion.
      for (const region of [...comp.sections, ...comp.nested]) {
        expect(`${id} ${region.label}: ${region.held}`).toBe(
          `${id} ${region.label}: ${region.height > 0 && region.height <= row.viewport.height}`,
        )
        // Every region is inside the raster it was cut from.
        expect(`${id} ${region.label}: ${region.top + region.height <= row.dimensions.height}`).toBe(
          `${id} ${region.label}: true`,
        )
      }
      // Sections tile in document order and never overlap: an overlap would
      // mean the walk had emitted a ground above its own parent's top, which is
      // the `position` failure the previous test guards.
      const tops = comp.sections.map((s) => s.top)
      expect(`${id}: ${tops.join()}`).toBe(`${id}: ${[...tops].sort((a, b) => a - b).join()}`)
      for (let i = 1; i < comp.sections.length; i++) {
        const prev = comp.sections[i - 1]
        expect(`${id}: ${prev.top + prev.height <= comp.sections[i].top}`).toBe(`${id}: true`)
      }
      // ACCENT IS NEVER RE-CHECKED PER SECTION. §5C's PLATE is a Marigold
      // lockup; scoring accent per composition would make a signature layout
      // permanently illegal, and §2.1b already scopes scarcity to the document.
      expect(`${id}: ${comp.breaches.some((b) => b.includes('accent'))}`).toBe(`${id}: false`)
    }
  })
})

describe('serialisation is byte-stable', () => {
  it('serialises the same input to the same bytes', () => {
    // A diff full of key-order churn is a diff nobody reads.
    expect(serialiseCensus(ARTIFACT)).toBe(
      serialiseCensus(JSON.parse(JSON.stringify(ARTIFACT)) as Census),
    )
  })

  it('matches the committed file byte for byte', () => {
    // Proves the committed artifact came out of this serialiser rather than
    // out of an editor. A hand-tuned number is exactly the failure this file
    // exists to prevent.
    expect(serialiseCensus(ARTIFACT)).toBe(ARTIFACT_TEXT)
  })

  it('renders percentages at two decimals and counts as integers', () => {
    expect(/"pct": \d+\.\d\d[,\n]/.test(ARTIFACT_TEXT)).toBe(true)
    expect(/"pixels": \d+,/.test(ARTIFACT_TEXT)).toBe(true)
    expect(ARTIFACT_TEXT.endsWith('\n')).toBe(true)
  })
})

describe('the committed artifact is intact', () => {
  it('is the schema this code writes', () => {
    expect(ARTIFACT.schemaVersion).toBe(SCHEMA_VERSION)
    expect(ARTIFACT.tool).toBe('scripts/census/run.ts')
  })

  it('holds exactly the rows the matrix names', () => {
    // An orphan row is a number for a screen nobody measures any more: a stale
    // claim with a fresh-looking file around it. A missing row is a silent skip.
    expect(Object.keys(ARTIFACT.rows)).toEqual(MATRIX_IDS)
  })

  it('records the bucket map, the targets and the resolution behind them', () => {
    expect(ARTIFACT.law.buckets).toEqual(BUCKETS)
    expect(ARTIFACT.law.targets).toEqual(TARGETS)
    expect(ARTIFACT.classifier.strayThresholdDeltaE).toBe(STRAY_DELTA_E)
    // §8's acceptance check travels with the numbers, not in a commit message.
    expect(ARTIFACT.law.bucketNote).toMatch(/Sand and Fog sit in BONE/)
    // And the denominator warning, which is the misreading most likely to
    // waste a future round: a taller page dilutes every percentage.
    expect(ARTIFACT.law.note).toMatch(/FULL-PAGE/)
  })

  it('records the palette it classified against', () => {
    expect(ARTIFACT.palette.tokens).toEqual(
      Object.fromEntries(readPalette().map((t) => [t.name, t.hex])),
    )
  })

  it("keeps every row's arithmetic self-consistent", () => {
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      const total = BUCKET_ORDER.reduce((n, b) => n + row.buckets[b].pixels, 0)
      expect(`${id}: ${total}`).toBe(`${id}: ${row.pixels.total}`)
      expect(`${id}: ${row.dimensions.width * row.dimensions.height}`).toBe(
        `${id}: ${row.pixels.total}`,
      )
      const dev = deviation(
        Object.fromEntries(BUCKET_ORDER.map((b) => [b, row.buckets[b].pct])) as Record<Bucket, number>,
      )
      expect(`${id}: ${Math.abs(dev - row.deviation) < 0.05}`).toBe(`${id}: true`)
    }
  })

  it('records zero external requests — the app renders fully offline', () => {
    // src/localFirst.test.ts asserts this over the SOURCE. This asserts it
    // over an actual production page load, which is the other half.
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      expect(`${id}: ${row.externalRequests}`).toBe(`${id}: 0`)
    }
  })

  it('measured every row at rest, with no live region painting', () => {
    // THE GUARD THE SETTLE CHECK CANNOT BE. Two captures 400ms apart cannot
    // detect anything that changes more slowly than they sample, and App's
    // toast lives 2600ms — so for three rounds eight app rows were captured
    // inside a celebration and the instrument had no way to say so. This
    // assertion is the way it says so.
    //
    // IF A ROW IS EVER MEANT TO CARRY A MESSAGE — a persist-fault row, say —
    // this is where that gets declared, deliberately and in one place. Do not
    // relax it to make a red row green: an unexplained entry here means the
    // census measured a screen that was in the middle of saying something.
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      expect(`${id}: ${row.announcements.join(' | ')}`).toBe(`${id}: `)
    }
  })

  it('records how many attempts each row needed to hold still', () => {
    // Swallowed retries are how a row that is quietly unstable stays invisible.
    // 1 means the page was already at rest; anything higher is a fact about the
    // tree, recorded rather than averaged away.
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      expect(`${id}: ${Number.isInteger(row.settleAttempts) && row.settleAttempts >= 1}`).toBe(
        `${id}: true`,
      )
    }
  })

  it('agrees with its own id about which view each row is in', () => {
    // The id is the only handle prose has on a row (§2.1b: "quote the row id"),
    // so a record whose fields contradict its key would make every quotation
    // ambiguous.
    for (const [id, row] of Object.entries(ARTIFACT.rows)) {
      const parsed = parseRowId(id)
      expect(`${id}: ${row.screen}/${row.theme}/${row.state}/${row.view}`).toBe(
        `${id}: ${parsed.screen}/${parsed.theme}/${parsed.state}/${parsed.view}`,
      )
    }
  })
})

describe('the live-region guard reads what the settle check cannot sample', () => {
  const region = (over: Partial<LiveRegion>): LiveRegion => ({
    label: 'Announcements',
    text: '',
    painted: true,
    ...over,
  })

  it('reports a painting region that is saying something', () => {
    expect(
      paintedAnnouncements([region({ text: 'Level 5. Steady Hand.' })]),
    ).toEqual(['Announcements: Level 5. Steady Hand.'])
  })

  it('ignores a painting region with nothing to say', () => {
    // Every one of App's regions is permanently mounted (Trust Rule 8), so
    // "present" is the normal case and means nothing on its own.
    expect(paintedAnnouncements([region({ text: '' })])).toEqual([])
  })

  it('ignores sr-only regions however much they are saying', () => {
    // At rest the ledger-range, lesson-status and log-status regions all carry
    // text they are SUPPOSED to carry, and none of them moves a pixel — the
    // .sr-only clip collapses them to 1x1. Listing them would bury the one
    // entry that means something under prose that is working as designed.
    expect(
      paintedAnnouncements([
        region({ label: 'Ledger range', text: 'Showing 3 of 12 days.', painted: false }),
        region({ label: 'XP gains', text: '+5 XP', painted: false }),
      ]),
    ).toEqual([])
  })

  it('asks the page for facts and decides in Node', () => {
    // Same split composition.ts makes: a rule that exists only as a string
    // evaluated in a browser is a rule no test can reach. The script reports
    // label/text/painted; every judgement about them is the function above.
    expect(LIVE_REGION_SCRIPT).toContain('[role="status"]')
    expect(LIVE_REGION_SCRIPT).toContain('[role="alert"]')
    expect(LIVE_REGION_SCRIPT).toContain('[aria-live]')
    // The three ways the cascade hides a mounted region, all of which the app
    // actually uses: .sr-only clips to 1x1, .toast:empty sets opacity 0.
    expect(LIVE_REGION_SCRIPT).toContain('rect.width > 1')
    expect(LIVE_REGION_SCRIPT).toContain("cs.visibility !== 'hidden'")
    expect(LIVE_REGION_SCRIPT).toContain('parseFloat(cs.opacity) > 0')
  })
})

describe('git dirtiness is read the same way every time', () => {
  it('reads porcelain output correctly', () => {
    expect(isDirty('')).toBe(false)
    expect(isDirty('\n')).toBe(false)
    expect(isDirty(' M src/App.tsx\n')).toBe(true)
    // Untracked counts: an untracked stylesheet is still something the browser
    // could have loaded, so the measurement does not describe the commit.
    expect(isDirty('?? scripts/census/scratch.ts\n')).toBe(true)
    expect(isDirty('A  docs/brand/census.json\n M src/styles/app.css\n')).toBe(true)
  })

  it('never reads an UNANSWERED git as clean', () => {
    /* THE FAILURE PATH THAT FED THIS FUNCTION, WHICH NOTHING USED TO COVER.
       run.ts's git() swallowed every failure and returned '', so git absent,
       git broken, or the directory not being a repo all arrived here as '' —
       and '' is clean. The run then stamped tree { sha: '', dirty: false } and
       sailed past the dirty guard: the one field that says "these numbers
       describe a committed tree" failed toward the reassuring answer. git()
       returns null on throw now, and null is dirty. */
    expect(isDirty(null)).toBe(true)
    expect(dirtyPaths(null)).toEqual(['<git did not answer>'])
  })

  it('names what was uncommitted rather than only asserting that something was', () => {
    // A dirty stamp a reader cannot act on is barely better than no stamp:
    // dirt in a stylesheet means the numbers are provisional, dirt in the
    // artifact itself does not.
    expect(dirtyPaths(' M src/styles/app.css\n?? scratch.ts\n')).toEqual([
      'scratch.ts',
      'src/styles/app.css',
    ])
    expect(dirtyPaths('')).toEqual([])
  })
})

describe('the census flags reject values that would make them vacuous', () => {
  it('refuses a --tolerance that is not a non-negative number', () => {
    /* A GATE THAT PASSES SILENTLY ON A TYPO IS WORSE THAN NO GATE. Without
       this, `--check --tolerance abc` gave NaN, every `Math.abs(delta) > NaN`
       inside checkTolerance was false, and the run reported success having
       compared nothing — the same argument .github/workflows/ci.yml makes for
       why a flaky ratio-law threshold must not exist. */
    expect(() => parseCensusArgs(['--tolerance', 'abc'])).toThrow(/non-negative number/)
    expect(() => parseCensusArgs(['--tolerance', '-1'])).toThrow(/non-negative number/)
    expect(() => parseCensusArgs(['--tolerance', 'Infinity'])).toThrow(/non-negative number/)
    expect(parseCensusArgs(['--tolerance', '0']).tolerance).toBe(0)
    expect(parseCensusArgs(['--tolerance', '2.5']).tolerance).toBe(2.5)
  })
})

describe('the run refuses to publish numbers from a tree that moved under it', () => {
  it('names every input that changed between the two snapshots', () => {
    /* ROUND 3'S DEFECT, MECHANISED. inputsHash used to be computed at the END
       of a run — after the bundle was built and every row shot — so an edit
       made WHILE the census ran wrote the new hash beside the old numbers and
       the staleness test then called them current. The run takes the hash
       before the build and re-takes it after the last row; this is the part
       that says which file moved. */
    const before = new Map([
      ['src/styles/app.css', 'sha256:aaa'],
      ['src/gone.tsx', 'sha256:bbb'],
    ])
    const after = new Map([
      ['src/styles/app.css', 'sha256:zzz'],
      ['src/new.tsx', 'sha256:ccc'],
    ])
    expect(movedInputs(before, after)).toEqual([
      'src/gone.tsx (removed)',
      'src/new.tsx (added)',
      'src/styles/app.css (edited)',
    ])
    expect(movedInputs(before, before)).toEqual([])
  })

  it('will not let one row’s type stack speak for twelve', () => {
    /* env.fonts and env.fingerprint are written once and presented as the
       environment for every row, and formatDiff refuses cross-environment
       subtraction on the strength of that single value. They used to be
       whatever the LAST row measured, with nothing checking the other eleven
       agreed — so a row that resolved a different stack (the exact thing
       FONT_PROBE's header says cannot be assumed away) was invisible. */
    const probe = (id: string, ui: string) => ({ id, families: { ui }, widths: { ui: 100 } })
    expect(disagreeingProbe([])).toBeNull()
    expect(disagreeingProbe([probe('a', 'DejaVu Sans'), probe('b', 'DejaVu Sans')])).toBeNull()
    expect(disagreeingProbe([probe('a', 'DejaVu Sans'), probe('b', 'Space Grotesk')])?.id).toBe('b')
  })
})

describe('THE STALENESS TEST', () => {
  it('declares a sorted, deduplicated input list', () => {
    const inputs = pixelInputs()
    expect(inputs).toEqual([...inputs].sort())
    expect(new Set(inputs).size).toBe(inputs.length)
    // The list must not quietly become empty, and must not lose the files
    // whose absence would make the whole guard vacuous.
    for (const required of [
      'index.html',
      // The build config is a pixel input and was missing from the list:
      // serve.ts builds through Vite's Node API, so every run loads
      // vite.config.ts, whose `distribution` plugin transforms the served
      // index.html through scripts/htmlComments.ts. A change to either moves
      // what the browser renders without moving inputsHash — a hole in the
      // staleness authority, which is round 3's defect wearing a hat.
      'vite.config.ts',
      'scripts/htmlComments.ts',
      'src/styles/app.css',
      'src/styles/tokens.css',
      'src/components/Landing.tsx',
      'src/engine/healthScore.ts',
      'src/state/store.ts',
      'scripts/census/palette.ts',
      'scripts/census/matrix.ts',
      'scripts/census/determinism.ts',
      // The third reading's boundary rule. It is not a driver file: changing
      // which DOM nodes count as grounds re-cuts every section in the artifact,
      // the same way changing the bucket map re-buckets every pixel.
      'scripts/census/composition.ts',
      'scripts/census/fixtures/seeded.json',
    ]) {
      expect(`${required}: ${inputs.includes(required)}`).toBe(`${required}: true`)
    }
    expect(inputs.some((p) => p.includes('.test.'))).toBe(false)
  })

  it('says docs/brand/census.json is stale when the tree has moved', () => {
    /**
     * THE WHOLE POINT OF THE ROUND. Round 3 measured at 07:52, committed at
     * 10:08, and published the 07:52 numbers as a description of the committed
     * tree; nothing in the repo could notice.
     *
     * A commit SHA would not have caught it — round 3 would have stamped a
     * real SHA on numbers from a different tree. A content hash does:
     * measuring early and committing late is fine IF nothing visual changed in
     * between, and if something did, this line goes red.
     */
    expect(
      ARTIFACT.inputsHash === inputsHash()
        ? 'census.json is current'
        : 'docs/brand/census.json is stale — run npm run census',
    ).toBe('census.json is current')
  })
})

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * raster.ts's supersampled surface, resolved to output pixels the same way its
 * private `resolve()` does. Reimplemented here on purpose: a reference that
 * called the decoder would be comparing the decoder to itself.
 */
function boxFilter(s: Surface): Uint8Array {
  const SS = 4
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

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function ihdr(
  width: number,
  height: number,
  bitDepth: number,
  colourType: number,
  interlace: number,
): Uint8Array {
  const d = new Uint8Array(13)
  const view = new DataView(d.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  d[8] = bitDepth
  d[9] = colourType
  d[12] = interlace
  return chunk('IHDR', d)
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** An RGBA image whose IDAT is split across chunks, like Chrome's. */
function syntheticRgba(width: number, height: number, rows: number[][]): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < width; x++) raw.set(rows[y % rows.length], y * (stride + 1) + 1 + x * 4)
  }
  const z = new Uint8Array(deflateSync(raw))
  const half = Math.floor(z.length / 2)
  return join(
    SIG,
    ihdr(width, height, 8, 6, 0),
    chunk('IDAT', z.subarray(0, half)),
    chunk('IDAT', z.subarray(half)),
    chunk('IEND', new Uint8Array(0)),
  )
}

function brokenIhdr(opts: { interlace?: number; bitDepth?: number }): Uint8Array {
  return join(
    SIG,
    ihdr(4, 4, opts.bitDepth ?? 8, 6, opts.interlace ?? 0),
    chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    chunk('IEND', new Uint8Array(0)),
  )
}
