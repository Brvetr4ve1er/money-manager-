# money — cdp-gate scenarios (`dashboard-v5/tools/cdp-gate.mjs`)

**Code: `tests/cdp-scenarios.mjs.snippet`** — paste-ready (its header says where each part goes: one key-table entry in
`t.press` so a scenario can press `0`, a helper block above the scenarios, six entries inside `SCENARIOS`, one header
comment line). The template has no `data-*` hooks, so the scenarios find buttons by visible label inside the money
screen and inputs by placeholder.

Run against the fake preload (`dev-main.js --preload=fake --hidden --remote-debugging-port=93xx`), then
`node tools/cdp-gate.mjs --port 93xx --scenario money-open-key0,money-log-spend,money-pay-bill,money-inbox-paste-promo,money-archive-ask,money-button-sweep`.
`money.read` answers the **full** fixture, `money.apply` answers `{view, note:'saved'}` (or the real
"amount needs a number above 0." error for an empty `log`). Every scenario asserts on
`hqFake.calls('money.apply')` — what the renderer *sent* — plus what's on screen. Placeholder data only.

| name | steps | must be true after |
|---|---|---|
| `money-open-key0` | focus the window (a `--hidden` harness's first focus opens What's new once — close it, it blocks hotkeys), press `0` | the Money space is shown on **Today**; header subtitle starts `breathing room 12,098 DA`; `hqFake.calls('money.read').length ≥ 1` (refresh on arrival); no error toast |
| `money-log-spend` | Today → type `350` in **Amount**, click chip `food`, click **Log it** | exactly one `money.apply` with `{type:'log', amount:'350', currency:'DA', category:'Food', accountId:<Cash id>, note:''}` and **no** `id`/`at`/`date` keys; toast `saved`; Amount field is empty again; then click **Log it** with Amount empty → toast `amount needs a number above 0.` (red), button usable again (guard released) |
| `money-pay-bill` | Runway → on the first bill click **Pay**, then **Mark paid** | one `money.apply` `{type:'obligation-pay', id:<first bill id>, amount:'', accountId:<its account>}`; the inline pay row closes; toast `saved` |
| `money-inbox-paste-promo` | Inbox → paste `Spotify: Get 3 months of Premium for $0.` into the textarea, click **Read it**; then on the promo slip click **Confirm** once | first call `{type:'inbox-paste', text:…, from:''}`; after one **Confirm** tap NO `inbox-confirm` call yet, the slip shows `Tap confirm anyway` and the button reads **Confirm anyway**; second tap sends `{type:'inbox-confirm', id:<promo id>, category:'Fun', accountId:<Card id>, anyway:true}` — the account chip defaults to the slip's same-currency account (`vals/money.js`), here the USD card |
| `money-archive-ask` | Jars → **Archive** on the first jar → **Keep it**; **Archive** again → **Archive** in the bar | after Keep it: zero `jar-archive` calls and the bar is gone; after Archive: exactly one `{type:'jar-archive', id:<jar id>}` |
| `money-button-sweep` | on each sub, from a clean screen, click every button in the money screen once | no button throws, nothing logs an error (buttons that open inline forms count as handled). cdp-gate.mjs has no generic every-button sweep at `76a7d1a`, so this scenario is it |

Measured at `76a7d1a` + this package (Electron 33, xvfb, synthetic 4-scan `data.js`): all six PASS, and the whole
gate (`--scenario all`, 34 existing + 6 money) is **40/40**.

Offline variant (optional, cheap): `hqFake.set('money', undefined)` is not possible (the group is part of the
preload) — instead run one screen with `--preload=` (none): Money shows the offline line, no button throws.
