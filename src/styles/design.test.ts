import { describe, it, expect } from 'vitest'
/* From disk, not through Vite's `?raw`: vitest stubs every CSS import to an
   empty string (`css: false` is the default and does not exempt `?raw`), so a
   raw import would assert nothing at all — silently. node:fs and
   import.meta.url are declared locally in src/vite-env.d.ts; adding
   @types/node would be a dependency change. */
import { readFileSync } from 'node:fs'

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
        if (v % 4 !== 0) found.push(`${prop}: ${m[1].trim()}`)
      }
    }
  }
  return found
}

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
    // A census of everything ≥28px painted at 1440 read 144 / 72 / 30 / 22 / 17:
    // --fs-h1 (42px) had zero uses anywhere in src/, so the ramp fell 2.4× in
    // one jump from the health readout to the section heads, with a defined
    // step skipped. The hero thesis is the one run of type that stands beside a
    // 144px lockup, and §3 defines that step as Grotesk 700 — which it was.
    expect(APP).toMatch(/--fs-h1\)/)
    expect(APP).toMatch(/\.hero-thesis \{[^}]*font-size: var\(--fs-h1\)/)
  })

  it('never renders a heading below body size', () => {
    // .hero-stage-name was an <h2> at --fs-cap: 13px, smaller than the 17px
    // body around it, which inverts the outline it belongs to.
    expect(APP).not.toMatch(/\.hero-stage-name \{[^}]*--fs-(cap|spec)/)
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

describe('§1 trait 09 / §8 — one diagonal per composition', () => {
  it('ships the app shear at every width, not only above 1024px', () => {
    // The 38° shear used to live inside the ≥1024 block, so every phone and
    // tablet capture — the app's stated primary device — contained no
    // diagonal at all.
    const shear = APP.indexOf('rotate(-38deg)')
    const desktop = APP.indexOf('@media (min-width: 1024px)')
    expect(shear).toBeGreaterThan(-1)
    expect(desktop).toBeGreaterThan(-1)
    expect(shear).toBeLessThan(desktop)
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
    // …and the marks are gated to the width where a lane exists. Below 720px
    // the rules grid is one full-measure column, the band's visible run is
    // slivers between stacked plates, and every mark on screen is cut
    // mid-glyph — the rotated-fragment artefact, back one glyph down.
    expect(LANDING).toMatch(/\.lp-band-mark \{[^}]*display: none/)
    const wide = /@media \(min-width: 720px\) \{([\s\S]*?)\n\}/.exec(LANDING)?.[1] ?? ''
    expect(wide).toMatch(/\.lp-band-mark \{ display: block/)
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

  it('keeps Void off the recessed surfaces — it is capped under 5%', () => {
    // --sunken: var(--void) in the dark theme measured 15.2% of the phone
    // page: 39 locked tiles, every track and every input. Void survives only
    // inside the display letterforms' halftone screen.
    expect(TOKENS).not.toMatch(/--sunken: var\(--void\)/)
    expect(TOKENS).toMatch(/--brand-screen: var\(--void\)/)
  })

  it('stands the archive on §5B’s Espresso spec sheet, in both themes', () => {
    // §5 layout B: "4-up grid of badges ON ESPRESSO, captioned with mono index
    // labels" — the codex and the badge shelf are literally that, and they were
    // rendering as ordinary Bone cards, so layout B existed nowhere in the
    // product. It is also the largest field correction available on a phone:
    // those two cards are the tallest on the page, and a census put the 375px
    // light app at 20.4% field / 68.5% bone against a 60/30 law.
    // No dark override: §5B says "on espresso" unconditionally.
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
    const tablet = /@media \(min-width: 768px\) \{([\s\S]*?)\n\}/.exec(APP)?.[1] ?? ''
    expect(tablet).toMatch(/\.persist-fault,\n\s*\.ledger-card/)
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
    // --s3 gap + --s4 margin = a whole step of the scale between the act-now
    // half of the stack and the read-only half. Left on .ledger-card it would
    // now fall between the month and the days inside it — two views of one
    // thing, split by the page's loudest gap.
    expect(APP).toMatch(/\n\.month-card \{ margin-top: var\(--s4\); \}/)
    expect(APP).not.toMatch(/\.ledger-card \{ margin-top/)
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

  it('spaces the two cards on the app\'s own rhythm and drops the macro-break', () => {
    // The frame holds two cards now, and .card carries no margin of its own —
    // the app's stack spaces cards with a flex gap, so a shot that did not
    // would butt the month card against the ledger. And the --s4 macro-break
    // .month-card carries in the app opens the ARCHIVE half of that stack;
    // there is no such split inside a figure, so it would print as a hanging
    // gap above the shot.
    const frame = /\n\.lp-shot-frame \{([^}]*)\}/.exec(LANDING)?.[1] ?? ''
    expect(frame).toMatch(/display: flex/)
    expect(frame).toMatch(/gap: var\(--s3\)/)
    expect(LANDING).toMatch(/\.lp-shot-frame \.month-card \{ margin-top: 0; \}/)
  })

  it('repaints nothing inside the card — a restyled shot is not a shot', () => {
    const inside = [...LANDING.matchAll(/\.lp-shot-frame [^{]*\{([^}]*)\}/g)].map((m) => m[1])
    for (const body of inside) expect(body).not.toMatch(/background|border|font-size/)
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
    expect(round(contrast(sunkDark, RAW.graphite))).toBe(7.7)
    expect(round(contrast(sunkDark, RAW.espresso))).toBe(8.96)
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

  it('leaves no stylesheet comment claiming a ratio the palette cannot produce', () => {
    // Not every figure in the comments is machine-checkable — some name a pair
    // in prose — but a ratio over the palette's own maximum is always wrong,
    // and that maximum is Bone on Espresso. This is the cheap standing guard
    // against the next "13.9:1" typed into a rationale. The 0.1 slack is the
    // design system's own rounding: §2.1's table prints that pair as 13.4:1
    // where it computes to 13.32, and the comments follow the binding table.
    const max = contrast(RAW.bone, RAW.espresso) + 0.1
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
