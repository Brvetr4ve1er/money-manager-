# Ember — Brand Book

**Industrial signage, poured soft.**

> Three colours, one diagonal, everything in a rounded box, and say less than
> you want to.

This is the working reference: what the brand is, how to build with it, and
what it refuses to do. It assembles [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) into
the order a designer actually needs it, adds the measured numbers, and points
at the code where each rule is enforced.

**Precedence.** `DESIGN-SYSTEM.md` is binding; this book restates it and must
never contradict it. A **Trust Rule** (§12 there, §7 here) outranks both —
those are product commitments, not style preferences.

---

## 1. The DNA

Ten traits. None of them is optional, and none is a mood.

| # | Trait | The rule | Where it shows |
|---|-------|----------|----------------|
| 01 | Container-first | Every mark lives inside a shape. Nothing floats. | `.mark`, `.stage-badge`, every landing plate |
| 02 | Negative space is the letterform | Read the gaps. Counters do the talking. | `Glyph.tsx` — every eye is a hole, not a fill |
| 03 | Stacked verticality | Wordmarks compress into bricks, never into lines. | `Wordmark.tsx` — EMB / ER, two rows |
| 04 | Soft-serve terminals | Every corner radiused. Squircle logic. No sharp miters. | `boxPath()` in `shape.ts` |
| 05 | Optical outline / keyline | A second contour offsets the mark from the field. | 2px keylines everywhere; button hover is an outline, not a lift |
| 06 | Three-tone max per surface | Field + form + counter. A fourth colour is an event. | Why the landing footer uses the knockout mark |
| 07 | Bone, not white | `#FFFFFF` is banned outright. | `--bone` is the counter token; no hex `#fff` ships |
| 08 | Extreme ink density | 85–95% coverage inside the container. Claustrophobic on purpose. | The mark's rows fill 89.2% of the inner area |
| 09 | Diagonal shear | One 30–45° diagonal cuts each composition. | `bandPath(…, -38)`; `.lp-band`; `.hero-frame::before` |
| 10 | Spec-sheet numerals | Indexed labels as decorative truth-telling. | `01/04`, `EMBER—01`, `Health 62/100` |

**Trait 10 has a condition.** *Decorative truth-telling* means the numbers must
be true. `01/04` is generated from the length of the list it captions; the
health index is the real score. A fraction invented to look technical is set
dressing and fails the trait.

---

## 2. Colour

```css
/* CORE — the non-negotiables */
--flare:    #F93E06;  /* orange-red. hero FIELD. ~45% of surface */
--graphite: #2A2D2C;  /* the form. never pure black */
--bone:     #F5E6E0;  /* the counter. replaces white */

/* STRUCTURAL NEUTRALS */
--espresso: #2A1E18;  --sand: #DFD5BC;  --fog: #E9E9E7;  --void: #121312;

/* ACCENTS — one per surface, never two */
--acid: #DFF205;  --marigold: #E9A20B;  --cobalt: #16224E;
--signal: #E31E24;  --moss: #3A4A2A;
```

**Ratio law — 60/30/8/2.** 60% Flare or Espresso · 30% Bone · 8% Graphite ·
2% one accent.

**Approved pairings, these five only:**
`Flare + Graphite + Bone` · `Espresso + Sand + Coral` ·
`Marigold + Cobalt + Bone` · `Void + Acid + Graphite` · `Signal + Fog + Graphite`

**Banned:** `#FFFFFF`, `#000000`, gradients over an 8% value shift, drop
shadows, pastels, two accents on one surface.

### 2.1 The contrast law — this is a layout constraint, not a checklist item

| Foreground | Field | Ratio | What it may carry |
|---|---|---|---|
| Graphite | Flare | **3.79 : 1** | ≥24px display, keylines, iconography. **No body text.** |
| Bone | Flare | **3.01 : 1** | ≥24px display, non-text UI. **No body text.** |
| Graphite | Bone | 11.4 : 1 | Everything |
| Bone | Graphite | 11.4 : 1 | Everything |
| Bone | Espresso | 13.4 : 1 | Everything |
| Graphite | Sand | 9.4 : 1 | Everything |
| Graphite | Marigold | 6.2 : 1 | Everything |
| Graphite | Acid | 9.7 : 1 | Everything |
| Marigold | Espresso | 7.4 : 1 | Everything |
| Marigold | Bone | 2.0 : 1 | **Nothing.** Not a caption, not a rule. |

Three hard rules:

1. **Flare is a FIELD, not a text background.** Display type (≥24px),
   containers, keylines and iconography may sit on it. Body copy, labels, help
   text and any string under 24px may not.
2. **On any accent fill the foreground is Graphite** — never Bone, never white.
   `--on-accent: var(--graphite)`, and it does not flip in dark mode.
3. **Any pair not in that table gets computed before it ships.** No exceptions,
   no eyeballing.

**This is where the layout comes from.** Because sub-24px copy cannot touch
Flare, a Flare composition has to put its words on Bone, Espresso, Sand or
Graphite plates. The plate-on-field look is not a decoration applied to the
brand — it is the contrast law made visible. Remove a plate and you remove the
only thing making its text legal.

### 2.2 Light and dark

Dark is a **ground swap**, not an inversion. Light ground Bone; dark ground
Espresso. Flare, Graphite and every accent keep their hex in both — the palette
is warm enough that inverting it would break the ratio law.

Two surfaces deliberately do **not** swap: the mark (`--brand-field` /
`--brand-form` / `--brand-counter`) and the marketing surface. Both are computed
against those exact three hexes; an ink that flipped to Bone in dark mode would
put Bone type on a Bone plate.

---

## 3. Type

Three tiers. No fourth.

| Tier | Face | Use |
|---|---|---|
| Display / wordmark | **BLOKFORM** (fallback: a heavy grotesque) | 1–3 words, always stacked, always in a container |
| Subhead / UI | Space Grotesk · Archivo Expanded · General Sans | Weights 500/700 only |
| Data / spec | JetBrains Mono · Martian Mono | Uppercase, +0.12em, 10–12px, index labels |

```
SCALE (1.333 — perfect fourth, clamped)
d1  112 / 0.78 / -0.045em   display   hero stack
d2   72 / 0.82 / -0.04em    display   section brick
h1   42 / 0.95 / -0.02em    grotesk 700
h2   30 / 1.05 / -0.015em   grotesk 700
h3   22 / 1.15 / -0.01em    grotesk 500
body 17 / 1.5  /  0         grotesk 500
cap  13 / 1.3  / +0.10em    grotesk 700 UPPER
spec 11 / 1.2  / +0.14em    mono 500 UPPER
```

**Fonts are self-hosted or system-stacked. No CDN request, ever** — the product
is local-first and must render fully offline.

**Known gap, stated plainly.** BLOKFORM does not exist yet, and no self-hosted
woff2 has shipped. The display stack currently falls through to Archivo Black /
Arial Black and the mono stack to the platform monospace. At app scale that is
invisible. At d1 on a poster it is not. Subsetting Space Grotesk and JetBrains
Mono (both OFL) to woff2 in `public/` is the fix; it adds no runtime dependency
and no network request.

---

## 4. The mark

```
CONTAINER
  Shape        superellipse, n = 4.2
  Aspect       1:2.1 portrait brick · 1:1 badge · 2.6:1 plate
  Keyline      outer contour offset 6% of the short side, SAME colour as the strokes
  Padding      8%, uniform

LETTERFORM
  EMB, three rows, stacked, equal optical mass per row
  Row gutters  5% of container height
  Ink          88% (±3) of the inner area
  Diagonal     exactly ONE, 38°, traversing the full stack
  Colour       field FLARE · strokes GRAPHITE · counters BONE

CLEARSPACE     25% of container width, all sides
MINIMUM SIZE   32px tall digital · 12mm print
LOCKUPS        brick (primary) · badge (avatar) · plate (nav) · knockout (1-colour)

FORBIDDEN      rotation · a third colour · gradients · stretching ·
               placing on photography without a solid container behind it
```

**The wordmark and the mark are different objects.** The mark is the EMB brick.
The full word EMBER stays the page `h1` for assistive technology; the brick is
the visual lockup. Both appear together — that is the point.

**The mark is not drawn, it is computed.**
`src/components/monogramGeometry.ts` holds the construction; `Monogram.tsx`
renders it in the product and `scripts/brand-assets.ts` emits the favicon, the
maskable icon and the social card from the identical path data. One set of
numbers, every surface. `npm run brand` regenerates the assets.

**A flame is not the mark.** The pre-system favicon was a gold flame on
`#ff4b2b` with a `#141414` stroke — wrong glyph, wrong palette, wrong stroke.
It is gone. The stage badge still uses a flame *glyph*, which is a stage
indicator, not a logo.

---

## 5. Layout

```
12-col fluid · gutter 24px · margin 40px (mobile 20px)
Baseline grid  8px. Everything snaps.
Radius set     4 / 12 / 28 / 999. Nothing between.
Border         2px solid graphite. Always 2px. Never 1px.
Elevation      NONE. Depth is colour offset and keylines only.
```

**The five signature layouts**

| | Layout | Recipe | Built in |
|---|---|---|---|
| A | **THE BRICK WALL** | Full-bleed colour, one centred container, ~60% negative field | `.lp-wall`, the desktop `.hero-frame` |
| B | **THE SPEC SHEET** | 4-up grid of badges on Espresso, mono index captions | `.lp-spec` |
| C | **THE PLATE** | Horizontal lockup on Marigold/Cobalt, subway proportions, hard keyline | `.lp-foot`, `.hero-nav` |
| D | **THE SHEAR** | One 38° band splits the canvas; type sits parallel to it | `.lp-shear` / `.lp-band` |
| E | **THE OBJECT** | One hard-lit specimen, centred on flat Flare, no shadow, no context | `.lp-object` |

**Composition rule.** Centre everything, then break it once with a diagonal.
Let a container touch the frame edge in exactly one place per layout. Caption
the corners with mono spec labels — on plates, never on the field.

---

## 6. Voice — The Fabricator

Someone who builds things properly and doesn't need you to be impressed.

**Coordinates:** Blunt 8/10 · Warm 6/10 · Playful 5/10 · Technical 7/10 ·
Formal 2/10

1. **Lead with the object.** Name the thing before you describe it.
2. **Sentences under nine words.** Fragments are preferred.
3. **Specify, don't adjectify.** `2mm keyline` beats `bold outline`. `38°`
   beats `dynamic`.
4. **Dry, never zany.** No exclamation marks. No puns. No emoji.
5. **Never say:** premium · curated · elevated · seamless · journey · unlock ·
   crafted.

**Use:** built · poured · stacked · pressed · indexed · tuned · hard · flat ·
sealed · spec · run · batch · plate · form
**Kill:** luxurious · artisanal · bespoke · revolutionary · game-changing ·
holistic · synergy · effortless

```
Hero        →  BUILT FLAT. / STACKED HARD.
Product     →  One piece. No seams. 33 of 36.
Empty state →  Nothing here yet. That's fine.
Error       →  That didn't go through. Try again.
Success     →  Done. Batch 07 confirmed.
CTA         →  GET ONE · SEE THE RUN · SPEC SHEET
Sign-off    →  Made in batches. Never in bulk.
Footer      →  No newsletter. We'll be here.
```

### 6.1 The one place blunt bends

Ember's users log money on days that went badly. **Blunt is fine; blame is
not.** State the fact and stop.

```
BAD  (punitive)      →  "You blew the budget again."
BAD  (soft/coddling) →  "It's okay! Everyone slips sometimes 😊"
GOOD (fabricator)    →  "Over by 4,200 DA. Logged."
```

Warmth is 6/10, not 0/10. Deadpan ≠ cold. The dryness is the respect.

### 6.2 Where the voice rules bend for a reason

The nine-word rule governs titles, labels, one-liners and every string a user
reads on a bad day. It does **not** govern lesson bodies — those teach, and
teaching needs sentences. The two absolute bans (the word list, the exclamation
mark) apply everywhere without exception, and are enforced by tests in
`src/content/lessons.test.ts` and `src/Root.test.tsx`.

Hedges are not padding. `about`, `worth double-checking` and the conditional
branches in the simulator are anti-false-confidence machinery. Compressing them
out would make the product sound more certain than its data supports.

---

## 7. Trust Rules — these outrank everything above

1. **Two tracks, never crossed.** XP and levels measure engagement. The Health
   Score measures financial reality. Engagement never feeds the score.
2. **No pay-to-win.** Every cosmetic, pet and badge is earned. No purchase path
   exists.
3. **Never punish honesty.** "I bought it anyway" logs at full XP, framed
   neutrally.
4. **No medical or therapeutic claims.** Ember is not treatment and never
   implies it.
5. **Honest cold start.** Under 90 days the app says it is still calibrating
   rather than projecting confidence it hasn't earned.
6. **Non-punitive framing everywhere.** The Impulse Monster is beatable, never
   shaming.
7. **Data leaves when you do.** Full export, always, no account required.
8. **Accessibility is not a style choice.** Live regions stay mounted, focus
   stays visible, reduced motion is fully honoured, the contrast law is
   enforced.

**Rule 5 has a marketing consequence people miss.** A stranger has logged
nothing, so there is nothing honest to show them. The landing surface therefore
carries no score, no stage, no demo figures and no product screenshot of
fabricated numbers — the alternative is presenting invented data as a product
shot, which is Rule 5 in reverse.

---

## 8. Art direction

**Photography.** One object, hard direct flash, dead-centre, on a seamless flat
brand colour. No surface, no horizon, no shadow. Chrome, steel, rubber, matte
plastic. Macro-tight, cropping the frame. The object is a *specimen*, not a
lifestyle.

**People.** Rare, always partial — a cropped eye, a hand holding an object.
Never a smiling full-body model.

**Illustration.** Flat vector only. Two or three colours. Squircle-based
construction. Mascots are geometric, front-facing, symmetrical, slightly
menacing in a friendly way. No line-art, no watercolour, no 3D render, no
gradient mesh.

**Emoji are retired as iconography.** They are a different vendor's
illustration on every device, they render in colours this palette cannot answer
for, and their contrast is unmeasurable. The stage marks, companions, boss,
shield, medal and mute state are drawn glyphs (`Glyph.tsx`), each with a real
text alternative at its call site.

**Texture — exactly two.** Fine offset-print grain at 6% opacity, and a 1px
halftone line screen used only inside display letterforms. Nothing else.

---

## 9. Motion

Mechanical, not organic. Things snap, index and lock. Nothing floats, drifts or
fades softly.

```
EASING
  primary    cubic-bezier(0.83, 0, 0.17, 1)     heavy in, hard out
  entrance   cubic-bezier(0.16, 1, 0.3, 1)      arrives and stops dead
  pop        cubic-bezier(0.34, 1.56, 0.64, 1)  8% overshoot max
  index      steps(6, end)                       counters and numerals

DURATION
  hover 90ms · tap 180ms · component 280ms · page 460ms · hero 820ms
```

**The six signature moves**

1. **THE STACK** — the logo assembles top-down; three rows drop 20px on
   `entrance`, staggered 70ms; the container keyline draws last, 180ms, from
   the top-left.
2. **THE SHEAR WIPE** — transitions are a hard 38° Flare band sweeping the
   viewport, 460ms, `primary`. No crossfade, ever.
3. **COUNTER FILL** — on scroll-into-view, letterform counters fill Graphite →
   Bone as a vertical wipe, 280ms. The letter hollows out.
4. **INDEX ROLL** — every numeral animates with `steps()` like an odometer.
   `33/36` clicks up. Never smooth-tweens.
5. **THE PRESS** — buttons compress, they never lift: `scale(0.96)` + radius
   28 → 12 in 90ms, released on `pop`.
6. **CONTAINER MORPH** — cards expand by morphing the superellipse
   (n: 4.2 → 2.8) rather than scaling. 280ms.

**Banned:** parallax, fade-in-up, blur transitions, spring bounces over 8%,
auto-rotating carousels, floating idle states, particles.

**Reduced motion** keeps every colour change and drops every transform. Nothing
may become invisible or unreachable at rest — which is why entrance keyframes
animate transform only and never opacity, and why a rotation used as *layout*
(the shear band) is not treated as motion.

---

## 10. Component law

- Superellipse containers via `clip-path`/SVG mask **wherever aspect > 1.5**;
  the radius token set plus `corner-shape` everywhere else. A card's height is
  content-driven and unbounded, so a whole-box clip would eat its content.
- 2px solid Graphite borders. Never 1px. **No `box-shadow` anywhere.**
- Max three colours per component. `#FFFFFF` is forbidden — use Bone.
- Buttons compress on press. They never lift.
- All numerals render in the mono stack, uppercase, +0.14em, tabular.
- Every card carries a mono spec label in its top-right corner.
- **Touch targets stay ≥48px** regardless of visual density.
- Focus rings are 3px `--ink` at 2px offset, and on any pinned surface each
  field names the ring colour that contrasts against it. Never lower it.

---

## 11. Sound

The chiptune cues survive the re-skin and follow the motion doctrine:
**mechanical, not musical**. A cue only ever fires alongside a visible change —
sound never carries information alone. Mute persists and is honoured
everywhere.

---

## 12. Asset inventory

| Asset | Path | State |
|---|---|---|
| Favicon | `public/icon.svg` | Generated from the mark. Current. |
| Maskable icon | `public/icon-maskable.svg` | Generated. Mark at 62% inside the safe zone. |
| Social card (master) | `public/og.svg` | Generated. THE BRICK WALL, current palette. |
| Social card (raster) | `public/og.png` | **Stale.** Pre-system flame card. Must be re-rasterised from `og.svg` — crawlers reject SVG. |
| iOS touch icon | `public/apple-touch-icon.png` | **Stale.** Re-rasterise from `icon-maskable.svg` at 180×180. |
| Manifest | `public/manifest.webmanifest` | Current. Flare theme, Bone splash. |
| Display / mono woff2 | — | **Missing.** See §3. |

Regenerate the vector assets with `npm run brand`. The two PNGs need a
rasteriser this repo deliberately does not depend on; converting them is an
out-of-band step and a deploy-checklist item in the README.

---

*Made in batches. Never in bulk.*
