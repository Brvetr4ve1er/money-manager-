# money — cdp-gate scenarios (`dashboard-v5/tools/cdp-gate.mjs`)

Run against the fake preload (`dev-main.js --preload=fake --hidden --remote-debugging-port=93xx`).
`money.read` answers the **full** fixture, `money.apply` answers `{view, note:'saved'}` (or the real
"amount needs a number above 0." error for an empty `log`). Every scenario asserts on
`hqFake.calls('money.apply')` — what the renderer *sent* — plus what's on screen. Placeholder data only.

| name | steps | must be true after |
|---|---|---|
| `money-open-key0` | focus the window, press `0` | the Money space is shown on **Today**; header subtitle starts `breathing room 12,098 DA`; `hqFake.calls('money.read').length ≥ 1` (refresh on arrival); no error toast |
| `money-log-spend` | Today → type `350` in **Amount**, click chip `food`, click **Log it** | exactly one `money.apply` with `{type:'log', amount:'350', currency:'DA', category:'Food', accountId:<Cash id>, note:''}` and **no** `id`/`at`/`date` keys; toast `saved`; Amount field is empty again; then click **Log it** with Amount empty → toast `amount needs a number above 0.` (red), button usable again (guard released) |
| `money-pay-bill` | Runway → on the first bill click **Pay**, then **Mark paid** | one `money.apply` `{type:'obligation-pay', id:<first bill id>, amount:'', accountId:<its account>}`; the inline pay row closes; toast `saved` |
| `money-inbox-paste-promo` | Inbox → paste `Spotify: Get 3 months of Premium for $0.` into the textarea, click **Read it**; then on the promo slip click **Confirm** once | first call `{type:'inbox-paste', text:…, from:''}`; after one **Confirm** tap NO `inbox-confirm` call yet, the slip shows `Tap confirm anyway` and the button reads **Confirm anyway**; second tap sends `{type:'inbox-confirm', id:<promo id>, category:'Fun', accountId:'', anyway:true}` |
| `money-archive-ask` | Jars → **Archive** on the first jar → **Keep it**; **Archive** again → **Archive** in the bar | after Keep it: zero `jar-archive` calls and the bar is gone; after Archive: exactly one `{type:'jar-archive', id:<jar id>}` |

Button sweep: the generic every-button sweep must pass on all four subs with the full fixture
(no button throws; buttons that open inline forms count as handled).

Offline variant (optional, cheap): `hqFake.set('money', undefined)` is not possible (the group is part of the
preload) — instead run one screen with `--preload=` (none): Money shows the offline line, no button throws.
