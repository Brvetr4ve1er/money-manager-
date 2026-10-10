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
- **"Why this stage?" breakdown** — the hero card expands into a per-component
  readout of the score (each bar 0–100, excluded components shown as honest
  absence), so the score is trainable cause-and-effect instead of a mystery
  number. It explains; it never advises.
- **Avatar stages** — Ember → Hearth-fire → Bonfire → Beacon, driven only by
  your financial state.
- **Onboarding profile ("My numbers")** — a skippable five-question setup
  (income, essentials, emergency fund, debt, one goal) that replaces the
  disclosed demo profile with your real numbers, raises component confidence,
  and flips the simulator's honesty note. Blank ≠ zero: components you never
  entered stay excluded from the score rather than scoring a guess.
- **Fast manual logging** — amount + category with inline validation, plus
  one-tap **repeat chips** derived from your own frequent (amount, category)
  pairs (the daily coffee/bus/bread in a single 48px tap), a **5-second Undo**
  after every log (the row and its XP grant revert together, so undo cycles
  farm nothing), and an **"I bought it anyway"** checkbox that logs a yielded
  impulse — same XP as any log, honesty is never punished — making Impulse
  Control a genuine two-sided ratio.
- **Resist button + "kept, not spent"** — resisting an impulse logs the
  avoided amount (+50 XP, capped daily), and the Ledger sums this month's
  resisted DA into one visible "kept" stat — a motivational mirror that is
  deliberately not a health-score input.
- **Decision simulator** — projects a baseline ("wait") path against a
  scenario ("buy") path month by month and states the specific tradeoffs:
  goal delay, extra months of debt, the month-one dip.
- **XP, levels, and daily quests** — the engagement track. Logging every
  purchase (+5), reading today's lesson (+15, verified), running a decision
  simulation (+15, verified), resisting an impulse (+50, capped daily), and
  reviewing your recent purchases (+10) all earn XP. Verified quests complete
  only when the app observes the action — never on self-report taps. This
  roster is canonical: the spec defers to it (see `src/engine/xp.ts`).
- **Daily lesson + codex** — 30 collectible one-screen lessons, one per day,
  date-rotated with no repeats until all are seen; each read lands as a
  permanent gold tile in the codex.
- **Weekly boss battle** — the Impulse Monster, whose HP is last week's real
  discretionary spend. Close this week under it and the boss goes down
  (+150 XP, once per week). Non-punitive by construction: losing copy offers
  a rematch, never shame, and the battle never touches the health score.
- **Achievements + pixel-pet loot** — nine earn-only badges with cosmetic
  companions that ride beside (never inside) the stage badge. No XP, nothing
  purchasable — the gacha aesthetic with none of the gacha economy.
- **Chiptune audio cues** — small synthesized sounds for logging, level-ups,
  and quest completion. Mutable; sound never carries information alone.
- **Neo-brutalist × gacha design** — thick black strokes, hard offset
  shadows, flat accent colors.

## Support modes

Mechanics for the days money is hardest to manage — named by need, never by
diagnosis. The **"What helps you"** card composes them; each can be changed
afterwards, and none of them touches the health score.

- **Hold the door** — a self-set brake: purchases at or above an amount, or
  in chosen categories, are *held* instead of logged, and the user decides
  again once the wait (1h–3 days) has passed. Tightening the brake is
  immediate; loosening or removing it waits **48 hours**, so a calm day
  binds a loud one. Letting a held purchase go is never punished and a
  release pays the ordinary +5 — the same honesty rules as any log.
- **Pace mirror** — spending speed over the last three days against the
  user's own 28-day baseline. Speaks only when it has something to say
  ("a bit / a lot faster than your usual pace"), needs two weeks of history
  before it speaks at all, and offers one thing: the trusted person.
- **Dim the house** — a low-energy view that draws only the essentials
  (health, logging, anything held, recent) and hides the engagement track;
  one tap restores everything.
- **Guilt-free return** — after five or more days away the app says
  "nothing is broken", asks for at most one rough number for the gap, and
  accepts skipping as a full answer. There is no back-fill and no streak:
  the seven-day badge counts logged days in any order, so a missed week
  costs nothing.
- **Calm mode** — sound off, no animation, no visual pop-ups; live regions
  still announce for assistive tech.
- **Someone you trust** — a weekly text snapshot the user builds (every
  section opt-in), previews, and sends by hand via copy or the OS share
  sheet. Nothing is shared automatically, and the snapshot says so.

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
- `src/engine/profile.ts` — user profile, demo fallback, and health inputs
- `src/engine/boss.ts` — weekly boss battle engine
- `src/engine/achievements.ts` — badge roster and pixel pets
- `src/engine/brakes.ts` — spending brakes (hold / edit lock) and the pace signal
- `src/engine/calm.ts` — low-energy mode and the guilt-free return
- `src/engine/snapshot.ts` — the trusted-person text snapshot
- `src/engine/needs.ts` — needs-based setup and the defaults it composes
- `src/content/lessons.ts` — the 30-lesson codex content
- `src/state/store.ts` — local-first persistence, sanitization, multi-tab
  merge, and export
- `src/state/reducer.ts` — pure state transitions (XP grants, undo, rollover)
- `src/components/` + `src/hooks/` — cards and the day/reward reaction logic
- `src/audio/chiptune.ts` — synthesized audio cues
- `src/styles/` — design tokens and app styles
