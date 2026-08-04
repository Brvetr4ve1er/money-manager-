/**
 * THE CLASSIFIER: tokens.css -> 12 hexes -> four ratio-law buckets.
 *
 * The palette is PARSED, never restated. src/styles/design.test.ts already
 * pulls the raw palette out of tokens.css with this exact regex, for the same
 * reason: a second copy of twelve hexes is a second thing to keep in sync, and
 * the copy is always the one that rots. Add a colour to tokens.css and the
 * census sees it immediately — census.test.ts then fails until it is bucketed,
 * which is deliberate. An unbucketed token would otherwise be silently
 * absorbed into whichever bucket owned its nearest neighbour.
 *
 * BUCKETS ARE THE RATIO LAW (DESIGN-SYSTEM.md §2, "60/30/8/2"). The mapping is
 * a judgement, so it is stated once here, written verbatim into
 * docs/brand/census.json's `law.buckets`, and asserted in the test file — three
 * copies that a test keeps identical, rather than one copy in an agent's head.
 * The judgements, in full, so a future round can dispute them from evidence:
 *
 *   field    flare, espresso     §2's own sentence is "60% Flare or Espresso".
 *   bone     bone, sand, fog     the paper family. §1 trait 07 is "bone, not
 *                                white": sand is aged paper and fog is the UI
 *                                surface, and neither has a budget of its own,
 *                                so they belong to the counter's 30%.
 *   graphite graphite, void      the form. Void is ink at max contrast, and §2
 *                                caps it under 5% — a sub-cap the bucket total
 *                                cannot express, which is why the artifact
 *                                also records per-token percentages.
 *   accent   acid, marigold,     §2's accent row, entire. The budget is 2% for
 *            cobalt, signal,     ONE of them per surface, not 2% each.
 *            moss
 *
 * Nearest-token classification is in CIELAB with ΔE76 — a perceptual space,
 * because the question "what colour is this app" is perceptual. Ties break by
 * declaration order in tokens.css, so two runs of one tree can never disagree.
 *
 * THE DERIVED TOKENS ARE PARSED TOO, AND THAT IS A CORRECTION, NOT AN EXTRA.
 * tokens.css's quiet register (--spec, --spec-sunken) is a color-mix of two
 * raw tokens, so its resolved value is in NO palette — and a classifier that
 * knows only the twelve raw hexes has to force it into whichever of them is
 * nearest. It chose badly, and the committed artifact showed it: light --spec
 * #676562 landed on `moss` at ΔE 24.2 (beating graphite by 0.7) and dark --spec
 * #b8aaa4 on `sand` at ΔE 17.8. Body text was therefore being charged to the
 * 2% ACCENT budget in light and to the 30% Bone budget in dark — the same
 * semantic role booked against two different budgets, which made the two
 * themes' `accent` and `inkOnPaper` figures non-comparable. `moss` read
 * 0.27-0.99% on all twelve committed rows although no stylesheet has ever
 * referenced var(--moss).
 *
 * So the mixes are resolved here (sRGB, the same arithmetic
 * src/styles/design.test.ts already uses to recompute every contrast figure in
 * tokens.css) and bucketed EXPLICITLY by role: the quiet register is ink, so
 * it is the form, so it is graphite. Same drift guard as the raw tokens — a
 * derived name this file does not bucket throws rather than being absorbed.
 */

import { readFileSync } from 'node:fs'

export const TOKENS_URL = new URL('../../src/styles/tokens.css', import.meta.url)

export type Bucket = 'field' | 'bone' | 'graphite' | 'accent'

/** Fixed order: it is the order every table, diff line and JSON key uses. */
export const BUCKET_ORDER: Bucket[] = ['field', 'bone', 'graphite', 'accent']

export const BUCKETS: Record<Bucket, string[]> = {
  field: ['flare', 'espresso'],
  bone: ['bone', 'sand', 'fog'],
  graphite: ['graphite', 'void'],
  accent: ['acid', 'marigold', 'cobalt', 'signal', 'moss'],
}

/**
 * The derived tokens tokens.css builds with color-mix, and the bucket each
 * belongs in BY ROLE rather than by nearest neighbour.
 *
 * Both are the quiet register — spec labels, notes, disclosures, input
 * placeholders. That is ink drawn on paper, i.e. §1 trait 06's FORM, i.e. §2's
 * 8% graphite budget. Nothing here is a field and nothing here is an accent.
 * A color-mix token tokens.css declares and this map does not name throws in
 * parseDerived: silent absorption is the failure this whole file exists to
 * prevent.
 */
export const DERIVED_BUCKETS: Record<string, Bucket> = {
  spec: 'graphite',
  'spec-sunken': 'graphite',
}

/** §2's 60/30/8/2, as percentages of full-page pixels. */
export const TARGETS: Record<Bucket, number> = { field: 60, bone: 30, graphite: 8, accent: 2 }

/**
 * THE RATIO LAW, SCROLLING FORM — §2's 60/30/8/2 restated for a document
 * nobody ever sees all at once.
 *
 * WHY IT EXISTS. §2 is a COMPOSITION law: a poster, a mark, a hero band and an
 * OG image are all held by the eye at once, so the whole-surface average IS
 * what a viewer perceives. An application document is not. Round 5 re-censused
 * the app in viewport-height windows and found the document average is the
 * arithmetic mean of two disjoint regimes that never appear together — on the
 * 375 phone, a Bone form stack at the head reading 15-18% field and a dark
 * index sheet at the tail reading 84-91%, averaging to a document 56/37 that
 * appears on no screen. Its mean-of-screens deviation was 52.8 against a
 * document deviation of 15.0. Four rounds of document-average censusing could
 * not have seen that, and one round of it was spent pushing an already-correct
 * mean further off.
 *
 * SO BOTH ARE MEASURED AND BOTH ARE RECORDED. The document figures are
 * unchanged and still comparable with rounds 1-4; these bounds are the second
 * reading, over the windows.
 *
 *   band     Every window has to be a legible composition on its own. Below
 *            35% field the page has stopped being a Flare product; above 80%
 *            it has stopped having anything on it.
 *   cap      The hard failure. A window past these is the inversion round 2
 *            fixed in the app and round 5 found still live on the landing.
 *   mean     §2's targets, over the windows rather than the pixels. The
 *            tolerance is wide on purpose: a mean is the one number here that
 *            a single tall card can move without any colour changing.
 *   ink      NOT an independent budget, and this is the round-5 finding that
 *            the old §2 reading could not express. Graphite is 1.16:1 on
 *            Espresso, so every Ink pixel must stand on a Bone-family ground,
 *            and every Bone-family ground is a pixel not in the field bucket:
 *            ink and field trade one for one. An 8%-of-document Ink budget and
 *            a 60%-of-document field budget are not simultaneously satisfiable.
 *            Measured over the paper instead — graphite / (graphite + bone) —
 *            the question becomes answerable: how inked is the part of the page
 *            that CAN carry ink.
 *   accent   Unchanged, and still of the document: scarcity is a property of
 *            the whole run, not of one screen (§2, "a 4th color is an event").
 */
export interface ScrollingFormLaw {
  band: { field: [number, number]; bone: [number, number] }
  cap: { field: number; bone: number }
  meanTolerance: { field: number; bone: number }
  inkOnPaperMin: number
  accentMax: number
}

export const SCROLLING_FORM: ScrollingFormLaw = {
  band: { field: [35, 80], bone: [15, 55] },
  cap: { field: 85, bone: 65 },
  meanTolerance: { field: 8, bone: 6 },
  inkOnPaperMin: 6,
  accentMax: 2,
}

/**
 * Above this ΔE a pixel is not really any token — an antialiased glyph edge,
 * the 6% offset grain (§8), or a derived colour like --spec. Such pixels still
 * count in their nearest bucket (dropping them would change the denominator
 * and break comparability with rounds 1-4), but their share is reported so a
 * reader can see how much of a row's number is genuinely palette.
 */
export const STRAY_DELTA_E = 12

export interface Token {
  name: string
  hex: string
  /** 0-based position in tokens.css. The tie-break. */
  order: number
  bucket: Bucket
}

/** Comments name hexes constantly, so they go before any value is scanned —
    the same guard src/styles/design.test.ts applies for the same reason. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

export function bucketOf(name: string): Bucket | null {
  for (const b of BUCKET_ORDER) {
    if (BUCKETS[b].includes(name)) return b
  }
  return null
}

/**
 * The 12 raw palette tokens, in declaration order.
 *
 * A token is a `--name: #rrggbb;` at the top of tokens.css; every semantic
 * token is a `var()` reference and matches nothing.
 *
 * THE PATTERN IS DELIBERATELY WIDER THAN THE TWELVE NAMES IT EXPECTS TO FIND.
 * It used to be /--([a-z]+):\s*(#[0-9a-f]{6});/, which is case- and
 * hyphen-intolerant — so a thirteenth token written `--deep-moss: #3A5A2A;`
 * inside the raw block was INVISIBLE to the classifier and its pixels were
 * absorbed into whichever bucket owned the nearest neighbour. That is the exact
 * silent-absorption failure this file's header says cannot happen, and the
 * `unbucketed token` throw below is the guard that was being defeated. The hex
 * is lower-cased on the way in so the artifact's palette block stays
 * byte-stable however tokens.css spells it.
 */
export function parsePalette(css: string): Token[] {
  const seen = new Set<string>()
  const out: Token[] = []
  for (const m of stripComments(css).matchAll(/--([a-z][a-z0-9-]*):\s*(#[0-9a-fA-F]{6});/g)) {
    const name = m[1]
    if (seen.has(name)) continue
    seen.add(name)
    const bucket = bucketOf(name)
    if (bucket === null) {
      throw new Error(
        `census: tokens.css declares --${name} but scripts/census/palette.ts does not bucket it. ` +
          'Add it to BUCKETS (and to law.buckets in the artifact) before measuring.',
      )
    }
    out.push({ name, hex: m[2].toLowerCase(), order: out.length, bucket })
  }
  return out
}

/**
 * The accents tokens.css actually BINDS TO A ROLE, in declaration order.
 *
 * WHY THE CENSUS NEEDS THIS AND A PERCENTAGE WILL NOT DO. Nearest-token
 * classification gives every accent a tail: the committed artifact reads
 * `signal` at 0.07-0.14% and `moss` at 0.06-0.07% on every row, and no
 * stylesheet in this repo references var(--signal), var(--moss) or
 * var(--cobalt) at all. Those pixels are antialiasing between Flare and its
 * neighbours, not design decisions. Counting them as "accents painting" would
 * be the census making a false statement about the product, which is the whole
 * class of defect it exists to end — so the question "how many accents is this
 * page spending" is answered from the token graph, and the per-token
 * percentages only say how much of each.
 *
 * A raw token bound to itself is not a role: only `--name: var(--accent)` where
 * `--name` is not one of the twelve counts.
 */
export function parseDeclaredAccents(css: string, raw: Token[]): string[] {
  const rawNames = new Set(raw.map((t) => t.name))
  const accents = new Set(BUCKETS.accent)
  const out: string[] = []
  for (const m of stripComments(css).matchAll(ALIAS_RE)) {
    if (rawNames.has(m[1])) continue
    if (!accents.has(m[2])) continue
    if (!out.includes(m[2])) out.push(m[2])
  }
  return out
}

/** CSS `color-mix(in srgb, A p%, B)` — a plain per-channel mix of the
    gamma-encoded values, which is what `in srgb` means. Same arithmetic as
    src/styles/design.test.ts's `mix()`, which recomputes every contrast figure
    tokens.css quotes; agreeing with it is the point. */
export function mixSrgb(aHex: string, bHex: string, weightA: number): string {
  const a = hexToRgb(aHex)
  const b = hexToRgb(bHex)
  return `#${a
    .map((v, i) => Math.round(v * weightA + b[i] * (1 - weightA)).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Innermost `selector { body }` blocks. Nested at-rules fall out for free:
    the selector group cannot contain a brace, so a match starts after the
    `@media (...) {` that encloses it. Same shape design.test.ts scans with. */
const BLOCK_RE = /([^{}]+)\{([^{}]*)\}/g
const ALIAS_RE = /--([a-z][a-z0-9-]*):\s*var\(--([a-z][a-z0-9-]*)\)\s*;/g
const MIX_RE =
  /--([a-z][a-z0-9-]*):\s*color-mix\(\s*in srgb,\s*var\(--([a-z][a-z0-9-]*)\)\s*(\d+(?:\.\d+)?)%,\s*var\(--([a-z][a-z0-9-]*)\)\s*\)\s*;/g

interface MixTemplate {
  from: string
  to: string
  weight: number
}

/**
 * Every value tokens.css's color-mix tokens can actually resolve to.
 *
 * The cascade is modelled, not guessed at, because a mix re-resolves under
 * every surface that re-declares its endpoints. A SURFACE ENVIRONMENT is a
 * block that declares `--ink` — there are exactly four in tokens.css (`:root`,
 * the dark `:root`, `.spec-sheet`, and the archive counter sheet) and each one
 * names its own `--ground` beside it. A block's template for `--spec` is its
 * own if it re-declares it (the two sheets deepen the mix) and the `:root`
 * template otherwise — which is how the DARK `--spec` exists at all: the dark
 * block re-declares --ink and --ground and inherits the mix written at :root.
 *
 * Anything unresolvable throws. A quiet colour the census cannot name is a
 * colour it would silently charge to the wrong budget, which is the defect.
 */
export function parseDerived(css: string, raw: Token[]): Token[] {
  const hexOf = new Map(raw.map((t) => [t.name, t.hex]))
  const stripped = stripComments(css)

  const aliases: Array<Map<string, string>> = []
  const mixes: Array<Map<string, MixTemplate>> = []
  const surfaces: number[] = []
  for (const block of stripped.matchAll(BLOCK_RE)) {
    const body = block[2]
    const alias = new Map<string, string>()
    for (const a of body.matchAll(ALIAS_RE)) alias.set(a[1], a[2])
    const mix = new Map<string, MixTemplate>()
    for (const m of body.matchAll(MIX_RE)) {
      mix.set(m[1], { from: m[2], to: m[4], weight: Number(m[3]) / 100 })
    }
    if (alias.has('ink')) surfaces.push(aliases.length)
    aliases.push(alias)
    mixes.push(mix)
  }
  // `:root` is the first block that declares --ink, and it holds the templates
  // every other surface inherits unless it overrides them.
  const rootIndex = surfaces[0]
  if (rootIndex === undefined) {
    throw new Error('census: tokens.css declares no --ink, so no surface environment can be read')
  }

  const out: Token[] = []
  const seen = new Set<string>()
  for (const index of surfaces) {
    for (const name of Object.keys(DERIVED_BUCKETS)) {
      const template = mixes[index].get(name) ?? mixes[rootIndex].get(name)
      if (template === undefined) continue
      const resolve = (role: string): string | undefined => {
        const rawName = aliases[index].get(role) ?? aliases[rootIndex].get(role)
        return rawName === undefined ? undefined : hexOf.get(rawName)
      }
      const from = resolve(template.from)
      const to = resolve(template.to)
      if (from === undefined || to === undefined) {
        throw new Error(
          `census: --${name} mixes var(--${template.from}) with var(--${template.to}), and ` +
            'scripts/census/palette.ts cannot resolve one of them to a raw palette hex on the ' +
            `surface declared at block ${index}. Resolve it before measuring.`,
        )
      }
      const bucket = DERIVED_BUCKETS[name]
      const hex = mixSrgb(from, to, template.weight)
      // Keyed by name AND value: one role has as many values as it has
      // surfaces, and two of them landing in one artifact key would hide a
      // whole theme's worth of pixels behind the other's percentage.
      const id = `${name}:${hex.slice(1)}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ name: id, hex, order: 0, bucket })
    }
  }
  return out
}

/**
 * The classifier's full token list: the twelve raw hexes, then the derived
 * quiet-register values in the order the surfaces declaring them appear.
 *
 * `order` is the array index in both halves, because that index is what
 * makeClassifier walks and therefore what the tie-break actually is.
 */
export function readPalette(): Token[] {
  const css = readFileSync(TOKENS_URL, 'utf8')
  const raw = parsePalette(css)
  return [...raw, ...parseDerived(css, raw)].map((t, i) => ({ ...t, order: i }))
}

export function readDeclaredAccents(): string[] {
  const css = readFileSync(TOKENS_URL, 'utf8')
  return parseDeclaredAccents(css, parsePalette(css))
}

// ── sRGB -> CIELAB (D65) ──────────────────────────────────────────────────
// Pure functions, ~30 lines, no dependency. D65 white point because sRGB is
// defined against it; using D50 here would rotate every hue slightly and make
// the numbers incomparable with any other tool a future round reaches for.

const XN = 95.047
const YN = 100
const ZN = 108.883

function linear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function f(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = linear(r)
  const G = linear(g)
  const B = linear(b)
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) * 100
  const y = (0.2126729 * R + 0.7151522 * G + 0.072175 * B) * 100
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) * 100
  const fx = f(x / XN)
  const fy = f(y / YN)
  const fz = f(z / ZN)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

export function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return rgbToLab(r, g, b)
}

export interface Match {
  /** Index into the palette array this classifier was built from. */
  index: number
  deltaE: number
}

/**
 * Nearest-token classifier, memoised on the packed 24-bit colour.
 *
 * The cache is the reason this is affordable: a 1440x3200 screenshot is 4.6M
 * pixels but only tens of thousands of DISTINCT colours, so the Lab conversion
 * and twelve distance computations run once per distinct colour, not once per
 * pixel.
 *
 * Strict `<` walking in declaration order is the tie-break: the first token
 * declared wins an exact tie, forever, on every machine.
 */
export function makeClassifier(palette: Token[]): (r: number, g: number, b: number) => Match {
  const labs = palette.map((t) => hexToLab(t.hex))
  const cache = new Map<number, Match>()
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const [L, A, B] = rgbToLab(r, g, b)
    let index = 0
    let best = Infinity
    for (let i = 0; i < labs.length; i++) {
      const d = (L - labs[i][0]) ** 2 + (A - labs[i][1]) ** 2 + (B - labs[i][2]) ** 2
      if (d < best) {
        best = d
        index = i
      }
    }
    const match: Match = { index, deltaE: Math.sqrt(best) }
    cache.set(key, match)
    return match
  }
}

/**
 * THE METRIC. Sum of absolute differences from the four targets, in percentage
 * points.
 *
 * This is not a new metric — census.test.ts pins it to the three figures
 * rounds 1-4 published (22.0, 19.3, 51.5), so a refactor cannot redefine it
 * while looking like it reproduced history.
 */
export function deviation(pct: Record<Bucket, number>): number {
  let sum = 0
  for (const b of BUCKET_ORDER) sum += Math.abs(pct[b] - TARGETS[b])
  return sum
}
