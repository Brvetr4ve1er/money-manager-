/**
 * THE ARTIFACT: its shape, its counting, its serialisation, its diff.
 *
 * Everything in this file is pure — no browser, no network, no filesystem — so
 * census.test.ts can assert the measurement itself rather than only the plumbing
 * around it. run.ts holds the parts that talk to Chrome and to git; the numbers
 * are decided here.
 *
 * WHY THE ARTIFACT IS COMMITTED AT ALL. Rounds 1-4 kept the census in an
 * agent's recollection and in prose comments, and round 3 published a 07:52
 * measurement as a description of a 10:08 tree. A committed JSON file with
 * stable keys turns "what colour is this app" into something a diff can answer,
 * and inputs.ts turns "is this file still true" into something a test can
 * answer.
 */

import {
  BUCKETS,
  BUCKET_ORDER,
  SCROLLING_FORM,
  STRAY_DELTA_E,
  TARGETS,
  deviation,
  makeClassifier,
  type Bucket,
  type ScrollingFormLaw,
  type Token,
} from './palette.ts'

export const SCHEMA_VERSION = 1
export const TOOL = 'scripts/census/run.ts'
export const ARTIFACT_PATH = 'docs/brand/census.json'

export interface BucketStat {
  pixels: number
  pct: number
}

export interface StrayColour {
  hex: string
  pct: number
  nearest: string
  deltaE: number
}

export interface Strays {
  /** Share of pixels that are not really any token — see STRAY_DELTA_E. */
  pctOverDeltaE12: number
  meanDeltaE: number
  /** The largest colours that are ACTUALLY over the threshold. See the note in
   *  censusPixels: this list used to be filled from every off-exact colour, so
   *  on 10 of 12 committed rows it named nothing but Flare antialiasing and
   *  disclosed not one of the strays it was counting. */
  top: StrayColour[]
  /** Off-exact but UNDER the threshold — glyph edges and the §8 grain. Kept
   *  because the previous list was mostly this, and deleting it outright would
   *  lose a reader's only view of how much of a row is antialiasing. */
  nearMisses: StrayColour[]
}

/** One viewport-height window of the document — one screen someone sees. */
export interface WindowStat {
  /** Scroll offset of the window's top edge, in CSS pixels. */
  top: number
  pct: Record<Bucket, number>
  deviation: number
}

export interface ScrollingFormRecord {
  /** The window height: the row's emulated viewport height, never the doc's. */
  viewportHeight: number
  count: number
  /** Unweighted mean of the window vectors — every screen counts once. */
  mean: Record<Bucket, number>
  meanDeviation: number
  /** graphite / (graphite + bone), over the document. See SCROLLING_FORM. */
  inkOnPaper: number
  worst: { top: number; deviation: number }
  /** Empty when the row is at law. Each entry names a window and a bound. */
  breaches: string[]
  windows: WindowStat[]
}

export interface RowRecord {
  screen: string
  viewport: { width: number; height: number; mobile: boolean }
  theme: string
  state: string
  /** FULL PAGE. This is the denominator — see the note in `law.note`. */
  dimensions: { width: number; height: number }
  pixels: { total: number }
  buckets: Record<Bucket, BucketStat>
  deviation: number
  tokens: Record<string, number>
  strays: Strays
  /** The second reading: §2 over the screens rather than over the pixels. */
  scrollingForm: ScrollingFormRecord
  externalRequests: number
}

export interface Census {
  schemaVersion: number
  tool: string
  capturedAt: string
  tree: { sha: string; branch: string; dirty: boolean; dirtyPaths: string[] }
  inputsHash: string
  env: {
    node: string
    chrome: string
    platform: string
    fingerprint: string
    fonts: Record<string, string>
  }
  determinism: {
    epoch: string
    timezone: string
    locale: string
    reducedMotion: boolean
    deviceScaleFactor: number
    settleChecked: boolean
  }
  palette: { source: string; sha256: string; tokens: Record<string, string> }
  classifier: {
    space: string
    metric: string
    tieBreak: string
    strayThresholdDeltaE: number
  }
  law: {
    targets: Record<Bucket, number>
    deviation: string
    note: string
    bucketNote: string
    buckets: Record<Bucket, string[]>
    /** The accents tokens.css binds to a role. §2 permits one per surface; §12
     *  (Trust Rule 1, two tracks never crossed) is why this product spends two
     *  and why that is not a defect. Recorded so the count in `breaches` can be
     *  read without re-deriving it. */
    declaredAccents: string[]
    scrollingForm: ScrollingFormLaw & { note: string }
  }
  rows: Record<string, RowRecord>
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

// ── counting ──────────────────────────────────────────────────────────────

export interface PixelCensus {
  total: number
  /** Per-token pixel counts, indexed like the palette array. */
  perToken: number[]
  buckets: Record<Bucket, BucketStat>
  deviation: number
  tokens: Record<string, number>
  strays: Strays
}

/**
 * Classify every pixel and fold it into the four ratio-law buckets.
 *
 * A 24-bit histogram first, then one classification per DISTINCT colour. A
 * full-page desktop shot is ~4.6M pixels but only tens of thousands of
 * distinct colours, so the Lab conversion and its twelve distance
 * computations run about a hundred times less often than the naive loop would.
 * The 64MB counter array is transient and is the cheap half of the trade.
 *
 * STRAYS STAY IN THEIR NEAREST BUCKET. Antialiased glyph edges, the 6% offset
 * grain (§8) and derived colours like --spec are nothing like any token, but
 * dropping them would change the denominator and break comparability with the
 * figures rounds 1-4 published. So they are counted AND disclosed: if
 * `pctOverDeltaE12` is 30, the four numbers above it deserve less trust, and a
 * reader can now see that instead of having to infer it.
 */
export function censusPixels(rgb: Uint8Array, palette: Token[]): PixelCensus {
  const total = rgb.length / 3
  const histogram = new Uint32Array(1 << 24)
  for (let i = 0; i < rgb.length; i += 3) {
    histogram[(rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2]]++
  }

  const classify = makeClassifier(palette)
  const perToken = new Array<number>(palette.length).fill(0)
  let strayPixels = 0
  let deltaESum = 0
  const strays: StrayColour[] = []
  const nearMisses: StrayColour[] = []

  for (let key = 0; key < histogram.length; key++) {
    const count = histogram[key]
    if (count === 0) continue
    const r = (key >> 16) & 255
    const g = (key >> 8) & 255
    const b = key & 255
    const match = classify(r, g, b)
    perToken[match.index] += count
    deltaESum += match.deltaE * count
    const entry = (): StrayColour => ({
      hex: `#${key.toString(16).padStart(6, '0')}`,
      pct: (count / total) * 100,
      nearest: palette[match.index].name,
      deltaE: match.deltaE,
    })
    // THE FIELD CALLED `strays` NOW CONTAINS STRAYS. It was filled from every
    // off-EXACT colour, which is a different set and a vastly larger one: on 10
    // of the 12 rows the committed artifact carried, every entry was under the
    // ΔE 12 threshold and the list was saturated by Flare antialiasing
    // (#f73e06 at ΔE 0.8, #f83e06 at 0.4). landing.375x812.light.fresh
    // disclosed 3.48% of its pixels as strays and named none of them, and the
    // one genuinely alarming entry in the whole file (#676562 -> moss at ΔE
    // 24.19 — see palette.ts's derived tokens) survived only by ranking 5th on
    // one row. The promise in this function's own header — "a reader can now
    // see that instead of having to infer it" — is only kept by splitting them.
    if (match.deltaE > STRAY_DELTA_E) {
      strayPixels += count
      strays.push(entry())
    } else if (match.deltaE > 0) {
      nearMisses.push(entry())
    }
  }

  const tokens: Record<string, number> = {}
  palette.forEach((t, i) => {
    tokens[t.name] = round2((perToken[i] / total) * 100)
  })

  const buckets = {} as Record<Bucket, BucketStat>
  const exactPct = {} as Record<Bucket, number>
  for (const bucket of BUCKET_ORDER) {
    let pixels = 0
    palette.forEach((t, i) => {
      if (t.bucket === bucket) pixels += perToken[i]
    })
    exactPct[bucket] = (pixels / total) * 100
    buckets[bucket] = { pixels, pct: round2(exactPct[bucket]) }
  }

  // Sorted by share, then by hex so an exact tie in count cannot flip between
  // runs — the same stability rule the classifier's tie-break follows.
  const bySize = (a: StrayColour, b: StrayColour) => (b.pct - a.pct) || (a.hex < b.hex ? -1 : 1)
  strays.sort(bySize)
  nearMisses.sort(bySize)
  const round = (s: StrayColour): StrayColour => ({
    hex: s.hex,
    pct: round2(s.pct),
    nearest: s.nearest,
    deltaE: round2(s.deltaE),
  })

  return {
    total,
    perToken,
    buckets,
    // Deviation from the EXACT percentages, then rounded once. Rounding the
    // four terms first and summing would accumulate up to 0.02pp of noise into
    // the headline number.
    deviation: round2(deviation(exactPct)),
    tokens,
    strays: {
      pctOverDeltaE12: round2((strayPixels / total) * 100),
      meanDeltaE: round2(deltaESum / total),
      top: strays.slice(0, 5).map(round),
      nearMisses: nearMisses.slice(0, 5).map(round),
    },
  }
}

// ── the windows ───────────────────────────────────────────────────────────

/**
 * Where the reader's screens sit in a document of `docHeight`.
 *
 * Tiled from the top, then ANCHORED TO THE BOTTOM. A document is almost never
 * a whole number of screens tall, and the two obvious ways to spend the
 * remainder are both wrong: dropping it hides the last screen of the page
 * (which on this app is the footer plate and the whole archive tail), and
 * counting a 100px sliver as a window lets a strip the eye never rests on
 * carry the same weight in the mean as a full screen. So the last window is
 * the screen a reader actually stops on when they hit the bottom — top =
 * docHeight - viewportHeight — and it may overlap its predecessor. Both are
 * real screens; overlapping them double-counts some pixels, which is correct
 * for a metric that asks what the eye holds rather than how many pixels exist.
 *
 * A document shorter than the viewport is one window, the document itself.
 */
export function windowTops(docHeight: number, viewportHeight: number): number[] {
  if (docHeight <= viewportHeight) return [0]
  const tops: number[] = []
  for (let top = 0; top + viewportHeight <= docHeight; top += viewportHeight) tops.push(top)
  const bottom = docHeight - viewportHeight
  if (tops[tops.length - 1] !== bottom) tops.push(bottom)
  return tops
}

/**
 * Count one horizontal slice into the four buckets, as exact percentages.
 *
 * A Map histogram rather than censusPixels' 24-bit array: this runs once per
 * window rather than once per row, and a 64MB zeroed allocation per window
 * would cost more than the classification it saves. The classifier is passed
 * IN so its memo survives across every window of a row — the same few thousand
 * distinct colours recur on every screen of the same page.
 */
function sliceBuckets(
  rgb: Uint8Array,
  offset: number,
  pixels: number,
  palette: Token[],
  classify: (r: number, g: number, b: number) => { index: number; deltaE: number },
): Record<Bucket, number> {
  const histogram = new Map<number, number>()
  const end = offset + pixels * 3
  for (let i = offset; i < end; i += 3) {
    const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2]
    histogram.set(key, (histogram.get(key) ?? 0) + 1)
  }
  const perBucket = { field: 0, bone: 0, graphite: 0, accent: 0 } as Record<Bucket, number>
  for (const [key, count] of histogram) {
    const match = classify((key >> 16) & 255, (key >> 8) & 255, key & 255)
    perBucket[palette[match.index].bucket] += count
  }
  const out = {} as Record<Bucket, number>
  for (const b of BUCKET_ORDER) out[b] = (perBucket[b] / pixels) * 100
  return out
}

/**
 * THE SECOND READING: §2 measured over the screens a reader sees.
 *
 * `documentBuckets` comes from the full-page count rather than being re-derived
 * from the windows, because the windows overlap and the document does not —
 * inkOnPaper and the accent cap are document properties and must not be
 * computed off a double-counted denominator.
 */
export function censusScrollingForm(
  rgb: Uint8Array,
  width: number,
  docHeight: number,
  viewportHeight: number,
  palette: Token[],
  documentBuckets: Record<Bucket, BucketStat>,
  /** Per-token document percentages, from the same count as documentBuckets.
   *  §2's accent rule is about HOW MANY accents are painting, not only how
   *  much accent there is, and the bucket total cannot express that. */
  tokens: Record<string, number>,
  /** The accents tokens.css binds to a role — see parseDeclaredAccents. */
  declaredAccents: string[],
): ScrollingFormRecord {
  const classify = makeClassifier(palette)
  const tops = windowTops(docHeight, viewportHeight)
  const height = Math.min(viewportHeight, docHeight)
  const pixels = width * height

  const windows: WindowStat[] = tops.map((top) => {
    const exact = sliceBuckets(rgb, top * width * 3, pixels, palette, classify)
    return {
      top,
      pct: Object.fromEntries(BUCKET_ORDER.map((b) => [b, round2(exact[b])])) as Record<Bucket, number>,
      deviation: round2(deviation(exact)),
    }
  })

  const mean = {} as Record<Bucket, number>
  const exactMean = {} as Record<Bucket, number>
  for (const b of BUCKET_ORDER) {
    exactMean[b] = windows.reduce((n, w) => n + w.pct[b], 0) / windows.length
    mean[b] = round2(exactMean[b])
  }

  const worst = windows.reduce((a, b) => (b.deviation > a.deviation ? b : a))
  const bonePixels = documentBuckets.bone.pixels
  const inkPixels = documentBuckets.graphite.pixels
  const paper = inkPixels + bonePixels

  return {
    viewportHeight,
    count: windows.length,
    mean,
    meanDeviation: round2(deviation(exactMean)),
    // Zero paper is a real answer, not a division to guard around: a page with
    // no Bone-family ground can carry no ink at all.
    inkOnPaper: paper === 0 ? 0 : round2((inkPixels / paper) * 100),
    worst: { top: worst.top, deviation: worst.deviation },
    breaches: scrollingFormBreaches(
      windows,
      mean,
      paper === 0 ? 0 : (inkPixels / paper) * 100,
      documentBuckets,
      tokens,
      declaredAccents,
    ),
    windows,
  }
}

/**
 * The share of the document below which an accent is not a colour anybody
 * sees. Nearest-token classification gives every accent a tail — the artifact
 * reads `signal` and `moss` at 0.06-0.14% on rows whose stylesheets reference
 * neither — so a floor is needed for the "is this painting" question whichever
 * side of it the answer comes from.
 */
export const ACCENT_PRESENCE_FLOOR = 0.25

/** The amended law, applied. One sentence per failure, naming the window. */
export function scrollingFormBreaches(
  windows: WindowStat[],
  mean: Record<Bucket, number>,
  inkOnPaper: number,
  documentBuckets: Record<Bucket, BucketStat>,
  tokens: Record<string, number>,
  /** The accents tokens.css binds to a role — see parseDeclaredAccents. */
  declaredAccents: string[],
): string[] {
  const law = SCROLLING_FORM
  const out: string[] = []
  for (const w of windows) {
    // The cap is reported INSTEAD of the band, not as well as it: a window over
    // 85% field is also over 80%, and two lines for one window would make a
    // long page look worse than a broken one.
    if (w.pct.field > law.cap.field) {
      out.push(`window @${w.top}: field ${w.pct.field.toFixed(2)} over the ${law.cap.field} cap`)
    } else if (w.pct.field > law.band.field[1]) {
      out.push(`window @${w.top}: field ${w.pct.field.toFixed(2)} over the ${law.band.field[1]} band`)
    } else if (w.pct.field < law.band.field[0]) {
      out.push(`window @${w.top}: field ${w.pct.field.toFixed(2)} under the ${law.band.field[0]} band`)
    }
    if (w.pct.bone > law.cap.bone) {
      out.push(`window @${w.top}: bone ${w.pct.bone.toFixed(2)} over the ${law.cap.bone} cap`)
    } else if (w.pct.bone > law.band.bone[1]) {
      out.push(`window @${w.top}: bone ${w.pct.bone.toFixed(2)} over the ${law.band.bone[1]} band`)
    } else if (w.pct.bone < law.band.bone[0]) {
      out.push(`window @${w.top}: bone ${w.pct.bone.toFixed(2)} under the ${law.band.bone[0]} band`)
    }
  }
  for (const b of ['field', 'bone'] as const) {
    const slack = law.meanTolerance[b]
    if (Math.abs(mean[b] - TARGETS[b]) > slack) {
      out.push(`mean ${b} ${mean[b].toFixed(2)} outside ${TARGETS[b]}±${slack}`)
    }
  }
  if (inkOnPaper < law.inkOnPaperMin) {
    out.push(`ink on paper ${inkOnPaper.toFixed(2)} under ${law.inkOnPaperMin}`)
  }
  if (documentBuckets.accent.pct > law.accentMax) {
    out.push(`accent ${documentBuckets.accent.pct.toFixed(2)} over the ${law.accentMax} document cap`)
  }
  // §2'S ACCENT RULE HAS TWO HALVES AND THIS INSTRUMENT USED TO CHECK ONE.
  // palette.ts states the other in prose — "the budget is 2% for ONE of them
  // per surface, not 2% each" — and §2's banned list ends with "more than one
  // accent per surface". A document carrying four accents at 0.4% each sums to
  // 1.6, breached nothing, and every app row was that shape. The per-token
  // percentages were already in the artifact; only the comparison was missing.
  //
  // COUNTED FROM THE TOKEN GRAPH, NOT FROM THE PERCENTAGES ALONE, and that is
  // the difference between a check that is true and one that happens to be.
  // Nearest-token classification gives every accent a tail: `signal` and `moss`
  // read 0.06-0.14% on rows whose stylesheets reference neither, so a naive
  // count reports four accents on a page that paints two. `declaredAccents` is
  // what tokens.css binds to a role; anything else above the floor is either
  // real drift or a classifier tail, and it is reported as its own line so the
  // two questions do not get one answer.
  const painting = (name: string) => (tokens[name] ?? 0) > ACCENT_PRESENCE_FLOOR
  const show = (name: string) => `${name} ${(tokens[name] ?? 0).toFixed(2)}`
  const declared = declaredAccents.filter(painting)
  if (declared.length > 1) {
    // §12 OUTRANKS §2 AND THAT IS WHY THIS IS A LINE AND NOT A VERDICT. The two
    // accents are Trust Rule 1 drawn in colour — --reward is the engagement
    // track, --data the financial-reality track, and they may never be the same
    // hue or a reward could be misread as a score. A future round must not
    // "fix" this line by collapsing them. What it IS good for: a third.
    out.push(
      `accents painting: ${declared.map(show).join(', ')} — §2 permits one per surface; ` +
        'the two tracks are Trust Rule 1 (tokens.css --reward/--data) and §12 outranks §2. ' +
        'A third is drift.',
    )
  }
  const undeclared = BUCKETS.accent.filter((n) => !declaredAccents.includes(n)).filter(painting)
  if (undeclared.length > 0) {
    out.push(
      `accent painting with no role bound to it: ${undeclared.map(show).join(', ')} — ` +
        'either a stylesheet reached past the token graph, or the classifier is absorbing ' +
        'something into it (see palette.ts on the derived tokens)',
    )
  }
  return out
}

// ── serialisation ─────────────────────────────────────────────────────────

/**
 * Numbers that must render with exactly two decimals.
 *
 * JSON has no notion of significant digits, so `69.6` and `69.60` are the same
 * value and JSON.stringify always prints the shorter one. A diff where a
 * percentage silently changes width is a diff that is harder to scan, so
 * percentage-shaped values are emitted through a marker string that is
 * unquoted on the way out. Pixel counts stay integers — they are the ground
 * truth, and a float-formatted count would be a lie about precision.
 */
const FIXED = new Set([
  'pct',
  'deviation',
  'pctOverDeltaE12',
  'meanDeltaE',
  'deltaE',
  'meanDeviation',
  'inkOnPaper',
])
/** Objects whose every numeric VALUE is a percentage, whatever its key is —
    `tokens` is keyed by token NAME, and a window's `pct`/`mean` are keyed by
    BUCKET name, so the key-name rule above cannot reach either. Listing `pct`
    in both sets is not a contradiction: the rule above fires when the value is
    a number (the document buckets) and this one when it is an object (a
    window's four-bucket vector). */
const FIXED_MAPS = new Set(['tokens', 'pct', 'mean'])
const MARK = '\u0000fixed:'

function markFixed(value: unknown, key: string, forced = false): unknown {
  if (typeof value === 'number' && (forced || FIXED.has(key))) {
    return `${MARK}${value.toFixed(2)}`
  }
  if (Array.isArray(value)) return value.map((v) => markFixed(v, key, forced))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    // Object key order is the artifact's key order. It is NOT sorted globally:
    // the top-level blocks read in a deliberate order (what tree, what
    // environment, what rules, then the numbers). Only `rows` is sorted, by
    // run.ts, because that is the block a diff scans.
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // palette.tokens holds hex STRINGS and rows[].tokens holds percentages.
      // The number test above ignores the flag for strings, so one rule covers
      // both without naming either site.
      out[k] = markFixed(v, k, forced || FIXED_MAPS.has(k))
    }
    return out
  }
  return value
}

/** Byte-stable: same input, same bytes, 2-space indent, trailing newline. */
export function serialiseCensus(census: Census): string {
  const json = JSON.stringify(markFixed(census, '', false), null, 2)
  // Unquote the marked numbers. The marker starts with NUL, which JSON.stringify
  // escapes as \u0000 and which cannot occur in any real value here.
  return json.replace(/"\\u0000fixed:(-?\d+\.\d+)"/g, '$1') + '\n'
}

// ── git ───────────────────────────────────────────────────────────────────

/**
 * `git status --porcelain` is empty exactly when the tree is clean. Untracked
 * files count as dirty on purpose: an untracked stylesheet or component is
 * still something the browser could have loaded, so a measurement taken beside
 * one does not describe the committed tree either.
 *
 * NULL IS DIRTY, and that asymmetry is deliberate. `null` means git did not
 * answer — absent, broken, or not a repo — and an unanswered question about
 * whether the tree was modified may not resolve to "it wasn't". This whole
 * round exists because provenance claims were trusted that nothing checked;
 * failing toward the reassuring answer is how that happens.
 */
export function isDirty(porcelain: string | null): boolean {
  if (porcelain === null) return true
  return porcelain.trim() !== ''
}

/**
 * The first probe that disagrees with the first row's, or null.
 *
 * WHY IT EXISTS. env.fonts and env.fingerprint are written once and presented
 * as the environment for every row, and formatDiff refuses cross-environment
 * subtraction on the strength of that single value. They used to be whatever
 * the LAST row measured, with nothing checking that the other eleven agreed —
 * so a row that resolved a different type stack, the exact thing run.ts's
 * FONT_PROBE header says cannot be assumed away, was invisible.
 *
 * Compared as serialised JSON: the probe's key order is fixed by FONT_PROBE,
 * and a families/widths pair is only meaningful as a whole.
 */
export function disagreeingProbe<T extends { id: string }>(probes: T[]): T | null {
  if (probes.length === 0) return null
  const key = ({ id: _id, ...rest }: T) => JSON.stringify(rest)
  const first = key(probes[0])
  return probes.find((p) => key(p) !== first) ?? null
}

/**
 * Added, removed and edited paths between two pixel-input snapshots, sorted.
 *
 * The naming half of the guard around a run: inputsHash answers "did anything
 * move", this answers "what". run.ts takes one snapshot before the build and
 * one after the last row, because the hash used to be computed only at the end
 * — so an edit made WHILE the census ran recorded the new hash beside the old
 * numbers, and the staleness test then called them current. That is round 3's
 * defect reproduced inside the instrument built to prevent it.
 */
export function movedInputs(before: Map<string, string>, after: Map<string, string>): string[] {
  const moved = new Set<string>()
  for (const [path, hash] of before) {
    if (!after.has(path)) moved.add(`${path} (removed)`)
    else if (after.get(path) !== hash) moved.add(`${path} (edited)`)
  }
  for (const path of after.keys()) if (!before.has(path)) moved.add(`${path} (added)`)
  return [...moved].sort()
}

/** The paths `git status --porcelain` named, so a dirty stamp says WHAT was
    uncommitted instead of only asserting that something was. Null (git did not
    answer) is one unnameable entry rather than an empty list, which would read
    as a clean tree. */
export function dirtyPaths(porcelain: string | null): string[] {
  if (porcelain === null) return ['<git did not answer>']
  return porcelain
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => line.slice(line.indexOf(' ') + 1).trim())
    .sort()
}

// ── diff ──────────────────────────────────────────────────────────────────

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`

/**
 * The mechanical sentence: what moved, by how much, per row.
 *
 * A WRONG DIFF IS WORSE THAN NO DIFF — that is round 3's lesson generalised.
 * When the environment fingerprints differ, the two artifacts were produced by
 * different font stacks and their numbers are not comparable; the header says
 * so and every delta is suppressed rather than printed misleadingly.
 */
export function formatDiff(committed: Census | null, measured: Census): string[] {
  const out: string[] = []
  if (committed === null) {
    out.push(`no committed ${ARTIFACT_PATH} — every row is new`)
    for (const id of Object.keys(measured.rows)) out.push(`${pad(id, 30)} NEW ROW`)
    return out
  }
  if (committed.env.fingerprint !== measured.env.fingerprint) {
    out.push('ENVIRONMENT DIFFERS — rows are not comparable')
    out.push(`  committed ${committed.env.fingerprint}  ${JSON.stringify(committed.env.fonts)}`)
    out.push(`  measured  ${measured.env.fingerprint}  ${JSON.stringify(measured.env.fonts)}`)
    return out
  }

  const ids = [...new Set([...Object.keys(committed.rows), ...Object.keys(measured.rows)])].sort()
  for (const id of ids) {
    const was = committed.rows[id]
    const now = measured.rows[id]
    if (!was) {
      out.push(`${pad(id, 30)} NEW ROW`)
      continue
    }
    if (!now) {
      out.push(`${pad(id, 30)} REMOVED (was deviation ${was.deviation.toFixed(2)})`)
      continue
    }
    const dev = `dev ${was.deviation.toFixed(2)} -> ${now.deviation.toFixed(2)} (${signed(now.deviation - was.deviation)})`
    for (const bucket of BUCKET_ORDER) {
      const a = was.buckets[bucket].pct
      const b = now.buckets[bucket].pct
      if (Math.abs(b - a) < 0.005) continue
      out.push(
        `${pad(id, 30)} ${pad(bucket, 9)} ${a.toFixed(2)} -> ${b.toFixed(2)}  (${signed(b - a)})   ${dev}`,
      )
    }
    // The second reading gets its own line, ALWAYS when it moves and even when
    // no bucket did: a change that only relocates colour between screens leaves
    // the document average identical, and that is precisely the class of change
    // rounds 1-4 were blind to.
    const wasForm = was.scrollingForm
    const nowForm = now.scrollingForm
    if (wasForm && nowForm) {
      const moved = Math.abs(nowForm.meanDeviation - wasForm.meanDeviation) >= 0.005
      const breached = nowForm.breaches.length !== wasForm.breaches.length
      if (moved || breached) {
        out.push(
          `${pad(id, 30)} ${pad('windows', 9)} mean-dev ${wasForm.meanDeviation.toFixed(2)} -> ` +
            `${nowForm.meanDeviation.toFixed(2)}  (${signed(nowForm.meanDeviation - wasForm.meanDeviation)})   ` +
            `breaches ${wasForm.breaches.length} -> ${nowForm.breaches.length}`,
        )
      }
    }
  }
  if (out.length === 0) out.push('no change')
  return out
}

/**
 * --check: the optional CI gate. Returns the rows whose buckets moved further
 * than the tolerance.
 *
 * It is NOT the default run and it is NOT a ratio-law threshold. The law is a
 * TARGET, not a direction — this round exists because two screens overshot 60%
 * field — so a gate like "field must not decrease" would block the correct
 * fix. This only asks "did anything move more than you expected", which is a
 * question about surprise, not about compliance.
 */
export function checkTolerance(
  committed: Census,
  measured: Census,
  tolerance: number,
): string[] {
  const out: string[] = []
  for (const [id, now] of Object.entries(measured.rows)) {
    const was = committed.rows[id]
    if (!was) {
      out.push(`${id}: new row, nothing to compare`)
      continue
    }
    for (const bucket of BUCKET_ORDER) {
      const delta = now.buckets[bucket].pct - was.buckets[bucket].pct
      if (Math.abs(delta) > tolerance) {
        out.push(`${id}: ${bucket} moved ${signed(delta)}pp (tolerance ${tolerance.toFixed(2)})`)
      }
    }
  }
  return out
}

/** The prose the artifact carries about its own denominator. */
export const LAW_NOTE =
  'Percentages are of FULL-PAGE pixels, so the denominator is the document, not ' +
  'the viewport: adding a tall card dilutes every percentage without any colour ' +
  'changing. Read pixels.total and dimensions before reading a shift as a palette ' +
  'change. Targets are targets, not directions — a screen may overshoot them.'

/**
 * THE RESOLUTION OF THE §8 ACCEPTANCE CHECK, recorded where the next round
 * will read it instead of re-deriving it.
 *
 * Rounds 1-4 used an ad-hoc method whose bucket mapping was never written
 * down. The check was: does this tool reproduce round 4's re-shot vectors? It
 * does on the light phone and it does not on the dark one, and the per-token
 * numbers in the artifact say why. It ships inside the artifact so the
 * argument travels with the numbers.
 *
 * IT IS FROZEN HISTORY AND IT SAYS SO, which it did not before. This is a
 * hard-coded paragraph stamped into every generated census.json, and it stated
 * its four figures in the PRESENT TENSE — "this tool's app.375x812.light.seeded
 * READS 51.2/40.9/4.8/3.1" — while the rows block of the very same file said
 * 41.63/47.86/6.41/4.10. The artifact disagreed with the tree it certifies,
 * which is the exact failure this tool was built to end, and because artifact.ts
 * is deliberately outside CENSUS_INPUTS the staleness hash can never turn red
 * over it: the numbers would have been re-emitted verbatim forever. So the
 * tense is fixed and the tree is named. THE ACCEPTANCE CHECK IS A HISTORICAL
 * EVENT — it happened once, against a tree that no longer exists — and the
 * comparison it made is not re-run on every census. What the rows say is in
 * the rows.
 */
export const BUCKET_NOTE =
  'HISTORICAL, AND STAMPED: every figure in this note was measured on the CLEAN TREE OF ' +
  'COMMIT a2d4e6d (round 5\'s acceptance check, 2026-08-04), before the collection card was ' +
  'deleted. It is the record of one comparison, not a description of the rows below — for ' +
  'those, read the rows. THE MAPPING: Sand and Fog sit in BONE, and Void sits in GRAPHITE. ' +
  "Checked against round 4's re-shot vectors: at that tree this tool's " +
  'app.375x812.light.seeded read 51.2/40.9/4.8/3.1 against round 4\'s 52.9/40.6/4.1/2.4 — ' +
  'inside 2pp on every bucket, so the mapping reproduced the historical method where the two ' +
  'could be compared. The dark phone did NOT reproduce (this tool 51.4/32.8/12.5/3.2 against ' +
  "round 4's 85.4/8.9/3.3/2.3) and the per-token block named the cause: between light and " +
  'dark the same page moved sand 3.70 -> 28.62 and bone 37.20 -> 4.23, because tokens.css ' +
  'gives the spec-sheet cards a Sand ground in dark. Counting that Sand as field would have ' +
  "put this tool's dark phone near 80/4, which brackets round 4's 85.4/8.9 — so rounds 1-4 " +
  'were not putting Sand in Bone. This design does, on §2\'s own words ("sand: aged paper, ' +
  'spec sheets") and §1 trait 07 (bone, not white): Sand is the paper family, which is the ' +
  "counter's 30% budget, not the field's 60%. CONSEQUENCE: round 4's dark-phone figure " +
  'overstated Flare+Espresso by roughly the 28pp of Sand on that screen. The dark phone was ' +
  'not the worst screen in the matrix; on this mapping it was one of the best.'

/**
 * WHY THE ARTIFACT CARRIES TWO READINGS OF ONE LAW.
 *
 * Recorded here rather than only in DESIGN-SYSTEM.md because the numbers and
 * the rule they are judged against have to travel together — the whole defect
 * this tool exists to fix is a figure that outlived the tree it described.
 */
export const SCROLLING_FORM_NOTE =
  'DESIGN-SYSTEM.md §2 is a COMPOSITION law and it is unchanged for every surface the eye ' +
  'holds at once: the poster, the mark, the hero band, each landing section, the OG image. ' +
  'This block is the same law read over a SCROLLING DOCUMENT, which is not one composition ' +
  'but a sequence of them. THE FINDING THAT PRODUCED IT IS HISTORICAL AND IS STAMPED AS SUCH: ' +
  'on the CLEAN TREE OF COMMIT a2d4e6d (round 5, 2026-08-04), MEASURED BY THE PRE-TOOL AD-HOC ' +
  'METHOD rather than by this tool — the two disagree by roughly 5 percentage points on ' +
  'identical pixels, so a tree stamp alone does not make two figures comparable; the ' +
  'instrument has to be named too. Before the collection card was ' +
  "deleted, the app's 375 light document read 56.0/36.9/4.5/2.6 — deviation 15.0, apparently " +
  'the best app screen in the matrix — while its eight viewport windows read 41.6, 15.6, 44.9, ' +
  '18.4, 65.7, 91.1, 86.6 and 83.9 percent field: a Bone form stack at the head and a dark ' +
  'index sheet at the tail, averaging to a vector that appeared on no screen, with a ' +
  'mean-of-screens deviation of 52.8. THAT DOCUMENT IS NOT THIS ONE — the card was deleted and ' +
  'the page is shorter now; for what this tree measures, read rows["app.375x812.light.seeded"] ' +
  'below rather than this sentence. `deviation` per row is the document reading and stays ' +
  'comparable with rounds 1-4; `scrollingForm` per row is the window reading. WHEN THEY ' +
  'DISAGREE, THE WINDOWS ARE THE TRUTH — they are what a reader is looking at. The document ' +
  'average moves when a card gets taller; only the windows move when a page gets better ' +
  'arranged, which is why the remaining work is INTERLEAVING rather than more or less Flare.'

export const LAW_TARGETS = TARGETS
