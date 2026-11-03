# Space Port Package — `money` (from Ember)

**Merging? Read `MERGE-BRIEF.md` first** — the step-by-step runbook (fast path: a known-good patch). This file is the spec. Source app: **Ember** (`Brvetr4ve1er/money-manager-`, React 18 + Vite + TypeScript + Electron),
a local-first money app for one owner in Algeria: DA cash/CCP typed by hand, a RedotPay USD card whose balance is
estimated, bills to payday, envelope jars, and a paste-a-receipt inbox. This package re-expresses the parts that
earn a WorkspaceHQ nav slot as an HQ space. HQ's own session merges it; nothing here touches the structure lane.

**Space id `money` · label "Money" · glyph ◈ · nav slot 10 · hotkey `0` · key prefix `mny`.**
(Not "Ember": HQ canon already uses Ember for the streak and a pc-health tier.)

## What the space does

One honest number — **breathing room until payday** — and the four places that move it.

| sub | what the owner sees and does |
|---|---|
| **today** (default) | Breathing room (holdings − money in jars − bills due before payday) and the per-day figure, labelled a forecast. Accounts as cards, USD with its DA conversion at the owner's own rate: "as typed" right after a confirm, "estimated" once logged spending/income has moved it since (Ember's rule, any currency), "confirmed N days ago", a stale nudge after a week on an estimate. Confirm balance (re-anchors), add, archive. Rate (DA per 1 USD) + payday day. Quick log: amount, DA/USD, category chips, account chips, note — Enter logs. Ledger: latest 15, remove a mis-log. Import an Ember export / export. |
| **runway** | Days to payday and what's likely to go out before it. Every bill / subscription / installment (n of 12) / variable bill (averages the last 3) with its next due date, coloured late / due soon / upcoming / paid off, its next step. Pay (writes a Bills ledger row on the bill's account; amount prefilled), undo today's payment, edit, archive. |
| **jars** | Envelopes with an optional target + date → "X DA a month for N months", on/off pace against the payday split. Add / take out; an overspent jar asks to be covered from another (a move, no red shame). Presets (emergency, Eid, Ramadan, rentrée, bills). Payday split per jar; "pay landed" records the income on an account and replays the split into jars. |
| **inbox** | Paste receipts / emails / SMS (RedotPay, Algerian bank débit SMS, BaridiMob/CCP, Jumia, Yassir, subscriptions…). Parsed locally into slips, deduped across messages and against the ledger. Each slip shows its evidence, confidence, flags. Confirm (with category + account) or reject; promos, renewal notices and already-logged purchases need a second deliberate tap; a refund goes back to a same-currency account as income, never as spending. Clear handled. |

## Architecture (how it maps onto HQ)

```
renderer (dashboard-v5)                         main (dashboard)
  tpl/money.tpl.js   ← reads finished values      money.js  init({ipcMain,dataDir,getWin})
  vals/money.js      ← maps LIVE.money.view         hq:money:read · apply · import · export
  logic/money.js     → hq.money.apply(INTENT)      money/commands.mjs  intent → Ember reducer actions (validates, mints ids/time)
  live/store.js      ← {view} / {error}            money/view.mjs      state + today → display-ready view
                                                    money/{state,inbox,engine,parse,dedupe,dates}.mjs  Ember's logic, ported verbatim
                                                    money/store.mjs     the file shape + sanitizer
                                                  data/money/state.json  (gitignored, atomic writes, corrupt → quarantined)
```

- **All math lives main-side.** dc-lite templates can't compute and vals stay thin, so main returns a *view*: every
  number already formatted ("12,098 DA", "$118.40", "due in 2 days"). The renderer never imports money logic.
- **The renderer sends intents, not entities.** `{type:'log', amount:'350', category:'Food', accountId}` — main
  validates every field, mints ids and timestamps, runs Ember's reducers + sanitizers, writes atomically, answers
  `{view, note}` or `{error}`. A forged intent can at worst be refused.
- **No window reload after a money write** — the reply carries the fresh view.
- **Ember's domain logic ports verbatim** (types stripped by the TypeScript compiler, comments kept). Proof: Ember's
  own tests for those modules (229 test cases) run unchanged on the ported ESM via a 40-line
  `node:test` shim (`main/money/vitest-shim.mjs`) — plus 10 main-module tests. `npm test` in this folder: 239/239.

## Where every file lands

See `renderer/catalog.diff.md` (renderer edits + landing table), `main/preload.diff.md` (preload, main.js line,
fake preload, landing table), `renderer/money.store.md` (store slice), `main/IPC-CONTRACT.rows.md`,
`main/CONTRACT.rows.md`, `tests/selftest-states.md`, `tests/cdp-scenarios.md` (code: `tests/cdp-scenarios.mjs.snippet`). `package.json` here is
package-local (CommonJS for `main/money.js` inside the Ember repo) — **not merged**.

## Cuts (v1) — named, so nobody looks for them

| cut | why |
|---|---|
| Learn room (55-lesson skill tree, quizzes, Leitner review), Hearth Month mini-game | a second app's worth of content; a space earns 4 subs. Candidate for a later space. |
| Tontines / jam'iyya, IOUs, zakat helper | real, but a fifth sub; Ember counted tontine and IOU payments in breathing room; v1 counts bills + jars only, and the UI breakdown lists exactly those three lines |
| Monthly recap, "your room" lanterns, health score, decision simulator | HQ's game layer + History cover the "look back" job; no duplicate scoring |
| Ember XP / badges / pets | HQ's game layer replaces them (`hq.actedOn` on log, pay, confirm, payday, confirm-balance) |
| Needs picker, brakes (spending hold), trusted-person snapshot, number-light mode, low-energy/calm modes | accessibility modes of a standalone app; HQ has its own reduce-motion/theme. Worth a later look. |
| Save charms (round-ups, per-category rules, treat tax) | needs its own surface; jars work without it |
| Gmail adapter (was a stub, off by default) | no network in this space at all |
| Cross-tab merge | HQ is one window; main is the single writer |
| Hearth/Clay visual design, Outfit font | HQ look only: Plex Mono + tokens, both themes |

## Known limits (honest)

- A balance that has moved since its last confirm is an **estimate** (last confirmed − spending logged since + income since); it drifts if spending isn't logged — the RedotPay card most of all. The UI says "estimated" and nudges a confirm after 7 days.
- The parser was tested on fixture messages, not yet on a week of the owner's real SMS/emails.
- Breathing room is a forecast to the next payday; no payday set = end of month.
