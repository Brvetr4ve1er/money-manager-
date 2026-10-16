# Ember

**Don't teach budgeting — build financial instincts.**

Ember is a behavioral money app for Algeria and the wider MENA region, built
around manual-first logging in dinars (DA). Instead of lecturing users with
spreadsheets and budget categories, it turns everyday money decisions into a
game you can feel: log a purchase, resist an impulse, watch your flame grow.
Everything runs locally in your browser — no bank connections, no accounts,
no server.

## Features

Ember is five rooms, reached from the dock (a left rail on wide screens).

**Home — the hearth**
- **Breathing room** — one honest number: what you hold, minus what's in jars,
  minus bills and family/friends payments due before payday, spread over the
  days left. A forecast, never a verdict. Number-light mode shows it as a
  filling tank instead of sums.
- **Accounts** — DA cash/CCP typed by you, plus a RedotPay USD card whose
  balance is *estimated* (last confirmed anchor − spend logged since + income
  since) and converted at your own DA/USD rate. "Confirm balance" re-anchors.
- **Fast logging** — amount, category, account; repeat chips, 5-second undo,
  an honest "I bought it anyway" box, and a resist button ("kept, not spent").
- **Your room** — lanterns and pieces that grow from *outcomes* (a jar
  funded, a month with room to spare), never from tap counts, and a calm
  "waiting for you" digest. A monthly moon-ceremony recap closes each month.

**Runway** — a thread of light from today to payday. Bills, subscriptions,
installments (n of 12) and variable bills light up when paid (a real ledger
row), flicker when close, and quietly go out if they slip — "Relight?", no
red.
A recurring audit totals your subscriptions per year, and tontine turns and
IOUs due before payday sit alongside.

**Jars** — envelopes / sinking funds with presets (Eid, Ramadan, rentrée,
emergency, bills). Each has a target and date ("X DA a month — on track?"),
rolls over, and an overspent jar asks you to cover it from another — just a
move. Payday replays your saved split in one tap; **save charms** suggest
top-ups (round-ups, "every coffee → +50 DA to Eid", a self-set treat tax)
that you confirm.

**Learn** — a finance game, not a lecture.
- **Skill path** — 55 lessons in 8 branches (Flow, Save, Borrow, Dinar, Earn,
  Family, Guard, Grow), written for Algeria: two exchange rates, taqsit,
  riba and murabaha, jam'iyya, zakat, local scams. Each lantern goes
  Read → Quiz → Try it for real, and "try it" is checked against what you
  actually did in the app.
- **Scenario quizzes** with plausible wrong answers that explain themselves,
  and a short optional spaced review (Leitner boxes).
- **Hearth Month** — a seeded four-week mini-game: pick a life (salaried,
  freelancer, student, installment payer), meet Eid, a cracked phone, a
  friend asking for a loan; no fail state, and the month ends with three
  lessons drawn from your own choices.
- Decision simulator, codex, badges and pets.

**Me** — profile, what helps you (needs-based modes), brakes, a trusted-person
snapshot, family & friends money (tontines, IOUs, an informational zakat
helper — "not a fatwa"), the **inbox** and backup export/import.

**Inbox** — paste a receipt, email or SMS (RedotPay, Algerian bank débit SMS,
BaridiMob/CCP, Jumia, Yassir, Netflix, Spotify, Steam, Google Play…) and
Ember parses it into slips in a review tray, deduped across messages and
against your ledger. Nothing is logged until you confirm. A read-only Gmail
adapter is stubbed behind `VITE_GOOGLE_CLIENT_ID` and off by default.

**The game, two tracks.** Warmth and the avatar stage come only from your
finances. XP, levels, rituals, badges and decor come from engagement and
learning. No streaks, no lives, no loot boxes, nothing to buy, no shame copy.

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

## Install the desktop app

Ember also ships as an Electron desktop app (Windows, macOS, Linux). It is
the same local-first web build, served from a private `app://ember` origin
with a strict Content-Security-Policy: no network requests, fonts bundled,
your data stays in the app's own storage on your machine.

**Where to get it.** Run the **Desktop app** workflow (Actions → Desktop app
→ Run workflow), or push a `v*` tag. Each OS job uploads an artifact named
`Ember-Linux`, `Ember-Windows` or `Ember-macOS` on the run's summary page:

| OS | Files | Install |
| --- | --- | --- |
| Windows | `Ember-<ver>-win-x64.exe` (installer), `Ember-<ver>-win-x64-portable.exe` | Run the installer (per-user, choose a folder) or just run the portable exe. The build is unsigned, so SmartScreen shows "Windows protected your PC": click **More info → Run anyway**. |
| macOS | `Ember-<ver>-mac-<arch>.dmg` | Open the dmg and drag Ember to Applications. The build is unsigned: the first time, **right-click Ember → Open → Open** (or System Settings → Privacy & Security → Open Anyway). |
| Linux | `Ember-<ver>-linux-x86_64.AppImage`, `Ember-<ver>-linux-x64.tar.gz` | `chmod +x Ember-*.AppImage && ./Ember-*.AppImage` (needs FUSE 2: `libfuse2`/`fuse2`), or extract the tar.gz and run `./ember`. |

Building locally:

```bash
npm run desktop:dev        # build the web app and open it in Electron
npm run desktop:build      # Linux AppImage + tar.gz into release/
npm run desktop:build:win  # Windows nsis + portable (best on Windows)
npm run desktop:build:mac  # macOS dmg (must run on macOS)
npm run desktop:e2e        # Playwright smoke test against the built app
```

"Export my data" opens a native Save dialog (default:
`Documents/ember-export-YYYY-MM-DD.json`). App data lives in the OS user-data
folder (`%APPDATA%\Ember`, `~/Library/Application Support/Ember`,
`~/.config/Ember`); window size and position are remembered there too.

### Add to WorkspaceHQ

Add Ember as an app entry pointing at the installed executable:

- Windows: `%LOCALAPPDATA%\Programs\Ember\Ember.exe` (default per-user
  install path; or wherever you put the portable exe)
- macOS: `/Applications/Ember.app`
- Linux: the AppImage path you saved it to (e.g.
  `~/Applications/Ember-0.1.0-linux-x86_64.AppImage`, made executable), or
  `<extract dir>/ember` from the tar.gz

Ember is single-instance: launching it again focuses the open window.

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

- `src/routes/` — the five rooms and the hash router
- `src/state/store.ts`, `src/state/reducer.ts` — local-first persistence,
  field-by-field sanitizing, symmetric multi-tab merge, root transitions
- `src/state/slices/{money,learn,social,inbox}.ts` — slice state, sanitizer,
  merge and prefixed reducer (`money/…`, `learn/…`, …)
- `src/engine/` — pure, tested logic: `money.ts` (balances, obligations,
  breathing room, jars, charms), `learn.ts`, `monthGame.ts`, `social.ts`,
  `recap.ts`, `room.ts`, `inbox/` (parsers + dedupe), `healthScore.ts`,
  `simulator.ts`, `xp.ts`, `achievements.ts`, `brakes.ts`, `needs.ts`
- `src/content/curriculum.ts` — the skill tree, lessons and quizzes
- `src/components/` — cards per room (`money/`, `runway/`, `jars/`, `learn/`,
  `social/`, `inbox/`)
- `desktop/` — Electron main process, preload, icon script and E2E smoke
- `src/proto/` — the Hearth and Clay design prototypes (`#/proto`)
