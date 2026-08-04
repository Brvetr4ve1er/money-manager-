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
})

describe('§2 — the ratio law and the palette budget', () => {
  it('gives the page a field that is not the card fill, in both themes', () => {
    // The root cause of "generic card stack": body, .card and .field all
    // resolved to the same hex, so three nested surface levels carried zero
    // colour offset. §2 puts 60% of the surface on Flare or Espresso; the
    // stage is the only surface big enough to carry it.
    const root = /:root \{([\s\S]*?)\n\}/.exec(TOKENS)?.[1] ?? ''
    const dark = /prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n  \}/.exec(TOKENS)?.[1] ?? ''
    const decl = (block: string, name: string) =>
      new RegExp(`${name}:\\s*var\\((--[a-z-]+)\\)`).exec(block)?.[1]

    expect(decl(root, '--stage')).toBe('--flare')
    expect(decl(root, '--field')).toBe('--bone')
    expect(decl(dark, '--stage')).toBe('--espresso')
    expect(decl(dark, '--field')).toBe('--graphite')
    expect(TOKENS).toMatch(/body \{[^}]*background: var\(--stage\)/)
  })

  it('keeps Void off the recessed surfaces — it is capped under 5%', () => {
    // --sunken: var(--void) in the dark theme measured 15.2% of the phone
    // page: 39 locked tiles, every track and every input. Void survives only
    // inside the display letterforms' halftone screen.
    const dark = /prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n  \}/.exec(TOKENS)?.[1] ?? ''
    expect(dark).toMatch(/--sunken: var\(--espresso\)/)
    expect(TOKENS).toMatch(/--brand-screen: var\(--void\)/)
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
