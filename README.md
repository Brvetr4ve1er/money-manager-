# Ember

**Don't teach budgeting — build financial instincts.**

Ember is a behavioral money app for Algeria and the wider MENA region, built
around manual-first logging in dinars (DA). Instead of lecturing users with
spreadsheets and budget categories, it turns everyday money decisions into a
game you can feel: log a purchase, resist an impulse, watch your flame grow.
Everything runs locally in your browser — no bank connections, no accounts,
no server.

## Features

- **Health score** — a five-component financial score (savings rate, budget
  adherence, emergency fund, debt trend, impulse control) with confidence
  shrinkage for thin data, asymmetric smoothing (improvement registers fast,
  decline must be sustained), and avatar-stage hysteresis so one bad day
  never demotes you.
- **Avatar stages** — Ember → Hearth-fire → Bonfire → Beacon, driven only by
  your financial state.
- **Decision simulator** — projects a baseline ("wait") path against a
  scenario ("buy") path month by month and states the specific tradeoffs:
  goal delay, extra months of debt, the month-one dip.
- **XP, levels, and daily quests** — the engagement track. Logging every
  purchase (+5), running a decision simulation (+15), resisting an impulse
  (+50, capped daily), and reviewing yesterday (+10) all earn XP. A daily
  lesson reward (+15) is reserved for when lesson content actually ships —
  Ember never pays XP for content that doesn't exist.
- **Chiptune audio cues** — small synthesized sounds for logging, level-ups,
  and quest completion. Mutable; sound never carries information alone.
- **Neo-brutalist × gacha design** — thick black strokes, hard offset
  shadows, flat accent colors.

## Trust rules

These are product invariants, not aspirations:

- **XP never feeds the health score.** XP rewards showing up; the score
  reflects financial reality only. Engagement can never buy a better avatar.
- **The simulator states tradeoffs, never verdicts.** It will tell you your
  goal slips two months; it will never say "you can afford it."
- **No pay-to-win.** Nothing purchasable affects the score or stages.
- **Local-first with full export.** All data lives in your browser's local
  storage, and a complete JSON export is always one tap away. Your data
  leaves when you do.

## Quick start

```bash
npm install
npm run dev
```

Built with Vite + React + TypeScript.

```bash
npm test        # run the engine test suites (vitest)
npm run build   # type-check and produce a production build
```

## Deploying

Social-share crawlers (WhatsApp, Facebook, Telegram — the dominant channels
in the target market) require **absolute** `og:image`/`twitter:image` URLs
and silently drop relative ones. Before building for production, set the
canonical origin so `vite.config.ts` can rewrite the card URLs and inject
`og:url`:

```bash
VITE_SITE_URL=https://ember.example.com npm run build
```

Deploy checklist:

- [ ] `VITE_SITE_URL` set to the canonical https origin (no trailing slash)
- [ ] `dist/index.html` contains absolute `og:image`/`twitter:image` URLs and an `og:url` tag
- [ ] `/og.png` (1200×630) is served at that origin

## Project layout

- `src/engine/healthScore.ts` — Health Score Formula v0.1
- `src/engine/simulator.ts` — Decision Simulator Logic v0.1
- `src/engine/xp.ts` — XP, levels, and titles
- `src/state/store.ts` — local-first persistence and export
- `src/audio/chiptune.ts` — synthesized audio cues
- `src/styles/` — design tokens and app styles
