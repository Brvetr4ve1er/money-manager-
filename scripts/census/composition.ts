/**
 * THE THIRD READING: §2 over the compositions the page actually authored.
 *
 * WHY IT EXISTS. `censusScrollingForm` tiles a document into viewport-height
 * windows starting at offset 0. That phase is arbitrary — a reader scrolls
 * continuously, so every offset is a screen somebody holds — and on a document
 * whose sections are authored compositions it measures a thing nobody designed.
 * Measured on the tree of 9a42bd8 with a sliding window instead of the grid,
 * `landing.375x812.light`'s worst window ran anywhere from deviation 30.48 to
 * 67.58 depending only on where the tiling started; the committed 45.85 was one
 * sample of a statistic with a 37-point range, and the true worst (67.58 @1992,
 * 27.84% field / 63.79% Bone) breached the band in a place the phase-0 grid
 * could not see.
 *
 * An application document has no authored composition boundaries, which is why
 * §2.1b substitutes a window for one. A marketing page HAS them: they are in
 * the DOM, they are opaque full-bleed grounds, and the reader's eye stops at
 * them. So this file finds them MECHANICALLY — one walk of the render tree, no
 * selector list, no per-page knowledge, nothing to keep in sync with a
 * stylesheet — and reads §2 over each one.
 *
 * IT IS THE HARSHER READING, NOT THE KINDER ONE, and that is the argument for
 * it. On the tree this was built against it ADDS breaches and removes none: the
 * landing's `.lp-shear` at 1440 is 627px against a 900px viewport — a
 * composition the eye holds entire — and it read 30.40% field / 66.45% Bone,
 * under §2.1b's 35 floor and over its 65 Bone HARD CAP, while the row it lives
 * in recorded `breaches: []`. No window isolates that section, so the window
 * reading structurally could not see it.
 *
 * TWO CHECKS FALL OUT OF ONE WALK, and separating them is the whole design:
 *
 *   SECTIONS   — §2's composition law, applied literally, and enforced ONLY
 *                where the section is no taller than the viewport, because that
 *                is the precondition §2 states for itself ("anything the eye
 *                holds at once"). A section taller than a viewport is a
 *                SEQUENCE, and the windows already own it.
 *   GROUND RUNS — §2.1b's own "no single ground may run longer than one
 *                viewport", which is written in the design system and was
 *                checked nowhere. Applied to grounds NESTED inside a section,
 *                not to the sections themselves: a section boundary is authored,
 *                so a reader scrolling out of a long section arrives somewhere
 *                the designer chose. A nested ground longer than a viewport is
 *                a run with no authored exit, and it is exactly what §2.1b's
 *                derivation is about. It fired on `.lp-shot-frame` (a 1007px
 *                full-bleed Bone mat on an 812px phone) at 9a42bd8.
 *
 * ACCENT STAYS DOCUMENT-SCOPED and is deliberately not re-checked here. §2.1b
 * already draws that line ("scarcity is a document property"), and it has to
 * hold: §5C names "THE PLATE — horizontal lockup on marigold/cobalt" as a
 * signature layout, so in that composition Marigold is a FIELD, not an accent,
 * and a per-section accent budget would make §5C permanently illegal.
 *
 * The walk needs no landing-specific knowledge and runs on the app rows
 * unchanged, AND IT FIRES THERE. This paragraph used to claim the opposite —
 * that the app's grounds all run longer than a viewport so the check never
 * fires — and the artifact of the round that wrote it said otherwise. Every app
 * row records `pageGround: null` (the shell paints no ground over the whole
 * document, which is the branch classifyGrounds states below and the published
 * rule block in §2.1b.1 did not), exactly one section — `div.hero-frame` @0,
 * 276px, held — and one breach: `bone 13.61 under the 15 band`, on every 375px
 * app row in both themes. What is true is the half that matters: the walk needs
 * no per-page knowledge to find it, and there is no `screen === 'landing'`
 * branch anywhere in this file.
 */

import { deviation, SCROLLING_FORM, type Bucket, type Token } from './palette.ts'
import { BUCKET_ORDER } from './palette.ts'

/**
 * One opaque, full-bleed, in-flow ground, as the browser reported it.
 *
 * `parent` is an index into the same array, or -1. Parentage is carried
 * explicitly rather than inferred from a depth counter because the SECTION rule
 * is "its only ground ancestors are the page ground and above" — a statement
 * about ancestry, not about depth, and the two differ the moment a page has two
 * top-level grounds.
 */
export interface Ground {
  /** `tag.first-class`, e.g. `section.lp-shear`. Identification, not a selector. */
  label: string
  top: number
  bottom: number
  parent: number
}

/**
 * THE DOM RULE, in one expression, evaluated in the page.
 *
 * GROUND(el) := opaque background
 *            AND in flow (position static or relative)
 *            AND full-bleed (left <= 0 and width >= document width)
 *            AND its painted colour differs from its nearest GROUND ancestor's
 *
 * Three edges this earned by getting them wrong first:
 *
 * 1. THE `position` FILTER IS LOAD-BEARING, NOT COSMETIC. Without it the
 *    landing's `.lp-band` qualifies — it is full-bleed and opaque — and at 1440
 *    its box is 2880–4203 while its section is 3229–3856, so it would emit a
 *    boundary 349px above its own parent's top and produce overlapping regions.
 *    It is also rotated 38°, so its box is not what it paints. `position:
 *    absolute` is the honest mechanical exclusion: a ground is something the
 *    flow stands on.
 * 2. `<html>` AND `<body>` ARE SKIPPED EXPLICITLY. body carries the app's Flare
 *    and spans the document, so it would be taken as the page ground and
 *    `div.landing` would become the only section. They are the UA canvas, not
 *    authored composition.
 * 3. ZERO-HEIGHT BOXES ARE NOT GROUNDS. A collapsed opaque wrapper paints
 *    nothing and would otherwise emit an empty region that divides by zero.
 */
export const COMPOSITION_SCRIPT = `(() => {
  const root = document.documentElement;
  const docWidth = Math.max(root.scrollWidth, Math.ceil(root.getBoundingClientRect().width));
  const opaque = (bg) => {
    const m = /^rgba?\\(([^)]+)\\)$/.exec(bg);
    if (!m) return false;
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return parts.length < 4 || parts[3] === 1;
  };
  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '';
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const out = [];
  const walk = (el, parent, parentBg) => {
    let nextParent = parent;
    let nextBg = parentBg;
    if (el !== root && el.tagName !== 'BODY') {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const top = Math.round(rect.top + window.scrollY);
      const bottom = Math.round(rect.bottom + window.scrollY);
      const bg = cs.backgroundColor;
      if (
        opaque(bg) &&
        (cs.position === 'static' || cs.position === 'relative') &&
        Math.round(rect.left) <= 0 &&
        rect.width >= docWidth - 1 &&
        bottom > top &&
        bg !== parentBg
      ) {
        out.push({ label: label(el), top: top, bottom: bottom, parent: parent });
        nextParent = out.length - 1;
        nextBg = bg;
      }
    }
    for (const child of el.children) walk(child, nextParent, nextBg);
  };
  walk(root, -1, null);
  return JSON.stringify(out);
})()`

/** One region of the document, counted. */
export interface RegionStat {
  label: string
  top: number
  height: number
  pct: Record<Bucket, number>
  deviation: number
  /** No taller than the viewport — §2's own precondition for applying itself. */
  held: boolean
}

export interface CompositionRecord {
  /** The ground spanning the whole document, or null when the walk found none. */
  pageGround: string | null
  /** The authored compositions, in document order. */
  sections: RegionStat[]
  /** Grounds nested inside a section — judged on run length, not on ratio. */
  nested: RegionStat[]
  /** Empty when the page is at law. One sentence per failure, naming the region. */
  breaches: string[]
}

/**
 * PAGE_GROUND := the outermost ground whose box spans the whole document.
 * SECTION     := a ground whose only ground ancestor is the page ground (or
 *                which has none at all, when a page has several top-level
 *                grounds and no single one wraps the document).
 * NESTED      := every other ground. These carry the run-length rule.
 *
 * Returned as index sets so the caller can keep the browser's document order.
 */
export function classifyGrounds(
  grounds: Ground[],
  docHeight: number,
): { page: number; sections: number[]; nested: number[] } {
  const roots = grounds.map((_, i) => i).filter((i) => grounds[i].parent === -1)
  const page = roots.find((i) => grounds[i].top <= 0 && grounds[i].bottom >= docHeight - 1) ?? -1
  const sections: number[] = []
  const nested: number[] = []
  grounds.forEach((g, i) => {
    if (i === page) return
    if (g.parent === -1 || g.parent === page) sections.push(i)
    else nested.push(i)
  })
  return { page, sections, nested }
}

/**
 * Bucket percentages over a horizontal band of the document.
 *
 * Deliberately a second, simpler implementation of what artifact.ts's
 * `sliceBuckets` does for a window: that one takes a byte offset and a pixel
 * count because a window is always exactly `width * viewportHeight` pixels,
 * and a region is not — it is bounded by two document rows, either of which can
 * fall outside the raster when a rect straddles the capture edge. Clamping here
 * rather than at every call site is why the two are not merged.
 */
function bandBuckets(
  rgb: Uint8Array,
  width: number,
  docHeight: number,
  top: number,
  bottom: number,
  palette: Token[],
  classify: (r: number, g: number, b: number) => { index: number; deltaE: number },
): { pct: Record<Bucket, number>; rows: number } {
  const from = Math.max(0, Math.min(docHeight, top))
  const to = Math.max(from, Math.min(docHeight, bottom))
  const rows = to - from
  const perBucket = { field: 0, bone: 0, graphite: 0, accent: 0 } as Record<Bucket, number>
  if (rows === 0) return { pct: perBucket, rows: 0 }
  const histogram = new Map<number, number>()
  const end = (to * width) * 3
  for (let i = from * width * 3; i < end; i += 3) {
    const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2]
    histogram.set(key, (histogram.get(key) ?? 0) + 1)
  }
  for (const [key, count] of histogram) {
    const match = classify((key >> 16) & 255, (key >> 8) & 255, key & 255)
    perBucket[palette[match.index].bucket] += count
  }
  const pixels = rows * width
  const pct = {} as Record<Bucket, number>
  for (const b of BUCKET_ORDER) pct[b] = (perBucket[b] / pixels) * 100
  return { pct, rows }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * §2 over the sections, and §2.1b's run-length rule over the nested grounds.
 *
 * `classify` is passed in so its memo survives across every region of a row —
 * the same few thousand distinct colours recur in every band of one page.
 */
export function censusComposition(
  rgb: Uint8Array,
  width: number,
  docHeight: number,
  viewportHeight: number,
  palette: Token[],
  grounds: Ground[],
  classify: (r: number, g: number, b: number) => { index: number; deltaE: number },
): CompositionRecord {
  const { page, sections, nested } = classifyGrounds(grounds, docHeight)

  const stat = (i: number): RegionStat => {
    const g = grounds[i]
    const { pct, rows } = bandBuckets(rgb, width, docHeight, g.top, g.bottom, palette, classify)
    return {
      label: g.label,
      top: g.top,
      height: rows,
      pct: Object.fromEntries(BUCKET_ORDER.map((b) => [b, round2(pct[b])])) as Record<Bucket, number>,
      deviation: round2(deviation(pct)),
      held: rows > 0 && rows <= viewportHeight,
    }
  }

  const sectionStats = sections.map(stat)
  const nestedStats = nested.map(stat)

  return {
    pageGround: page === -1 ? null : grounds[page].label,
    sections: sectionStats,
    nested: nestedStats,
    breaches: compositionBreaches(sectionStats, nestedStats, viewportHeight),
  }
}

/**
 * The verdict, recomputable from the committed numbers alone — the same
 * property `scrollingFormBreaches` has, and for the same reason: a hand-edited
 * verdict in the artifact must not be able to survive a test.
 */
export function compositionBreaches(
  sections: RegionStat[],
  nested: RegionStat[],
  viewportHeight: number,
): string[] {
  const law = SCROLLING_FORM
  const out: string[] = []
  for (const s of sections) {
    // A section taller than the viewport is a SEQUENCE, not a composition. §2
    // says "anything the eye holds at once" and this is where that clause is
    // spent — the windows already judge everything longer.
    if (!s.held) continue
    // Cap instead of band, never both: a section over the cap is also over the
    // band, and two lines for one region would make a long page look worse than
    // a broken one. Same rule scrollingFormBreaches follows.
    if (s.pct.field > law.cap.field) {
      out.push(`section ${s.label} @${s.top}: field ${s.pct.field.toFixed(2)} over the ${law.cap.field} cap`)
    } else if (s.pct.field > law.band.field[1]) {
      out.push(`section ${s.label} @${s.top}: field ${s.pct.field.toFixed(2)} over the ${law.band.field[1]} band`)
    } else if (s.pct.field < law.band.field[0]) {
      out.push(`section ${s.label} @${s.top}: field ${s.pct.field.toFixed(2)} under the ${law.band.field[0]} band`)
    }
    if (s.pct.bone > law.cap.bone) {
      out.push(`section ${s.label} @${s.top}: bone ${s.pct.bone.toFixed(2)} over the ${law.cap.bone} cap`)
    } else if (s.pct.bone > law.band.bone[1]) {
      out.push(`section ${s.label} @${s.top}: bone ${s.pct.bone.toFixed(2)} over the ${law.band.bone[1]} band`)
    } else if (s.pct.bone < law.band.bone[0]) {
      out.push(`section ${s.label} @${s.top}: bone ${s.pct.bone.toFixed(2)} under the ${law.band.bone[0]} band`)
    }
  }
  for (const n of nested) {
    if (n.height > viewportHeight) {
      out.push(
        `ground run ${n.label} @${n.top}: ${n.height}px inside a ${viewportHeight}px viewport ` +
          `(§2.1b — no single ground may run longer than one viewport)`,
      )
    }
  }
  return out
}

/** The prose the artifact carries about its own third reading. */
export const COMPOSITION_NOTE =
  'THE THIRD READING, and it is the HARSHER one. `deviation` is the document, `scrollingForm` is ' +
  'the reader\'s screens on a grid phased from offset 0, and this is §2 read over the compositions ' +
  'the page AUTHORED. Boundaries are derived mechanically from the render tree — an opaque, ' +
  'full-bleed, in-flow ground whose colour differs from its nearest ground ancestor\'s — so there ' +
  'is no selector list and no offset table to keep in sync with a stylesheet. SECTIONS are the ' +
  'grounds directly under the page ground, and §2 is enforced on one ONLY where it is no taller ' +
  'than the viewport, because "anything the eye holds at once" is §2\'s own precondition; anything ' +
  'longer is a sequence and the windows own it. NESTED grounds are judged instead on §2.1b\'s "no ' +
  'single ground may run longer than one viewport", which is the run with no authored exit. ' +
  'ACCENT IS NOT RE-CHECKED HERE and must not be: §5C\'s PLATE is a Marigold lockup, so in that ' +
  'composition Marigold is a field, and a per-section accent budget would make a signature layout ' +
  'permanently illegal. WHY IT WAS ADDED: on the tree of 9a42bd8 the landing\'s window reading ' +
  'recorded zero band breaches while landing.1440x900 `.lp-shear` — 627px against a 900px ' +
  'viewport, a composition held entire — read 30.40% field / 66.45% Bone, under the 35 floor and ' +
  'over the 65 Bone hard cap. No window isolates that section, so no phase of the grid could see ' +
  'it. This reading ADDS breaches and removes none, which is the direction that makes it ' +
  'falsifiable.'
