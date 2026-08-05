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
(PROVENANCE: `docs/brand/census.json`, the committed artifact, kept current by the staleness
hash rather than by a commit hash that ages), which is what the rule below
means by "comes from that file": the page averages **57.00% field / 33.98% Bone** over the whole
document, while its **eight** viewport windows run 59.36, 51.40, 65.26, 50.72, 50.22, 53.35, 62.61
and 74.07 percent field. Those eight are all inside the band below; the average they
produce is still a number that appears on no screen, which is the point.
(It was **seven** windows and 56.25 / 34.62 one round ago, on the same fixture and the same
viewport. Nothing about the law moved: card 01 started printing the week block in every state
rather than only while the score is withheld, the phone document grew 5,605 → 5,818px, and an
eighth window appeared at the tail. A worked example whose row grows a window is exactly the
case the binding test above it exists for.)

**AND THE FIRST OF THOSE SEVEN USED TO BE A CELEBRATION.** This paragraph quoted 56.73 / 34.05
and a first window of 59.41 for three rounds, from the artifact committed at `dc529fb`, and both
were readings of a page mid-announcement. The census fixture held five achievement unlocks and
*qualified* for seven, so every mount unlocked `streak-7` and `boss-win`, and `useRewards` put a
2.6-second Flare toast and a Marigold XP chip on screen — which the capture landed inside. The
settle check could not see it: it compares two captures 400ms apart, and **a byte comparison
cannot detect anything that changes more slowly than it samples**. The fixture now holds what it
qualifies for, so the app is measured at rest; the tool records every painting live region per
row (`announcements`, empty on every row of the matrix) so this class of error states itself instead of
being inferred. The cost of the three rounds was not the 1.4pp on window `@0`. It was
`div.hero-frame`, whose section reading at `9a42bd8` was **80.02% field / 8.82% Bone** — a
recorded band breach on a 276px composition — against **77.03 / 13.61** at rest. Two-thirds of
that breach was a banner. The Bone-floor half was real, was 1.39pp under, and was identical in
both themes. **IT IS PAID, AND THE PRICE WAS ONE DECLARATION.** `.hero-word-col` — §5 layout A's
single centred container, 178px wide on the phone — carried `padding: var(--s2) var(--s3)`.
Uniform `--s3` puts 178 × 16 = 2,848px² more Bone into a 375 × 276 frame, i.e. +2.75pp against a
1.39pp shortfall, on the 8px grid, with the ≥1024 block already re-declaring the same property so
no desktop row moves and with the frame's `min-height` absorbing the height so no document moves
either. The section now reads **74.39 field / 16.31 Bone, deviation 30.67** on all ten 375px app
rows, still byte-identical across the two themes (PROVENANCE: `docs/brand/census.json`; the two
readings before it are HISTORICAL). Ten waived breaches closed on one line, which is what a
measured tree buys you: the cheapest pixel in the repo was findable because it had a number.

**THE SETTLE PROTOCOL IS FOUR ATTEMPTS, NOT TWO, AND HALF THE MATRIX DEPENDS ON IT.** The
sentence above describes the check as it was; the admission rule moved in the round that admitted
five previously-refused pairs, and a rule that decides whether a row gets measured at all is not a
driver detail. As it now stands: up to **four** two-capture comparisons per row, each pair 400ms
apart, **byte-exact and never toleranced**, and the attempt count is recorded per row
(`settleAttempts`) so "needed three tries" is a fact in the artifact rather than something the
loop swallowed. Two attempts refused every quiet 375px app row on this container, behind a
diagnosis about reward toasts that was measurably false — the real difference between a phone
row's first two captures is the antialiased keyline of the topbar's mute button, re-rastered over
the first ~1.1s. **Tolerancing the comparison was the obvious fix and was rejected**: byte
exactness is precisely what stops a 2600ms toast from being averaged into a row, and a per-pixel
epsilon would blind the instrument in the one direction it cannot afford. More attempts cost only
wall clock; a row that is genuinely animating still fails and still writes nothing. The change is
load-bearing and it is also self-checking, because the rows it admitted ADD breaches rather than
removing them. Read `settleAttempts` in `docs/brand/census.json` for how many rows currently need
more than one; every 375px app row does.

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

Every figure in that paragraph is a toast figure — it was measured before the fixture was
quiesced (see the correction above), and `66.01 / 25.28` and `59.41 / 30.30` in particular are
window `@0` with a banner across it. The conclusion is unharmed, which is the only reason the
paragraph stands: at rest the same pair reads **64.32 / 27.48** (dark) and **57.50 / 32.85**
(light), and the mean-of-windows vectors are **57.77 / 33.13** and **56.43 / 34.50** — still the
same page to within a point. (PROVENANCE: the toast figures are HISTORICAL, from the census
committed at `12bbf5e`; the at-rest pair is `docs/brand/census.json`. Both at-rest windows moved
0.90pp toward each other when `.hero-word-col`'s padding closed the hero band's Bone floor —
window `@0` is the one window that plate is in.)

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
**THAT PROBE IS AN INSTRUMENT NOW — see §2.1b.4** — and two things follow. Its figures were a
scratch probe on `9a42bd8` and are NOT in the committed `sliding` series, so they may not be
diffed against it; and @1992 is CLOSED (42.33 field / 49.24 Bone on this tree, inside the band on
both axes). The row's worst has moved to `.lp-shear`.

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
SECTION     := a GROUND whose only GROUND ancestor is PAGE_GROUND, or which
               has none at all when no ground spans the document
NESTED      := every other GROUND
```

**The null case is not a corner: it is the case every app row takes.** `composition.ts` has
always stated it (`classifyGrounds`: `g.parent === -1 || g.parent === page`); this block did not,
and the block is the published law. On every app row in `docs/brand/census.json` `pageGround` is
`null` — the app's shell paints no single ground over the whole document — and the walk's one
qualifying ground is therefore a SECTION with no page ground above it.

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

**Accent must stay document-scoped or §5C becomes illegal.** `.lp-foot` reads accent 30.80% at
375 and 27.98% at 1440 under a naive per-section count (PROVENANCE: `docs/brand/census.json`) — because §5C names *"THE PLATE —
horizontal lockup on marigold/cobalt"* as a signature layout, and this page takes the **marigold**
branch of that slash. In that composition Marigold **is** a field, not an accent. §2.1b
already draws exactly this line between window-scoped budgets and document-scoped ones; the
section reading inherits it unchanged. The document reading is the one that keeps it honest, and
it is inside the law: the accent **bucket** reads **1.32% at 375 and 1.54% at 1440** against the
2% cap, of which Marigold is 1.02 and 1.40 and the rest is classifier tail
(PROVENANCE: `docs/brand/census.json`), which is why a 31% section may be exempted without the
exemption being a licence.

**AND THE SAME ARGUMENT DISPOSES OF `.lp-foot`'s BONE FLOOR, WHICH IS THE WORST SECTION READING
IN THE ARTIFACT AND HAS BEEN OPEN, UNARGUED, SINCE THE THIRD READING LANDED.**
(PROVENANCE: `docs/brand/census.json`.) The section reads
**61.58% field / 2.85% Bone / 4.76% Graphite / 30.80% accent, deviation 60.78** at 375 and
**67.41 / 2.52 / 2.09 / 27.98, deviation 66.78** at 1440, and
`section footer.lp-foot: bone 2.85 under the 15 band` is recorded on all four landing rows of
every census since the one committed at `83c9a9e`. The paragraph above exempts that section's
ACCENT and then stops,
which left the field/Bone split — the same buckets, the same composition, the same §5C argument —
with no disposition anywhere in this document. Carried through: in a §5C plate the accent bucket
is holding the COUNTER'S ROLE, not an accent's.
A 31% Marigold lockup standing on 61% Espresso is §2's 60/30 read exactly, and Marigold is the
one accent in this palette that legally carries body copy (Graphite on Marigold, 6.38:1, §2.1
rule 2) — so the plate can do the counter's whole job, which is why the Bone bucket holds a
keyline and two links rather than a plate. The band is measuring the wrong two buckets for
this one composition, and a Bone band added to satisfy it would be designing around a
classification artefact — which §2.1 forbids by name.

**THE SENTENCE ABOVE USED TO READ "in an approved `Marigold + Cobalt + Bone` plate", AND THE TREE
HAS NEVER PAINTED A COBALT PIXEL.** §5C's layout name carries a slash — *marigold/cobalt*, either
one — and this argument upgraded it into an *and*, then cited §2's approved triad as the licence
for a composition that contains two of its three colours. The artifact says so in one field:
`tokens.cobalt` is **0.00 on all twenty rows**, and no stylesheet in the repo references
`var(--cobalt)` — which `scripts/census/census.test.ts` said, in the comment on a passing test,
the whole time the waiver two hundred lines below it claimed the opposite. **A WAIVER'S NUMBER WAS
PINNED AND ITS ARGUMENT WAS NOT**, so one file held both halves of a contradiction and the suite
stayed green: §2.1b's failure mode with the premise and the measurement swapped. A comment cannot
lose an argument with another comment, so that one is an assertion now too. What `.lp-foot`
paints is two grounds and four tones, nested so neither surface carries more than three (§1 trait
06) — Espresso field, Marigold plate, **Bone** counter (the 6px `--lp-counter` keyline and the two
links, 13.4:1) outside; Marigold field, Graphite ink inside. The disposition is unharmed, because
it never rested on the triad: it rests on the accent being document-scoped and on Marigold being
legal for body copy. It is now checked rather than asserted — `census.test.ts` pins all four
buckets of the section on all four rows and pins Cobalt at zero, and `design.test.ts`'s §5C block
pins the footer's grounds, inks and keylines in `landing.css`.
**THE BREACH STAYS IN THE ARTIFACT, AND THAT IS DELIBERATE.** No exemption is carved into
`compositionBreaches`. It could only be carved by naming a selector or by inventing a heuristic,
and §2.1b.1's whole construction is that the walk holds no per-page knowledge; a reading that got
KINDER by special case would stop being the harsher reading that is the argument for it. So the
disposition lives here and in the test: `census.test.ts` carries a per-row waiver list, each entry
quoting the breach verbatim with the paragraph that argues it, so this breach cannot grow, cannot
multiply and cannot be joined by an unargued one without the suite going red.

**AND THE PRICE OF THE FIX IS NAMED HERE SO THAT NO FUTURE ROUND PRICES IT AGAIN.** A waiver that
records only a refusal reads as debt, and debt gets re-opened by whoever inherits it. The breach
IS closeable: giving `nav.lp-foot-links` a Bone plate is a ~48px band the full width of the
plate, and against a section 252px tall at 375 and 250px at 1440 that is more than ten points of
Bone at either width — cheap, and enough. What it buys with is a THIRD ground in the footer — a
second one standing directly on the section's own field, where §5C authorises exactly one, the
lockup — and a re-roling of the links from Bone-on-Espresso 13.4:1 to
Graphite-on-Bone. That is designing around a classification artefact, which §2.1 forbids by name.
So this is **WONTFIX, not deferred**: the four entries in `census.test.ts` are a decision with its
price attached, and the numbers are pinned in them so a drift still fails.

**AND A REFUSAL THAT LIVES ONLY IN A COMMENT IS NOT A REFUSAL.** The paragraph above is the third
round in which this document has priced a plate it does not want; nothing in the tree stopped
anyone from shipping it, and the waiver — which is the only thing keeping the suite green on this
section — would have gone on passing, because the breach string it pins mentions Bone and nothing
else. So the ground count is now an assertion: `design.test.ts`'s §5C block reads every
`.lp-foot*` rule in `landing.css` and requires exactly two `background` declarations
(`--lp-espresso`, `--lp-gold`), the two inks §2.1's table licenses on them, and no tone that
`tokens.css`'s dark block redefines — which is also why this is the one composition in the matrix
whose two themes measure identically rather than merely alike. Ship the plate priced above and
two named tests go red in the ordinary suite, with no browser and no census run.

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

The rule needs no landing-specific knowledge and runs on the app rows unchanged, and **it fires
there.** This paragraph used to say the opposite — that the app's grounds "are all longer than a
viewport, so the composition check does not fire and the app keeps being judged by its windows" —
and that was false in the artifact of the round that wrote it. Read the rows: every app row
records `pageGround: null`, exactly one section, `div.hero-frame` @0, 276px and therefore
`held: true`. That section carried `section div.hero-frame @0: bone 13.61 under the 15 band` on
**every** 375px app row, in both themes, for four rounds. **IT IS CLOSED** — see §2.1b's opening
block for the one declaration that closed it — and the same section reads
**74.39% field / 16.31% Bone, deviation 30.67** today, on all ten of those rows
(PROVENANCE: `docs/brand/census.json`; the 13.61 is HISTORICAL). The finding stands although the
breach does not, and that is the point of keeping the
sentence: a reading that fires only while a defect is open cannot tell you when the next one
arrives. §2.1b.2 states the same finding four hundred words further down; the two halves of one
document disagreed about whether the third reading applies to the app at all. It does. What is
true, and is the point that sentence was reaching for, is that the walk needs no per-page
knowledge to do it: `scripts/census/composition.ts` contains no `screen === 'landing'` branch,
and it never gains one.

#### 2.1b.2 What is in the matrix is a claim about what matters

Three readings over twelve rows is still twelve rows, and **a screen nobody censuses is a screen
nobody has a number for.** Rounds 1–6 measured the app in exactly one state — a user with 21
transactions, a completed profile and 510 XP — and reported that every viewport window was inside
the band. That sentence was true and it was about one fixture.

Round 7 added FOUR pairs, all at 375×812, and each one broke on arrival. Three came with the
instrument; the fourth (`cold`) came with the product change that created the screen it measures,
and is set out after the block below. **ROUND 8 PAID FIFTEEN OF THE SIXTEEN BAND BREACHES THOSE
PAIRS ARRIVED WITH**, so every figure in the next two blocks is now HISTORICAL and the state of
the same six rows today is the third block, at the end of this section. The old blocks stay
because a row that broke on arrival and was then fixed is the whole case for adding it, and
deleting the arrival reading would leave the fix looking like a preference:

```
PROVENANCE: HISTORICAL. Every figure in this block is the census committed at
            a5add96, which stamps tree 44ff64a, dirty — the state round 7 left
            and round 8 was pointed at. Steer by the ROUND 8 block below it.
.day0        the app's FIRST SCREEN — profile null, ledger empty, ProfileCard's
             setup form open. Not `fresh` (that is the landing; the gate reads
             storage) and not `cold` (day one, with a log). The fixture is
             defaultState() verbatim.
   (Counts below are BAND breaches — `breaches` minus the two-accent advisory
    every app row carries. The array length is one higher on each of them.)
   app.375x812.light.day0   6 windows  meanDeviation 19.89  worst @2436 dev 65.74
      FOUR breaches.   window @2436 27.13 field / 61.49 bone — under the field
                       floor and over the 55 Bone band;
                       mean field 50.79 and mean bone 39.30, both outside
   app.375x812.dark.day0    6 windows  meanDeviation 15.64  worst @3398 dev 35.44
      THREE breaches.  window @3248 bone 14.84 and window @3398 bone 14.23,
                       both under the 15 floor;  mean bone 22.92, outside
.dense       ONE DAY holding 24 rows. Not a big ledger: ArchiveCard windows to
             WINDOW_DAYS = 3, so 900 rows over 300 days render eight rows and a
             SHORTER page than `seeded`. The card bounds days, never rows, and
             the stripe alternates per `ledger-day` — so one dense day is one
             unbroken ground run.
   app.375x812.light.dense  doc 6834  meanDeviation 20.59  worst @4872 dev 79.95
      FOUR breaches.   window @4872 24.53 field / 69.98 bone — under the field
                       floor AND over the 65 Bone HARD CAP;  mean field 51.51
                       and mean bone 40.29, both outside
   app.375x812.dark.dense   doc 6834  meanDeviation  3.92  worst @4872 dev 41.13
      ONE breach.      window @4872 field 80.56, over the 80 band — the same
                       window, the other way round
.breakdown   the health drawer OPEN. +195px of document, and it produces the
             worst app window in the matrix.
   app.375x812.light.seeded.breakdown  8 windows  meanDeviation 8.83
      worst window @812 dev 44.71 — 39.62 field / 49.41 bone
   app.375x812.dark.seeded.breakdown   8 windows  meanDeviation 8.18
      worst window @1624 dev 33.78
```

`@4872` in the dense pair is the theme-twin check paying for itself in one line: **24.53% field
in light and 80.56% in dark, the same window of the same DOM.** That is not two defects. It is
one ground run measured through the swap, which is precisely what the twin rule is for. **And it
is what the fix was written against**: because the two plates are duals, one rule — a long day
striping its own rows in the day's opposite plate (`ArchiveCard`, `LONG_DAY_ROWS`) — moves 24.53
up and 80.56 down at once. Neither number survives; that window now reads 54.52 / 41.15 in light
and 51.56 / 44.14 in dark (PROVENANCE: `docs/brand/census.json`).

The fourth finding needed no new row, only the fixture correction: **`div.hero-frame` read
13.61% Bone against a 15% floor, in both themes, on every 375px app row.** The section reading
found it as soon as the banner stopped inflating it. It is the app's own instance of the hero
band §2 names, and it is closed — §2.1b's opening block states the declaration and the arithmetic.

**What was deliberately NOT added, with the reason, because an absent row is a claim too.** The
desktop twins of all three pairs: the drawer costs 0.8 mean-dev at 1440 and the dense day's
defect is width-independent (at 1440 with 120 rows the same run reads 92.7% field, over the 85%
cap — a worse number, from the same cause). The check-back prompt: already on screen in every
seeded row, `d0` is due on the frozen day. A non-empty live region: already covered, by accident,
and now covered on purpose by `announcements`. A heavy spread-out ledger: measures nothing, per
the window above.

**AND THEN A FOURTH PAIR WENT LIVE, BECAUSE A CHANGE MADE A SCREEN THAT DID NOT EXIST BEFORE.**
`cold` was the pair this section listed as deliberately absent — "day one sits between day zero
and seeded and carries no state either of them lacks" — and that reasoning was sound about the
app as it then was. Round 7's product step ended it. Card 01 no longer prints a demo-derived
score while `profile` is null: it prints the WEEK BLOCK, a stated run of the last seven days of
the record (see `HeroCard`, `weekToDate`). `day0` has no rows, so it renders the block's one-line
empty state; every `seeded` row has a profile, so it renders no block at all. The block with
something in it — the facts line, the repeated-category list, the definition note — was on no
row in the matrix. So the fixture was redefined to the state the change is about (six rows over
five days, pre-setup, one of them a resist) and the pair was uncommented.

```
PROVENANCE: HISTORICAL — the census committed at a5add96, which stamps tree
            44ff64a, dirty. All three of these band breaches are closed; see
            the ROUND 8 block at the end of this section.
   app.375x812.light.cold   doc 4952   7 windows  meanDeviation 15.84  worst @3248 dev 65.86
      TWO band breaches + one mean.  window @3248 27.12 field / 59.80 bone
                                     mean bone 37.92, outside 30±6
   app.375x812.dark.cold    doc 4952   7 windows  meanDeviation  4.01  worst @3248 dev 43.40
      ONE band breach.               window @3248 bone 8.35, under the 15 floor
```

`@3248` is the theme-twin check paying for itself again, and it is the SAME defect `day0` already
records one window earlier (`@2436`, 27.13 / 61.49 light against 66.82 / 15.16 dark): before
setup, `ProfileCard`'s open form is one unbroken ground taller than a viewport, and neither the
day list nor the decision record — the two surfaces whose stripe breaks a run on the seeded page
— has anything in it to stripe. It is a pre-setup structural run, it is not the week block, and
it was not fixed in the round that found it. It was measured on two pairs instead of one, which
was the only claim this section made about it — and measuring it on two pairs is what made it
worth eleven waivers to somebody.

**IT IS FIXED NOW, AND THE FIX IS THE SAME SENTENCE THIS SECTION ALREADY CONTAINED.** "Neither the
day list nor the decision record has anything in it to stripe" names the two surfaces that carry a
plate on the seeded page — and it does not say the third thing, which is that the card doing the
running had no plate at all. `ProfileCard`'s SAVED branch has carried
`<ul className="profile-rows counter-plate">` since the first plate pass; its OPEN branch, the one
this whole defect is about, was bare paper. So the three optional groups — Emergency fund,
Revolving debt, Savings goal — take `.counter-plate` (`.note-pad` is the precedent: a plated
`fieldset` full of form controls). The required income/essentials pair stays on the paper, and the
`.btn-flame` submit stays off the plate, because Flare on the plate's Sand-in-dark half is 2.51:1.
The plate bleeds `--s2` into the card's inset for the reason the archive head does — without it
every field re-wraps a line narrower, the document grows ~305px instead of ~96, and the grid
re-phases into new breaches at the far end. All eleven `day0` and `cold` band breaches close, and
`app.375x812.dark.day0` becomes the best app row in the matrix at meanDeviation 2.90
(PROVENANCE: `docs/brand/census.json`).

**The week block moved `day0` toward the band on both axes and in both themes**, which is what a
counter plate in `.hero-main`'s slot is supposed to do — a plate is the ground's OPPOSITE, so one
block moves the two themes the right way at once (§2.1b). Three artifacts, because two changes
landed on this row and pretending they were one would be the mislabel this section keeps paying
for:

```
BEFORE = the census committed at 83c9a9e, which stamps tree ec3aa0c, dirty.
         No week block.  (The carrier is named the way §2.1b's closing rule
         asks: the census committed AT ec3aa0c has twelve rows and no `day0`
         row at all, so it cannot be the source of any figure on this line.)
MIDDLE = the census committed at c3c6c3b, which stamps tree 83c9a9e, dirty.
         Week block in; HeroCard still printed the calibration clause here.
AFTER  = the census committed at a5add96, which stamps tree 44ff64a, dirty.
         NOT docs/brand/census.json any more — this line used to name it, and
         round 8's setup-form plate moved both rows off it. The calibration
         clause is withheld before setup (it qualified a score this card had
         already refused to render — see HeroCard), which is 20px off the
         document. Read the ROUND 8 block below for where these two rows are.
Counts are the `breaches` ARRAY LENGTH, so each includes the two-accent advisory.
app.375x812.light.day0   mean-of-windows dev 22.16 -> 20.05 -> 19.89
                         breaches 7 -> 5 -> 5
                         field 50.85 -> 51.69 -> 51.57   bone 38.80 -> 38.26 -> 38.36
app.375x812.dark.day0    mean-of-windows dev 16.28 -> 15.19 -> 15.64
                         breaches 4 -> 3 -> 4
                         field 63.41 -> 63.23 -> 63.37   bone 23.62 -> 24.06 -> 23.91
```

The dark row went one breach BACK at the last step and the entry stays in because of it: shrinking
the document by 20px re-phased the grid, and `@3248` — which read 15.07% Bone in MIDDLE, 0.07 over
the floor — came in at 14.84, 0.16 under it. That is §2.1b.1's arbitrary phase again, on a change
that removed a line of type. It is recorded, not corrected; the correction would be to move a
boundary until the grid samples somewhere kinder, which the same section forbids.

Every `seeded` row is BYTE-IDENTICAL across both changes, and that is the design rather than luck:
the week block renders only while `profile` is null and the calibration gate only fires where
`hasScore` is false, so the twelve rows this section's earlier paragraphs quote measure exactly
the same DOM they did before.

**THE ROUND 8 STATE OF THE SIX ROWS THIS SECTION ADDED.** Thirty waived breaches went to five: one
window/mean entry, four `.lp-foot` sections, and every one of the ten `div.hero-frame` entries
gone. Three changes did it and each is one idea — a uniform padding on the hero's centred
container, a counter plate under the setup form's optional groups, a sub-day stripe inside a long
ledger day. None of them moved a boundary until the grid sampled somewhere kinder; all three
added ground where a run needed interrupting, which is the only move §2.1b offers.

```
PROVENANCE: docs/brand/census.json, the artifact this section ships with.
Counts are BAND breaches — `breaches` minus the two-accent advisory every app
row carries, so each array is one longer.
   app.375x812.light.day0   doc 4306  6 windows  meanDeviation  8.44  worst @2436 dev 44.18
      ZERO.  mean 56.52 field / 34.00 bone.  Worst window 37.91 / 51.77.
   app.375x812.dark.day0    doc 4306  6 windows  meanDeviation  2.90  worst @3494 dev 22.39
      ZERO.  mean 60.75 field / 29.30 bone — the best app row in the matrix.
   app.375x812.light.cold   doc 5048  7 windows  meanDeviation  8.86  worst @2436 dev 44.17
      ZERO.  mean 56.51 field / 34.43 bone.  Worst window 37.92 / 48.80.
   app.375x812.dark.cold    doc 5048  7 windows  meanDeviation  6.95  worst @3248 dev 27.86
      ZERO.  mean 57.09 field / 33.47 bone.  Worst window 48.03 / 43.65.
   app.375x812.light.dense  doc 6816  9 windows  meanDeviation  9.92  worst @6004 dev 27.96
      ZERO.  mean 57.05 field / 34.96 bone — 1.04pp inside the 30±6 tolerance.
   app.375x812.dark.dense   doc 6816  9 windows  meanDeviation 13.19  worst @5684 dev 35.69
      ONE, and it is waived as a DECISION:  mean bone 36.59, 0.59 over.
      All nine of this row's windows are inside the band; what is left is a
      document mean on the fixture built to be adversarial.
```

**The one that stays is a duty cycle, not a defect, and refusing to close it is the finding.** The
sub-day stripe's two plates are duals, so any duty cycle that pulls light's mean Bone down pushes
dark's up by nearly as much; the corridor that satisfies both at once is about half a point wide.
Measured on this tree, both `dense` rows: one row in two gives light 34.96 and dark 36.59; two
rows in five gives light 35.97 and dark 35.59 — both inside, by 0.03 and 0.41. Two-in-five closes
the last waiver in the app and it is **refused**. 0.03pp is the width of a re-wrap, not a margin,
and a modulus chosen so that a mean lands inside a tolerance is §2.1b.1's forbidden move with
arithmetic instead of a paragraph. The stripe stays at one in two — the alternation the day groups
above it already use — and the number is pinned in `census.test.ts`, where a drift in either
direction fails.

#### 2.1b.3 A paragraph of copy is a composition change, and the grid phase will bill you for it

Round 7's growth step put 178px of terms into `.lp-wall` on the phone — a mono stamp, one claim
and three lines saying what the app will not do to the reader, above the fold and ahead of the
mechanic. **No ground changed.** No plate was added or taken away, no token moved, and the only
new paint is a 6px Graphite keyline standing where `.lp-share`'s Flare one already stood. It is
copy. It moved every window on all four landing rows, and it is worth stamping BECAUSE it is
only copy: the model §2.1b hands a designer works on paragraphs exactly as it works on plates.

```
PROVENANCE, and the two ends of this comparison are BOTH historical now — the
step it records is two changes old.
BEFORE = the census committed at 83c9a9e, which stamps tree ec3aa0c, dirty.
         No block.
AFTER  = the census committed at 44ff64a, which stamps tree c3c6c3b, dirty.
         The 178px block, before the badge stripe's tail was fixed.
landing.375x812.light.fresh   mean-of-windows dev 3.13 -> 5.50   doc field 58.82 -> 57.35
landing.375x812.dark.fresh    mean-of-windows dev 2.67 -> 1.71   doc field 61.03 -> 59.44
landing.1440x900.*.fresh      mean-of-windows dev 8.22 -> 8.07   doc field 61.34 -> 59.88
NOW (docs/brand/census.json), after the last badge took its fill back and the
no-retention rule grew a clause — mean-of-windows dev rises because doc field
falls further below the 60 target, and every row is inside the band with zero
window breaches, which is the reading the band actually makes:
landing.375x812.light.fresh   mean-of-windows dev 9.16   doc field 55.45
landing.375x812.dark.fresh    mean-of-windows dev 5.37   doc field 57.53
landing.1440x900.*.fresh      mean-of-windows dev 8.06   doc field 59.88
```

**The model, read backwards, priced the paragraph before it was written.** `.lp-wall`'s window
`@0` held 66.48% field / 24.25% Bone in the census committed at `83c9a9e`, which stamps tree
`ec3aa0c`, dirty — 6.5pp OVER the 60 target. A Bone-grounded block inside an 812px window trades
about **0.082pp of field per pixel** of height on this page — the least-squares slope across all
three drafts of the same block, which is also the figure Landing.tsx quotes for the same page.
(The pairwise slopes are 0.084 from 0 to 178 and 0.075 from 178 to 229; this line used to quote
0.075 and call it the three-draft figure, which is the one of the three least representative of
the set.)

```
PROVENANCE, one carrier per line, per this section's own closing rule.
row landing.375x812.light.fresh.
  0px  — the census committed at 83c9a9e, which stamps tree ec3aa0c, dirty.
178px  — docs/brand/census.json, the artifact this document ships with.
229px  — the census committed at c3c6c3b, which stamps tree 83c9a9e, dirty.
         NOT an unmeasured draft: it shipped, it is in the history, and the
         three figures on its line are that file read verbatim.
block height   wall height   window @0 field      window @4872 field
     0px          1675           66.48                  73.51
   178px          1869           51.57                  64.20
   229px          1920           47.77                  78.25
```

**The two columns are different statistics and the right-hand one is no longer even a series.**
`@0` is: all three of its readings are the same page with a different block in it. The `@4872`
column is not, because the tail of the badge grid changed under it AFTER all three drafts were
measured (see `.lp-badge`'s `:not(:last-child)` in landing.css). 64.20 is this tree with the
178px block in it; 73.51 and 78.25 are the construction that preceded it, and the 178px line read
80.11 under that construction. Read down that column for history, never for a trend.

**`@0` is monotonic in the block's height and it is the real reading**: the block is IN that
window, the trade is Bone for field one pixel at a time, and the 62-word draft (357px, not in the
table — it also pushed `.lp-share`'s lead under the fold) would have overshot to the other side of
the target as far as the page started on the near side of it. The 25-word form is the one that
lands nearest 60. That is the whole of §2.1b's arithmetic applied to a paragraph, and it is why
the block's length is recorded in Landing.tsx as a constraint rather than as an edit.

**`@4872` WAS NOT MONOTONIC, IT WAS A BREACH, AND IT IS PAID.** The block does not appear in that
window at all; the window only moves over the `.lp-spec` → `.lp-shear` boundary as the wall above
it changes length. At the 178px draft it read 80.11 — a recorded band breach, 0.11pp over the 80%
field cap, on both `landing.375x812` rows — and it was one grid sample of a run that had ALREADY
been measured worse: on the clean tree of `9a42bd8` the sliding-window probe put
`landing.375x812.dark` at 81.78% field / 14.42% Bone at offset 4783, outside the band on both
axes, at a phase the grid does not sample. (That figure is HISTORICAL and belongs to no committed
series — see §2.1b.4. On this tree @4783 reads 58.37 / 35.62, so the badge fill closed it at every
phase and not only at the grid's.)
**The cause was the run, not the paragraph, and the run is what was cut.** `.lp-spec`'s tail meets
`.lp-shear`'s head on the SAME Espresso ground, and the badge stripe's derivation ("the longest
keyline run is two badges, ~370px") silently assumed every keyline run is flanked by Bone. The
last one is not: below the last badge there is no next badge, only two sections' padding and a
d2 sign, and the run measured 545px in Chromium at 375×812 on the tree of `44ff64a`. Filling the
last badge gives that run the flank the derivation already assumed. It moves no box — a fill is
not a length — so §2.1b.1's binding sentence is not being spent: **the answer was not to
relengthen the wall until the grid sampled somewhere kinder.** `@4872` now reads 64.20 field /
30.31 Bone, deviation 9.01, and both `landing.375x812` rows record zero window breaches. The bill
was paid in Bone, not in phase.

#### 2.1b.4 The fourth reading — the band with the grid's phase taken away

**`worst`, `mean`, `meanDeviation`, `breaches` and `windows[]` ARE UNCHANGED AND ARE STILL THE
GRID'S.** Nothing above this heading is renumbered, retired or recomputed; every figure §2.1b,
§2.1b.1, §2.1b.2 and §2.1b.3 quotes, every `@0`/`@4872` column and every pinned window waiver
still means what it meant. `scrollingForm.sliding` is a NEW BLOCK and a NEW SERIES, starting at
round 8, with **no comparable predecessor in any earlier census**. The round-7 sliding figures
elsewhere in this document — `landing.375x812.light` @1992 at 27.84 / 63.79, the 30.48–67.58
spread, `landing.375x812.dark` 81.78 / 14.42 @4783 — were a SCRATCH PROBE on the clean tree of
`9a42bd8`. They are not this series and must never be diffed against it.

§2.1b.1 already stated the defect: *"The window grid has a phase, and the phase is arbitrary."*
It was stated and not acted on for a round. `sliding` evaluates the same band and the same caps
at **every** offset — step 1, because a step of 8 is a smaller arbitrary phase rather than the
absence of one — and records the worst screen, the two banded buckets' extremes, and each
crossed bound with **how many offsets cross it**.

```
worst        the worst screen on the page, at any offset. Phase-free.
extremes     field and bone, min and max, with the offset of each.
excursions   one per bucket per side: the bound crossed, the worst value,
             the offset, and the EXTENT in offsets. The cap is reported
             INSTEAD of the band, as it is for a window — restated for a
             range, where one row can hold offsets past the cap and other
             offsets past the band only.
NO MEAN, and that is a rule rather than an omission.
```

**There is no sliding mean and there may not be one.** Scanline *y* is covered by
`min(y,L) − max(0,y−W+1) + 1` windows, so an all-offsets mean down-weights the first and last
viewport of every page on a ramp from 1/W to 1: a triangular-weighted DOCUMENT average dressed
as a mean of screens, which is the exact statistic this whole section exists to reject. The
grid's mean gives every screen weight 1 and stays the mean. This is why the fourth reading is an
ADDITION and not a replacement — the grid is the better instrument for one of the two statistics,
so retiring it would be paying a comparability discontinuity for a downgrade.

**The implementation changed and the numbers did not, and that is checked rather than claimed.**
Re-slicing per window is O(window pixels), and the slide asks for **88,154** windows across the
matrix instead of 136. So each SCANLINE is classified once and prefix-summed, and every window —
grid or sliding — is an O(1) subtraction. The counts are integers, so the swap does not
approximate the old slicer, it reproduces it: `census.test.ts` compares the two over every offset
of three viewport heights and the worst disagreement is **0**, not "0 to 2dp".

The cost is negative, which is the whole reason the reading is affordable. Measured on this
container over all twenty committed rasters (a scratch bench on this tree, not the census):

```
prefix pass, all 20 rows          576 ms     <- REPLACES the line below
per-window slicing, 136 windows  1352 ms
grid windows off the prefix      0.33 ms
sliding, all 88,154 offsets        46 ms
naive slide (extrapolated)       ~875 s      = 14.6 minutes
```

The fourth reading costs 622ms where the second alone cost 1352ms, so the census got faster while
gaining it. That matters more than it sounds: a tool nobody re-runs when pixels move is the
failure this instrument exists to end, and 14.6 minutes is how you get one.

**WHAT IT REPORTS: SIX BREACHES ON FIVE ROWS, AND ALL FIVE ROWS RECORD ZERO WINDOW BAND BREACHES.**
Fifteen of twenty rows are clean at every offset, so this is not a reading that fails everything.
(PROVENANCE: `docs/brand/census.json`.) The grid worst understates the true worst screen on every
row in the matrix, by 0.17 deviation points (`app.375x812.light.seeded.breakdown`) to 25.12
(`landing.1440x900.*`).

```
                                   grid worst        sliding worst
app.375x812.dark.day0              22.39 @3494       40.75 @2844
landing.1440x900.*.fresh           30.60 @4068       55.72 @1455
landing.375x812.*.fresh            37.96 @5684       53.96 @5891
```

1. **`app.375x812.dark.day0`, `bone 14.31 under the 15 band, 88 of 3495 offsets, @1111.** The
   pre-setup structural run §2.1b.2 records — closed at the grid's phase by ProfileCard's counter
   plate, which took eleven waived entries with it, and still there between two grid samples. The
   window at @1111 catches 77px of that plate's tail and then ~735px in which no scanline band
   exceeds 15% Bone; the grid reads Bone 29.44 at @812 and 30.69 at @1624. **It is in no section
   record either** — the row carries `pageGround: null`, one section (`div.hero-frame`, 276px) and
   `nested: []` — so this is the one screen in the matrix that the second and third readings both
   structurally cannot see. It is one defect seen twice: at the same offset of the same DOM, dark
   reads 71.52 field / 14.31 Bone and light reads 59.56 / 27.93, so a plate — the ground's
   opposite — moves both the right way at once. (PROVENANCE: `docs/brand/census.json` for the
   grid, section and sliding figures. The light twin's vector at @1111 is not a field in that
   file — only the extremes are — so it was read off the same run's raster on this tree, with
   `--keep-shots`, and it is stamped here rather than committed.)

2. **`landing.1440x900.*`, `bone 57.86 over the 55 band, 175 of 4069 offsets, @1453.** Inside
   `section.lp-spec` (@1180, **h2241** against a 900px viewport, `held: false`). §2.1b.1 does not
   band-check a section longer than the viewport, and it says why: *"Longer is a SEQUENCE and the
   windows already own it."* The windows own it and the windows' phase misses it — @900 reads Bone
   37.92 and @1800 reads 41.47. **That is the seam between the second and third readings**, and
   the slide is the only one of the three with a boundary in the middle of a section two and a
   half viewports long.

3. **`landing.375x812.*`, `field 34.92 under the 35 band (6 of 6570)` and `bone 55.65 over the 55
   band (150 of 6570)`.** The same seam on the phone, in `section.lp-shear` (@5270, **h1365**
   against 812, `held: false`). Two bounds, one run. The field entry is a HAIRLINE and is waived
   as one rather than hidden: 0.08pp under, across six offsets, 5886–5891. The instrument's own
   run-to-run drift, observed once on `app.375x812.dark.cold`, is 0.01pp, so it is eight times the
   noise floor and real. Round 7's probe put this row's worst at @1992 (27.84 / 63.79) and @4783
   (81.78 / 14.42); **both are closed** — 42.33 / 49.24 and 58.37 / 35.62 on this tree, inside the
   band on both axes. The worst moved, which is what a worst does. (PROVENANCE: the round-7 pair
   is HISTORICAL, a scratch probe on the clean tree of `9a42bd8`. The breach strings and their
   extents are `docs/brand/census.json`; the two closure vectors were read off this run's rasters
   at @1992 and @4783, offsets the artifact does not serialise.)

**Enforced exactly like the other two.** `census.test.ts` carries `SLIDING_WAIVERS`, verbatim and
exact in both directions: a new breach fails, a drifted number fails, a closed breach fails.
**The string pins the EXTENT as well as the depth**, which the window strings cannot: over a range
a hairline that stays exactly as deep and spreads from six offsets to six hundred is a regression
no magnitude can see. A count is a fact, so this needs no threshold and does not become the tuned
heuristic §2.1b.1 forbids by name. And the churn is not new — `inputsHash` already forces a full
re-census on any pixel change, so these waivers move exactly when the window waivers already move.

**These six are OPEN, not WONTFIX**, which is the opposite of the `.lp-foot` entries above. The
cause of each is named and none was paid in the round that built the reading that found them. The
precedent is round 7's four fixture pairs: they broke on arrival, they were waived with their
cause stated, and round 8 paid fifteen of the sixteen. **`scripts/census/artifact.ts` joins the
staleness inputs in the same change**, because it decides what every number in the file means and
its absence from that list is how `BUCKET_NOTE` contradicted the rows block of its own file for
three rounds without the suite going red.

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
