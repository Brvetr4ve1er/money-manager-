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
NO ACCOUNT  ·  NO BANK LINK  ·  EXPORT ALWAYS
```

## What it is

A money tracker for people whose money problem is friction, memory and
impulse — not arithmetic. You log what you spend, by hand, in Algerian dinars.
Ember groups the log by day, shows you where you are in the month, scores your
financial reality from five weighted components — running on placeholder
numbers until you enter your own in **My numbers**, and redistributing the
weight of any component you leave blank once you have — and states the tradeoff
when you are deciding on a purchase.

It runs in a browser tab with nothing behind it. No account, no server, no
bank link, no purchase path — `src/` contains no `fetch`, no socket and no
auth. Every byte lives in that browser's local storage. Close the tab and
Ember has nothing on you.

A purchase is two taps: one cash key, then Log.

## Send it to a friend who overspends

The reason is one mechanic, and it is the one thing a bank-linked tracker
cannot do at all: **Ember logs the thing you did not buy.**

You type the amount and press **"I resisted an impulse"** instead of Log. The
row records what the purchase would have cost. It adds nothing to that day's
total — money that did not move is not spend — and it sums into one figure at
the head of the record card: `3,500 DA resisted this month`. A bank feed can
only ever see money that moved, so this row does not exist anywhere else.

The other half is what happens when you lose. Buy it anyway, tick "I bought it
anyway", and the row reads the same as any other: full XP, a quiet marker,
no colour, no lecture. That is what makes Impulse Control a real two-sided
ratio instead of a resist-only self-report — and it is why the honest log is
the one you keep using.

## Is it for you

**Yes, if —**

- You deal in cash, in DA, across accounts no aggregator covers.
- You will not hand a bank login to an app, and would rather type the number.
- You have quit a budgeting app because it lectured you. Ember states the fact
  and stops: a day total is flat ink, no colour verdict and no comparison; the
  record card shows totals with no target line and no projection; the string
  "over budget" appears nowhere in the product; the score explains itself and
  never advises.
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

## The seven mechanics

```
01/07  HEALTH SCORE     Five components. Shrunk for thin data. It explains; it never advises.
02/07  THE RESIST       Resisted, not spent. Summed for the month. The total is not a score input.
03/07  THE SIMULATOR    Baseline against scenario. States the tradeoff. Never the verdict.
04/07  THE RECORD       The last 60 runs kept, with the line each printed. Bought it · Waited · Resisted it. Answers, never a tally.
05/07  THE MONSTER      This week's discretionary spend is its HP. Last week's is the line. Beatable, never shaming.
06/07  THE MONTH SO FAR Day index, month total, days left, one bar per day. No target line. No projection.
07/07  THE NOTE         80 characters on any row, in your words. Optional, unpaid, never asked for twice.
```

This block is not prose. `src/README.test.ts` holds it to `MECHANICS` in
`src/components/Landing.tsx` — same count, same order, same titles — because
the landing page and this file are two copies of one claim and the second one
is always the one that rots.

"Resisted", not "kept": the app observed the tap, not the outcome. It sums the
prices of things you say you did not buy, and it says so in those words.

**Whose numbers the score is on.** Before you fill in **My numbers**, the score
runs on a demo profile — an invented income, essentials figure and emergency
fund — so the card has something to show on day one. It is not yours and the
app never pretends otherwise: the health card prints *"Placeholder numbers
until setup."*, the desktop hero prints *"Placeholder until setup"*, and the
simulator prints *"Projected on the demo profile"*. Impulse Control is the one
component that reads nothing but rows you logged, so it is yours from the first
tap; the other four are measured against the placeholder figures until you
replace them, and the whole score carries a reduced confidence while they
stand. Once you have entered your numbers, anything you leave blank — no
emergency fund, no debt — is dropped and its weight redistributed across the
components you did fill in, with the card naming each one it left out.

Around them: XP and levels for showing up, 4 daily quests (2 of them verified
by the app, not by a tap), 30 collectible one-screen lessons, 9 earn-only
badges with cosmetic companions, and chiptune cues that never carry information
alone.

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

The scope is stated once, in the card's own words: *"Totals only. No targets.
No averages. No projections."* There is no target line, no average, no run rate
and no "at this pace" — a month-to-date total is exact from day one, a
projection off twelve days is not. The component is never handed your profile,
which is the structural reason a budget bar cannot appear on it.

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
- **Honest cold start.** Before setup the score says it is running on
  placeholder numbers — it is scoring a demo profile, not you, and every
  surface that reads it says so. Under 90 days it says it is still calibrating
  rather than projecting confidence it has not earned.
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
scheduler are 141 kB of the JS bundle — 61% of it, fixed, and not reducible
without changing the dependency line at the top of this section. The other
89 kB is Ember. The largest STATIC asset is `og.png` at 75 kB, which every
share unfurl fetches; the JS bundle is three times its size uncompressed, and
about the same size as it once gzipped (74 kB each), which is the honest
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

## Project layout

- `src/engine/healthScore.ts` — Health Score Formula v0.1
- `src/engine/simulator.ts` — Decision Simulator Logic v0.1
- `src/engine/xp.ts` — XP, levels, and titles
- `src/engine/profile.ts` — user profile, demo fallback, calibration window
- `src/engine/boss.ts` — weekly boss battle engine
- `src/engine/achievements.ts` — badge roster and pixel pets
- `src/engine/ledger.ts` — day grouping, day totals, the day headings, and
  `monthToDate` (the month's per-day totals, day index and record window)
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
  cash denominations and the note cap are read from code rather than typed into
  the copy, for the same reason
- `src/components/ArchiveCard.tsx` — the record: day index, month-to-date
  total, days left, the per-day strip, and the day-grouped ledger under them.
  One card, one heading, one scope line — it was a month card and a ledger
- `src/components/CollectionCard.tsx` — the codex and the badge grid in one
  card, each still a named `#codex` / `#badges` section for the hero's jumps
- `src/components/QuestCard.tsx` — the daily quests with the XP bar and level
  above them, which was a card of its own
- `src/components/SimCard.tsx` — the decision simulator and the decision
  record it writes: every run is persisted with the projection it showed,
  and answered later with Bought it / Waited / Resisted it
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

## License

Apache-2.0. See [LICENSE](LICENSE).

---

No newsletter. We'll be here.
