import { describe, it, expect } from 'vitest'
/* From disk, not through Vite's `?raw`: vitest stubs every CSS import to an
   empty string (`css: false` is the default and does not exempt `?raw`), so a
   raw import would assert nothing at all — silently. node:fs and
   import.meta.url are declared locally in src/vite-env.d.ts; adding
   @types/node would be a dependency change. */
import { readdirSync, readFileSync } from 'node:fs'

/**
 * The design system as assertions over the stylesheets themselves.
 *
 * These rules are the ones a rendered audit caught and a DOM test cannot:
 * they are about the SHEET, not about any one element. jsdom applies no CSS —
 * vitest stubs the `.css` imports entirely — so a computed-style test here
 * would assert nothing. Reading the source is the only honest instrument
 * available without adding a browser dependency, and every rule below is
 * mechanical enough that reading the source is sufficient.
 *
 * Each block cites the section of docs/brand/DESIGN-SYSTEM.md it enforces.
 */

/** Comments name px values constantly ("the 20px gap it replaces"), so they
    must go before any value is scanned — otherwise the rationale for a fix
    trips the rule the fix satisfies. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const read = (name: string) =>
  stripComments(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'))

const TOKENS = read('tokens.css')
const APP = read('app.css')
const LANDING = read('landing.css')

/** Properties that place or size a box. Deliberately excludes border-width,
    outline-offset, border-radius and every font metric: §5's 8px baseline is
    about layout, and the radius/keyline token sets have their own values
    (4/12/28/999, 2px) that are not multiples of the spacing grid. */
const SPACING_PROPS = [
  'gap', 'row-gap', 'column-gap',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-inline', 'margin-block',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-inline', 'padding-block',
  'inset', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
]

function offGridLengths(css: string): string[] {
  const found: string[] = []
  for (const prop of SPACING_PROPS) {
    const re = new RegExp(`(?:^|[;{}\\s])${prop}\\s*:\\s*([^;{}]+)`, 'g')
    for (const m of css.matchAll(re)) {
      for (const px of m[1].matchAll(/(-?\d*\.?\d+)px/g)) {
        const v = Math.abs(Number(px[1]))
        // 1/2/3px are the hairline, the §5 keyline and the focus ring — the
        // three sub-grid lengths the system names. Everything else snaps to a
        // half-step of the 8px baseline, which is what the file already
        // expresses as calc(var(--s1) / 2).
        if (v <= 3) continue
        // EIGHT, not four. §5 says "Baseline grid: 8px. Everything snaps" and
        // §6's space scale is 8/16/24/40/64/104/168 — a %4 gate let seven
        // lengths (92, 28, 44, 900) sit off the baseline while a test named
        // for 8 reported coverage.
        if (v % 8 !== 0) found.push(`${prop}: ${m[1].trim()}`)
      }
    }
  }
  return found
}

describe('the sheets parse as the sheets they look like', () => {
  // THIS FILE READS CSS AS TEXT, AND A CSS PARSER DOES NOT. Every assertion
  // below this one runs on stripComments() output, so a stray comment
  // delimiter is invisible to all of them — while the browser reads everything
  // after it as a selector and swallows real rules until the next `{`. That is
  // not hypothetical: an editing pass on app.css left one extra comment-close
  // in a prose block, the suite stayed green, and the ONLY thing that noticed
  // was a census re-run in which app.375x812.dark.seeded's document lost 179px
  // and its field went 58.07% -> 62.38 with no rule intentionally changed.
  // PROVENANCE: HISTORICAL — that pair is a broken tree against its own fix,
  // caught mid-round and never committed, so it is in no artifact and names a
  // state nobody can re-measure. It is the incident, not a reading. The
  // census is a 40-second browser run; this is instant, and it is the cheaper
  // place to catch it.
  // (Line comments, not a block: the assertion below is ABOUT comment
  // delimiters, and a block comment here could not name one.)
  for (const [name, css] of [
    ['tokens.css', 'tokens.css'],
    ['app.css', 'app.css'],
    ['landing.css', 'landing.css'],
  ] as Array<[string, string]>) {
    it(`leaves no unopened comment or unclosed rule in ${name}`, () => {
      const raw = readFileSync(new URL(`./${css}`, import.meta.url), 'utf8')
      // Same regex read() uses, so what is asserted here is exactly what every
      // other test in this file believes it is reading.
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(`${name} stray comment close: ${stripped.includes('*/')}`).toBe(
        `${name} stray comment close: false`,
      )
      expect(`${name} unclosed comment: ${stripped.includes('/*')}`).toBe(
        `${name} unclosed comment: false`,
      )
      let depth = 0
      for (const ch of stripped) {
        if (ch === '{') depth++
        else if (ch === '}') depth--
        expect(depth).toBeGreaterThanOrEqual(0)
      }
      expect(`${name} brace balance: ${depth}`).toBe(`${name} brace balance: 0`)
    })
  }
})

describe('§5 — everything snaps to the 8px baseline', () => {
  it('places and sizes every box on the grid in app.css', () => {
    // The audit found `gap: 20px` and `inset: -10px 0` on the quest list: two
    // values off the baseline, tuned against each other so the invisible hit
    // areas met without overlapping. Both are gone; this stops them coming
    // back one ad-hoc value at a time.
    expect(offGridLengths(APP)).toEqual([])
  })

  it('places and sizes every box on the grid in landing.css', () => {
    expect(offGridLengths(LANDING)).toEqual([])
  })
})

describe('§3 — the display tier does real work in the product', () => {
  it('uses the display tokens in the app, not only on the marketing surface', () => {
    // --fs-d1 and --fs-d2 had zero uses in app.css: the whole rendered scale
    // was 144 → 22 → 17 → 13 → 11, a 122px hole and then four sizes inside
    // one octave. The band lockup and the health readout are the two marks
    // that close it.
    expect(APP).toMatch(/--fs-d2\)/)
  })

  it('gives card titles the h2 tier they were minted for', () => {
    expect(APP).toMatch(/\.card h2 \{[^}]*--fs-h2/)
  })

  it('uses every step of the scale it defines — no 2.4× hole in the ramp', () => {
    // A census of everything ≥28px painted at 1440 read 72 / 30 / 22 / 17 in
    // the card stack: --fs-h1 (42px) was defined and skipped, so the ramp fell
    // 2.4× in one jump from the health readout to the section heads.
    //
    // THE STEP HAS TO BE IN THE STACK, which is what the first version of this
    // assertion did not say. It only required --fs-h1 somewhere in app.css, and
    // was satisfied by .hero-thesis — a different composition, inside
    // `@media (min-width: 1024px)`, on an element the phone (the stated primary
    // device) never renders. The cliff itself never moved. So the readout at
    // the top of the stack is asserted directly.
    expect(APP).toMatch(/\.score-value \{[^}]*font-size: var\(--fs-h1\)/)
    // …with its own line-height and tracking, not h1's size over d2's metrics.
    expect(APP).toMatch(/\.score-value \{[^}]*line-height: var\(--lh-h1\)/)
    expect(APP).toMatch(/\.score-value \{[^}]*letter-spacing: var\(--tr-h1\)/)
    // The band keeps its own step; both are the same token, in two ramps.
    expect(APP).toMatch(/\.hero-thesis \{[^}]*font-size: var\(--fs-h1\)/)
    // And d2 stays where §3 puts it: BLOKFORM, stacked, in a container.
    expect(APP).toMatch(/\.hero-lockup \{[^}]*font-size: var\(--fs-d2\)/)
  })

  it('closes the same hole on the poster, which has its own stylesheet', () => {
    // The landing's declared sizes read 112 / 72 / 30 / 22 / 17 — the identical
    // 2.4× fall from the d2 section brick to the next tier down, and a 3.7×
    // one from the d1 lockup that stands directly over .lp-thesis in the wall.
    // Fixing app.css did nothing for it. .lp-thesis is the page's promise line
    // (the first reading-tier string in §5A's wall and in §5E's object), and at
    // h2 it rendered at the size of a card title and 1.36× its own lede.
    expect(LANDING).toMatch(/--fs-h1\)/)
    const thesis = /\n\.lp-thesis \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    expect(thesis).toMatch(/font-size: var\(--fs-h1\)/)
    // The whole tier travels together or the leading is wrong for the size:
    // h1 is 42/0.95/-0.02em in §3, not 42 on h2's 1.05 leading.
    expect(thesis).toMatch(/line-height: var\(--lh-h1\)/)
    expect(thesis).toMatch(/letter-spacing: var\(--tr-h1\)/)
    // Tier 2, not Tier 1: §3 reserves the display face for 1–3 stacked words
    // and this line is five. Taking the SIZE tier is not taking the face.
    expect(thesis).not.toMatch(/font-family/)
    // …and the lede below it must not follow, or the step just moves down one
    // and the gap is unchanged.
    expect(LANDING).toMatch(/\.lp-lede \{[^}]*font-size: var\(--fs-h3\)/)
  })

  it('never renders a heading below body size', () => {
    // .hero-stage-name was an <h2> at --fs-cap: 13px, smaller than the 17px
    // body around it, which inverts the outline it belongs to.
    expect(APP).not.toMatch(/\.hero-stage-name \{[^}]*--fs-(cap|spec)/)
  })

  it('keeps the stage label inside the plate it is painted on (§2.1)', () => {
    // CONSTRAINT §2.1 — this is a CONTRAST rule, not a layout preference.
    // .stage-info carries .counter-plate, which is the ground's OPPOSITE, so a
    // label wider than the plate does not merely overhang: its tail lands on
    // the CARD's fill, which is Bone-on-Bone at 1.00:1 in light and
    // Graphite-on-Espresso at 1.16:1 in dark. Measured in Chromium at 320x812
    // before this rule: the plate's content box was 68px, "Bonfire" laid out at
    // 97.47px and ended 13px past the plate's fill, inside the card. Three of
    // the four STAGE_META labels overflowed; the stage name is also the stage
    // badge's text alternative, so the badge's meaning went with it.
    const name = /\n\.stage-name \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    // THE GUARANTEE: whatever the label, whatever the width, it breaks inside.
    expect(name).toMatch(/max-width: 100%/)
    expect(name).toMatch(/overflow-wrap: anywhere/)
    // THE OUTCOME: below 360 the row reflows so the plate gets the card's full
    // measure and no real label ever reaches the break. Not a padding tweak
    // (that only moves the boundary) and not a shrunk .stage-col (the badge is
    // a fixed 96px).
    const narrow = /@media \(max-width: 359px\) \{([\s\S]*?)\n\}/.exec(APP)?.[1] ?? ''
    expect(narrow).toMatch(/\.hero-main \{ flex-wrap: wrap; \}/)
    expect(narrow).toMatch(/\.stage-info \{ flex: 1 0 100%; \}/)
    expect(APP).toMatch(/\.stage-badge \{[^}]*width: 96px/)
    // Verified in-browser at 320/360/375/412/768 after the change: every one of
    // the four STAGE_META labels ends at or inside the plate's content edge, so
    // no glyph is painted on the 1.00:1 / 1.16:1 pair in any theme.
  })
})

describe('§3 — nothing on the page is fetched from anywhere', () => {
  it('requests no remote font, sheet or image from any stylesheet', () => {
    // §3: "Fonts must be self-hosted or system-stacked. No external font CDN
    // request — the app is local-first and must render fully offline." The
    // landing surface makes the same promise in prose ("Runs on your phone.
    // Not on your bank"), and a single @import of a font sheet would make the
    // marketing copy false on the first offline load — silently, because it
    // would still look right on the developer's machine.
    // The two permitted textures are inline data: URIs, which is why the
    // pattern is scheme-anchored rather than a blanket url() ban.
    for (const [name, css] of [['tokens', TOKENS], ['app', APP], ['landing', LANDING]] as const) {
      expect(`${name}: ${/@import/.test(css)}`).toBe(`${name}: false`)
      expect(`${name}: ${/url\(\s*['"]?(https?:)?\/\//.test(css)}`).toBe(`${name}: false`)
    }
  })
})

describe('§8 — exactly two textures, and the grain is ONE of them', () => {
  it('defines the grain tile once, as a token, and inlines it nowhere', () => {
    // §8 budgets the product two textures: 6% offset-print grain and the
    // halftone inside display letterforms. The grain tile shipped as two
    // byte-identical 353-character data: URIs — one in app.css behind the
    // desktop hero, one in landing.css behind the brick wall — each commented
    // as "the same tile" as the other. Two copies of a texture is not a budget
    // of one texture; it is two textures that happen to agree today.
    const tile = /--grain-tile:\s*url\(/g
    expect(TOKENS.match(tile) ?? []).toHaveLength(1)
    // The use sites reference the token and inline nothing. Anchored on the
    // data: scheme rather than on url(), because both files legitimately
    // reference var(--grain-tile) and the §3 remote-asset ban is separate.
    for (const [name, css] of [['app', APP], ['landing', LANDING]] as const) {
      expect(`${name} inlines a data URI: ${/url\(\s*['"]?data:/.test(css)}`).toBe(
        `${name} inlines a data URI: false`,
      )
      expect(`${name} uses the token: ${css.includes('var(--grain-tile)')}`).toBe(
        `${name} uses the token: true`,
      )
    }
  })
})

describe('§1 trait 09 / §8 — one diagonal per composition', () => {
  it('ships the app shear at every width, not only above 1024px', () => {
    // The 38° shear used to live inside the ≥1024 block, so every phone and
    // tablet capture — the app's stated primary device — contained no
    // diagonal at all.
    //
    // ASSERTED BY NESTING DEPTH, NOT BY FILE ORDER. This read "the shear
    // appears before the first `@media (min-width: 1024px)` in the file", which
    // is a proxy: it says nothing about the shear and everything about which
    // rule happens to be typed first. It went red the moment a width-scoped
    // plate undo was added ABOVE it (the two blocks at the top of app.css) even
    // though the shear had not moved and was still unconditional. APP is
    // comment-stripped by read(), so counting braces to the shear is exact: a
    // declaration in a top-level rule sits at depth 1, and one inside any
    // at-rule sits at 2 or deeper.
    const shear = APP.indexOf('rotate(-38deg)')
    expect(shear).toBeGreaterThan(-1)
    let depth = 0
    for (const ch of APP.slice(0, shear)) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    expect(depth).toBe(1)
    // …and the ≥1024 block still exists, so this is not passing because the
    // breakpoint was deleted out from under it.
    expect(APP).toContain('@media (min-width: 1024px)')
  })

  it('cuts the app composition exactly once', () => {
    expect(APP.match(/rotate\(-?38deg\)/g)).toHaveLength(1)
  })

  it('cuts each landing composition exactly once', () => {
    // Two full-bleed compositions carry one each: the wall (§5A) and the shear
    // section (§5D).
    expect(LANDING.match(/rotate\(-?38deg\)/g)).toHaveLength(2)
  })

  it('sets type parallel to the shear band, at a size §2.1 allows on Flare', () => {
    // §5D has two clauses: "one 38° diagonal band splits the canvas; TYPE SITS
    // PARALLEL TO IT". The band shipped typeless because a rotated SENTENCE is
    // occluded at its middle by the rule plates at every width. An index has no
    // middle, so the marks are children of the band itself — inheriting the
    // rotation, parallel by construction, with no second angle to keep in sync.
    const band = /\n\.lp-band \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    expect(band).toMatch(/font-size: var\(--fs-h2\)/)
    expect(band).toMatch(/font-weight: 700/)
    // …and the marks are NUMERALS, so §11 fixes the face: "all numerals render
    // in the mono stack, uppercase, +0.14em", unconditionally. The band shipped
    // in Grotesk at --tr-h2 while every other spec index on the poster
    // (.lp-index, .lp-corner, .lp-facts, .lp-shot-tag, .lp-count) was mono.
    // .score-line already resolved the identical §3-vs-§11 collision the same
    // way: the scale comes from §3 and the face from §11.
    expect(band).toMatch(/font-family: var\(--mono\)/)
    expect(band).toMatch(/letter-spacing: var\(--tr-spec\)/)
    expect(band).not.toMatch(/font-family: var\(--ui\)/)
    // §2.1 rule 1: Flare is a field, and no string under 24px may sit on it.
    // --fs-h2 floors at 24px; anything from --fs-h3 down would be illegal here.
    expect(band).not.toMatch(/font-size: var\(--fs-(h3|body|cap|spec)\)/)
    // The clip has to land off-canvas, which it does because both band ends sit
    // outside the section at every width — a mark cut in half on screen is the
    // truncation this whole construction exists to avoid.
    expect(band).toMatch(/overflow: hidden/)
    expect(LANDING).toMatch(/\.lp-band-mark \{[^}]*flex-shrink: 0/)
  })

  it('carries that type on the phone too, in a lane rather than behind plates', () => {
    // THE UNFINISHED HALF. The construction above solves the occlusion for a
    // section wider than it is tall — at 1440 the diagonal has a 678px run and
    // the four-column grid leaves band showing beside it. Below 720px the grid
    // is one full-measure column, the column IS the viewport, and the band's
    // only run is ~60px slivers between stacked plates. The marks were
    // therefore switched off entirely, so the stated primary device shipped
    // §5D's first clause and none of its second.
    //
    // The collision is the overlap, so the fix is to stop overlapping: the band
    // gets a canvas of its own between the sign and the plates, with nothing
    // drawn over it. Not "hide the type", and not "shrink the type".
    const band = /\n\.lp-band \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    const lane = /\n\.lp-band-lane \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    expect(lane).toMatch(/position: relative/)
    expect(lane).toMatch(/overflow: hidden/)
    // THE HEIGHT IS THE ANGLE. tan 38° = 0.78129, so a lane whose height is its
    // width times that tangent is the box whose corner-to-corner diagonal is
    // exactly 38° — the band's centreline enters at one corner and leaves at
    // the opposite one, touching both side edges. Any shorter and it exits
    // through the top and bottom instead, dying to a sliver in each corner,
    // which is the fragment artefact one level up. A hard px height, a vh, or
    // a rounder ratio would all break that; this value is not tuneable.
    expect(lane).toMatch(/aspect-ratio: 1 \/ 0\.78129/)
    // It bleeds out of the section's inline padding, or the diagonal stops at
    // a 24px inset and reads as a stripe on a plate rather than a split canvas.
    expect(lane).toMatch(/margin: var\(--s4\) calc\(-1 \* var\(--s3\)\)/)

    // ONE BAND ELEMENT, TWO GEOMETRIES. display: contents generates no box, so
    // at ≥720 the lane stops being a containing block and .lp-band falls back
    // to being absolutely positioned across .lp-shear — the composition round 3
    // verified on pixels, byte-identical. A second band element would have been
    // a second angle to keep in sync with the first.
    const wide = /@media \(min-width: 720px\) \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    expect(wide).toMatch(/\.lp-band-lane \{ display: contents/)
    expect(band).toMatch(/position: absolute/)

    // The marks are centred inside the band, which is what keeps them off the
    // clip: the band's centre is the lane's centre, and the run reaches
    // ±W/(2·cos38) from there before it meets a corner — 238px at a 375px lane.
    expect(band).toMatch(/justify-content: center/)
    expect(wide).toMatch(/\.lp-band \{ justify-content: flex-start/)

    // THE COUNT IS THE GATE, not the display. 18 marks are rendered at every
    // width; below 720 the surplus is never drawn rather than drawn and
    // clipped, so no mark is cut mid-glyph on any screen. 3 marks measure 288px
    // end to end against a ≥406px run at 320px; 5 measure 522px against ≥609px
    // at 480px.
    expect(LANDING).toMatch(/\.lp-band-mark \{[^}]*display: none/)
    expect(LANDING).toMatch(/\.lp-band-mark:nth-child\(-n \+ 3\) \{ display: block/)
    const mid = /@media \(min-width: 480px\) \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    expect(mid).toMatch(/\.lp-band-mark:nth-child\(-n \+ 5\) \{ display: block/)
    expect(wide).toMatch(/\.lp-band-mark \{ display: block/)

    // §2.1 rule 1 has no mobile carve-out: the marks are the same --fs-h2 at
    // every width, and that token floors at 24px. The phone is where a
    // "just make it fit" shrink would have been tempting and illegal.
    expect(band).toMatch(/font-size: var\(--fs-h2\)/)
    expect(LANDING).not.toMatch(/\.lp-band-mark[^}]*font-size/)
  })
})

describe('§2 — the ratio law and the palette budget', () => {
  const root = () => /:root \{([\s\S]*?)\n\}/.exec(TOKENS)?.[1] ?? ''
  const dark = () =>
    /prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n  \}/.exec(TOKENS)?.[1] ?? ''
  const sheet = () => /\n\.spec-sheet \{([\s\S]*?)\n\}/.exec(TOKENS)?.[1] ?? ''
  const decl = (block: string, name: string) =>
    new RegExp(`${name}:\\s*var\\((--[a-z-]+)\\)`).exec(block)?.[1]

  it('gives the page a field that is not the card fill, in both themes', () => {
    // The root cause of "generic card stack": body, .card and .field all
    // resolved to the same hex, so three nested surface levels carried zero
    // colour offset. §2 puts 60% of the surface on Flare or Espresso; the
    // stage is the only surface big enough to carry it.
    expect(decl(root(), '--stage')).toBe('--flare')
    expect(decl(root(), '--field')).toBe('--bone')
    expect(decl(dark(), '--field')).toBe('--espresso')
    expect(TOKENS).toMatch(/body \{[^}]*background: var\(--stage\)/)
  })

  it('never overrides the stage in dark — Flare keeps its hex in both themes', () => {
    // §2.2 swaps the GROUND (Bone -> Espresso) and keeps Flare's hex in both.
    // --stage is a field, not a reading ground, so the swap must not reach it.
    // Overriding it to Espresso was measured: Flare fell to 2.5% of the dark
    // phone with no brand mark below the hero band, and the stage/card offset
    // collapsed to 1.164:1 — depth back on the 2px keyline, which is the exact
    // defect the stage split exists to kill. Against the Espresso card the
    // Flare stage measures 4.41:1, the widest surface offset in the app.
    expect(decl(dark(), '--stage')).toBeUndefined()
    expect(dark()).not.toMatch(/--stage:/)
  })

  it('never promotes Graphite from the form to a card fill', () => {
    // §1 trait 06 gives every surface three roles — field, form, counter — and
    // §2 budgets them 60/30/8. Graphite is the 8% role. `--field: graphite` in
    // the dark block put it at 52.6% of the dark phone, 6.6x its budget and the
    // largest law violation anywhere in the app, because on a 375px column the
    // cards ARE the screen. Neither theme may hand it a container fill again.
    for (const block of [root(), dark(), sheet()]) {
      expect(decl(block, '--field')).not.toBe('--graphite')
    }
  })

  it('keeps Void off every CONTAINER surface — it is capped under 5%', () => {
    // This assertion used to be a blanket ban on `--sunken: var(--void)`,
    // written when Void as the dark recess measured 15.2% of the phone page —
    // 39 locked tiles, every track and every input. THE TILES LEFT. They recess
    // onto .spec-sheet's own ground now (asserted below), so the dark recess is
    // five keypad keys, the profile/log inputs, the health track and one hover
    // state. PROVENANCE: read the `void` figure of app.375x812.dark.seeded and
    // app.1440x900.dark.seeded in docs/brand/census.json, which the staleness
    // test keeps current — the 2.4% / 1.3% this comment used to state were
    // undated and out by roughly 2x. The phone is inside §2's 5% cap and NOT by
    // much. The recess is Void on purpose — Graphite is LIGHTER than the dark
    // card (relative luminance 0.0255 vs 0.0149), so it drew every recess as a
    // raised plate.
    //
    // What actually blows the 5% cap is a CONTAINER fill: a Void sheet was
    // measured at 31.6% of the page. So the guard moves from the recess to the
    // roles that carry area, which is the rule it was always a proxy for.
    for (const prop of ['--ground', '--field', '--stage'] as const) {
      expect(`${prop}: ${new RegExp(`${prop}: var\\(--void\\)`).test(TOKENS)}`)
        .toBe(`${prop}: false`)
    }
    expect(decl(dark(), '--sunken')).toBe('--void')
    expect(TOKENS).toMatch(/--brand-screen: var\(--void\)/)
  })

  it('bounds the recess itself — Void’s footprint is a list, not a vibe', () => {
    // The container-role ban above says nothing about how MUCH recess there is,
    // and that is exactly the drift the original 15.2% measurement caught: the
    // re-census lives in docs/brand/census.json and a comment cannot enforce it,
    // so tracks, tiles and inputs could be added without limit and every
    // assertion here would stay green. (The figure this sentence used to reason
    // from — "2.4%" — was undated and wrong, which is the argument twice over.)
    //
    // So the surfaces that paint the recess are ENUMERATED. Adding one fails
    // this test, which is the point: a new Void surface in dark needs a fresh
    // census, not a passing suite. Two of these never resolve to Void at all —
    // .boss-track sits on .spec-sheet, which re-declares --sunken as its own
    // ground, and .decision-checkback is a recess inside a card that is Bone in
    // light and Espresso in dark — so the live dark-Void set is the health
    // track, the inputs and the keypad.
    // (Three more left this list entirely. .codex-locked and .ach-locked were
    // 39 of the tiles this budget was written about and their card is deleted;
    // the quest box's hover state went with the quest card. .xp-track is STILL
    // HERE and no longer resolves to Void in dark at all — it sits on
    // .counter-plate now, which re-declares --sunken as Sand in dark and
    // Espresso in light, the same way .spec-sheet does for .boss-track.)
    const withoutComments = APP.replace(/\/\*[\s\S]*?\*\//g, '')
    const recessed: string[] = []
    for (const m of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/background: var\(--sunken\)/.test(m[2])) continue
      recessed.push(m[1].trim().split('\n').map((l) => l.trim()).join(' '))
    }
    expect(recessed.sort()).toEqual([
      '.boss-track',
      '.decision-checkback',
      '.field',
      '.health-track',
      '.note-key',
      '.xp-track',
    ])
  })

  it('stands the archive on §5B’s Espresso spec sheet, in both themes', () => {
    // §5 layout B: "4-up grid of badges ON ESPRESSO, captioned with mono index
    // labels" — the codex and the badge shelf are literally that, and they were
    // rendering as ordinary Bone cards, so layout B existed nowhere in the
    // product. It is also the largest field correction available on a phone:
    // those two cards are the tallest on the page, and a census put the 375px
    // light app at 20.4% field / 68.5% bone against a 60/30 law.
    // §5B says "on espresso" unconditionally and this base rule obeys it in
    // both themes. The dark counter-sheet below re-grounds two cards on top of
    // it — see that block for why an Espresso figure on an Espresso ground is
    // not what §5B is describing.
    expect(decl(sheet(), '--field')).toBe('--espresso')
    expect(decl(sheet(), '--ink')).toBe('--bone')
    // The derived quiet registers must be re-declared, not inherited: a custom
    // property's var() references are substituted where it is DECLARED, so an
    // inherited --spec is already a resolved hex measured against the WRONG
    // ground. Without these two lines the sheet's spec labels are ~1.5:1.
    expect(sheet()).toMatch(/--spec: color-mix/)
    expect(sheet()).toMatch(/--spec-sunken: color-mix/)
    // The recess is the sheet's own ground. 39 locked tiles at --s5 tall is how
    // the Graphite budget went 6.6x over in the first place; they must not
    // reintroduce a fourth surface colour on the surface that fixed it.
    expect(decl(sheet(), '--sunken')).toBe('--espresso')
  })

  describe('§1 trait 06 — dark gets the counter role back, in Sand', () => {
    /** Every counter-sheet rule: a @media block, whatever its condition, whose
        selector re-grounds a .spec-sheet card. Found by searching rather than
        by position, so re-ordering the file cannot silently make these
        assertions match nothing — and the condition is captured, because round
        5 gave the two cards different ones. */
    const rules = () => [
      ...TOKENS.matchAll(/@media ([^{]*?) \{\s*(\.spec-sheet\.[^{}]+?)\s*\{([\s\S]*?)\n  \}/g),
    ]
    const ruleFor = (card: string) => rules().find((m) => m[2].includes(card))
    const conditionFor = (card: string) => ruleFor(card)?.[1] ?? ''
    const counterSel = () => rules().map((m) => m[2].trim())
    const counter = () => ruleFor('archive-card')?.[3] ?? ''

    it('re-grounds the archive card a dark theme leaves role-less', () => {
      // §2.2 swaps the GROUND and stops there; nothing in it swaps the COUNTER,
      // and §4 says "Counters are BONE" unconditionally. In light that role is
      // spent by the Bone cards standing on the Espresso sheet. In dark it was
      // spent nowhere — ground, card and sheet were all Espresso, so card-to-
      // sheet measured 1.00:1 / ΔRGB 0 across ~33% of the page. Surface-to-
      // surface offset among the dark neutrals is structurally capped at
      // 1.34:1, so no third dark hex can close it: the only fix is to give the
      // Bone family a surface back.
      const c = counter()
      expect(c).not.toBe('')
      expect(decl(c, '--field')).toBe('--sand')
      expect(decl(c, '--ground')).toBe('--sand')
      expect(decl(c, '--ink')).toBe('--graphite')
      expect(decl(c, '--counter')).toBe('--sand')
      // Same rule as .spec-sheet's own recess: the recess is the surface's own
      // ground, so a re-grounded card adds no fourth surface colour.
      expect(decl(c, '--sunken')).toBe('--sand')
      expect(decl(c, '--keyline')).toBe('--ink')
    })

    it('deepens the quiet mixes for Sand — 70% is under the body floor there', () => {
      // Sand is a light surface with less headroom than Bone: --ink mixed 70%
      // toward it is #605F57 at 4.40:1, under §2.1's 4.5:1 floor — the identical
      // trap tokens.css already documents for the light Sand recess. Copying
      // .spec-sheet's 70/80 pair onto this ground is the one way to break it,
      // so the numbers are asserted, not just present.
      expect(counter()).toMatch(/--spec: color-mix\(in srgb, var\(--ink\) 80%, var\(--ground\)\)/)
      expect(counter()).toMatch(
        /--spec-sunken: color-mix\(in srgb, var\(--ink\) 88%, var\(--ground\)\)/,
      )
    })

    it('is scoped by doubled selectors, to exactly the two markless cards', () => {
      // `.spec-sheet.archive-card` is (0,2,0) and beats the (0,1,0)
      // `.spec-sheet` regardless of source order. A bare `.archive-card` is
      // (0,1,0) — a tie, and ties are settled by whichever rule comes last.
      // ONE rule, where there were two. The second was
      // `.spec-sheet.collection-card`, and the card it scoped — 41 tiles, no
      // controls — is deleted, so the duplicated declaration body and the test
      // that kept the two copies character-identical are both gone with it.
      // Asserted as an equality so a selector matching no DOM cannot creep back
      // in behind a passing suite.
      expect(counterSel()).toEqual(['.spec-sheet.archive-card'])
      // WHY IT STOPS HERE, as arithmetic rather than taste. Flare on Sand is
      // 2.51:1 against 4.41:1 on Espresso — so .boss-fill's Flare bar and
      // .export-note's Flare fault bar would each drop under WCAG 1.4.11's 3:1
      // non-text floor if their card were re-grounded. Those two are the whole
      // remainder of the sheet — which is why the list above is exhaustive and
      // asserted as an equality, not a containment.
      // (The Marigold .xp-fill was a third case at 1.49:1 on Sand; it left the
      // sheet entirely when the XP bar merged into QuestCard.)
      //
      // AND NOTHING NAMES THE DELETED CARD. A token scope whose selector
      // matches no DOM is dead weight that reads as live rule; this is the
      // stylesheet half of the deletion, asserted rather than assumed.
      expect(TOKENS).not.toContain('.spec-sheet.collection-card {')
      for (const gone of ['.codex-tile', '.ach-tile', '.codex-locked', '.ach-locked']) {
        expect(`${gone}: ${new RegExp(`\\n\\${gone} \\{`).test(APP)}`).toBe(`${gone}: false`)
      }
      // The ARCHIVE takes it in dark at any width OR from 1400px in either
      // theme. 1400 is measured, not chosen: docs/brand/census.json carries
      // app.1024/1280/1440 either side of the gate, and applying this rule at
      // 1024 was measured to drive that width from 63.6% field to 47.5% — the
      // same defect pointed the other way. See the block above the rule.
      expect(conditionFor('archive-card')).toBe('(prefers-color-scheme: dark), (min-width: 1400px)')
      // AND THE SELECTOR IS NOT SCOPED TO THE APP STACK, which is the one
      // correction this rule invites and the one that was measured to be wrong.
      // The landing mounts a real <ArchiveCard> as its product shot, so the
      // same rule paints it — and the width arm's premise (the .main-stack
      // gutter) does not exist on the landing, which makes `.main-stack
      // .spec-sheet.archive-card` look like the obvious tidy-up. Measured on
      // the tree committed as 12bbf5e with the width arm scoped that way,
      // landing.1440x900.light.fresh window @900 read 85.94% field / 10.78%
      // Bone — over §2.1b's 85 HARD CAP, against 82.42 / 14.15 as shipped ON
      // THAT SAME TREE: the 560px shot is the only Bone-family ground in that
      // window. The shipped figure has moved since (81.04 / 15.57 in the
      // artifact committed at dc529fb) and the counterfactual has not been
      // re-run against it, so the pair is stamped rather than restated — a
      // delta that subtracts two different trees is not a delta. See the block
      // above the rule for both arms stated separately.
      expect(counterSel()).not.toContain('.main-stack .spec-sheet.archive-card')
      expect(counterSel()).not.toContain('.lp-shot-frame .spec-sheet.archive-card')
    })
  })

  describe('§2.1b — the two plates, and the ground that must not run a screen', () => {
    /** A plate's token block, by class name and by media condition. `null`
        condition means the unconditional rule. Found by search rather than by
        position so re-ordering tokens.css cannot make an assertion match
        nothing — the trap the counter-sheet block above already documents. */
    const plate = (cls: string, condition: string | null) => {
      const re =
        condition === null
          ? new RegExp(`\\n\\.${cls} \\{([\\s\\S]*?)\\n\\}`)
          : new RegExp(
              `@media ${condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\s*\\.${cls} \\{([\\s\\S]*?)\\n  \\}`,
            )
      return re.exec(TOKENS)?.[1] ?? ''
    }
    const roles = (block: string) =>
      Object.fromEntries(
        ['--ground', '--field', '--sunken', '--ink', '--counter'].map((n) => [n, decl(block, n)]),
      )

    it('gives the counter plate the sheet’s own light half, declaration for declaration', () => {
      // WHY THIS EXISTS AT ALL. §2.1b measures each VIEWPORT WINDOW, and at
      // tree 71b5608 the phone failed 5 of 7 windows in light and 7 of 7 in
      // dark while both document averages looked ordinary. The unit that has to
      // alternate is smaller than a card — SimCard alone is over a viewport
      // tall — so the plate is a ground change inside a container.
      // Its LIGHT half is .spec-sheet's block verbatim, and that is asserted
      // rather than described: every pair inside a counter plate in light is
      // then a pair §5B's sheet has already shipped and measured.
      expect(roles(plate('counter-plate', null))).toEqual(roles(sheet()))
      expect(plate('counter-plate', null)).toMatch(
        /--spec: color-mix\(in srgb, var\(--ink\) 70%, var\(--ground\)\)/,
      )
    })

    it('gives the counter plate’s dark half BONE — the light theme’s own surface', () => {
      // NOT the archive sheet's Sand, and the difference is the safety
      // argument. §4 says "Counters are BONE" unconditionally; §2 gives Sand to
      // "aged paper, spec sheets" and the archive is one. On Bone the plate's
      // interior is EXACTLY the light theme's reading surface, so no foreground
      // that lands on one is a pair this app has not already measured — Flare
      // is 3.02:1 there against 2.51:1 on Sand, which is the pair that holds
      // .btn-flame and .boss-fill off the archive's Sand ground.
      const dark = plate('counter-plate', '(prefers-color-scheme: dark)')
      expect(dark).not.toBe('')
      expect(roles(dark)).toEqual(roles(root()))
      // Re-declared, never inherited: a custom property's var() references are
      // substituted where it is DECLARED (see .spec-sheet above).
      expect(dark).toMatch(/--spec: color-mix/)
      expect(dark).toMatch(/--spec-sunken: color-mix/)
    })

    it('makes the reading plate the page’s own ground, in both themes', () => {
      // The dual: .reading-plate is what interrupts a run inside a container
      // that is ALREADY on the counter, which in this app is the archive. Its
      // two halves are the two halves of :root, so — like the counter plate's
      // dark half — it introduces no pair the app has not shipped.
      expect(roles(plate('reading-plate', null))).toEqual(roles(root()))
      expect(roles(plate('reading-plate', '(prefers-color-scheme: dark), (min-width: 1400px)')))
        .toEqual(roles(dark()))
    })

    it('keys the reading plate on the archive’s own condition, not on the theme', () => {
      // THE COMMA IS AN OR, and it is the same OR the counter sheet uses. The
      // archive is Sand in dark at any width and in EITHER theme from 1400px
      // up; keyed on the theme alone, light at >=1400px left a Bone plate on a
      // Sand sheet — two hexes, one bucket, no alternation at all. Measured in
      // that state: app.1440x900.light.seeded window @3600 read 25.00% field /
      // 70.27% Bone, worse than the row the plate was added to fix.
      const archiveCondition =
        /@media ([^{]*?) \{\s*\.spec-sheet\.archive-card \{/.exec(TOKENS)?.[1] ?? ''
      const plateCondition =
        /@media ([^{]*?) \{\s*\.reading-plate \{/.exec(TOKENS)?.[1] ?? ''
      expect(plateCondition).toBe(archiveCondition)
      expect(plateCondition).toBe('(prefers-color-scheme: dark), (min-width: 1400px)')
    })

    it('gives the XP strip its container from the plate, not from a card', () => {
      // CONSTRAINT §2.1b. The strip is not a .card (see XpStrip): it has no
      // heading, no §11 corner mark and no keyline or fill of its own. Its
      // whole container is .counter-plate — which is what makes it a GROUND
      // INTERRUPTION rather than one more Bone box in the longest Bone run on
      // the light phone. So this rule may declare box properties only; the
      // moment it declares a background or a border it has stopped being a
      // plate and started being a second, unmeasured surface.
      const strip = /\n\.xp-strip \{([\s\S]*?)\n\}/.exec(APP)?.[1] ?? ''
      expect(strip).not.toBe('')
      expect(strip).not.toMatch(/(?:^|[;{\s])(?:background|border|color)\s*:/)
      expect(strip).not.toMatch(/(?:^|[;{\s])--[a-z-]+\s*:/)
      expect(APP).toMatch(/\n\.xp-strip \{[\s\S]*?display: flex/)
    })

    it('keeps the XP bar’s 1.4.11 edge legal on BOTH halves of the plate it moved to', () => {
      // The bar used to stand on the Bone reading ground, where --sunken is
      // Sand in light and Void in dark. On .counter-plate --sunken is the
      // PLATE's own ground: Espresso in light, Sand in dark. One of those two
      // is a pair the fill cannot carry alone, which is why .xp-fill keeps its
      // --keyline stroke — the boundary is delimited by the stroke there.
      expect(round(contrast(RAW.marigold, RAW.espresso))).toBe(7.43) // light: fill clears alone
      expect(round(contrast(RAW.marigold, RAW.sand))).toBe(1.49) // dark: it does not
      // …so the stroke carries it, and the stroke is --keyline = --ink =
      // Graphite on the plate's dark half. Both sides over WCAG 1.4.11's 3:1.
      expect(round(contrast(RAW.graphite, RAW.marigold))).toBe(6.38)
      expect(round(contrast(RAW.graphite, RAW.sand))).toBe(9.52)
      // The stroke is declared, and it is load-bearing on exactly one half —
      // deleting it is a silent contrast regression in one theme only.
      const fill = /\n\.xp-fill \{([\s\S]*?)\n\}/.exec(APP)?.[1] ?? ''
      expect(fill).toMatch(/border-right: var\(--keyline-w\) solid var\(--keyline\)/)
    })

    it('draws the counter plate with no keyline and the reading plate with one', () => {
      // Measured, not stylistic. A counter plate's fill IS its boundary —
      // 13.4:1 Espresso on Bone in light, 11.4:1 Bone on Espresso in dark — and
      // a --keyline stroke there would be Bone on Bone (1:1) or Graphite on
      // Espresso (1.16:1). The reading plate has one because one of its three
      // placements has no fill offset to spend: at >=1400px in light the
      // archive is Sand and Bone on Sand is 1.20:1, where the Graphite keyline
      // is 9.5:1 outside and 11.4:1 inside.
      expect(plate('counter-plate', null)).not.toMatch(/\n  border:/)
      expect(plate('reading-plate', null)).toMatch(
        /border: var\(--keyline-w\) solid var\(--keyline\)/,
      )
    })

    /** A width-scoped plate's undo block, from app.css. Searched across EVERY
        media block of that width rather than the first one: app.css carries
        several at 768 and 1024, and "the first" is a fact about typing order,
        not about the rule — the same proxy that made the shear test above go
        red for an unrelated edit. */
    const undo = (width: number, cls: string) => {
      const blocks = [
        ...APP.matchAll(new RegExp(`@media \\(min-width: ${width}px\\) \\{([\\s\\S]*?)\\n\\}`, 'g')),
      ]
      for (const block of blocks) {
        const body = new RegExp(`\\.${cls} \\{([\\s\\S]*?)\\n  \\}`).exec(block[1])?.[1]
        if (body !== undefined) return body
      }
      return ''
    }
    /** Every custom property a block declares, in declaration order. */
    const tokensOf = (block: string) => [...block.matchAll(/(--[a-z-]+):/g)].map((m) => m[1])

    it('undoes a width-scoped plate token for token, so none can be left behind', () => {
      // TWO PLATES ARE SCOPED BY WIDTH — the hero's foot (below 1024, where the
      // topbar is still a band rather than the 100vh hero) and the archive's
      // head (below 768, above which the stack is a two-track grid and the
      // archive is the only card spanning both, so the plate stops being a
      // region inside a column). Both undos are in app.css, and the measured
      // figures behind both widths are in the block above them.
      //
      // A HALF-UNDONE PLATE IS A CONTRAST BUG, not a layout one: leave --ink
      // declared while the background reverts and the type is Bone on Sand at
      // 1.20:1 on exactly one theme at exactly one width, which is the class of
      // defect nobody finds by looking. So the undo is asserted to name EVERY
      // token its plate declares — add a ninth token to a plate and this goes
      // red rather than the app going quietly illegible on the desktop.
      for (const [width, cls, plateName] of [
        [1024, 'hero-foot\\.counter-plate', 'counter-plate'],
        [768, 'month-block\\.reading-plate', 'reading-plate'],
      ] as Array<[number, string, string]>) {
        const body = undo(width, cls)
        expect(`${plateName} undo found: ${body !== ''}`).toBe(`${plateName} undo found: true`)
        expect(tokensOf(body).sort()).toEqual(tokensOf(plate(plateName, null)).sort())
      }
    })

    it('reverts a scoped plate with `unset`, never with a copy of the ground', () => {
      // Custom properties are INHERITED properties, so `unset` on one computes
      // to `inherit` — the element falls back to whatever the card around it
      // declares. Spelling the fallback out instead would put a second copy of
      // :root's or .spec-sheet's arithmetic in app.css, and a drifted copy is a
      // contrast bug on one branch, in one theme, at one width. This file
      // already carries the history: the collection sheet's duplicated media
      // query needed a test asserting the two bodies were character-identical,
      // and the copy going away is what actually fixed it.
      for (const [width, cls] of [
        [1024, 'hero-foot\\.counter-plate'],
        [768, 'month-block\\.reading-plate'],
      ] as Array<[number, string]>) {
        const body = undo(width, cls)
        expect(tokensOf(body).length).toBeGreaterThan(0)
        for (const token of tokensOf(body)) {
          const value = new RegExp(`${token}:\\s*([^;]+);`).exec(body)?.[1]
          expect(`${token}: ${value}`).toBe(`${token}: unset`)
        }
        expect(body).not.toMatch(/color-mix/)
        expect(body).not.toMatch(/var\(--(?:espresso|bone|sand|graphite|void|flare)\)/)
      }
    })

    it('gives the measure ladder a rung at 1400, where the stage surplus is', () => {
      // THE ONE LEVER THAT MOVES BOTH THEMES THE SAME WAY. A plate is the
      // ground's OPPOSITE, so it helps one theme and hurts the other — and both
      // 1440 app rows were over §2.1b's field tolerance at once (mean field
      // 69.04 dark, 68.22 light against 60±8, in the artifact committed at
      // dc529fb). Flare is theme-invariant, so the only symmetric give-back is
      // less bare stage. Widening the measure at the width where the surplus
      // appears took them to 65.71 and 65.02, mean-dev 18.08 -> 11.35 and
      // 16.45 -> 10.32, and cleared both breaches.
      const rung = /@media \(min-width: 1400px\) \{([\s\S]*?)\n\}/.exec(APP)?.[1] ?? ''
      expect(rung).toMatch(/\.main-stack \{ max-width: calc\(1160px \+ var\(--s3\) \* 2\); \}/)
      // The foot follows the stack at every rung, or the page abandons its own
      // measure in its last 100px.
      expect(rung).toMatch(/\.foot \{ max-width: 1160px; \}/)
      // A LADDER, NOT A SCATTER: one measure per breakpoint, each wider than the
      // last. A rung that did not grow would be a breakpoint with no reason.
      const measures = [...APP.matchAll(/\.main-stack \{[^}]*max-width: calc\((\d+)px/g)].map((m) =>
        Number(m[1]),
      )
      expect(measures).toEqual([520, 760, 1080, 1160])
      // …and nothing below 1400 moves, which is why no phone or tablet row in
      // the census changed: the rung declares a measure and nothing else.
      expect(rung).not.toMatch(/background|color|--ground|--field|padding|gap/)
    })

    it('breaks the landing’s two longest desktop grounds', () => {
      // §2.1b's window band on the poster. In the artifact committed at
      // dc529fb, landing.1440x900.*.fresh breached twice: window @900 at 81.04%
      // field (over the 80 band) and window @3873 at 10.64% Bone (under the
      // 15). Both windows had exactly one Bone-family ground in 900px.
      //
      // THE LEDE PLATE is the section's own construction, not a new one:
      // .lp-note-strip is already a Bone plate inside .lp-spec "because it is a
      // claim about the product", and the lede is the sentence the section
      // opens with. Scoped to ≥1024 because a plate is a give-back and the 375
      // rows are already in band.
      const lede =
        /@media \(min-width: 1024px\) \{\s*\.lp-spec \.lp-spec-lede \{([\s\S]*?)\n  \}/.exec(
          LANDING,
        )?.[1] ?? ''
      expect(lede).toMatch(/background: var\(--lp-counter\)/)
      expect(lede).toMatch(/color: var\(--lp-form\)/)
      expect(lede).toMatch(/border: var\(--keyline-w\) solid var\(--lp-form\)/)
      // The note strip's pair, reused rather than invented — so §2.1 rule 3 has
      // nothing new to compute.
      const strip = /\n\.lp-note-strip \{([^}]*)\}/.exec(LANDING)?.[1] ?? ''
      expect(strip).toMatch(/background: var\(--lp-counter\)/)
      expect(strip).toMatch(/color: var\(--lp-form\)/)
      // THE CLOSING PLATE takes .lp-measure's 1080, the measure every other
      // section on the poster is set to.
      expect(LANDING).toMatch(/\.lp-object-plate \{[^}]*max-width: 1080px/)
      expect(LANDING).toMatch(/\.lp-measure \{[^}]*max-width: 1080px/)
      // Both together: zero band breaches on the 1440 landing rows, and the 375
      // rows untouched (they were already clean).
    })
  })

  it('recesses the input off the card it sits in', () => {
    expect(APP).toMatch(/\.field \{[^}]*background: var\(--sunken\)/)
    // …and the placeholder takes the mix measured against THAT surface: --spec
    // is mixed toward --ground and falls to 4.02:1 on Sand.
    expect(APP).toMatch(/\.field::placeholder \{ color: var\(--spec-sunken\)/)
  })

  it('stands the foot on a plate — no sub-24px string sits on the Flare field', () => {
    // §2.1 rule 1: Flare is a field, never a text background. The foot was the
    // one run of copy directly on the page background.
    expect(APP).toMatch(/\.foot \{[^}]*background: var\(--field\)/)
  })

  it('stands the storage fault on a plate too — .main-stack paints nothing', () => {
    // The same hazard, one rule later: .persist-fault is a direct child of
    // .main-stack, which sets no background, inside .shell, which sets none
    // either — so its ground is body's --stage, and that is Flare in light.
    // 17px/700 Graphite on Flare is 3.79:1, and its Flare signal bar on a
    // Flare ground was 1:1, i.e. invisible. Dark mode looked perfect, which is
    // why it shipped. This assertion is what makes the next run of copy
    // dropped straight into the stack fail the suite instead of the audit.
    expect(APP).toMatch(/\.persist-fault \{[^}]*background: var\(--field\)/)
    expect(APP).toMatch(/\.persist-fault \{[^}]*color: var\(--ink\)/)
    // The empty region must still clip to nothing — the plate may not appear
    // while there is no fault to report.
    expect(APP).toMatch(/\.persist-fault:empty \{[^}]*position: absolute/)
    // …and it spans both tracks at ≥768px, so a fault cannot re-pair the grid.
    // ASSERTED PER SELECTOR, not as one typed run: the XP strip joined the
    // spanning set (a ~90px item packed into one track leaves a card-sized
    // hole of bare stage beside it — see the measurement beside the rule), and
    // a single literal made adding a THIRD spanning element read as a
    // regression when it is the same fix.
    const tablet = /@media \(min-width: 768px\) \{([\s\S]*?)\n\}/.exec(APP)?.[1] ?? ''
    const spanning = /\n((?:  \.[a-z-]+,\n)*  \.[a-z-]+) \{ grid-column: 1 \/ -1; \}/.exec(tablet)
    expect(spanning?.[1].split(',\n').map((l) => l.trim()).sort()).toEqual([
      '.archive-card',
      '.persist-fault',
      '.xp-strip',
    ])
  })
})

describe('§11 / §1 trait 06 — the act-now cards close at three roles + one accent', () => {
  // THE COUNT THAT WAS WRONG. LogCard painted five hues at once — Bone (.card
  // field, and the CTA's own label), Graphite (--ink and the CTA plate), Sand
  // (--sunken under .field and .note-key), Flare (the CTA keyline and the
  // .field-error bar) and Marigold (.btn-gold). SimCard was five the same way,
  // with Acid where Marigold is. §11 caps a component at three colours and §1
  // trait 06 spends them as field + form + counter, allowing a fourth only as
  // "an event"; a permanently-mounted input recess and an always-on CTA ring
  // are not events. Two rules carried the overspend and both are asserted here
  // so the tally cannot silently grow back.
  const rule = (css: string, sel: string) =>
    new RegExp(`\\n\\${sel} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''

  it('gives the primary CTA a boundary that clears 3:1 on every ground', () => {
    // THIS ASSERTION USED TO ENCODE A MEASURED DEFECT, so it is re-pointed
    // rather than deleted. It required `border-color: var(--cta-field)` and
    // explicitly forbade --cta-keyline — i.e. a Graphite plate with a Graphite
    // border. Round 4 made the ordinary card's --field Espresso, and Graphite
    // on Espresso is 1.16:1: under WCAG 1.4.11's 3:1 non-text floor, so on
    // every dark .card the primary action had NO EDGE and read as loose Bone
    // type (--cta-ink is the identical hex as --ink there). Confirmed by
    // screenshot at 375x812 dark and by a computed-style probe at 320/375/768/
    // 1024/1400/1440.
    //
    // Flare is the only palette value that clears 3:1 against all four
    // surfaces this control renders on — asserted below from the hexes rather
    // than restated, so the claim cannot drift from the palette.
    const flame = rule(TOKENS, '.btn-flame')
    expect(flame).toMatch(/border-color: var\(--cta-keyline\)/)
    expect(TOKENS).toMatch(/--cta-keyline: var\(--flare\)/)
    for (const ground of [RAW.espresso, RAW.bone, RAW.graphite]) {
      expect(`${ground}: ${contrast(RAW.flare, ground) >= 3}`).toBe(`${ground}: true`)
    }
    // …and the plate itself still fails on the dark card, which is why the
    // border had to move. This is the fact the old assertion was blind to.
    expect(contrast(RAW.graphite, RAW.espresso)).toBeLessThan(3)
    // …and Flare survives where trait 06 actually sanctions it: on hover, i.e.
    // transiently. The event, not the furniture.
    expect(TOKENS).toMatch(
      /\.btn-flame:not\(:disabled\)[^{]*hover[^{]*\{[^}]*outline-color: var\(--cta-keyline\)/,
    )
  })

  it('draws the inline validation bar in ink, and keeps Flare for faults', () => {
    // §12.8 says the message may not ride on hue — which cuts both ways. The
    // words, the role="alert" announcement and §6's 6px keyline carry it; the
    // colour was carrying the fifth hue. A form error can stand on screen for
    // as long as the field is empty, so it is furniture, not an event.
    const err = rule(APP, '.field-error')
    expect(err).toMatch(/border-left: var\(--keyline-heavy\) solid var\(--keyline\)/)
    expect(err).not.toMatch(/var\(--alert\)/)
    // The two markers that ARE faults — a dead origin and a failed export —
    // keep the Flare bar. They mark a broken machine, not a typo, and neither
    // sits inside one of the act-now cards.
    for (const sel of ['.persist-fault', '.export-note']) {
      expect(rule(APP, sel)).toMatch(/border-left: var\(--keyline-heavy\) solid var\(--alert\)/)
    }
  })
})

describe('§2 / §11 — pure white is banned, including the white nobody declared', () => {
  it('draws the impulse checkbox instead of letting the UA paint it', () => {
    // No stylesheet declares #FFFFFF, and a pixel census still sampled
    // rgb(255,255,255) on the light phone: the control kept `appearance: auto`,
    // so the UA painted the UNCHECKED box white. accent-color only reaches the
    // CHECKED fill, which is why setting it looked like a complete fix.
    const box = /\n\.impulse-check input \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(box).toMatch(/appearance: none/)
    expect(box).toMatch(/background: var\(--field\)/)
    expect(box).toMatch(/border: var\(--keyline-w\) solid var\(--keyline\)/)
    // accent-color styles nothing once appearance is none; leaving it would
    // imply the UA still paints part of this control.
    expect(box).not.toMatch(/accent-color/)
    // The FILL is the primary state signal, so the control keeps its state even
    // where ::before on a checkbox is unsupported.
    expect(APP).toMatch(/\.impulse-check input:checked \{[^}]*background: var\(--ink\)/)
    // …and forced-colours mode hands the native control back rather than
    // stranding an unpainted outline.
    expect(APP).toMatch(/forced-colors: active\) \{\s*\.impulse-check input \{[^}]*appearance: auto/)
  })

  it('declares no hex outside the raw palette block in any stylesheet', () => {
    // The palette is 12 hexes and they live in one place (see the tokens.css
    // header). This is the standing guard that made the checkbox's white the
    // interesting case: it could only get on screen because it was never
    // written down.
    const raw = /--flare: #f93e06;[\s\S]*?--moss: #3a4a2a;/.exec(TOKENS)?.[0] ?? ''
    expect(raw).not.toBe('')
    for (const [name, css] of [
      ['tokens', TOKENS.replace(raw, '')], ['app', APP], ['landing', LANDING],
    ] as const) {
      expect(`${name}: ${css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []}`).toBe(`${name}: `)
    }
  })
})

describe('§9 — reduced motion drops the transform and keeps the state change', () => {
  it('neutralises THE PRESS through the token, not by killing transforms wholesale', () => {
    // A blanket `transform: none` would fling .toast and .hero-nav off-screen
    // (both centre with translateX(-50%)), so the press rides on one token the
    // reduced-motion block zeroes.
    const reduce = /prefers-reduced-motion: reduce\) \{\s*:root \{([\s\S]*?)\n  \}/
      .exec(TOKENS)?.[1] ?? ''
    expect(reduce).toMatch(/--press: none/)
    expect(TOKENS).toMatch(/\.btn:not\(:disabled\):active \{[^}]*transform: var\(--press\)/)
  })

  it('leaves every pressed control still visibly changing at rest', () => {
    // §9: nothing may become invisible or unreachable under reduced motion.
    // With --press zeroed, the radius half of the move (28 -> 12) is what
    // carries the whole affordance — so it must not itself be a transform.
    expect(TOKENS).toMatch(/\.btn:not\(:disabled\):active \{[^}]*border-radius: var\(--r-sm\)/)
  })
})

describe('§2.1 — the note keys sit on a measured pair', () => {
  it('recesses the pad onto --sunken rather than the Flare field', () => {
    // The keys are 13px numerals. Graphite on Flare is 3.79:1 — legal for
    // display type, illegal here — so the pad takes the input's own recessed
    // surface, where --ink measures 9.4:1 light / 13.4:1 dark.
    const key = /\n\.note-key \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(key).toMatch(/background: var\(--sunken\)/)
    expect(key).not.toMatch(/var\(--(stage|flare|cta-field)\)/)
  })

  it('keeps every note key on the 48px target floor with its focus ring intact', () => {
    // §11: touch targets stay >=48px regardless of visual density, and §12.8
    // keeps focus visible. The keys inherit both from .btn — so what can
    // regress is a component rule overriding them back down.
    expect(TOKENS).toMatch(/\.btn \{[^}]*min-height: 48px/)
    for (const sel of ['note-key', 'note-clear']) {
      const body = new RegExp(`\\n\\.${sel} \\{([^}]*)\\}`).exec(APP)?.[1] ?? ''
      expect(body).not.toMatch(/min-height|outline: none/)
    }
  })

  it('marks every inert control with a measured pair, never an opacity dim', () => {
    // Declared on the SHARED class, not per-control. Every inert control in
    // the app uses aria-disabled plus an onClick guard (the `disabled`
    // attribute drops keyboard focus to <body> under the user's own finger),
    // so :disabled never matches — and while this lived on .note-clear alone,
    // LessonCard's "Collected" button kept its live Marigold plate, the
    // pointer cursor, the hover contour and THE PRESS while granting nothing.
    const inert = /\.btn:disabled,\n\.btn\[aria-disabled='true'\] \{([^}]*)\}/.exec(TOKENS)?.[1] ?? ''
    expect(inert).toMatch(/color: var\(--spec-sunken\)/)
    expect(inert).toMatch(/border-style: dashed/)
    expect(inert).not.toMatch(/opacity/)
    // THE PRESS is an affordance and an inert control has nothing to afford.
    expect(TOKENS).toMatch(/\.btn\[aria-disabled='true'\]:active \{[^}]*transform: none/)
    // …and neither is the hover contour: EVERY shared hover rule excludes it,
    // enumerated rather than spot-checked so a third one cannot slip in.
    const hovers = [...TOKENS.matchAll(/^\.btn[^\n{]*:hover[^\n{]*\{/gm)].map((m) => m[0])
    expect(hovers.length).toBeGreaterThanOrEqual(2)
    for (const rule of hovers) expect(rule).toContain(":not([aria-disabled='true'])")
  })
})

describe('§12.8 / Trust Rule 1 — the month strip states, it does not judge', () => {
  it('draws the bars in ink, never in an accent', () => {
    // --reward is the engagement track's colour and --data the financial
    // one's: a month drawn in --reward would put XP's hue on money (Trust
    // Rule 1, drawn in colour), and one drawn in --data would read as a
    // verdict the card explicitly does not pass — the same argument
    // .day-total makes in the ledger.
    const bar = /\n\.month-bar \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(bar).toMatch(/background: var\(--ink\)/)
    expect(bar).not.toMatch(/var\(--(reward|data|alert|stage)\)/)
  })

  it('separates "no record" from "a real zero" by border STYLE, not by hue', () => {
    // WCAG 1.4.1 and §12.8: the distinction that stops the card lying about
    // the user on install day may not ride on colour alone. Solid ink under
    // the days Ember has records for, dashed quiet rule under the blanks.
    expect(APP).toMatch(
      /\.month-cell\.is-recorded \{[^}]*border-bottom: var\(--keyline-w\) solid var\(--keyline\)/,
    )
    expect(APP).toMatch(/\.month-cell\.is-no-record,\n\.month-cell\.is-ahead \{[^}]*dashed/)
  })

  it('cuts the macro-break above the card that OPENS the archive', () => {
    // A WHOLE STEP of the scale between the act-now half of the stack and the
    // read-only half, and the arithmetic is `stack gap + this margin`. It rides
    // on the ARCHIVE card, which now holds the month figures and the days
    // together — so there is no longer a seam inside the archive for the page's
    // loudest gap to fall into.
    // TWO VALUES, because the stack gap has two: the phone runs --s4 between
    // cards (CONSTRAINT §2.1b — see .main-stack) and from 768px up it runs
    // --s3. --s4 + --s5 = --s6 and --s3 + --s4 = --s5, so the break is a step
    // of §6's scale at both widths rather than a number that happens to be big.
    expect(APP).toMatch(/\n\.archive-card \{ margin-top: var\(--s5\); \}/)
    expect(APP).toMatch(/\n  \.archive-card \{ margin-top: var\(--s4\); \}/)
    expect(APP).not.toMatch(/\.ledger-card \{ margin-top/)
    expect(APP).not.toMatch(/\.month-card \{ margin-top/)
  })
})

describe('§2.2 — the product shot is themed, not pinned', () => {
  it('hands the shot back the app ink the poster section would otherwise impose', () => {
    // The landing pins its foregrounds because it is a poster (see the header
    // of landing.css). The shot is a specimen OF the themed app standing on
    // that poster: .lp-spec's Bone would inherit straight through tokens.css's
    // .card, which sets a background and no colour — Bone type on the Bone
    // light-theme card. Invisible in light, perfect on a dark dev machine.
    const frame = /\n\.lp-shot-frame \{([^}]*)\}/.exec(LANDING)?.[1] ?? ''
    expect(frame).toMatch(/color: var\(--ink\)/)
  })

  it('drops the macro-break the archive card carries in the app', () => {
    // The frame keeps the app's own stack rhythm (flex + the --s3 gap) so a
    // second card added to the shot could never butt against the first. And the
    // --s4 macro-break .archive-card carries in the app opens the ARCHIVE half
    // of that stack; there is no such split inside a figure, so it would print
    // as a hanging gap above the shot.
    const frame = /\n\.lp-shot-frame \{([^}]*)\}/.exec(LANDING)?.[1] ?? ''
    expect(frame).toMatch(/display: flex/)
    expect(frame).toMatch(/gap: var\(--s3\)/)
    expect(LANDING).toMatch(/\.lp-shot-frame \.archive-card \{ margin-top: 0; \}/)
  })

  it('repaints nothing inside the card — a restyled shot is not a shot', () => {
    /**
     * DESCENDANTS ONLY, AND THAT IS A CORRECTION TO THE PATTERN, NOT A RELAXING
     * OF THE RULE. It read `\.lp-shot-frame [^{]*\{`, and `[^{]*` matches the
     * empty string — so `.lp-shot-frame {` matched too and every property on
     * the MOUNT was checked as though it had been painted onto the card. The
     * subject of this rule is the card, so the pattern now requires a
     * descendant selector, and the set of banned properties gains `color`:
     * repainting the shot's ink is exactly as much of a lie about the product
     * as repainting its fill, and the old pattern did not ban it.
     * The mount's own paint is the next case down, where it can be stated
     * precisely instead of by accident.
     */
    const inside = [...LANDING.matchAll(/\.lp-shot-frame\s+\.[^{]*\{([^}]*)\}/g)].map((m) => m[1])
    // Non-empty, or this is asserting over nothing.
    expect(inside.length).toBeGreaterThan(0)
    for (const body of inside) expect(body).not.toMatch(/background|border|color|font-size/)
  })

  it('mounts the shot on paper without drawing a second edge around the card', () => {
    /**
     * THE MOUNT MAY PAINT; THE CARD MAY NOT BE PAINTED. The frame carries a
     * Bone mat (see landing.css) because the card is the one unpinned element
     * on this poster — its plates are Bone in light and Espresso in dark, so
     * the window over the shot (landing.375x812 @1624, in the artifact at
     * commit 80f643d) measured 78.13% field / 14.50% Bone in dark against
     * 45.87 / 45.47 in light, which §2.1b calls one defect seen twice.
     * The mat is a ground the two themes share, and it is the page's paper
     * rather than the card's fill.
     *
     * WHAT IT MAY NOT DO. A `border` on the mount would be a third contour
     * 16px outside a card that already carries §11's 2px keyline and §1 trait
     * 05's second contour — a frame the product does not have. A `font-size`
     * would resize type that belongs to the app. And the mat is paid for out
     * of the section gutter on the phone (margin-inline), never out of the
     * specimen's width: a card narrower than the narrowest phone is not "the
     * card anyone will use".
     */
    const frame = /\n\.lp-shot-frame \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    expect(frame).toMatch(/background: var\(--lp-counter\)/)
    expect(frame).toMatch(/padding: var\(--s2\)/)
    expect(frame).not.toMatch(/border:/)
    expect(frame).not.toMatch(/font-size/)
    // The gutter give-back, phone-scoped, and paint-free.
    const bleed = /@media \(max-width: 719px\) \{\s*\.lp-shot-frame \{([^}]*)\}/.exec(LANDING)?.[1] ?? ''
    expect(bleed).toMatch(/margin-inline: calc\(-1 \* var\(--s3\)\)/)
    expect(bleed).not.toMatch(/background|border|color|font-size/)
  })
})

describe('§4 — the wordmark is a brick, not a justified line', () => {
  it('stacks the rows flush in both stylesheets', () => {
    // `justify-content: space-between` on rows of 3 and 2 letters dumps all
    // the slack into ER's single gap: the page h1 rendered as `EMB` / `E   R`.
    for (const css of [APP, LANDING]) {
      const rows = [...css.matchAll(/\.wm-row \{([^}]*)\}/g)].map((m) => m[1])
      expect(rows.length).toBeGreaterThan(0)
      for (const body of rows) expect(body).not.toContain('space-between')
    }
  })
})

describe('§5 — the layout breaks where the devices are', () => {
  it('gives 521–1023px a real breakpoint instead of a marooned phone column', () => {
    expect(APP).toMatch(/@media \(min-width: 768px\)/)
  })

  it('never re-introduces a max-width on the shell that would stop the field bleeding', () => {
    const shell = /\n\.shell \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(shell).not.toContain('max-width')
  })
})

describe('§1 trait 05 — every container carries the second contour', () => {
  const ring = () => /\n\.card::before \{([\s\S]*?)\n\}/.exec(TOKENS)?.[1] ?? ''
  const card = () => /\n\.card \{([\s\S]*?)\n\}/.exec(TOKENS)?.[1] ?? ''

  it('rings the card with a 2nd contour offset from the field', () => {
    // Trait 05 verbatim: "Marks are ringed by a 2nd contour that OFFSETS them
    // from the field." It is one of the ten immutable traits and it was drawn
    // nowhere — every container in the app carried exactly one border, which is
    // the trait's first half and none of its second.
    const r = ring()
    expect(r).toMatch(/content: ''/)
    expect(r).toMatch(/position: absolute/)
    expect(r).toMatch(/border: var\(--keyline-w\) solid var\(--keyline\)/)
    // A decorative ring must never eat a tap on the card under it.
    expect(r).toMatch(/pointer-events: none/)
    // Same n=4.2 curve as the container, with the keyword line first as the
    // guaranteed fallback — the pattern .card itself uses.
    expect(r).toMatch(/corner-shape: squircle;[\s\S]*corner-shape: superellipse\(2\.07\)/)
  })

  it('draws it INSIDE, so it spends the bucket that has a surplus', () => {
    // Outside, the ring eats the Flare stage: it trades one under-budget
    // bucket (field, 53.5% against §2's 60% floor on the 375px phone) for
    // another (ink, 4.3% against 8%) and nets zero. Inside, it eats card
    // interior. Shot both ways, same seed, 375x812 light: 60.5/33.5/3.7/2.2
    // without the ring, 59.7/33.7/4.3/2.3 with — deviation 8.5 -> 8.0, and
    // -3.0 on the dark phone. `inset` is what makes it inside.
    expect(ring()).toMatch(/inset: calc\(var\(--keyline-w\) \* 2\)/)
  })

  it('keeps the contour visible where an in-flow plate crosses it', () => {
    // PAINT ORDER, not colour: .card::before is positioned and .window-bar is
    // an in-flow div, so the ring painted OVER the simulator's bar in
    // --keyline — which is --ink, which is the bar's own fill. The top edge and
    // the upper flanks of the ring simply disappeared. The bar takes the stack
    // and redraws the missing run in its counter (11.44:1 light / 13.32:1
    // dark), so the contour stays continuous across the plate.
    const bar = /\n\.window-bar \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(bar).toMatch(/position: relative/)
    expect(bar).toMatch(/z-index: 1/)
    expect(bar).toMatch(/border-bottom: var\(--keyline-w\) solid var\(--counter\)/)
  })

  it('keeps §5’s "always 2px" border and derives every length from a token', () => {
    // §5 and §11 BOTH say "2px solid graphite. Always 2px. Never 1px", so the
    // fix for a starved ink budget may not be to fatten the keyline to §6's
    // border.keyline: 6. Two 2px strokes, not one 6px one — and the card's own
    // border is still the first of them.
    expect(card()).toMatch(/border: var\(--keyline-w\) solid var\(--keyline\)/)
    expect(TOKENS).toMatch(/--keyline-w: 2px/)
    expect(card()).not.toMatch(/keyline-heavy/)
    expect(ring()).not.toMatch(/keyline-heavy/)
    // The offset is two keyline widths and the inner radius is the outer one
    // less that offset — which is what makes the two rings concentric instead
    // of converging at the corners. Neither is a new value beside the token
    // set (§5: "4 / 12 / 28 / 999. Nothing between"); both are derived from it,
    // the way the chip family writes its sub-8px padding as calc(--s1 / 2).
    expect(ring()).toMatch(
      /border-radius: calc\(var\(--r-lg\) - var\(--keyline-w\) \* 2\)/,
    )
    // No literal px anywhere in the rule: a hard-coded 4px/24px here is exactly
    // how the derivation silently decouples from --keyline-w.
    expect(ring()).not.toMatch(/\d+px/)
  })
})

describe('Trust Rule 8 — the focus ring is a mechanism, not a default', () => {
  it('declares one 3px ring and suppresses it in no stylesheet', () => {
    // The a11y sweep measured a `solid 3px rgb(42,45,44)` outline on EVERY
    // tab stop on both surfaces. That result only holds while this one rule
    // exists and nothing anywhere cancels it — and the app now hands focus to
    // five script-focusable <section> jump targets that have no ring of their
    // own to fall back on.
    expect(TOKENS).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/)
    expect(LANDING).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/)
    for (const [name, css] of [
      ['tokens.css', TOKENS],
      ['app.css', APP],
      ['landing.css', LANDING],
    ] as const) {
      // `outline: none` / `outline: 0` is the one line that makes every
      // keyboard stop in a stylesheet invisible at once. There is no legal
      // use of it here: an element that must not show a ring should not be
      // focusable, and §11 already forbids the box-shadow substitute.
      expect(css, name).not.toMatch(/outline\s*:\s*(none|0)\b/)
    }
  })

  /**
   * The other half of Trust Rule 8's "live regions stay mounted", and until
   * now it lived only in prose.
   *
   * App, LogCard, LessonCard, SimCard, ProfileCard and ArchiveCard between
   * them mount eleven permanently-present announcement surfaces, every one of
   * them empty at boot. Mounting is not enough: a region hidden with `display: none` or
   * `visibility: hidden` is removed from the accessibility tree, so its
   * reappearance with text reads as a brand-new region and VoiceOver (and
   * sometimes NVDA) skip the announcement entirely. That is the exact failure
   * the mounted-empty pattern exists to prevent, re-introduced from the
   * stylesheet. Three rules carry the whole mechanism — .sr-only, which nine
   * of the eleven use, plus the two in-flow regions that hide themselves while
   * empty — and each one is a single line away from silencing the app.
   *
   * The rationale is written at all three rules in app.css. This is the test
   * that makes the rationale enforceable.
   */
  it('hides an announcement surface by geometry, never by removing it from the tree', () => {
    const HIDDEN_FROM_AT = /(display\s*:\s*none|visibility\s*:\s*hidden|content-visibility\s*:\s*hidden)/
    const rule = (selector: string): string => {
      const m = new RegExp(`(?:^|\\n)${selector.replace(/[.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(APP)
      // The selector itself is part of the assertion: a rename that drops one
      // of these rules must fail here rather than pass by finding nothing.
      expect(m, `${selector} is missing from app.css`).not.toBeNull()
      return m![1]
    }
    // The shared visually-hidden class. Clip pattern, and every one of its
    // declarations is geometry — the region stays laid out at 1x1px and stays
    // in the tree.
    const srOnly = rule('.sr-only')
    expect(srOnly).not.toMatch(HIDDEN_FROM_AT)
    expect(srOnly).toMatch(/position:\s*absolute/)
    expect(srOnly).toMatch(/clip:\s*rect\(/)
    expect(srOnly).toMatch(/overflow:\s*hidden/)
    // The storage fault: in flow and visible when it has something to say,
    // taken out of flow by the same clip pattern when it does not.
    const fault = rule('.persist-fault:empty')
    expect(fault).not.toMatch(HIDDEN_FROM_AT)
    expect(fault).toMatch(/clip:\s*rect\(/)
    // The toast banner fades with opacity for the same reason — never
    // display/visibility, which would drop the empty banner from the tree
    // between messages.
    const toast = rule('.toast:empty')
    expect(toast).not.toMatch(HIDDEN_FROM_AT)
    expect(toast).toMatch(/opacity:\s*0/)
  })

  it('re-colours the ring on the landing’s one Espresso jump target', () => {
    // The page-wide ring is pinned to --lp-form (Graphite) because every
    // focusable thing on the landing sits on Bone or Marigold — except the
    // section that IS the jump target. `<section id="spec" tabIndex={-1}>` is
    // the Espresso field, where Graphite computes to 1.16:1, and because the
    // section is full-bleed the ring's left and right segments fall
    // off-viewport: the only visible parts were two horizontal lines beside the
    // section's own 2px Graphite borders. Bone is 13.3:1, and the negative
    // offset keeps the ring inside the section so it cannot be mistaken for
    // one of those borders.
    const spec = /\n\.lp-spec:focus-visible \{([^}]*)\}/.exec(LANDING)?.[1] ?? ''
    expect(spec).toMatch(/outline-color: var\(--lp-counter\)/)
    expect(spec).toMatch(/outline-offset: -6px/)
  })
})

describe('WCAG 1.4.10 — the poster reflows at the 320px floor it claims', () => {
  it('lets every auto-fit/auto-fill track shrink below its own minimum', () => {
    // `minmax(296px, 1fr)` cannot shrink under 296px. .lp-measure inside
    // .lp-spec's `var(--s5) var(--s3)` padding is 272px at a 320px viewport, so
    // the mechanics grid overflowed by 24px — and .lp-spec is the one landing
    // section without overflow:hidden, so the whole DOCUMENT scrolled sideways
    // for every viewport at or under 343px. min(track, 100%) clamps the floor to
    // the container and is a no-op above that, so the column-count derivation
    // the rule's own comment makes is untouched.
    for (const [name, css] of [
      ['landing.css', LANDING],
      ['app.css', APP],
    ] as const) {
      for (const m of css.matchAll(/repeat\(auto-(?:fit|fill),\s*minmax\(([^,]+),/g)) {
        expect(`${name}: ${m[1].trim()}`).toMatch(/^[^:]+: min\(/)
      }
    }
  })
})

/**
 * §2.1 rule 3 — "Every new foreground/field pair must be checked before it
 * ships. If it is not in the table above, compute it."
 *
 * The stylesheets record those computations in comments, which made the
 * comments the compliance record — and an audit found six of them naming a
 * surface the app no longer paints (Graphite where the dark block now says
 * Espresso) or simply overstating the ratio. A comment cannot fail a build, so
 * the arithmetic moves here: the mixes are parsed out of tokens.css itself and
 * the ratios recomputed, which is the only form in which "8.9:1" is evidence
 * rather than an assertion.
 *
 * Pure sRGB WCAG 2.x, and pure functions only — no dependency, no browser.
 */
const RAW: Record<string, string> = Object.fromEntries(
  [...TOKENS.matchAll(/--([a-z]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
)

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}
function relLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** color-mix(in srgb, A p%, B) — gamma-encoded channel-wise, as CSS specifies
    for the srgb colour space. Used to resolve --spec / --spec-sunken, which
    are the only derived colours in the token graph. */
function mix(a: string, p: number, b: string): string {
  const A = rgb(a)
  const B = rgb(b)
  return (
    '#' +
    A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, '0')).join('')
  )
}
const round = (n: number) => Math.round(n * 100) / 100

describe('§2.1 rule 3 — every pair on a surface is computed, not asserted', () => {
  it('reads the raw palette out of tokens.css rather than restating it', () => {
    // If the parse ever returns nothing, every case below would silently pass.
    expect(RAW.flare).toBe('#f93e06')
    expect(RAW.graphite).toBe('#2a2d2c')
    expect(RAW.bone).toBe('#f5e6e0')
    expect(RAW.espresso).toBe('#2a1e18')
    expect(RAW.sand).toBe('#dfd5bc')
  })

  it('reproduces the §2.1 table the design system ships', () => {
    // The instrument is checked against the binding document before it is used
    // as evidence for anything else. Exact values, with the table's own printed
    // figure beside each. They agree on the verdicts, which is what §2.1 is
    // for, and differ in the last digit on four rows — the table is rounded and
    // in two places conservative. Where a stylesheet comment cites the TABLE
    // (13.4, 6.2, 9.7) it is quoting the binding document, not this file; where
    // it records a pair the table does not list, it must match what is computed
    // here.
    expect(round(contrast(RAW.graphite, RAW.flare))).toBe(3.79) // table: 3.79
    expect(round(contrast(RAW.bone, RAW.flare))).toBe(3.02) // table: 3.01
    expect(round(contrast(RAW.graphite, RAW.bone))).toBe(11.44) // table: 11.4
    expect(round(contrast(RAW.bone, RAW.espresso))).toBe(13.32) // table: 13.4
    expect(round(contrast(RAW.graphite, RAW.marigold))).toBe(6.38) // table: 6.2
    expect(round(contrast(RAW.graphite, RAW.acid))).toBe(11.15) // table: 9.7
  })

  it('holds the quiet register above the 4.5:1 body floor on every ground', () => {
    // --spec is mixed toward --ground, so it has to be recomputed per theme
    // AND per surface. The figure that mattered: on the .spec-sheet the mix is
    // Bone-toward-Espresso, and the comment claimed 8.9:1 where it is 7.19.
    const specLight = mix(RAW.graphite, 0.7, RAW.bone)
    const specDark = mix(RAW.bone, 0.7, RAW.espresso)
    expect(specLight).toBe('#676562')
    expect(specDark).toBe('#b8aaa4')
    expect(round(contrast(specLight, RAW.bone))).toBe(4.78)
    expect(round(contrast(specDark, RAW.espresso))).toBe(7.19)
    // …and the reason --spec-sunken exists: --spec on the Sand recess is under
    // the floor, so a quiet string there must take the deeper mix.
    expect(contrast(specLight, RAW.sand)).toBeLessThan(4.5)
    const sunkLight = mix(RAW.graphite, 0.8, RAW.bone)
    const sunkDark = mix(RAW.bone, 0.8, RAW.espresso)
    expect(round(contrast(sunkLight, RAW.sand))).toBe(5.35)
    // The dark recess is Void, not Graphite (see the dark block in tokens.css:
    // Graphite is LIGHTER than the Espresso card, so it drew every recess as a
    // raised plate). The pair got wider in the swap, not narrower.
    expect(round(contrast(sunkDark, RAW.void))).toBe(10.31)
    expect(round(contrast(RAW.bone, RAW.void))).toBe(15.32)
    expect(round(contrast(sunkDark, RAW.espresso))).toBe(8.96)
  })

  it('holds the dark counter sheet above the body floor on its deeper mixes', () => {
    // Sand has less headroom than Bone, and the failure mode is silent: copying
    // .spec-sheet's own 70/80 mixes onto this ground computes to #605F57 at
    // 4.40:1 — under §2.1's 4.5:1 body-text floor, on the two cards that carry
    // the ledger's every row. 80/88 is what clears it.
    const specSand70 = mix(RAW.graphite, 0.7, RAW.sand)
    expect(specSand70).toBe('#605f57')
    expect(contrast(specSand70, RAW.sand)).toBeLessThan(4.5)
    const specSand = mix(RAW.graphite, 0.8, RAW.sand)
    const sunkSand = mix(RAW.graphite, 0.88, RAW.sand)
    expect(specSand).toBe('#4e4f49')
    expect(round(contrast(specSand, RAW.sand))).toBe(5.67)
    expect(round(contrast(sunkSand, RAW.sand))).toBe(7.04)
    // The card's own ink, and the offset that is the point of the whole rule:
    // Sand sheet against the Espresso card above it, where dark used to have
    // 1.00:1 across a third of the page.
    expect(round(contrast(RAW.graphite, RAW.sand))).toBe(9.52)
    expect(round(contrast(RAW.sand, RAW.espresso))).toBe(11.09)
    // Its Graphite keyline on the Flare stage clears the 3:1 non-text floor —
    // which is what delimits the card, since the Sand FIELD on Flare is 2.51:1,
    // the same shape of argument as light's 3.02:1 Bone card.
    expect(round(contrast(RAW.graphite, RAW.flare))).toBe(3.79)
    expect(contrast(RAW.sand, RAW.flare)).toBeLessThan(3)
    // …and why the rule stops at two cards: the accent marks the other sheet
    // cards carry cannot stand on Sand.
    expect(round(contrast(RAW.marigold, RAW.sand))).toBe(1.49) // .xp-fill
    expect(round(contrast(RAW.flare, RAW.sand))).toBe(2.51) // .boss-fill, .export-note
    expect(contrast(RAW.marigold, RAW.espresso)).toBeGreaterThanOrEqual(3)
    expect(contrast(RAW.flare, RAW.espresso)).toBeGreaterThanOrEqual(3)
    // The ledger's one accent survives the move because its EDGE swaps halves:
    // on Espresso the Acid fill carries it and the Bone ring is 1.03:1; on Sand
    // the fill is 1.17:1 and the Graphite ring carries it. One of the two is
    // always over 3:1, which is the test .ach-medal fails and this passes.
    expect(contrast(RAW.acid, RAW.espresso)).toBeGreaterThanOrEqual(3)
    expect(contrast(RAW.acid, RAW.sand)).toBeLessThan(3)
    // …and the third ground an Acid mark can land on, which had no row here at
    // all until .sim-result's bare keyline was measured at 1.03:1 on it. A
    // missing row is how an unchecked pair ships: the block asserted acid on
    // Espresso and acid on Sand and said nothing about the light card's Bone.
    expect(round(contrast(RAW.acid, RAW.bone))).toBe(1.03)
    expect(round(contrast(RAW.graphite, RAW.sand))).toBe(9.52)
    expect(round(contrast(RAW.graphite, RAW.acid))).toBe(11.15)
  })

  it('keeps every surface offset and signal bar over the 3:1 non-text floor', () => {
    // The stage against the card it holds, in both themes — this is the offset
    // the --stage split was introduced to create, and the number the dark block
    // cites as its justification.
    expect(round(contrast(RAW.flare, RAW.bone))).toBe(3.02)
    expect(round(contrast(RAW.flare, RAW.espresso))).toBe(4.41)
    // .persist-fault / .field-error / .export-note: a Flare bar on the plate.
    for (const field of [RAW.bone, RAW.espresso]) {
      expect(contrast(RAW.alert ?? RAW.flare, field)).toBeGreaterThanOrEqual(3)
    }
  })

  it('measures the .spec-sheet pairs the sheet’s own comment records', () => {
    // The sheet re-roles field to Espresso and ink to Bone, and every earned
    // tile is now that pair inverted (Bone plate, Espresso ink) rather than an
    // accent — see .codex-tile. Both directions are the same ratio.
    expect(round(contrast(RAW.bone, RAW.espresso))).toBe(13.32)
    expect(round(contrast(RAW.espresso, RAW.bone))).toBe(13.32)
    // The sheet's Bone keyline against the Flare stage it stands on.
    expect(contrast(RAW.bone, RAW.flare)).toBeGreaterThanOrEqual(3)
  })

  it('pins the two pairs the comments got wrong, so they cannot come back', () => {
    // Round 5 recomputed every ratio it was about to quote and found two that
    // the tree had been repeating without checking:
    //   Graphite on Espresso — written 1.09:1 in tokens.css (three places) and
    //     App.test.tsx, and 1.16:1 in landing.css and design.test.ts. The same
    //     pair, two values, both load-bearing: it is the reason ink cannot be
    //     drawn on the sheet, which is the reason the ink budget and the field
    //     budget cannot both be met (see §2.1b).
    //   Sand on Bone — 1.20:1, and the light counter sheet's whole argument is
    //     that its Graphite keyline delimits it because its fill does not.
    // The overclaim guard below could never catch either: both are UNDER the
    // ceiling. Under-claims are the more dangerous kind, because a comment that
    // understates a ratio makes a rule look more necessary than it is.
    expect(round(contrast(RAW.graphite, RAW.espresso))).toBe(1.16)
    expect(round(contrast(RAW.sand, RAW.bone))).toBe(1.2)
    const sheets = [
      ['tokens.css', readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')],
      ['landing.css', readFileSync(new URL('./landing.css', import.meta.url), 'utf8')],
      ['app.css', readFileSync(new URL('./app.css', import.meta.url), 'utf8')],
    ] as const
    // THE WRONG FIGURE, MATCHED AS A FIGURE. This was `css.includes('1.09:1')`,
    // a substring test, so it also banned the tail of 11.09:1 — Sand on
    // Espresso, a real measured pair asserted twenty lines above — and the
    // sheets had been quietly writing "11.1:1" to get round it. A guard that
    // makes correct prose imprecise is a guard that will be worked around
    // rather than obeyed. The boundary is the whole change: in "11.09:1" the
    // character before the match is a digit, so \b does not open there.
    const WRONG_PAIR = /\b1\.09:1\b/
    expect(WRONG_PAIR.test('Graphite on Espresso is 1.09:1')).toBe(true)
    expect(WRONG_PAIR.test('Sand on Espresso is 11.09:1')).toBe(false)
    for (const [name, css] of sheets) {
      expect(`${name}: ${WRONG_PAIR.test(css) ? 'still says 1.09:1' : 'clean'}`).toBe(
        `${name}: clean`,
      )
    }
  })

  it('leaves no stylesheet comment claiming a ratio the palette cannot produce', () => {
    // Not every figure in the comments is machine-checkable — some name a pair
    // in prose — but a ratio over the palette's own maximum is always wrong.
    // This is the cheap standing guard against the next "13.9:1" typed into a
    // rationale. The 0.1 slack is the design system's own rounding: §2.1's table
    // prints Bone/Espresso as 13.4:1 where it computes to 13.32, and the
    // comments follow the binding table.
    //
    // The bound is COMPUTED over every pair rather than pinned to one. It used
    // to be hard-coded as Bone-on-Espresso, which stopped being the widest pair
    // the moment the dark recess moved to Void: Bone on Void is 15.32:1 and it
    // is a shipped, load-bearing pair (see --sunken in the dark block). Deriving
    // it means the bound tracks the palette instead of a snapshot of it — and
    // the pair that sets it is pinned below, so the ceiling cannot drift upward
    // unnoticed.
    let widest = 0
    let widestPair = ''
    for (const [an, a] of Object.entries(RAW)) {
      for (const [bn, b] of Object.entries(RAW)) {
        if (contrast(a, b) > widest) {
          widest = contrast(a, b)
          widestPair = `${an}/${bn}`
        }
      }
    }
    expect(widestPair).toBe('bone/void')
    expect(round(widest)).toBe(15.32)
    const max = widest + 0.1
    const raw = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
    const app = readFileSync(new URL('./app.css', import.meta.url), 'utf8')
    const landing = readFileSync(new URL('./landing.css', import.meta.url), 'utf8')
    const overclaims: string[] = []
    for (const [name, css] of [['tokens', raw], ['app', app], ['landing', landing]] as const) {
      for (const m of css.matchAll(/(\d+(?:\.\d+)?):1\b/g)) {
        if (Number(m[1]) > max) overclaims.push(`${name}: ${m[0]}`)
      }
    }
    expect(overclaims).toEqual([])
  })
})

/**
 * ROUND 5's STRUCTURAL FIX, HALF TWO.
 *
 * Half one is the census itself (scripts/census/, docs/brand/census.json) and
 * the staleness hash that fails the suite when the artifact stops describing
 * the tree. This is the other half, and it exists because the artifact cannot
 * defend the PROSE: rounds 3 and 4 both published a pixel vector that had
 * outlived the tree it described, and round 5 found two of them still sitting
 * in tokens.css — one 150 lines above the rule that had invalidated it, in the
 * same file. An undated number is the defect. So a number without a stated
 * provenance is now a test failure.
 */
describe('no pixel figure anywhere in the tree may be undated', () => {
  /**
   * THE GUARD COULD NOT SEE THE ROUND IT WAS WRITTEN FOR, and both halves of
   * that miss are fixed here.
   *
   * SHAPE (PATTERN SPECIMEN — the figures below are forms, not readings).
   * `VECTOR` matched only the FOUR-part composition vector
   * (`59.7/33.7/4.3/2.3`). §2.1b's window law is written as TWO-part
   * field/Bone pairs and as arrow deltas, so `82.42 / 14.15`,
   * `70.70% field -> 80.91` and `61.04 / 32.50` — every measurement round 6
   * produced — were invisible to it while the suite stayed green.
   *
   * REACH. It scanned three stylesheets. The figures had spread into .tsx
   * components, test files, the census tool and DESIGN-SYSTEM.md itself, and
   * §2.1b binds all of them: "any figure quoted about this product's pixels
   * comes from that file or says which tree it came from."
   */
  /** PATTERN SPECIMEN — the composition vector: `59.7/33.7/4.3/2.3`, spaces optional. */
  const QUAD = String.raw`\d{1,3}\.\d\s*\/\s*\d{1,3}\.\d\s*\/\s*\d{1,3}\.\d\s*\/\s*\d{1,3}\.\d`
  /** PATTERN SPECIMEN — §2.1b's window reading: `82.42 / 14.15`, `78.13% field / 14.50`. */
  const PAIR = String.raw`\d{1,3}\.\d{1,2}\s*%?\s*(?:field)?\s*\/\s*\d{1,3}\.\d{1,2}`
  /** PATTERN SPECIMEN — a before/after delta: `67.99 -> 68.39`, `70.70% field -> 80.91`. */
  const ARROW = String.raw`\d{1,3}\.\d{1,2}\s*(?:%|pp)?\s*(?:field|Bone)?\s*->\s*\d{1,3}\.\d{1,2}`
  const VECTOR = new RegExp(`${QUAD}|${PAIR}|${ARROW}`, 'g')

  /**
   * A measurement, not any two numbers with a slash between them.
   *
   * THE GATE IS WHAT KEEPS THE GUARD HONEST. Without it the same patterns
   * catch contrast ratios (`3.79 / 3.01`) and superellipse exponents
   * (`4.2 -> 2.8`), and a guard that demands a census stamp on a geometry
   * constant teaches the next round to work around it. A pixel claim always
   * names its subject: a census row id, the artifact, a bucket, or a window.
   */
  const MEASUREMENT = new RegExp(
    [
      String.raw`\b(?:app|landing)\.\d{3,4}x\d{3,4}\.(?:light|dark)\.(?:seeded|fresh|cold)\b`,
      String.raw`census\.json`,
      String.raw`%\s*field`,
      String.raw`mean field`,
      String.raw`window @`,
      String.raw`meanDeviation`,
      String.raw`scrollingForm`,
      String.raw`mean-of-windows`,
    ].join('|'),
  )

  /**
   * Provenance, in either of the two forms §2.1b names: "quote the row id, or
   * stamp the tree."
   *
   * THE INLINE STAMP IS ACCEPTED DELIBERATELY. landing.css and DESIGN-SYSTEM.md
   * already write "AT COMMIT 80f643d" and "tree `12bbf5e`" in running prose,
   * which is the rule obeyed; forcing those blocks into a PROVENANCE: keyword
   * would be churn that improves nothing.
   */
  const PROVENANCE = /PROVENANCE:[\s\S]*?(?:census\.json|HISTORICAL)/
  const TREE_STAMP = /\b(?:tree|commit(?:ted)?)\b[\s\S]{0,32}?\b[0-9a-f]{7,40}\b/i

  /**
   * The one exemption, and it exists because this describe block has to PRINT
   * the shapes it bans. A comment marked PATTERN SPECIMEN is exhibiting the
   * form of a measurement, not making one — the regexes above and the fixtures
   * in the control below. It is asserted to live in this file only, so it
   * cannot become the escape hatch every guard eventually grows.
   */
  const SPECIMEN = /PATTERN SPECIMEN/

  /** Comment blocks and runs of line comments; whole paragraphs in Markdown. */
  const blocksOf = (text: string, markdown: boolean) =>
    markdown
      ? [...text.matchAll(/(?:^|\n\n)([\s\S]*?)(?=\n\n|$)/g)].map(
          (m) => ({ text: m[1], index: m.index ?? 0 }),
        )
      : [...text.matchAll(/\/\*[\s\S]*?\*\/|(?:^[ \t]*\/\/[^\n]*\n?)+/gm)].map((m) => ({
          text: m[0],
          index: m.index ?? 0,
        }))

  /** Every file that may carry a pixel claim, walked off the disk rather than
      typed — a new component with a census figure in its header is covered the
      day it lands, which a typed roster would not be. */
  const SCANNED: [string, string, boolean][] = (() => {
    const out: [string, string, boolean][] = []
    const walk = (dir: URL, rel: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir), `${rel}${entry.name}/`)
        else if (/\.(css|tsx?)$/.test(entry.name)) {
          out.push([`${rel}${entry.name}`, readFileSync(new URL(entry.name, dir), 'utf8'), false])
        }
      }
    }
    walk(new URL('../', import.meta.url), 'src/')
    walk(new URL('../../scripts/census/', import.meta.url), 'scripts/census/')
    for (const doc of ['../../README.md', '../../docs/brand/DESIGN-SYSTEM.md']) {
      const url = new URL(doc, import.meta.url)
      out.push([doc.replace('../../', ''), readFileSync(url, 'utf8'), true])
    }
    return out
  })()

  it('makes every quoted pixel figure name where it came from', () => {
    const undated: string[] = []
    for (const [name, text, markdown] of SCANNED) {
      for (const block of blocksOf(text, markdown)) {
        const hits = block.text.match(VECTOR)
        if (hits === null) continue
        if (!MEASUREMENT.test(block.text)) continue
        // The rule, in full: a block that quotes a measurement must point at
        // the committed artifact — which a hash keeps current — declare itself
        // HISTORICAL, which is a promise that nobody will steer by it, or name
        // the tree the figure was measured on.
        if (PROVENANCE.test(block.text) || TREE_STAMP.test(block.text)) continue
        if (SPECIMEN.test(block.text)) continue
        const line = text.slice(0, block.index).split('\n').length
        undated.push(`${name}:${line} quotes ${hits[0]} with no provenance`)
      }
    }
    expect(undated).toEqual([])
  })

  it('keeps the specimen exemption to this file', () => {
    // An exemption nobody bounds is an exemption everybody uses. PATTERN
    // SPECIMEN means "this block prints the SHAPE of a measurement so the guard
    // can be read", which is true of exactly one describe block in the tree.
    const users = SCANNED.filter(([, text]) => SPECIMEN.test(text)).map(([name]) => name)
    expect(users).toEqual(['src/styles/design.test.ts'])
  })

  it('still finds the figures it is meant to be guarding', () => {
    // A regex that matched nothing would pass the test above forever. This is
    // the silent-skip guard, and it now covers the SHAPES as well as the count:
    // the two-part window reading is the one §2.1b's law is written in, and it
    // was the one the old pattern could not see.
    const files = SCANNED.filter(([, text]) => VECTOR.test(text) && MEASUREMENT.test(text)).map(
      ([name]) => name,
    )
    expect(files.length).toBeGreaterThanOrEqual(6)
    expect(files.some((f) => f.endsWith('tokens.css'))).toBe(true)
    expect(files.some((f) => f.endsWith('.tsx'))).toBe(true)
    expect(files.some((f) => f.endsWith('DESIGN-SYSTEM.md'))).toBe(true)
    // …and the patterns themselves, so a rewrite that narrows one is caught.
    expect(new RegExp(QUAD).test('59.7/33.7/4.3/2.3')).toBe(true)
    expect(new RegExp(PAIR).test('82.42 / 14.15')).toBe(true)
    expect(new RegExp(PAIR).test('78.13% field / 14.50')).toBe(true)
    expect(new RegExp(ARROW).test('70.70% field -> 80.91')).toBe(true)
    // …and the gate, which is what stops it eating ratios and geometry.
    expect(MEASUREMENT.test('Graphite on Flare is 3.79:1')).toBe(false)
    expect(MEASUREMENT.test('corner-shape n 4.2 -> 2.8')).toBe(false)
    expect(MEASUREMENT.test('app.375x812.dark.seeded window @0')).toBe(true)
    // …and both provenance forms, since accepting only one would force churn.
    expect(TREE_STAMP.test('measured at tree 12bbf5e')).toBe(true)
    expect(TREE_STAMP.test('the artifact AT COMMIT 80f643d')).toBe(true)
    expect(PROVENANCE.test('PROVENANCE: HISTORICAL — never steer by this')).toBe(true)
    expect(TREE_STAMP.test('measured on this tree')).toBe(false)
  })
})

/**
 * §2 / round 5 — the counter sheet, which now has two conditions and therefore
 * two copies of one declaration body.
 */
describe('§2.2 — the counter sheet re-grounds the archive without drifting', () => {
  const RAW_TOKENS = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

  /** The declaration body of the first rule whose selector matches. */
  const bodyOf = (selector: string): string => {
    const at = RAW_TOKENS.indexOf(`\n  ${selector} {`)
    expect(`${selector} present: ${at !== -1}`).toBe(`${selector} present: true`)
    const open = RAW_TOKENS.indexOf('{', at)
    const close = RAW_TOKENS.indexOf('}', open)
    return RAW_TOKENS.slice(open + 1, close)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
  }

  it('declares the counter ground exactly once', () => {
    // It used to be twice: CSS cannot hand one declaration body to two media
    // queries, so `.spec-sheet.collection-card` carried a character-identical
    // copy and a test kept the two in step — --spec is a mix against --ground,
    // so one drifted value is a contrast bug that appears on one branch, in one
    // theme, at one width. The collection card is deleted; the copy went with
    // it, and the eight declarations exist in exactly one place again.
    expect(bodyOf('.spec-sheet.archive-card')).toContain('--ground: var(--sand)')
    expect(RAW_TOKENS.split('--counter: var(--sand);')).toHaveLength(2)
  })

  it('grounds the archive on Sand from 1400px up as well as in dark', () => {
    // The comma is an OR. The width is a MEASURED choice, not a round number:
    // see the block above the rule, and the app.1024/1280/1440 rows in
    // scripts/census/matrix.ts that stand either side of it.
    expect(RAW_TOKENS).toMatch(
      /@media \(prefers-color-scheme: dark\), \(min-width: 1400px\) \{\s*\.spec-sheet\.archive-card \{/,
    )
    // …and it is the only card that takes it. The second counter-grounded
    // selector was the collection card's, which is deleted.
    expect(RAW_TOKENS).not.toContain('collection-card {')
  })
})

/**
 * §5A / §1 trait 01 — a container that spans the measure is not a container.
 */
describe('§5A — the landing badge stops being a slab on the phone', () => {
  it('drops the fill and keeps the keyline below 720px', () => {
    const phone =
      /@media \(max-width: 719px\) \{\s*\.lp-badge:not\(:nth-child\(3n\)\) \{([^}]*)\}/.exec(
        LANDING,
      )?.[1] ?? ''
    expect(phone).not.toBe('')
    // §1 trait 05's optical outline replaces the fill: no background, and the
    // ink and the ring both move to the counter so they read on the Espresso
    // field (§2.1: Bone on Espresso is 13.4:1, better than the 11.4:1 pair it
    // replaces). The shape itself — border width, radius, corner-shape,
    // padding — is untouched, because trait 01 still applies.
    expect(phone).toMatch(/background: none/)
    expect(phone).toMatch(/color: var\(--lp-counter\)/)
    expect(phone).toMatch(/border-color: var\(--lp-counter\)/)
    expect(phone).not.toMatch(/border-radius|corner-shape|padding|border-width/)
    // …AND IT IS NOT EVERY BADGE. CONSTRAINT §2.1b: eight keyline badges in a
    // 1-up column is 1487px of unbroken Espresso on a 375px phone, which put
    // window @3248 at 89.77% field / 4.89% Bone at tree 71b5608 — over the 85
    // cap and under the 15 floor on one screen. Every third badge keeps its
    // fill, so the longest keyline run is two badges. The :not() is the whole
    // mechanism; a bare .lp-badge here would reinstate the breach.
    expect(LANDING).toMatch(/\.lp-badge:not\(:nth-child\(3n\)\)/)
  })

  it('leaves the badge a filled plate at the width where it is an object', () => {
    // The base rule is unchanged: at >=720 the grid is 2-up or 3-up and the
    // badge is one object among several standing in the field, which is the
    // composition §5A asks for and the one the census measures at law.
    const base = /\n\.lp-badge \{([^}]*)\}/.exec(LANDING)?.[1] ?? ''
    expect(base).toMatch(/background: var\(--lp-counter\)/)
    expect(base).toMatch(/color: var\(--lp-form\)/)
  })

  it('turns the badge inside out only where nothing in it can take focus', () => {
    // CONSTRAINT: Trust Rule 8. The page-level ring is Graphite (.landing
    // :focus-visible), which is 1.16:1 on Espresso — the exact trap
    // .lp-spec:focus-visible exists to fix. Making the badge transparent is
    // only safe while no control lives inside one, and Landing.tsx renders a
    // span, an h3 and a p. If that ever changes, this rule needs the .lp-spec
    // treatment BEFORE the fill comes off.
    const landingTsx = readFileSync(new URL('../components/Landing.tsx', import.meta.url), 'utf8')
    const badge = /className="lp-badge"[\s\S]*?<\/li>/.exec(landingTsx)?.[0] ?? ''
    expect(badge).not.toBe('')
    expect(badge).not.toMatch(/<(a|button|input|select|textarea)\b|tabIndex/)
  })
})

/**
 * THE DECISION RECORD's stylesheet obligations. Two of them are Trust Rules
 * wearing CSS: the three answers may not be told apart by colour or weight
 * (§12.6), and none of them may shrink under §11's 48px floor.
 */
describe('§11 / §12.6 — the decision record answers are peers', () => {
  it('keeps the three answers on one button class, with no colour split', () => {
    // "Bought it" is not a failure state, and a stylesheet is the easiest place
    // to accidentally say that it is. All three render as the plain .btn family
    // through one class, which declares no background and no colour at all.
    const btn = /\n\.decision-btn \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(btn).not.toBe('')
    expect(btn).not.toMatch(/background|color|border/)
    // No per-answer selector exists anywhere — no .decision-btn.is-bought, no
    // :nth-child colouring, no ✓/✗ pseudo-element.
    expect(APP).not.toMatch(/\.decision-(btn|outcome)[^{]*(is-bought|is-waited|is-resisted)/)
    expect(APP).not.toMatch(/\.decision-(btn|outcome)[^{]*::(before|after)/)
    // The recorded answer is one class for all three outcomes, at one weight.
    const outcome = /\n\.decision-outcome \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(outcome).toMatch(/font-weight: 700/)
    expect(outcome).not.toMatch(/background|color:/)
  })

  it('inherits the 48px floor rather than shrinking under it', () => {
    // .decision-btn only changes the type size and padding, exactly like .chip
    // and .ledger-more — the floor lives on .btn in tokens.css and must not be
    // overridden here.
    expect(TOKENS).toMatch(/\.btn \{[^}]*min-height: 48px/)
    const btn = /\n\.decision-btn \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(btn).not.toMatch(/min-height|height/)
  })

  it('spends the card\u2019s one accent panel once, on the newest row', () => {
    // §1 trait 06 / §11's three-colour cap: .sim-result marks the simulator's
    // current projection. Older rows drop to plain ink so a long record never
    // stacks accents down the card.
    expect(APP).toMatch(/\.sim-result\.decision-line \{[^}]*font-size: var\(--fs-body\)/)
    const line = /\n\.decision-line \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(line).not.toMatch(/background|color:/)
  })

  it('marks that panel with a RINGED keyline bar, not with a block of Acid', () => {
    /* §2.1b caps accent at 2% of the DOCUMENT, and the artifact committed at
       96b728b (tree 71b5608 — the one round 6 started from) reported that
       breach in its own breaches array on six of its twelve rows. On the phone
       the two declared accents alone spent it: app.375x812.light.seeded read
       accent 2.27% of the document, --reward (Marigold) 1.11 and --data (Acid)
       0.94, and this full-width padded block fill was the dominant Acid area on
       a 375px column, growing with the record. It takes .lp-share's
       construction now (landing.css): §6's 6px keyline against the card's own
       ground.

       AND THE KEYLINE IS RINGED, because the swap traded a checked pair for an
       unchecked one. Acid on the light Bone card is 1.03:1 — under §2.1's 3:1
       non-text floor — while the same stroke reads 12.98:1 on the dark Espresso
       card: one mark, one DOM, a theme mirror. The 2px --keyline around it is
       Graphite in light and Bone in dark, so the mark clears 3:1 against its
       ground in both. */
    const result = /\n\.sim-result \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    // No bare stroke any more: the strip is a ringed ::before, so the rule
    // itself must not re-declare a border on the accent.
    expect(result).not.toMatch(/border-left/)
    expect(result).toMatch(/position: relative/)
    expect(result).not.toMatch(/background/)
    const strip = /\n\.sim-result::before \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(strip).toMatch(/background: var\(--data\)/)
    // OUTLINE, NOT BORDER, and the accent cap is the reason: this row sits at
    // exactly 2.00% document accent, so a ring that ate into the 6px §6 keyline
    // or grew the strip would have moved a budget with no headroom. An outline
    // takes no layout, so the painted Acid is identical to the bare border-left
    // it replaced — measured: accent held at 2.00 while graphite went 7.20 ->
    // 7.21 (census --diff against the artifact committed at dc529fb).
    expect(strip).toMatch(/outline: var\(--keyline-w\) solid var\(--keyline\)/)
    expect(strip).toMatch(/width: var\(--keyline-heavy\)/)
    expect(strip).not.toMatch(/box-shadow/)
    // No --on-accent, because nothing stands ON the accent any more. The string
    // inherits --ink: 11.4:1 on the light card and 13.4:1 on the dark one,
    // against the 9.7:1 the Acid fill gave it.
    expect(result).not.toMatch(/color:/)
    expect(round(contrast(RAW.graphite, RAW.bone))).toBe(11.44)
    expect(round(contrast(RAW.bone, RAW.espresso))).toBe(13.32)
    // THE PAIR THE BARE BAR SHIPPED, pinned so it cannot come back unguarded.
    // Acid on the light card fails the non-text floor; the ring is what makes
    // the mark legal, and the ring's own pairs are both over it.
    expect(contrast(RAW.acid, RAW.bone)).toBeLessThan(3)
    expect(round(contrast(RAW.graphite, RAW.acid))).toBe(11.15)
    expect(round(contrast(RAW.acid, RAW.espresso))).toBe(12.98)
  })

  it('lifts the SIM—05 corner mark above the window bar it rides in', () => {
    /* IT WAS NEVER ON SCREEN. .spec-label is position:absolute at z-index auto
       (tokens.css); .window-bar is a positioned SIBLING at z-index 1, added to
       clear .card::before; .sim-card creates no stacking context — so the bar
       won the paint order over its earlier sibling and painted over the label.
       Measured in the browser at 375x812 in both themes: a 1:1 capture clipped
       to the label's own 49x14 box held ONE distinct colour with z-index auto
       (686 pixels of bar fill, no glyph) and 93/95 with this rule. It is aria-hidden
       decoration, so App.test's spec-run assertion reads the DOM and stayed
       green throughout, and §11's "every card carries a mono spec label in its
       top-right corner" was silently unmet on this one card. */
    const label = /\n\.sim-card \.spec-label \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(label).toMatch(/z-index: 2/)
    // 2 clears the bar's 1 and no more: the bar must stay above .card::before,
    // which is the reason the bar carries a z-index at all.
    expect(APP).toMatch(/\n\.window-bar \{[^}]*z-index: 1/)
  })

  it('keeps the check-back count off the one pair tokens.css forbids in writing', () => {
    /* BOTH HALVES OF THIS FACT WERE ALREADY IN THE SUITE AND NOTHING CONNECTED
       THEM: the recess test above lists .decision-checkback as a --sunken
       surface, and the contrast block below asserts contrast(specLight, sand)
       is under 4.5 as the reason --spec-sunken exists. .checkback-head set
       --spec on that recess anyway — #676562 on Sand, 3.98:1, for an 11px mono
       string. This is the assertion that joins them. */
    const head = /\n\.checkback-head \{([^}]*)\}/.exec(APP)?.[1] ?? ''
    expect(head).toMatch(/color: var\(--spec-sunken\)/)
    expect(head).not.toMatch(/color: var\(--spec\);/)
    const specLight = mix(RAW.graphite, 0.7, RAW.bone)
    expect(contrast(specLight, RAW.sand)).toBeLessThan(4.5)
    // Every ground this row can stand on, computed rather than asserted: the
    // light Sand recess, the dark Void one, the Espresso spec sheet and the
    // archive's Sand counter sheet.
    const grounds: Array<[string, string]> = [
      [mix(RAW.graphite, 0.8, RAW.bone), RAW.sand],
      [mix(RAW.bone, 0.8, RAW.espresso), RAW.void],
      [mix(RAW.bone, 0.8, RAW.espresso), RAW.espresso],
      [mix(RAW.graphite, 0.88, RAW.sand), RAW.sand],
    ]
    for (const [ink, ground] of grounds) {
      expect(`${ink} on ${ground}: ${contrast(ink, ground) >= 4.5}`).toBe(`${ink} on ${ground}: true`)
    }
  })
})

/**
 * Trust Rule 8 × §2.1b — THE RING HAS TO SURVIVE THE PLATES.
 *
 * The focus ring is one rule, `outline: 3px solid var(--ink)` at
 * `outline-offset: 2px`, and both halves of it are inherited: the colour comes
 * from whatever ground the control stands on, and the 2px gap shows that same
 * ground back through. §2.1b's two plates re-ground REGIONS INSIDE cards, so a
 * control inside one takes the plate's `--ink` and draws its ring on the plate's
 * `--field` — a pairing that did not exist before the plates did, and that no
 * rule anywhere states.
 *
 * Two ways it can go silently wrong, and both are one edit away:
 *   · a future ground redeclares `--ink` without redeclaring `--field`, and the
 *     ring is drawn in an inherited colour against a surface nobody checked it
 *     on. The failure is invisible in the sheet and invisible on the screen;
 *   · a plate's padding drops below the ring's reach, and a control at the
 *     plate's inner edge throws its ring onto the CARD outside — which is the
 *     plate's opposite ground by construction, i.e. Bone on Bone or Espresso on
 *     Espresso. A plate is chosen to be the opposite of what surrounds it, so
 *     this failure mode is guaranteed rather than unlucky.
 *
 * Neither is caught by the existing ring test, which checks that the rule
 * exists and that nothing cancels it. These check that it still reads.
 */
describe('Trust Rule 8 — the focus ring reads on every ground, plates included', () => {
  /** How far the ring reaches outside the control's border box, in px. */
  const ringReach = (): number => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(TOKENS)?.[1] ?? ''
    const width = Number(/outline:\s*(\d+)px solid/.exec(rule)?.[1])
    const offset = Number(/outline-offset:\s*(\d+)px/.exec(rule)?.[1])
    expect(`width ${width}, offset ${offset}`).toBe('width 3, offset 2')
    return width + offset
  }

  /** One level of var() indirection against the raw palette. */
  const resolve = (value: string): string | undefined => {
    const m = /^var\(--([a-z-]+)\)$/.exec(value.trim())
    return m ? RAW[m[1]] : undefined
  }

  /** Every flat block in a sheet that re-grounds by declaring --ink. */
  function grounds(css: string): Array<{ selector: string; ink: string; field: string }> {
    const out: Array<{ selector: string; ink: string; field: string }> = []
    for (const m of css.matchAll(/([^{}]*)\{([^{}]*?--ink\s*:[^{}]*?)\}/g)) {
      const selector = m[1].trim().split('\n').pop()!.trim()
      const ink = /--ink\s*:\s*([^;]+);/.exec(m[2])![1].trim()
      // `unset` is a width-scoped plate's UNDO (see §2.1b) — it hands the token
      // back to the ground outside, which is a block this list already holds.
      if (ink === 'unset') continue
      const field = /--field\s*:\s*([^;]+);/.exec(m[2])?.[1].trim()
      // A ground that moves the ink and leaves the field behind draws the ring
      // in a colour nobody measured against the surface under it.
      expect(field, `${selector} redeclares --ink without --field`).toBeDefined()
      out.push({ selector, ink, field: field as string })
    }
    return out
  }

  it('pairs every re-grounded ink with a field it was measured against', () => {
    const blocks = grounds(TOKENS)
    // If the parse returns nothing, every case below passes on air. Eight
    // grounds at this tree: :root and .spec-sheet in both themes, the archive's
    // dark/wide sheet, and §2.1b's two plates in both of theirs.
    expect(blocks.map((b) => b.selector)).toEqual([
      ':root',
      ':root',
      '.spec-sheet',
      '.spec-sheet.archive-card',
      '.counter-plate',
      '.counter-plate',
      '.reading-plate',
      '.reading-plate',
    ])
    for (const { selector, ink, field } of blocks) {
      const fg = resolve(ink)
      const bg = resolve(field)
      expect(fg, `${selector}: --ink ${ink} is not a raw palette token`).toBeDefined()
      expect(bg, `${selector}: --field ${field} is not a raw palette token`).toBeDefined()
      // The ring's floor is WCAG 1.4.11's 3:1 for a non-text indicator; these
      // are text grounds too, so §2.1's 4.5:1 body floor is the one that binds.
      // Every one of them clears it by a wide margin today (9.5:1 is the
      // narrowest — Graphite on Sand), and the assertion is that a new ground
      // cannot arrive without doing the same.
      expect(contrast(fg as string, bg as string), `${selector} ink on its own field`)
        .toBeGreaterThanOrEqual(4.5)
    }
  })

  it('never lets a plate throw a control’s ring onto the card outside it', () => {
    const reach = ringReach()
    const space = Object.fromEntries(
      [...TOKENS.matchAll(/--(s\d):\s*(\d+)px;/g)].map((m) => [m[1], Number(m[2])]),
    )
    expect(space.s2).toBe(16)
    // Every rule that sets padding on either plate, in either sheet. The plates
    // declare `padding: var(--s2)` in tokens.css and app.css re-states it for
    // the three components whose own reset would win the cascade — a fourth
    // that lands here with a smaller box is the failure this catches.
    const found: string[] = []
    for (const [name, css] of [
      ['tokens.css', TOKENS],
      ['app.css', APP],
    ] as const) {
      for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const selector = m[1].trim()
        if (!/counter-plate|reading-plate/.test(selector)) continue
        const padding = /(?:^|[;{\s])padding\s*:\s*([^;}]+)/.exec(m[2])?.[1]
        if (padding === undefined) continue
        found.push(`${name} ${selector.split('\n').pop()!.trim()}`)
        for (const token of padding.matchAll(/var\(--(s\d)\)/g)) {
          expect(space[token[1]], `${name}: ${selector} padding`).toBeGreaterThanOrEqual(reach)
        }
        for (const px of padding.matchAll(/(\d+)px/g)) {
          expect(Number(px[1]), `${name}: ${selector} padding`).toBeGreaterThanOrEqual(reach)
        }
      }
    }
    // The plates' own rules plus app.css's cascade re-statement. Renaming a
    // plate must fail here rather than pass by matching nothing.
    expect(found.length).toBeGreaterThanOrEqual(3)
  })
})
