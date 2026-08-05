<p align="center">
  <img src="docs/brand/og.svg" alt="The Ember mark and wordmark on an orange field, over the line: built flat, logged in DA." width="820">
</p>

<h1 align="center">Ember</h1>

<p align="center"><strong>A money app that runs on your phone, not on your bank.</strong></p>

<p align="center">
  <a href="https://github.com/Brvetr4ve1er/money-manager-/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Brvetr4ve1er/money-manager-/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-2A2D2C"></a>
  <img alt="Zero runtime dependencies beyond React" src="https://img.shields.io/badge/runtime%20deps-react%20only-F93E06">
</p>

```
LOGGED BY HAND  ·  PRICED IN DA  ·  NO ACCOUNT  ·  NO BANK LINK  ·  EXPORT ALWAYS
```

## What it is

A money tracker for people whose money problem is friction, memory and
impulse — not arithmetic. You log what you spend, by hand, in Algerian dinars.
Ember groups the log by day, shows you where you are in the month, scores your
financial reality from five weighted components — once you have entered your
own figures in **My numbers**, and redistributing the weight of any component
you leave blank — and states the tradeoff when you are deciding on a purchase.
Before that it prints no score at all, and prints your last seven days instead.

It runs in a browser tab with nothing behind it. No account, no server, no
bank link, no purchase path — `src/` contains no `fetch`, no socket and no
auth. Every byte lives in that browser's local storage. Close the tab and
Ember has nothing on you.

A purchase is two taps: one cash key, then Log.

## Nothing here grades you

The landing page says this above the fold, and it is a claim about what the
product will not do, so it is worth stating in full where there is room.

There is no score until you enter your own numbers. Before that the health card
prints your last 7 days — days logged, what they came to, what you resisted,
any category with more than one row — and names the gap exactly once: *"No score
yet. Your numbers turn it on."* No stage, no rating, no numeral computed off a
demo profile's salary. Days are counted, never chained: the day figure is a
count, it cannot become a run, and there is no grid of days to read as hits and
misses. The record carries no target line, no average and no projection — the
component is never handed your profile, which is the structural reason a budget
bar cannot appear on it. Tick **"I bought it anyway"** and the row logs at full
XP with a quiet marker and no colour.

That last one is the whole register. `docs/brand/DESIGN-SYSTEM.md` §7.1 prints
the two failures side by side — *"You blew the budget again"* and *"It's okay!
Everyone slips sometimes"* — and bans them as one rule, because the second
presumes the slip and then comforts you for it. What ships instead is *"Over by
4,200 DA. Logged."* The dryness is the respect.

`src/noVerdict.test.tsx` is that paragraph as a test. It renders the app on a
month that spent four times its own essentials figure, with impulses ticked, and
asserts the whole rendered document — cards, drawer, toasts, live regions —
matches none of four registers: punitive, comforting, retention and projection.
It reads the RENDER rather than the source on purpose: `budgetAdherenceScore`
and `longestLogStreak` are real identifiers in a real engine, and what the page
promises is about what a person reads. The landing is held to the same four,
which is what stopped its own copy from printing the retention vocabulary in
order to deny it.

## Send it to a friend who overspends

The reason is one mechanic, and it is the one thing a bank-linked tracker
cannot do at all: **Ember logs the thing you did not buy.**

You type the amount and press **"I resisted an impulse"** instead of Log. The
row records what the purchase would have cost. It adds nothing to that day's
total — money that did not move is not spend — and it sums into one line at the
head of the record card: `3,500 DA resisted this month`. A bank feed can only
ever see money that moved, so this row does not exist anywhere else.

**Hand entry is what makes the row possible**, which is the part that reframes
manual logging from a cost into the position. A feed imports events. Not buying
is not an event, so no amount of automation reaches that row: the only product
that can hold it is one where a person puts it there. Manual-first is not the
price of having no bank integration — it is the thing the integration could not
have bought.

The other half is what happens when you lose. Buy it anyway, tick "I bought it
anyway", and the row reads the same as any other: full XP, a quiet marker,
no colour, no lecture. That is what makes Impulse Control a real two-sided
ratio instead of a resist-only self-report — and it is why the honest log is
the one you keep using.

That `3,500 DA resisted this month` is not typed: `src/README.test.ts` builds it
with the record card's own `resistedChipLabel` over the same `sampleLedger` rows
the landing page renders through the real component, and the landing's fold
prints it the same way. Neither document can quote a line this product does not
print.

## Is it for you

**Yes, if —**

- You deal in cash, in DA, across accounts no aggregator covers.
- You will not hand a bank login to an app, and would rather type the number.
- You have quit a budgeting app because it lectured you. Ember states the fact
  and stops: a day total is flat ink, no colour verdict and no comparison; the
  record card shows totals with no target line and no projection; the string
  "over budget" appears nowhere in the product; the score explains itself and
  never advises. `src/noVerdict.test.tsx` renders the app on a bad month and
  holds the whole screen to that — see **Nothing here grades you** above.
- You want your data to leave with you. One tap, full JSON, no account.

**No, if —**

- You want automatic bank sync. Nothing here reads a bank — and in a cash
  economy a feed is a partial record by construction, so the automatic
  competitor is the one with the gaps. Every row is typed or tapped in.
  Nothing is imported, so nothing is auto-categorised, so no row is
  quietly filed under the wrong merchant. That is the design, not a gap in it.
- You need a currency other than DA. Amounts format as DA everywhere; there is
  no converter and no second unit. Ember is built for one market and prices
  itself in that market's notes: the cash pad is 2000 / 1000 / 500 / 200 / 100,
  the denominations actually in circulation.
- You want it on several devices. Storage is one browser's local storage. Two
  tabs of the same browser merge; two phones do not. Export writes a JSON file
  you move yourself — there is no import screen that reads it back in.
- You want a shared household ledger. One browser, one ledger, nobody to share
  it with.

Ember is not treatment and does not imply it. It is a logbook with a score on
it.

## The eight mechanics

```
01/08  HEALTH SCORE     No score until your own numbers are in. Your last 7 days stand there, and the card says so: "No score yet. Your numbers turn it on." Then: five components, shrunk for thin data. It explains; it never advises.
02/08  THE RESIST       Resisted, not spent. Summed for the month. The total is not a score input.
03/08  THE SIMULATOR    Baseline against scenario. States the tradeoff. Never the verdict.
04/08  THE RECORD       The last 60 runs kept, with the line each printed. Bought it · Waited · Resisted it. Answers, never a tally.
05/08  THE CHECK-BACK   14 days after "Bought it", one question about the object. Still using it · Not any more · Never used it. Filed, never counted.
06/08  THE MONSTER      This week's discretionary spend is its HP. Last week's is the line. Beatable, never shaming.
07/08  THE MONTH SO FAR Day index, month total, days left, one bar per day. No target line. No projection.
08/08  THE NOTE         80 characters on any row, in your words. Optional, unpaid, never asked for twice.
```

This block is not prose. `src/README.test.ts` holds it to `MECHANICS` in
`src/components/Landing.tsx` — same count, same order, same titles — because
the landing page and this file are two copies of one claim and the second one
is always the one that rots.

"Resisted", not "kept": the app observed the tap, not the outcome. It sums the
prices of things you say you did not buy, and it says so in those words.

**Whose numbers the score is on — and what the card shows before there are
any.** Until you fill in **My numbers** there is no score on screen. Not a
qualified one, not a greyed one: no stage, no rating, no number, on the card and
on the desktop hero alike. The engine still needs an income and an essentials
figure to compute anything, and the ones it would use before setup are a demo
profile's — an invented income, essentials figure and emergency fund. A rating
off a stranger's salary is a claim about nobody, and a disclaimer under it is an
admission rather than a fix.

What card 01 prints instead is **the last seven days of your own record**: how
many days you logged on, what those rows came to, what you resisted, and any
category the week holds more than one row for — *"Food · 4 rows · 1,920 DA"*.
Sums over rows you typed, exact from the first one. It is not a streak: the day
figure is a count and never a run, nothing resets, no gap is named, and there is
no grid of days to read as hits and misses. The card names what is missing once
— *"No score yet. Your numbers turn it on."* — with a link to the card that
supplies it, and never asks again.

Once your numbers are in, the score, the stage, the rating and the *"Why this
stage?"* breakdown all arrive and the week block stands down. The simulator says
its own half while it is still projecting on placeholders (*"Projected on the
demo profile"*). Impulse Control is the one component that reads nothing but
rows you logged, so it is yours from the first tap. Anything you leave blank —
no emergency fund, no debt — is dropped and its weight redistributed across the
components you did fill in, with the card naming each one it left out.

Around them: XP and levels for showing up — one strip, a level line and a bar —
a 30-lesson codex counted on the lesson card, 9 earn-only badges whose reward is
a cosmetic companion on card 01, and chiptune cues that never carry information
alone. The companions stand on the card in both states, before setup and after:
every badge reachable in week one is reachable before you have entered a number,
and an app may not take back what it has already paid.

**The daily quests are deleted, and so is the card they were on.** There were
three, and before that four. The fourth — "look back over your recent
purchases" — went first: it paid XP for a tap the app could not observe. The
last self-report one, "log every purchase today", had the same defect and
outlived it by a round; the app can see rows arrive, it cannot see whether
*every* purchase was logged. The other two were marked verified and rendered as
inert status rows repeating what the lesson card and the simulator already
showed. Take the self-report row out and the card has no control on it at all,
which is the same verdict that retired the XP card before it. What is left is
the level line and the bar. **Nothing you earn is worth less for it:** a logged
purchase, a resisted impulse, today's lesson and a simulation all pay exactly
what they paid before, and every XP grant the deleted quests ever made still
counts toward your level — the grant log is evidence, and evidence is not
edited.

A ninth card holding a 30-tile codex grid and a 9-tile badge shelf went the same
way a round earlier. It was 62.5% of the card stack's rendered elements on
install day — 59.9% at day 40, counted by a jsdom render probe at `a2d4e6d`, the
last tree that rendered it, and a DOM share rather than a pixel share, which is
why it is not in `docs/brand/census.json` — and it carried no control at all:
1,644px of 375px column, last in the stack, to reach nothing you can act on.
Badges still unlock, still announce and still bring their companion; the codex
still rotates and still counts. Only the trophy case is gone.

**The record card** is one card that answers both halves of "where am I". It
was two — a month card stacked on a ledger, two headings and two near-identical
scope disclosures a scroll apart — and they are `ArchiveCard` now: one `h2`,
one scope line, one empty state.

The head is the month: `Day 4 / 31`, the month's logged total, the days left,
and one bar per calendar day scaled to the biggest day drawn. Days before your
first ever row are drawn blank and dashed rather than at zero, and the card says
so in words — *"Days before it are blank, not zero"* — because on install day
the month may already be half over and Ember was not there for it. Under it the
log is grouped by day — Today, Yesterday, then the date — with that day's spend
beside the heading. Resists list under their day and add nothing to it.

The list opens on the last 3 days and grows 30 more per press, up to
everything. It is a step rather than one "show all" because one press used to
render the whole record — 27,793 DOM nodes for a 5,000-row ledger, measured in
jsdom at commit 73b9260, which a mid-range Android pays again in layout and
raster. Nothing is hidden by it: the window keeps growing to the end, and the
line the card announces names the real day count on every press, so a partly
grown list never reports itself as the whole record.

The scope is stated once, in the card's own words: *"Totals only. No targets.
No averages. No projections."* There is no target line, no average, no run rate
and no "at this pace" — a month-to-date total is exact from day one, a
projection off twelve days is not. The component is never handed your profile,
which is the structural reason a budget bar cannot appear on it.

**The check-back** is the one mechanic here that spans weeks. Answer a record
row "Bought it" and it says when it will ask about it — *"Check back in 14
days."* — and on that day the row rises to the top of the record and asks once:
what became of the object. **Still using it**, **Not any more**, **Never used
it**. Three peer answers again, same ink, same weight, no ✓/✗.

What it will not do is the version everybody writes first. It never asks
whether it was worth it: that grades a past self, and the app cannot know the
answer anyway. It never counts the answers — there is no "you stopped using 4
of 7" anywhere, because a count of outcomes is a verdict about your character
one step removed. It pays no XP and touches no health component. And it never
invents a name for what you bought: your note if you wrote one, the amount and
the day if you did not.

It has an honest cold start and the app says so rather than dressing it up: it
needs one closed purchase plus fourteen days of real time, so on day one there
is nothing, and a user who never simulates never sees it. The only thing the
app promises in the meantime is the day it will ask — and it asks on that day
for as long as the run is still in the record, which the `DECISION_MAX` cap
below bounds: run more than 60 simulations inside those fourteen days and the
oldest pending questions are trimmed away with their rows.

**The decision record** sits inside the simulator, not beside it. The last 60
runs are kept, each with the exact line it printed — frozen, never recomputed,
so editing **My numbers** cannot rewrite what the app told you last week; the
cap is `DECISION_MAX`, and the record drops from the oldest end — and each one
waits for an answer: **Bought it**, **Waited**, **Resisted it**. Three peer
buttons, same ink, same weight, no ✓/✗. "Bought it" is first because it is the
honest answer nearest the thumb; it prefills the log field and logs nothing on
its own. "Resisted it" writes an ordinary resist row, capped like any other.
There is no bought-versus-waited tally anywhere in the product, and that
absence is the feature: a record answers, it does not keep score of you.

**The note** is one optional field per row: "What was it?", 80 characters,
capped at both ends — `maxLength` on the input and a sanitiser at the storage
boundary, so a hand-edited payload cannot land a multi-megabyte memo in your
browser quota. It writes what you typed and nothing else. A bad note costs the
note, never the row it rode in on. Rows logged before the field existed render
exactly as they always did: no placeholder, no prompt, no "add a note". And
typing one pays no XP — logging is +5 either way.

**Logging takes cash, not digits.** The amount field carries a pad of the
denominations actually in circulation — 2000, 1000, 500, 200, 100 DA — and each
tap adds one to what is already there, so 1,500 DA takes two keys. Typing still
works and still wins: the pad composes with what you typed and never replaces
it. Tapping keys pays no XP. Only a logged purchase does.

## Trust rules

Product invariants. They outrank the design system and they outrank a feature.

- **XP never feeds the health score.** XP measures showing up. The score
  measures money. Engagement cannot buy a better avatar.
- **The simulator states tradeoffs, never verdicts.** It will tell you the goal
  slips two months. It will never say you can afford it.
- **Nothing is for sale.** Every badge, pet and stage is earned. No purchase
  path exists.
- **Honesty is never punished.** "I bought it anyway" logs at full XP, framed
  neutrally, and is what makes Impulse Control a real two-sided ratio.
- **Honest cold start.** Before setup there is no score — the card prints your
  last seven days instead of a rating computed off a demo profile, and the
  desktop hero withholds the stage with it. Under 90 days it says it is still
  calibrating rather than projecting confidence it has not earned — the
  horizon is `CALIBRATION_DAYS` in `src/engine/profile.ts`, and the landing page
  reads it rather than typing it. Nothing here is a retention device: no streak
  to lose, no missed day, no reminder that escalates.
- **Your data leaves when you do.** Full JSON export, always, one tap, no
  account.

## Run it

```bash
npm install
npm run dev
```

Vite 5 · React 18 · TypeScript strict · Vitest. No runtime dependency beyond
`react` and `react-dom`; no font CDN; the app renders fully offline.

```bash
npm test        # the engine, state and component suites
npm run build   # type-check and produce a production build
npm run brand   # regenerate every brand asset from the mark's geometry
                # (needs Node >= 22.6: --experimental-strip-types landed there)
npm run census  # measure what colour the app actually is, and rewrite
                # docs/brand/census.json (needs a local Chromium)
```

`npm run brand` emits the favicon, the maskable icon, the social card and both
PNGs from `src/components/monogramGeometry.ts` — the same path data the app
renders its mark with, so a shipped asset cannot drift from the mark in the
product. The two PNGs (`og.png`, `apple-touch-icon.png`) exist because social
crawlers reject SVG and Safari ignores SVG touch icons; they are rasterised by
`scripts/raster.ts`, which is Node built-ins only — no rasteriser dependency,
runtime or otherwise. That writer has no font engine, so `og.png` renders §5
layout E (THE OBJECT — the mark alone on flat Flare, one 38° shear, no type)
while `og.svg` keeps layout A with its typeset lines. The words the card used
to carry are in `og:title`/`og:description`, which every crawler renders as
text beside the image.

`og.svg` is written to `docs/brand/`, not `public/`. Nothing on the web asks
for it — crawlers are pointed at `og.png` and the manifest at the two icons —
so it is a documentation asset (this file's header) and `public/` stays exactly
the set of files a client actually fetches. `src/brandAssets.test.ts` asserts
that, along with the shape and the byte ceiling of the PNGs.

### What the payload is

`npm run build` prints the real numbers. Roughly: React, ReactDOM and the
scheduler are 141 kB of the JS bundle — 60% of it, fixed, and not reducible
without changing the dependency line at the top of this section. The other
92 kB is Ember. The largest STATIC asset is `og.png` at 75 kB, which every
share unfurl fetches; the JS bundle is three times its size uncompressed, and
about the same size as it once gzipped (75 kB each), which is the honest
comparison because the PNG does not compress further. It is an indexed PNG
rather than truecolour because the composition resolves to 206 colours, so the
palette is lossless and costs a third of the bytes. `index.html` ships stripped
of its comments — the rationale in that file is for this repo, not for the wire
(`scripts/htmlComments.ts`).

## Install it

Ember ships a web manifest, so Android and desktop Chrome offer it as an app
and iOS gets a real add-to-home-screen icon. There is no app store listing and
there does not need to be — add-to-home-screen is the distribution channel.

## Deploying

Social-share crawlers (WhatsApp, Facebook, Telegram — the dominant channels in
the target market) require **absolute** `og:image`/`twitter:image` URLs and
silently drop relative ones. The canonical link has the same constraint. Set
the origin so `vite.config.ts` can rewrite the card URLs and emit the rest:

```bash
VITE_SITE_URL=https://ember.example.com npm run build
```

That injects `og:url` and `<link rel="canonical">`, rewrites the card URLs, and
emits `robots.txt` + `sitemap.xml` into `dist/`.

Deploy checklist:

- [ ] `VITE_SITE_URL` set to the canonical https origin (no trailing slash)
- [ ] `dist/index.html` contains absolute `og:image`/`twitter:image` URLs, an
      `og:url` tag and a `<link rel="canonical">`
- [ ] `dist/robots.txt` and `dist/sitemap.xml` present and pointing at that origin
- [ ] `/manifest.webmanifest`, `/icon.svg`, `/icon-maskable.svg` served
- [ ] `/og.png` (1200×630) and `/apple-touch-icon.png` (180×180) served, and
      regenerated with `npm run brand` if the mark changed — both are emitted
      from the mark's geometry and the output is byte-stable, so a re-run on an
      unchanged mark produces no diff
- [ ] `dist/index.html` contains no HTML comments (the build strips them) and
      `dist/` contains nothing that no document references

## Design

`docs/brand/BRAND-BOOK.md` is the reference: DNA, colour, type, logo
construction, voice, art direction, motion. `docs/brand/DESIGN-SYSTEM.md` is
the binding spec it summarises. Where the two disagree, the design system wins;
where the design system disagrees with a trust rule, the trust rule wins.

Three colours, one diagonal, everything in a rounded box. No drop shadows, no
white, no emoji as iconography, and a contrast law (§2.1) that is enforced
rather than aspirational — Flare is a field, never a text background, which is
why every string under 24px in this product sits on a plate.

### The colour census

`docs/brand/census.json` is the committed answer to "what colour is this app".
`npm run census` builds the production bundle, serves it, drives a headless
Chromium over the DevTools protocol with no dependency added, screenshots
twenty full pages (landing at 375/1440, app at 375/1024/1280/1440, each in
both themes, plus four phone-width pairs: the app's first screen before any
setup, the pre-setup app with a week of rows on it, a ledger day holding 24
rows, and the health drawer open), classifies
every pixel to its nearest palette token in CIELAB, and folds the twelve tokens
into the four terms of the ratio law (§2's 60/30/8/2). `npm run census -- --diff`
prints what moved without writing. The whole matrix takes about 56 seconds —
roughly 27 for the twelve rows it had before, 24 for the eight added, and 7 for
the extra settle comparison every phone-width app row now needs.

It reads each page **twice**. The document reading is the whole-page average and
is comparable with every figure the project published before the tool existed.
The second reading, `scrollingForm`, cuts the document into viewport-height
windows and measures each one, because a document average is not something
anybody looks at: `app.375x812.light.seeded` averages 56.59% field over the
document while its seven windows run 58.40, 49.05, 68.84, 53.43, 48.70, 44.92
and 73.98 — a vector that appears on no screen. (Those are the committed rows at this
tree, quoted the way §2.1b requires. An earlier draft of this paragraph said
"averaged 56% while its windows ran 15% at the head and 91% at the tail" with no
tree on it, which was a figure from a tree that still had a ninth card — on the
one page in the repo that exists to explain why undated pixel figures are
forbidden.) §2 is unchanged for anything the eye holds at once (the poster, the
mark, the hero band, each landing section). For a scrolling application document
the second reading is the one that is true, and `npm run census -- --windows`
prints the per-screen table behind it.

There is a **third** reading, `composition`, and it exists because the window
grid has an arbitrary phase: it tiles from offset 0, while a reader scrolls
continuously. Slide the window over every offset of `landing.375x812.light` and
the worst-window deviation ranges from 30.48 to 67.58 — the grid reports one
sample of that. So the census also asks the page where its own compositions are:
one walk of the render tree picks out every opaque, full-bleed, in-flow ground
whose colour differs from its nearest ground ancestor's, and §2 is applied to
each **section** that is no taller than the viewport, because that is §2's own
precondition. Grounds nested inside a section get §2.1b's other sentence
instead — *no single ground may run longer than one viewport* — which nothing
checked until now. There is no selector list and no per-page knowledge; the same
walk runs on the app rows and finds the hero band, which is one of the surfaces
§2 already names. See §2.1b.1 in `docs/brand/DESIGN-SYSTEM.md` for the rule and
the two breaches it found that no phase of the window grid could see.

Each row also records **whether the page was actually at rest**, because the
settle check cannot answer that on its own: it compares two captures 400ms
apart, and a byte comparison cannot see anything that changes more slowly than
it samples. App's reward toast lives 2,600ms, and for three rounds the census
fixture qualified for two achievements it had not persisted — so every app row
was captured mid-celebration and the design system's worked example quoted a
banner as the app's reading at rest. `announcements` now lists every live region
that was painting text at capture (empty on every row, and a test says
so), and `settleAttempts` records how many comparisons a row needed rather than
swallowing the retries. See §2.1b.2 for the four row pairs added on the back of
that, and for the band breaches they found on screens nothing was measuring —
the app's first screen before setup breaches in both themes.

It exists because the numbers used to live in an agent's recollection. One round
shot its screenshots at 07:52, committed at 10:08, and published the 07:52
figures as a description of the committed tree; the next round inherited them
and had to throw the premise away. So the artifact carries an `inputsHash` — a
sha256 over every file that can change a pixel — and a test in the ordinary
suite asserts it still matches the working tree. Edit a stylesheet, commit
without re-running the census, and the suite goes red naming the command. The
commit SHA in the file is provenance only; it would not have caught that.

Three things it deliberately is not. It is **not a gate on the ratio law** — the
law is a target, not a direction, and a naive threshold would block the correct
work of pulling an overshooting screen back down. It is **not portable between
machines**: the type stacks end in system fallbacks, so the artifact records an
`env.fingerprint` and the diff refuses to subtract across a mismatch rather than
print a misleading delta. And its headline figure is **not a viewport
measurement** — the denominator is the whole document, so a taller page dilutes
every percentage without any colour changing. Read `pixels.total` before reading
a shift as a palette change, and read `scrollingForm` before reading the
document average as a description of anything a person saw.

Everything the run needs is pinned from outside the app — frozen clock, pinned
timezone and locale, seeded storage, `prefers-reduced-motion: reduce` — because
a tree that renders differently while being measured is not the tree that ships.
`src/` contains not one line that knows the census exists. The run also takes
the input hash **before** the build and again after the last row, and writes
nothing if they differ: measuring early and publishing late is the defect the
tool exists to end, and it would otherwise have been reachable from inside the
tool itself.

**If you have no local Chromium**, the staleness test will go red on any
stylesheet edit and there is no environment-variable bypass — a gate with a
documented escape hatch is a gate that gets used through the hatch. The relief
valve is the advisory `census` job in `.github/workflows/ci.yml`: it runs on
pull requests whose diff touches `src/`, `index.html` or `scripts/census/`,
prints the same table, and produces a correct `census.json` for you to commit.
It is `continue-on-error` on purpose — a missing Chrome in a future runner
image, or a row that will not hold still, reports rather than blocks.

## Project layout

- `src/engine/healthScore.ts` — Health Score Formula v0.1
- `src/engine/simulator.ts` — Decision Simulator Logic v0.1
- `src/engine/xp.ts` — XP, levels, and titles
- `src/engine/profile.ts` — user profile, demo fallback, calibration window
- `src/engine/boss.ts` — weekly boss battle engine
- `src/engine/achievements.ts` — badge roster and pixel pets
- `src/engine/ledger.ts` — day grouping, day totals, the day headings,
  `monthToDate` (the month's per-day totals, day index and record window),
  `weekToDate` (the last 7 days as a count of days logged, two totals and the
  categories holding more than one row — what card 01 prints while it is
  withholding the score) and
  `resistedThisMonthDA` — the month's resisted total, in the engine because the
  record card and the landing page's pitch both state it
- `src/engine/keypad.ts` — cash denominations and the amount composition
- `src/content/lessons.ts` — the 30-lesson codex content
- `src/content/sampleLedger.ts` — the sample rows behind the landing's product
  shot (dated against the day the page opens, so the shot cannot go stale;
  three of the seven carry a note, four do not, because the field is optional)
- `src/state/store.ts` — local-first persistence, sanitization (including the
  80-character note cap), multi-tab merge, export, the local-calendar day key
  every date in the product is stamped with, and the three decision answers the
  simulator and the landing page both render
- `src/state/reducer.ts` — pure state transitions (XP grants, undo, rollover)
- `src/localFirst.test.ts` — "no server, no account, nothing for sale" as an
  assertion over the source tree, because an absence is the one claim no
  feature test defends
- `src/noVerdict.test.tsx` — "nothing here grades you" as an assertion over the
  rendered product, on the month a reader would be ashamed to show an app. Four
  banned registers, the landing held to the same four as the app it describes
- `src/shareCard.test.ts` — the unfurl copy in `index.html` as assertions, for
  the same reason: a forwarded link's card is the first surface most people in
  the target market see and the last one anybody re-reads
- `src/README.test.ts` — this file's product claims as assertions: the mechanic
  block against `MECHANICS`, the note cap, the cash keys, the lesson and badge
  counts, and a ban on naming components that no longer exist. Copy drifts by
  default when a product moves faster than its documentation
- `src/brandAssets.test.ts` — the deployed payload: the PNGs are indexed and
  inside their byte ceiling, `public/` holds nothing no document references,
  and the shipped `index.html` carries no repo documentation
- `src/Root.tsx` — the cold-start gate: landing for a first visit, app after
- `src/components/Landing.tsx` — the marketing surface. Its product shot is a
  live `<ArchiveCard>`, not an image: the page renders the shipped component
  through the shipped engines, so the screenshot cannot drift from the app. The mechanic count, the
  cash denominations, the note cap and the resisted line the fold quotes are
  read from code rather than typed into the copy, for the same reason
- `src/components/ArchiveCard.tsx` — the record: day index, month-to-date
  total, days left, the per-day strip, and the day-grouped ledger under them.
  One card, one heading, one scope line — it was a month card and a ledger
- `src/components/XpStrip.tsx` — the engagement track, and the whole of it: a
  level line and a bar. Not a card, and the third surface in a row to shed one
- `src/components/SimCard.tsx` — the decision simulator, the decision record
  it writes and the check-back that answers it: every run is persisted with the
  projection it showed, answered with Bought it / Waited / Resisted it, and — if
  it was bought — asked about once, 14 days later
- `src/components/monogramGeometry.ts` — the mark (§4), as computed geometry
- `src/components/` + `src/hooks/` — cards and the day/reward reaction logic
- `src/audio/chiptune.ts` — synthesized audio cues
- `src/styles/` — design tokens, app styles, landing styles
- `scripts/brand-assets.ts` — emits the shipped brand assets from the mark
- `scripts/raster.ts` — the scan converter and PNG writer behind them, in Node
  built-ins only: indexed colour when the composition fits 256 tones, which is
  what took `og.png` from 105 kB to 75 kB with identical pixels
- `scripts/htmlComments.ts` — strips the served document's comments at build
  time; the source keeps every one of them
- `scripts/census/` — the colour census: the row matrix, the tokens.css palette
  parser and CIELAB classifier, a PNG decoder that is the inverse of
  `raster.ts`'s writer, the CDP driver, the viewport-window reading of the ratio
  law, the DOM-derived composition reading in `composition.ts`, and the
  staleness hash that keeps `docs/brand/census.json` from outliving the tree it
  describes

## License

Apache-2.0. See [LICENSE](LICENSE).

---

No newsletter. We'll be here.
