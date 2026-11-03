# money — IPC-CONTRACT rows (write these BEFORE landing the code)

New dated section for `docs/sync/IPC-CONTRACT.md`, placed like the latest ones (GitHub view, Connected accounts):
just above `## Rules`, headed `## <date> — Money space (rows written before the handler lands)` with one line
"Additive only. New file `dashboard/money.js` + `dashboard/money/*.mjs` (one hook line in `main.js`)." and then
this table (the main invoke table's columns):

| `window.hq` method | Channel | Args | Returns | Primary surface |
|---|---|---|---|---|
| **Money space** (`dashboard/money.js`, data `data/money/state.json`) | | | | |
| `money.read()` | `hq:money:read` | — | `{view}` — the display-ready money view built main-side by `dashboard/money/view.mjs` for TODAY (local date); a missing file is a correct empty view, a corrupt one is quarantined to `state.json.corrupt` first · `{error}` on a real IO failure | MONEY space (all subs) |
| `money.apply(intent)` | `hq:money:apply` | `{type, …fields}` — an INTENT, never an entity. `type` ∈ `account-save` `account-archive` `settings` `log` `tx-undo` `obligation-save` `obligation-archive` `obligation-pay` `obligation-unpay` `jar-save` `jar-archive` `jar-move` `jar-cover` `split-save` `payday-run` `inbox-paste` `inbox-confirm` `inbox-reject` `inbox-clear`; fields per `dashboard/money/commands.mjs` (strings from inputs are fine: `"2 500"`, `"1.200,00"`) | `{view, note}` after the write landed (atomic tmp + rename) · `{error}` with owner-facing copy when refused (unknown type, > 64 KB, bad field, gone id, USD without a rate, promo/renewal/already-logged slip without `anyway:true`) — nothing written. Ids + timestamps are minted in main, never taken from the renderer | MONEY space |
| `money.importFile()` | `hq:money:import` | — (main opens a native Open dialog; gates: `HQ_MONEY_IMPORT_FILE`) | `{view, note}` — the picked file (≤ 5 MB, an Ember export or a money export) is sanitized and **merged as a union** (existing rows win ties; nothing replaced) · `{canceled:true}` · `{error}` (not JSON / nothing importable / write failed) | MONEY › today |
| `money.exportFile()` | `hq:money:export` | — (native Save dialog, default `Documents/money-YYYY-MM-DD.json`) | `{note}` · `{canceled:true}` · `{error}` | MONEY › today |

Invariants (put under the table):
- No push channel: money changes only through these four calls, and every write answers with the fresh view —
  main does **not** reload the window after a money write.
- No network, nothing outbound. The only paths main touches outside `data/money/` are the ones the owner picked
  in a native dialog (import reads one file, export writes one file).
- `apply` is synchronous inside the handler (read → validate → write), so two calls serialize on main's event loop.
