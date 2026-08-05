# Ember — Design System

**Positioning line:** *Industrial signage, poured soft.*

**The one-sentence brief to carry into every decision:**
*Three colors, one diagonal, everything in a rounded box, and say less than you want to.*

This document is binding. Where it conflicts with older Ember styling, this document wins.
Where it conflicts with a **Trust Rule** (§12), the Trust Rule wins — those are product
commitments, not style preferences.

---

## 1. Style DNA — the 10 immutable traits

| #  | Trait | Rule |
|----|-------|------|
| 01 | Container-first | Every mark lives inside a shape. Superellipse, hexagon, plate, badge. Nothing floats. |
| 02 | Negative space is the letterform | Read the gaps, not the strokes. Counters do the talking. |
| 03 | Stacked verticality | Wordmarks compress vertically into bricks, not horizontally into lines. |
| 04 | Soft-serve terminals | Every corner radiused. Squircle logic. No sharp miters anywhere. |
| 05 | Optical outline / keyline | Marks are ringed by a 2nd contour that offsets them from the field. |
| 06 | Three-tone max per surface | Field + form + counter. A 4th color is an event. |
| 07 | Bone, not white | Warm cream/bone replaces white everywhere. White is banned. |
| 08 | Extreme ink density | Strokes near-touch. 85–95% coverage inside the container. Claustrophobic on purpose. |
| 09 | Diagonal shear | One 30–45° diagonal cuts each composition. Motion frozen in geometry. |
| 10 | Spec-sheet numerals | Fractional/indexed labels (`33/36`, `AB—01`) as decorative truth-telling. |

---

## 2. Color system

```css
/* ── CORE (the non-negotiables) ───────────────── */
--flare:      #F93E06;  /* orange-red. hero field. 45% of all surface */
--graphite:   #2A2D2C;  /* charcoal. the form. never pure black */
--bone:       #F5E6E0;  /* warm cream. the counter. replaces white */

/* ── STRUCTURAL NEUTRALS ──────────────────────── */
--espresso:   #2A1E18;  /* dark warm ground, badge backdrops */
--sand:       #DFD5BC;  /* aged paper, spec sheets */
--fog:        #E9E9E7;  /* UI surface, disabled states */
--void:       #121312;  /* max contrast only. use < 5% */

/* ── ACCENTS (one per campaign, never two) ────── */
--acid:       #DFF205;  /* lime. digital/product moments */
--marigold:   #E9A20B;  /* amber. wayfinding, retail */
--cobalt:     #16224E;  /* navy. authority, editorial */
--signal:     #E31E24;  /* true red. alerts, drops */
--moss:       #3A4A2A;  /* forest. premium/physical goods */
```

**Ratio law — 60/30/8/2.**
60% Flare or Espresso · 30% Bone · 8% Graphite · 2% one accent.

**Approved pairings (these five only):**
`Flare + Graphite + Bone` · `Espresso + Sand + Coral` · `Marigold + Cobalt + Bone` ·
`Void + Acid + Graphite` · `Signal + Fog + Graphite`

**Banned:** pure `#FFFFFF`, pure `#000000`, any gradient over 8% opacity shift, drop shadows,
pastels, more than one accent per surface.

### 2.1 Contrast law (binding, derived — do not "design around" it)

Measured WCAG contrast ratios for this palette:

| Foreground | Field | Ratio | Verdict |
|---|---|---|---|
| Graphite `#2A2D2C` | Flare `#F93E06` | **3.79 : 1** | Large text (≥24px, or ≥18.66px bold) and UI borders only. **Fails AA for body text.** |
| Bone `#F5E6E0` | Flare `#F93E06` | **3.01 : 1** | Large text / non-text UI only. **Fails AA for body text.** |
| Graphite `#2A2D2C` | Bone `#F5E6E0` | 11.4 : 1 | Pass everywhere. |
| Bone `#F5E6E0` | Graphite `#2A2D2C` | 11.4 : 1 | Pass everywhere. |
| Bone `#F5E6E0` | Espresso `#2A1E18` | 13.4 : 1 | Pass everywhere. |
| Graphite `#2A2D2C` | Marigold `#E9A20B` | 6.2 : 1 | Pass for body text. |
| Graphite `#2A2D2C` | Acid `#DFF205` | 9.7 : 1 | Pass for body text. |

Therefore, as a hard rule:

1. **Flare is a FIELD, not a text background.** Display type (≥24px), containers, keylines,
   and iconography may sit on Flare. Body copy, labels, form help text, and any string
   under 24px **may not**. Put those on Bone, Espresso, Sand, or Graphite.
2. **On any accent fill, the foreground is Graphite** — never Bone, never white.
   `--on-accent: var(--graphite)` and it never flips in dark mode.
3. Every new foreground/field pair must be checked before it ships. If it is not in the
   table above, compute it.

### 2.1b Ratio law — scrolling form

§2's 60/30/8/2 is a **composition** law. It is unchanged, and it is measured over
the whole surface, for anything the eye holds at once: the poster, the mark, the hero band,
each landing section, the OG image.

An application document is not one composition. It is a sequence of them, and the
whole-document average is a number nobody ever looks at. Measured — `app.375x812.light.seeded`
in `docs/brand/census.json`, the artifact committed at `dc529fb`, which is what the rule below
means by "comes from that file": the page averages **56.73% field / 34.05% Bone** over the whole
document, while its **seven** viewport windows run 59.41, 49.05, 68.84, 53.43, 48.70, 44.92
and 73.98 percent field. Those seven are all inside the band below; the average they
produce is still a number that appears on no screen, which is the point.

It was not always inside the band, and the state that produced this rule is worth stamping.
On the CLEAN TREE OF COMMIT `71b5608` the same row's **document** average was 41.70% field /
47.32% Bone, and its **mean of windows** — a different statistic, which is the whole subject of
this section — was 45.75 / 43.91, over seven windows running 40.92, 15.79, 45.60, 15.46, 21.30,
89.12 and 92.09 percent field: a Bone form stack at the head, a dark index sheet at the tail.
**Five of those seven windows breached; the dark row of the same page breached all seven, and
its document average, 67.87 / 19.89, was ordinary rather than alarming — deviation 20.21, ninth
of the matrix's twelve rows, where the best was `app.1024x900.light.seeded` at 6.64.** That is
the whole case for measuring windows: a row can breach every window it has and still read as
unremarkable at the document level.

**A worked example is exactly where a mislabel does the most damage, and this one carried one.**
The sentence above used to call 63.35 / 24.71 the dark phone's *document average* and "the most
respectable in the matrix". Both halves were wrong out of the same file: 63.40 / 24.70 is that
row's **mean of windows** at `71b5608`, its document reading was 67.87 / 19.89, and it ranked
ninth of twelve rather than first. The paragraph whose entire argument is that the two readings
differ was quoting the wrong one of the two as its evidence. Read the row.

So for a **scrolling application document**, measure each viewport-height window:

```
Every window   field 35–80%  ·  Bone family 15–55%
               hard caps: no window over 85% field or over 65% Bone
Mean of windows  60 / 30 / 8 / 2, tolerance ±8 field, ±6 Bone
Ink              >= 6%, measured over Bone-family-grounded area only
Accent           <= 2% of the document — scarcity is a document property
```

**Ink is not an independent budget, and that is a correction to §2, not a loophole.**
Graphite is 1.16:1 on Espresso, so every Ink pixel must stand on a Bone-family ground, and
every Bone-family ground is a pixel not in the field bucket. Ink and field trade one for one.
An 8%-of-document Ink budget and a 60%-of-document field budget are not simultaneously
satisfiable on the same page. Ink is therefore measured over the paper it can be drawn on.

**No single ground may run longer than one viewport.** This is not a second law; it is the
window band restated as something a designer can build to, and it is derived. Take a 375px
phone: `.main-stack` leaves a 24px stage gutter either side, so a card row is 12.8% field and
75.0% Bone, and a field-grounded row is 89.5% / 5.6%. Feed those into an 812px window and the
floors fall out as lengths — with Flare either side, a Bone run breaks the 35% field floor
once it passes **~605px**, and a field run breaks the 15% Bone floor once it passes **~702px**.
Every breaching window in the artifact at tree `71b5608` sat inside such a run, the longest
being 4,070px of unbroken Espresso down the dark phone's head and 1,487px of it down the
landing's badge grid.

The consequence is that **the card is the wrong unit**. Cards on that phone run 314–1,165px —
measured in Chromium at 375×812 on the seeded fixture, at the tree this document ships with,
with SimCard the 1,165px one —
so a window can sit entirely inside one — no reordering and no re-grounding of whole cards
reaches it. The unit that alternates is a REGION: `.counter-plate` (the counter ground —
Espresso in light, Bone in dark) and `.reading-plate` (the reading ground — Bone in light,
Espresso in dark) in `tokens.css`. A plate is a ground, so a run of plate is also a run: the
decision record and the ledger's day groups stripe rather than plating whole, and plating them
whole was measured to invert the defect rather than fix it.

**The two themes of one page must measure alike, and that is §2.2 restated as a number.** Dark
is a ground swap, not a different design — so a window that is field-heavy in one theme and
Bone-heavy in the other, in the same place, is not two problems but one defect seen twice.
Measured in the census **committed at** `12bbf5e` — which stamps tree `96b728b`, dirty, because
the round's changes were not committed when it ran; naming the carrier is the only unambiguous
way to point at it — `app.375x812.*.seeded` window `@0`: 74.65% field / 16.91% Bone in
dark against 52.95 / 36.19 in light — one 14.65pp over the 60 target and the other 7.05 under,
on the same DOM, on the first screen anyone sees. A plate is the ground's OPPOSITE, so one
plate moves both the right way at once: `.hero-foot` took that window to 66.01 / 25.28 and
59.41 / 30.30, and with `.month-block` doing the same at the tail the two themes' whole
mean-of-windows vectors land at 57.82 / 33.01 (dark) and 56.90 / 33.96 (light) — the same page
to within a point, from a pair that were 21.70pp apart on the first screen. The check is cheap
and it is the one this document asks for: **compare a row against its own theme twin before
comparing it against the law.**

**A plate may be scoped by width, and its undo is `unset`.** A plate is a give-back, so it
belongs only where the window it lands in is short of the ground it carries; both of the
plates above are switched off past a breakpoint that was measured, not chosen (see app.css).
The undo re-declares every token the plate declares as `unset` — custom properties are
inherited, so that is `inherit` — rather than spelling the fallback out. A spelled-out
fallback is a second copy of `:root`'s or `.spec-sheet`'s arithmetic, and a drifted copy is a
contrast bug on one branch, in one theme, at one width.

#### 2.1b.1 The third reading — sections, and the runs inside them

**The window grid has a phase, and the phase is arbitrary.** `windowTops()` starts at offset 0
and steps by the viewport. A reader does not: they scroll continuously, so **every** offset is a
screen somebody holds. Slide the window over all 812 offsets of `landing.375x812.light` on the
clean tree of `9a42bd8` and the row's worst-window deviation ranges from **30.48 to 67.58**,
average 50.72, against the 45.85 that tree's artifact reported. The committed figure was one
sample of a statistic with a 37-point spread, and the true worst — @1992, **27.84% field /
63.79% Bone**, outside the band on both axes — sat between two grid windows that both passed
(@1624 field 40.28, @2436 field 64.53). The row recorded `breaches: []`. Any change that
lengthens a section by 60px moves the reported number without improving one screen.

**An application document has no authored composition boundaries. That is why §2.1b substitutes
a window for one. A marketing page has them.** They are in the DOM, they are opaque grounds, and
the reader's eye stops at them. So the landing is measured a third way, and the boundaries are
derived **mechanically from the render tree** — no selector list, no offset table, nothing to
keep in sync with a stylesheet:

```
GROUND(el)  := background alpha === 1
            AND position is static or relative        (in flow)
            AND rect.left <= 0 AND rect.width >= document width
            AND its painted colour differs from its nearest GROUND ancestor's
            AND rect.height > 0                       (<html> and <body> excluded)

PAGE_GROUND := the outermost GROUND whose box spans the whole document
SECTION     := a GROUND whose only GROUND ancestor is PAGE_GROUND
NESTED      := every other GROUND
```

```
Every SECTION   field 35–80% · Bone 15–55% · caps 85 field / 65 Bone
                — the same band and the same caps as a window, and
                  enforced only where the section is no taller than the
                  viewport, because "anything the eye holds at once" is
                  §2's own precondition. Longer is a SEQUENCE and the
                  windows already own it.
Every NESTED    height <= one viewport
                — §2.1b's "no single ground may run longer than one
                  viewport", finally checked. A section boundary is
                  authored, so scrolling out of a long section lands
                  somewhere a designer chose; a nested ground longer than
                  a viewport is a run with no authored exit.
Accent          not re-checked. Accent stays a document property.
```

**Accent must stay document-scoped or §5C becomes illegal.** `.lp-foot` reads accent 31.02% at
375 and 27.98% at 1440 under a naive per-section count — because §5C names *"THE PLATE —
horizontal lockup on marigold/cobalt"* as a signature layout and §2 lists `Marigold + Cobalt +
Bone` as an approved pairing. In that composition Marigold **is** a field, not an accent. §2.1b
already draws exactly this line between window-scoped budgets and document-scoped ones; the
section reading inherits it unchanged.

**This reading is the harsher one, and that is the argument for it.** It was adopted because it
*adds* breaches and removes none. On the tree of `9a42bd8`, `landing.1440x900.*` `.lp-shear` was
627px against a 900px viewport — a composition the eye holds entire — and read **30.40% field /
66.45% Bone**: under the 35 floor and over the 65 Bone HARD CAP, in both themes, on the widest
screen in the matrix. The row's window reading recorded zero breaches, because no window
isolates that section: @2700 covers its first 371px mixed with 529px of badge grid, @3600 its
last 256px mixed with `.lp-object`. The section reading finds a cap breach the window reading
structurally cannot see. The run-length check found the second one in the same walk:
`.lp-shot-frame`, a full-bleed Bone mat 1911–2918 = **1007px** on an 812px phone, the run that
produced the @1992 window above.

The rule needs no landing-specific knowledge and runs on the app rows unchanged. There it finds
the shell's grounds; those are all longer than a viewport, so the composition check does not
fire and the app keeps being judged by its windows. That is the correct outcome, and it is why
`scripts/census/composition.ts` contains no `screen === 'landing'` branch.

The instrument is `npm run census`; the answer is committed at `docs/brand/census.json` and a
test fails when it stops describing the tree. Any figure quoted about this product's pixels
comes from that file or says which tree it came from — three rounds were steered by numbers
that had outlived the tree they described, and the worked example above was itself one of them
for a round: it quoted a 56% document over eight windows, from a tree that still had a ninth
card, with nothing on it saying so. The staleness hash guards the artifact. Nothing guards a
figure retyped into prose except the rule in this paragraph, so the rule is: **quote the row
id, or stamp the tree.**

### 2.2 Light / dark mapping

Dark is not an inversion; it is a **ground swap**. Light ground = Bone. Dark ground = Espresso.
Flare, Graphite and the accents keep their hex values in both — the palette is already warm
enough that inverting it would break the ratio law.

---

## 3. Typography

Three tiers. No exceptions.

**Tier 1 — Display / wordmark: `BLOKFORM`.** Until the custom face exists, the display stack
falls back to a heavy grotesque. Only for 1–3 words. Always stacked. Always inside a container.
Tracking `-0.04em`. Line-height `0.78`.

**Tier 2 — Subhead / UI:** neo-grotesque with high x-height. *Space Grotesk*, *Archivo Expanded*,
*General Sans*. Weights 500/700 only.

**Tier 3 — Data / spec:** monospace. *JetBrains Mono*, *Martian Mono*. Uppercase,
tracking `+0.12em`, 10–12px, for the `33/36` index labels.

```
SCALE (1.333 — perfect fourth, clamped)
d1  112 / 0.78 / -0.045em   BLOKFORM   hero stack
d2   72 / 0.82 / -0.04em    BLOKFORM   section brick
h1   42 / 0.95 / -0.02em    Grotesk 700
h2   30 / 1.05 / -0.015em   Grotesk 700
h3   22 / 1.15 / -0.01em    Grotesk 500
body 17 / 1.5  /  0         Grotesk 500
cap  13 / 1.3  / +0.10em    Grotesk 700 UPPER
spec 11 / 1.2  / +0.14em    Mono 500 UPPER
```

Fonts must be **self-hosted or system-stacked**. No external font CDN request — the app is
local-first and must render fully offline.

---

## 4. Logo / monogram construction

```
CONTAINER
  Shape: superellipse, n = 4.2
  Aspect: 1 : 2.1 (portrait brick) — or 1:1 badge, 2.6:1 plate
  Keyline: outer contour offset by 6% of container width, SAME color as letterforms
  Inner padding: 8% of container width, uniform

LETTERFORM
  3 characters maximum, stacked, equal optical mass per row
  Row gutters: 5% of container height
  Ink coverage: 88% (±3) of the inner area
  Exactly ONE 38° diagonal must traverse the full stack
  Counters are BONE. Strokes are GRAPHITE. Field is FLARE.

CLEARSPACE       = 25% of container width on all sides
MINIMUM SIZE     = 32px tall digital / 12mm print
LOCKUP VARIANTS  = brick (primary) · badge (avatar) · plate (nav bar) · knockout (1-color)

FORBIDDEN: rotation, outlining in a 3rd color, gradients, stretching, placing on
           photography without a solid container behind it.
```

**Ember's mark:** the monogram is the 3-letter stack **EMB** in a portrait brick. The full
word EMBER remains the page `h1` for assistive tech; the brick is the visual lockup.

---

## 5. Layout & grid

```
12-col fluid · gutter 24px · margin 40px (mobile 20px)
Baseline grid: 8px. Everything snaps.
Radius token set: 4 / 12 / 28 / 999 (pill). Nothing between.
Border: 2px solid graphite. Always 2px. Never 1px.
Elevation: NONE. Depth comes from color offset + keylines only.

SIGNATURE LAYOUTS
  A. THE BRICK WALL — full-bleed color, single centered container, 60% negative field
  B. THE SPEC SHEET — 4-up grid of badges on espresso, captioned with mono index labels
  C. THE PLATE      — horizontal lockup on marigold/cobalt, subway proportions, hard keyline
  D. THE SHEAR      — one 38° diagonal band splits the canvas; type sits parallel to it
  E. THE OBJECT     — single hard-lit product on flat Flare, centered, no shadow, no context
```

---

## 6. Tokens

```json
{
  "color": {
    "flare":"#F93E06","graphite":"#2A2D2C","bone":"#F5E6E0",
    "espresso":"#2A1E18","sand":"#DFD5BC","fog":"#E9E9E7",
    "void":"#121312","acid":"#DFF205","marigold":"#E9A20B",
    "cobalt":"#16224E","signal":"#E31E24","moss":"#3A4A2A"
  },
  "radius": { "xs":4, "sm":12, "lg":28, "pill":999, "squircle":"superellipse(4.2)" },
  "space":  { "1":8,"2":16,"3":24,"4":40,"5":64,"6":104,"7":168 },
  "border": { "hairline":2, "keyline":6 },
  "font": {
    "display":"BLOKFORM","ui":"Space Grotesk","mono":"JetBrains Mono",
    "tracking": { "display":"-0.045em","ui":"-0.015em","caps":"0.10em","spec":"0.14em" },
    "leading":  { "display":0.78,"heading":0.95,"body":1.5 }
  },
  "motion": {
    "instant":90,"quick":180,"base":280,"slow":460,"epic":820,
    "ease":       "cubic-bezier(0.83,0,0.17,1)",
    "easeOut":    "cubic-bezier(0.16,1,0.3,1)",
    "overshoot":  "cubic-bezier(0.34,1.56,0.64,1)",
    "mechanical": "steps(6, end)"
  },
  "shadow": { "none":"none" }
}
```

---

## 7. Voice

**Archetype:** The Fabricator. Someone who builds things properly and doesn't need you to be
impressed.

**Coordinates:** Blunt 8/10 · Warm 6/10 · Playful 5/10 · Technical 7/10 · Formal 2/10

1. **Lead with the object.** Name the thing before you describe it.
2. **Sentences under nine words.** Fragments are fine. Fragments are preferred.
3. **Specify, don't adjectify.** `2mm keyline` beats `bold outline`. `38°` beats `dynamic`.
4. **Dry, never zany.** Humor lives in understatement and the deadpan spec label.
   No exclamation marks, no puns, no emoji.
5. **Never say** premium, curated, elevated, seamless, journey, unlock, or crafted.

**Use:** built, poured, stacked, pressed, indexed, tuned, hard, flat, sealed, spec, run,
batch, plate, form
**Kill:** luxurious, artisanal, bespoke, revolutionary, game-changing, holistic, synergy,
effortless

```
Hero        →  BUILT FLAT. / STACKED HARD.
Product     →  One piece. No seams. 33 of 36.
Empty state →  Nothing here yet. That's fine.
Error       →  That didn't go through. Try again.
Success     →  Done. Batch 07 confirmed.
CTA         →  GET ONE  ·  SEE THE RUN  ·  SPEC SHEET
Sign-off    →  Made in batches. Never in bulk.
Footer      →  No newsletter. We'll be here.
```

### 7.1 Voice × Trust Rules (the one place blunt bends)

Ember's users log money on days that went badly. Blunt is fine; **blame is not**. The
Fabricator states the fact and stops — it never editorialises about the user's failure.

```
BAD  (punitive)      →  "You blew the budget again."
BAD  (soft/coddling) →  "It's okay! Everyone slips sometimes 😊"
GOOD (fabricator)    →  "Over by 4,200 DA. Logged."
```

Warmth is 6/10, not 0/10. Deadpan ≠ cold. The dryness is the respect.

---

## 8. Art direction

**Photography.** One object, hard direct flash, dead-centre, on a seamless flat brand colour —
no surface, no horizon, no shadow. Chrome, steel, rubber, matte plastic. Macro-tight so the
object crops the frame. The object is a *specimen*, not a lifestyle.

**People.** Rare, always partial — a cropped eye, a hand holding an object. Never a smiling
full-body model.

**Illustration.** Flat vector only. Two or three colours. Squircle-based construction. Mascots
are geometric, front-facing, symmetrical, slightly menacing in a friendly way. No line-art, no
watercolour, no 3D render, no gradient mesh. **This retires emoji as UI iconography** — the
stage marks and companion pets become flat vector glyphs drawn on squircle geometry.

**Texture.** Exactly two: fine offset-print grain at 6% opacity, and a 1px halftone line screen
used only inside display letterforms. Nothing else.

**Composition.** Centre everything, then break it once with a diagonal. Let the container touch
the frame edge in one place per layout. Caption with mono spec labels in the corners.

---

## 9. Motion

Mechanical, not organic. Things snap, index and lock. Nothing floats, drifts or fades softly.

```
EASING
  primary    cubic-bezier(0.83, 0, 0.17, 1)     heavy in, hard out
  entrance   cubic-bezier(0.16, 1, 0.3, 1)      arrives and stops dead
  pop        cubic-bezier(0.34, 1.56, 0.64, 1)  8% overshoot max
  index      steps(6, end)                       for counters/numerals

DURATION
  hover 90ms · tap 180ms · component 280ms · page 460ms · hero 820ms
```

**Six signature moves**

1. **THE STACK** — Logo assembles top-down. Each of the 3 letter rows drops in on `entrance`,
   staggered 70ms, travelling 20px. The container keyline draws last, 180ms, clockwise from
   top-left.
2. **THE SHEAR WIPE** — Transitions are a hard 38° diagonal band of Flare sweeping the
   viewport. 460ms, `primary`. No crossfade, ever.
3. **COUNTER FILL** — On scroll-into-view, letterform counters fill Graphite → Bone as a
   vertical wipe, 280ms. The letter appears to *hollow out*.
4. **INDEX ROLL** — All numerals animate with `steps()` like a mechanical odometer.
   `33/36` clicks up. Never smooth-tweens.
5. **THE PRESS** — Buttons don't lift, they compress: `scale(0.96)` + radius `28 → 12` in 90ms.
   Release snaps back with `pop`.
6. **CONTAINER MORPH** — Cards expand by morphing the superellipse (n: 4.2 → 2.8) rather than
   scaling. 280ms. The shape gets *squarer* as it grows.

**Banned motion:** parallax, fade-in-up, blur transitions, spring bounces over 8%,
auto-rotating carousels, floating/breathing idle states, particles.

**Reduced motion:** `prefers-reduced-motion: reduce` keeps every colour change and drops every
transform. Nothing may become invisible or unreachable at rest.

---

## 10. Sound

Ember's chiptune cues survive the re-skin, but they follow the motion doctrine: **mechanical,
not musical**. A cue only ever fires alongside a visible change — sound never carries
information alone. Mute state persists and is honoured everywhere.

---

## 11. Component law

- Superellipse containers via `clip-path`/SVG mask, **not** `border-radius`, wherever aspect > 1.5.
- 2px solid Graphite borders. Never 1px. **No `box-shadow` anywhere.**
- Max three colours per component. `#FFFFFF` is forbidden — use Bone.
- Buttons compress on press (scale .96, radius 28→12, 90ms), release on `pop`.
- All numerals render in the mono stack, uppercase, `+0.14em`.
- Every card carries a mono spec label in its top-right corner (`04/12`, `LOG—01`).
- Touch targets stay ≥48px regardless of visual density.

---

## 12. Trust Rules (product commitments — these outrank style)

These predate the design system and survive it:

1. **Two tracks, never crossed.** XP and levels measure engagement. The Health Score measures
   financial reality. Engagement never feeds the score.
2. **No pay-to-win.** Every cosmetic, pet and badge is earned. No purchase path exists.
3. **Never punish honesty.** "I bought it anyway" is logged at full XP, framed neutrally.
4. **No medical or therapeutic claims.** Ember is not treatment and never implies it.
5. **Honest cold start.** Under 90 days the app says it is still calibrating rather than
   projecting confidence it hasn't earned.
6. **Non-punitive framing everywhere.** The Impulse Monster is beatable, never shaming.
7. **Data leaves when you do.** Full export, always, no account required.
8. **Accessibility is not a style choice.** Live regions stay mounted, focus stays visible,
   reduced motion is fully honoured, contrast law (§2.1) is enforced.
