# money — CONTRACT rows (`docs/sync/CONTRACT.md`)

## Table row (the sidecar list at the top)

Append to the `## Files the frontend consumes` table, after the `data/browser-activity.json` row:

| File | Consumed by | Notes |
|---|---|---|
| `data/money/state.json` | `dashboard/money.js` only (renderer gets a derived view over `hq:money:*`) | owner money data · gitignored · frontend lane |

## Section

Under `## Pending changes`, as a sibling of the other frontend-lane local stores (`### data/claude/ …`, the vault
note formats): after the last of those (`VEEMO CORTEX/40_Resources/Prompts/<slug>.md`), before the dated
`## 2026-10-16 · struct · …` entries.

### `data/money/` — money space (frontend lane, local only, gitignored)

`data/money/state.json`, written only by `dashboard/money.js` (atomic: `state.json.<pid>.tmp` → rename).
Never read by `collector/`, the MCP server or `build-data.mjs`; never committed. A file that won't parse is
renamed to `state.json.corrupt` (kept, never overwritten) and the app starts from an empty state.

```jsonc
{
  "v": 1,
  "money": {                                   // Ember's money slice, sanitized field by field (dashboard/money/state.mjs)
    "accounts":    [{ "id", "name", "currency": "DA"|"USD", "anchorBalance", "anchorAt": ISO, "archived", "updatedAt": ISO }],
    "obligations": [{ "id", "name", "amount", "currency", "kind": "bill"|"variable"|"subscription"|"installment",
                      "cadence": "monthly"|"weekly"|"yearly"|"once", "firstDue": "YYYY-MM-DD", "accountId"|null,
                      "installment": { "total", "paidBefore" }|null, "nextStep", "archived", "updatedAt" }],
    "payments":    [{ "id", "obligationId", "due", "paidOn", "amount", "currency", "txId", "void", "updatedAt" }],
    "jars":        [{ "id", "name", "emoji", "target"|null, "targetDate"|null, "locked", "archived", "updatedAt" }],
    "jarMoves":    [{ "id", "jarId", "amount" /* signed */, "date", "kind": "topup"|"withdraw"|"cover"|"payday"|"charm" }],
    "charms": [], "dismissed": [],             // kept for Ember round-trips; the space doesn't use them in v1
    "incomes":     [{ "id", "accountId", "amount", "date", "at": ISO, "note" }],
    "settings":    { "fxDaPerUsd"|null, "paydayDay": 1..28|null, "split": [{ "jarId", "amount" }], "savedAt" }
  },
  "transactions": [{ "id", "amountDA" /* ≥ 0 */, "category", "date", "note"?, "accountId"?, "original"?: { "amount", "currency": "USD" },
                     "at"?: ISO, "obligationId"?, "resistedImpulse"? }],   // newest first, ≤ 50 000
  "inbox": { "candidates": [{ "id", "merchant", "amount" /* < 0 = refund */, "currency", "date", "sources": [{ "from", "text", "receivedAt" }],
                              "confidence": 0..1, "flags": ["duplicate"|"not_a_charge"|"promo"|"refund"], "suggestedCategory",
                              "status": "pending"|"confirmed"|"rejected", "txId"|null, "cleared", "updatedAt" }] }
}
```

Derived values are **never stored** (balances = anchor − spend after it + income after it; next due = firstDue advanced
once per live payment; jar balance = sum of moves). "Clear handled" keeps a tombstone (`cleared:true`, `sources:[]`) so the
message text is dropped but the slip can't come back. Size: a year of daily use is well under 1 MB.

The same three top-level keys are what an **Ember export** (`ember-state-v1`) carries, so `hq:money:import` accepts one directly.
