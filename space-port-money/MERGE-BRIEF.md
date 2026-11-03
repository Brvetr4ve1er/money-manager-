# MERGE BRIEF — landing the Money space in WorkspaceHQ

> **For the WorkspaceHQ Claude Code session.** This is the one document to read first: everything you need
> to merge Ember's money core into `Brvetr4ve1er/workspace-HQ` as a space, with no back-and-forth to the
> Ember chat. Written 2026-11-03 against WorkspaceHQ `main` @ **`76a7d1a`**.
> Package source: `github.com/Brvetr4ve1er/money-manager-` → folder **`space-port-money/`**.

---

## 0. TL;DR

- **What:** a new space **Money** (id `money`, glyph ◈, **10th nav entry, hotkey `0`**, vals prefix `mny`) with 4 subs:
  **today · runway · jars · inbox**. Local money data in `data/money/state.json`. No network, nothing outbound.
- **How (fast path):** `git apply` the known-good patch `space-port-money/reference/workspace-hq-76a7d1a.patch`
  (the exact result of a full dry-run merge, verified to apply clean and pass), then run the gates in §6, then
  commit in lanes (§7). If `main` has moved past `76a7d1a`, use the **manual path** (§4) — every edit is
  documented with anchors.
- **Lane:** frontend only (`dashboard/`, `dashboard-v5/`) + `meta:` for `docs/sync/*`. Nothing in `collector/`,
  `schema/`, `spellbook/`, `run-pipeline.ps1`.
- **Already proven** (Linux, Electron 33, synthetic scans): HQ suites unchanged except additions, goldens
  attributed, `?selftest=1` **3000 combos / 0 errors / 0 unresolved**, cdp-gate **40/40**, money suite **239/239**.

---

## 1. What the space is (product)

One honest number — **breathing room until payday** = what you hold − money set aside in jars − bills due before
payday — plus the four places that move it. Owner: one person in Algeria; DA cash/CCP typed by hand, a RedotPay
**USD** card whose balance is *estimated*, the owner's own DA/USD rate.

| sub | does |
|---|---|
| **today** (default) | breathing room + per-day ("a forecast, not a verdict"); account cards (balance, "estimated"/"as typed", "confirmed N days ago", stale nudge ≥ 7 d; confirm balance, add, archive); rate + payday day; quick log (amount, DA/USD, category chips, account chips, note, Enter); ledger (latest 15, remove a mis-log); import Ember export / export |
| **runway** | days to payday + "likely to go out before then"; every bill / subscription / installment (n of 12) / variable bill (avg of last 3) coloured late · due soon · upcoming · paid off; Pay (Bills ledger row on the bill's account), undo today's payment, edit, archive |
| **jars** | envelopes, optional target + date → "X DA a month for N months", on/off pace vs the payday split; add / take out; overspent jar → cover from another jar; presets; payday split + "pay landed — run the split" |
| **inbox** | paste receipts/emails/SMS → parsed locally (RedotPay, Algerian bank débit SMS, BaridiMob/CCP, Jumia, Yassir, subscriptions) → deduped slips with evidence + confidence + flags → confirm (category + account) / reject; promo, renewal notice, already-logged need a **second deliberate tap**; refunds go back as income, never spending; clear handled |

Cut in v1 (don't look for them): Ember's Learn room/Hearth Month, tontines/IOUs/zakat, recap, room/lanterns,
health score/simulator, Ember XP/badges (HQ's game layer replaces it), accessibility modes, save charms, Gmail stub.
Name is **Money**, not Ember — HQ canon already uses "Ember" (streak, pc-health tier).

---

## 2. Architecture (why it's shaped like this)

```
renderer  dashboard-v5/                          main  dashboard/
  src/tpl/money.tpl.js   reads finished values     money.js            init({ ipcMain, dataDir, getWin })
  src/vals/money.js      maps LIVE.money.view       ├ hq:money:read    → { view } | { error }
  src/logic/money.js     → hq.money.apply(INTENT)   ├ hq:money:apply   → { view, note } | { error }
  src/live/store.js      live.money = {view,…}      ├ hq:money:import  → { view, note } | { canceled } | { error }
                                                    └ hq:money:export  → { note } | { canceled } | { error }
                                                   money/commands.mjs  intent → Ember reducer actions (validate, mint ids/time)
                                                   money/view.mjs      state + today → display-ready view (all math here)
                                                   money/store.mjs     file shape + sanitizer
                                                   money/{state,inbox,engine,parse,dedupe,dates}.mjs   Ember logic, ported verbatim
                                                 data/money/state.json  gitignored · atomic tmp+rename · corrupt → .corrupt
```

Rules this follows (and you should keep):
- **All math main-side.** dc-lite templates can't compute; main returns a *view* with every number pre-formatted.
  The renderer never imports money logic.
- **Renderer sends intents, never entities** (`{type:'log', amount:'350', category:'Food', accountId}`); main validates
  every field, mints ids/timestamps, runs Ember's reducers + sanitizers. Unknown types / > 64 KB refused before IO.
- **No window reload after a money write** — the reply carries the fresh view (`store.applyMoney` swaps it in).
- **Writes are not gated on the time machine** — money isn't scan data; when scrubbed the screen says so (blue line).
- ESM from CJS main via `import(pathToFileURL(...))`, same idiom as `claude-prompts.js`.
- Main module is a NEW file with a one-line `require('./money').init(...)` in `main.js` (house rule).

---

## 3. FAST PATH — apply the known-good patch (WorkspaceHQ `main` == `76a7d1a`)

```powershell
git fetch origin; git log -1 --format=%h origin/main          # must print 76a7d1a — otherwise use §4
# get the package (any way you like), e.g.:
git clone --depth 1 https://github.com/Brvetr4ve1er/money-manager- ..\money-manager-
git apply --check --whitespace=nowarn ..\money-manager-\space-port-money\reference\workspace-hq-76a7d1a.patch
git apply --whitespace=nowarn ..\money-manager-\space-port-money\reference\workspace-hq-76a7d1a.patch
```
(`--whitespace=nowarn`: HQ files are CRLF; git reports every CR as "trailing whitespace" — harmless.)

The patch = 44 files: 21 modified, 23 new. It already contains the golden re-records, selftest block, cdp
scenarios, fake-preload entries, contract rows and the README gate line. Re-verified: applies clean to a
fresh `76a7d1a` clone and passes money 239/239, dashboard-v5 434/434, tools+mcp 33/33.

Then go to **§6 gates** and **§7 commits**.

---

## 4. MANUAL PATH — if `main` moved past `76a7d1a`

Try `git apply --3way` first; resolve conflicts with the docs below. If that's a mess, apply by hand in this order.
Every doc names its anchor text (match text, not line numbers).

| # | what | doc in the package |
|---|---|---|
| 1 | Contract rows **first** (house rule: contract before code) | `main/IPC-CONTRACT.rows.md` → `docs/sync/IPC-CONTRACT.md` (dated section above `## Rules`); `main/CONTRACT.rows.md` → `docs/sync/CONTRACT.md` (table row + section) |
| 2 | Main files land as-is | `main/money.js` → `dashboard/money.js`; `main/money.test.mjs` → `dashboard/money.test.mjs`; `main/money/*` → `dashboard/money/` (incl. `*.test.mjs`, `vitest-shim.mjs`, `fixtures.mjs`) |
| 3 | `main.js` hook + preload group | `main/preload.diff.md` |
| 4 | Renderer files land as-is | `renderer/money.tpl.js` → `src/tpl/money.tpl.js`; `renderer/money.vals.js` → `src/vals/money.js`; `renderer/money.logic.js` → `src/logic/money.js`; `tests/money.logic.test.mjs` → `src/logic/money.test.mjs` |
| 5 | Wiring edits (catalog, ctx, app.js incl. hotkey 0, vals index, app.tpl, shell subtitle + rail digit, palette, whats-new, hq-icon) | `renderer/catalog.diff.md` §1–§8b |
| 6 | Store slice (`live.money`, `refreshMoney`, `applyMoney`, `importMoney`, start(), exports) | `renderer/money.store.md` (refresh-on-arrival line: add ONCE — it's in catalog.diff §3 too) |
| 7 | Fake preload: paste fixture + 4 method rows; fixture JSON lands in tools | `main/preload.diff.md` (paste `main/fake-preload.money.snippet.js`; `main/money.fake-views.json` → `dashboard-v5/tools/money.fake-views.json`) |
| 8 | Selftest block (3 edits inside `run()`) | `tests/selftest-states.md` |
| 9 | cdp-gate scenarios (6) | `tests/cdp-scenarios.mjs.snippet` (+ `tests/cdp-scenarios.md`) |
| 10 | README gate line | `node --test dashboard/money/*.test.mjs` (and `dashboard/money.test.mjs` is already caught by `dashboard/*.test.mjs`) |
| 11 | Goldens — re-record **attributed** | `renderer/catalog.diff.md` → "Goldens" (exact `golden-diff --allow` command) |

Expected touched set (from the dry run): **modified** `README.md`, `dashboard/main.js`, `dashboard/preload.js`,
`docs/sync/CONTRACT.md`, `docs/sync/IPC-CONTRACT.md`, `dashboard-v5/src/{app.js, app.tpl.js, selftest.js,
tpl.hash.test.mjs, vals.golden.test.mjs, __golden__/vals.hashes.json}`, `src/elements/hq-v3.js`,
`src/live/{catalog.mjs, store.js}`, `src/logic/{palette.js, whats-new.js}`, `src/vals/{ctx.js, index.js, shell.js}`,
`tools/{cdp-gate.mjs, fake-preload.js}` · **new** `dashboard/money.js`, `dashboard/money.test.mjs`,
`dashboard/money/` (16 files), `src/logic/money.js`, `src/logic/money.test.mjs`, `src/tpl/money.tpl.js`,
`src/vals/money.js`, `tools/money.fake-views.json`.

---

## 5. Traps the dry run hit (all fixed in the docs — don't re-learn them)

1. **Hotkey:** NAV already has 9 entries (Studio is #9). Money is #10 → key **0**: `onKey` regex `/^[0-9]$/`,
   index `e.key === '0' ? 9 : n-1`; rail digit/tooltip and palette hint must show `0`, not `10`; cheat sheet "1 – 9, 0".
2. **Nav icon:** `<hq-icon name="money">` falls back to the Home glyph unless you add the ◈ path + hover in
   `src/elements/hq-v3.js` (catalog.diff §8b).
3. **Fake preload is sandboxed** — it can't `require()` a `.json`. Paste the one-line `const MONEY = {…}` snippet.
4. **Selftest can't `fetch()` `file://`** in Electron — load the fixture as a JSON module import, or the whole
   selftest crashes with 0 combos. Also snapshot/restore `LV.money`, and land-and-wait per sub (arriving on money
   re-reads it and overwrites synthetic state). Use `MV` not `M` (`M` is the model in `run()`).
5. **Goldens:** `vals.golden.test.mjs` has a hard-coded `TABS` list — add `'money'` there or no money scenarios exist.
   Moving keys (only): 137 `mny*`/`onMny*`, `v.money`, `nav[9]`, `moreNav[5]`, `whatsNew.changes[14]`, `keys[2].k`.
   195 → 199 hashes. `tpl.hash`: +57015 chars (290971 → 347986).
6. **A clean selftest without `dashboard/data.js` proves nothing** (every screen is "no scan data"). On the
   owner's PC real scans exist; elsewhere bake a synthetic one from `vals.golden.test.mjs`'s `DATA()` — never commit it.
7. **cdp:** a `--hidden` harness opens What's new on first focus, which swallows hotkeys — close it first.
   There's no generic button sweep in cdp-gate; `money-button-sweep` is it.
8. **Package `package.json`** (type: commonjs) is package-local only — **don't merge it**.

---

## 6. Gates (all must hold before committing)

```powershell
node --test dashboard/*.test.mjs                       # +10 (money.test.mjs); pre-existing env failures unchanged by name
node --test dashboard/money/*.test.mjs                 # 229 — Ember's own tests, verbatim, on node:test via vitest-shim.mjs
node --test dashboard/claude-hub/*.test.mjs            # unchanged
node --test dashboard-v5/src/*.test.mjs dashboard-v5/src/dc/*.test.mjs dashboard-v5/src/live/*.test.mjs dashboard-v5/src/logic/*.test.mjs dashboard-v5/src/elements/*.test.mjs dashboard-v5/styles/*.test.mjs dashboard-v5/tools/*.test.mjs   # 425 → 434
node --test tools/*.test.mjs tools/trailer/*.test.mjs mcp/workspacehq/*.test.mjs    # unchanged (33)
```
Then the renderer gates (from `dashboard-v5`, own `HQ_V5_PROFILE`):
```powershell
..\dashboard\node_modules\electron\dist\electron.exe dev-main.js --preload=fake --hidden --remote-debugging-port=9351
node tools/cdp-gate.mjs --port 9351 --scenario money-open-key0,money-log-spend,money-pay-bill,money-inbox-paste-promo,money-archive-ask,money-button-sweep
# full gate: --scenario all → 40/40 expected (34 existing + 6 money)
# selftest (?selftest=1 via dev-main's selftest flag): expect +340 money combos, 0 errors, 0 unresolved, both themes
```
Dry-run baselines on Linux (for comparison): `dashboard/*` 458→468 pass with 12 pre-existing env failures
(HQ_APP_LOG_DIR, claude binary, Documents paths, screen-capture), claude-hub 169 pass / 3 pre-existing.
On the owner's Windows box those env failures should not exist.

---

## 7. Commits + handoff (house conventions)

Read `docs/sync/HANDOFF.md` first. Suggested small commits, in order:
1. `meta: money space — IPC-CONTRACT + CONTRACT rows (contract before code)` — `docs/sync/*`
2. `fe: money space main side — dashboard/money.js + dashboard/money/ (Ember logic, 239 tests)` — incl. `main.js` hook, `preload.js` group, README gate line
3. `fe: money space renderer — tpl/vals/logic/store, nav slot 10 (key 0), icon` — all `dashboard-v5/src` edits
4. `fe: money space gates — selftest states, cdp scenarios, fake preload, goldens re-recorded (attributed)`

Append a HANDOFF entry: `## 2026-11-0x · FROM frontend · main @ <sha>` with DONE (space landed, gates numbers),
IN-FLIGHT (none), ASKS (owner: import Ember export + paste real SMS on the PC), BREAKS (none; additive only).

---

## 8. After landing — owner checks on the Windows PC (what the dry run could NOT verify)

- Real Electron **32** on Windows (dry run used 33 on Linux), the real `main.js` IPC path (renderer was tested
  against the fake preload; handlers have node tests), real scan data, the native Open/Save dialogs.
- Press **0** → Money. **Import…** an Ember export (Ember desktop → Me → *Export my data* → JSON): balances should match Ember.
  Import is a **union** (never replaces; re-importing the same file adds 0).
- Paste a few real RedotPay / bank / BaridiMob SMS into **Inbox**; anything misread → send to the Ember chat for a parser rule.
- Data file: `data/money/state.json` (gitignored). A corrupt file is moved to `state.json.corrupt`, never overwritten.

---

## 9. Reference — every package file

| file | role |
|---|---|
| `MERGE-BRIEF.md` | this runbook |
| `PORT.md` / `ANSWERS.md` | the spec (screens, flows, cuts, limits) / HQ's §11 questionnaire answered |
| `reference/workspace-hq-76a7d1a.patch` | the known-good full merge (fast path) |
| `main/money.js` (+ `.test.mjs`) | CJS main module, 4 channels, atomic store, injectable dialogs (`HQ_MONEY_IMPORT_FILE` for gates) |
| `main/money/commands.mjs` | intent allowlist (19 types) → Ember reducer actions; owner-facing refusals |
| `main/money/view.mjs` | the renderer's view model (all derived numbers + strings) |
| `main/money/store.mjs` | file shape v1, sanitizer, union merge for import |
| `main/money/{state,inbox,engine,parse,dedupe,dates,fixtures}.mjs` (+ tests) | Ember logic, ported verbatim (TS compiler, comments kept) |
| `main/money/vitest-shim.mjs` | maps Ember's vitest matchers onto node:assert (tests stay verbatim) |
| `main/preload.diff.md`, `IPC-CONTRACT.rows.md`, `CONTRACT.rows.md` | main-side wiring + contract text |
| `main/money.fake-views.json`, `fake-preload.money.snippet.js` | fake-preload fixture (readable / paste-ready), generated by `tests/make-fake-views.mjs` from the real engine, placeholder data only |
| `renderer/money.{tpl,vals,logic}.js` | the space (dc-lite only; inline token styles, no CSS file) |
| `renderer/catalog.diff.md`, `money.store.md` | renderer wiring + store slice |
| `tests/money.logic.test.mjs` | renderer logic test (written for its landing path) |
| `tests/selftest-states.md`, `cdp-scenarios.md`, `cdp-scenarios.mjs.snippet` | selftest block + 6 cdp scenarios |
| `package.json` | package-local only, **not merged** |
