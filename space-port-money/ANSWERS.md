# money — questionnaire answers (brief §11)

**1. What it does; sub-tabs.** A local money console for one owner in Algeria: breathing room until payday, accounts
(DA typed, RedotPay USD estimated at the owner's own rate), bills on a runway, envelope jars with a payday split, and
a paste-a-receipt inbox that turns SMS/emails into slips you confirm. Sub-tabs: **today · runway · jars · inbox**.

**2. Stack today → eliminated.** React 18, Vite, TypeScript, vitest, Electron 33 + electron-builder, @fontsource/outfit.
All eliminated: UI re-expressed in dc-lite (template + vals + logic mixin); TypeScript stripped by the TS compiler
(comments kept) into plain ESM; vitest tests run on `node:test` through a 40-line shim; Electron/packaging replaced by
HQ's main process; Outfit replaced by HQ's Plex Mono. **Zero npm deps added.**

**3. Data model.** One JSON file, `data/money/state.json` (shape in `main/CONTRACT.rows.md`): accounts, obligations,
payments, jars + jar moves, incomes, settings (rate, payday, split), ledger transactions, inbox candidates. Everything
derived (balances, next due, jar balances, breathing room) is recomputed on every read, never stored. Size: < 1 MB for a
year. Lives **main-side** (owned by `dashboard/money.js`); the renderer only holds the last view main returned.

**4. Main process needs.** Files only (`data/money/`, plus one owner-picked file per import/export).
| channel | payload → return |
|---|---|
| `hq:money:read` | — → `{view}` \| `{error}` |
| `hq:money:apply` | `{type, …fields}` intent → `{view, note}` \| `{error}` |
| `hq:money:import` | — (native Open dialog) → `{view, note}` \| `{canceled}` \| `{error}` |
| `hq:money:export` | — (native Save dialog) → `{note}` \| `{canceled}` \| `{error}` |

**5. Network.** None. Ember's Gmail stub is cut. Parsing is local regex.

**6. Outbound.** Nothing is posted or sent anywhere. (The inbox is inbound-only and already approval-gated: nothing
pasted is logged until the owner confirms each slip.)

**7. Game layer.** `this.hq.actedOn({kind:'money', action, xp})` after a write *succeeds*: log 3, confirm a slip 3,
pay a bill 5, payday split 5, confirm a balance 2. Never for opening forms, never scaled by amounts (it rewards keeping
the books, not spending or balances). `FX().sfx('done' | 'error')` on outcomes.

**8. Time machine.** Money is live data, not part of a scan: it does **not** follow the scrubber. When scrubbed, the
money screen says so in a blue line ("money isn't part of the scan, so this screen stays live and editable") and its
writes stay enabled (they never touch scan data).

**9. cdp-gate scenarios.** `money-open-key0`, `money-log-spend` (incl. refused-empty + guard release),
`money-pay-bill`, `money-inbox-paste-promo` (second-tap rule), `money-archive-ask` — details in `tests/cdp-scenarios.md`.

**10. Cut in v1.** Learn room + Hearth Month, tontines/IOUs/zakat, recap, room/lanterns, health score + simulator,
Ember XP/badges/pets, needs/brakes/trusted snapshot/number-light/low-energy/calm modes, save charms, Gmail stub,
cross-tab merge, the Hearth visual design. Reasons per item in `PORT.md` → Cuts.
