# money — catalog + wiring diff (renderer, frontend lane, `fe:`)

Every edit outside the four new files, in apply order. Paths are under `dashboard-v5/`.
Line anchors are quoted from `76a7d1a`; match the text, not the number.

## 1. `src/live/catalog.mjs` — nav slot **0** (10th entry), sub-tabs

The live catalog already has 9 spaces (Studio is #9), so money takes the 10th slot, hotkey **0**.

```js
// NAV: append after studio
  { id: 'money', label: 'Money', glyph: '◈' },
// SUBS: add
  money: [['today', 'Today'], ['runway', 'Runway'], ['jars', 'Jars'], ['inbox', 'Inbox']],
```

## 2. `src/vals/ctx.js` — the `v.money` screen flag

In the `Object.assign(v0, { … })` that sets `life:` and `studio:`, add:

```js
    money: ok && !onPage && S.tab === 'money',
```

## 3. `src/app.js`

```js
// imports, after studioLogic:
import { moneyLogic } from './logic/money.js';
// Object.assign(Component.prototype, …): append moneyLogic to the mixin list
// initial state, sub defaults object: add  money: 'today'
//   (the line: sub: Object.assign({ projects: 'grid', … life: 'screen' }, saved.sub || {}))
// initial state, anywhere in the literal (next to studioFilter is fine):
      mny: {},   // money space drafts + busy guard (logic/money.js); never persisted — main owns the data
// componentDidUpdate, next to the refreshSocial line:
    if (moved && S.tab === 'money') this.store.refreshMoney();
```

Hotkey 0 — `onKey`, replace the number-key line:

```js
    // was: if (/^[1-9]$/.test(e.key) && …) { this.go(this.M.NAV[+e.key - 1].id); return; }
    if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) { const n = this.M.NAV[e.key === '0' ? 9 : +e.key - 1]; if (n) this.go(n.id); return; }
```

## 4. `src/vals/index.js`

```js
import { moneyVals } from './money.js';
// SURFACES: append moneyVals (after accountsVals)
```

## 5. `src/app.tpl.js`

```js
import money from './tpl/money.tpl.js';
// joined list: insert `money` right after `studio`
```

## 6. `src/vals/shell.js` — the screen subtitle

In the `screenSub` map, add:

```js
    money: LIVE.money && LIVE.money.view ? (LIVE.money.view.hasAccounts ? 'breathing room ' + LIVE.money.view.room.amount + ' · payday ' + LIVE.money.view.payday : 'no accounts yet') + ' · local only, never synced' : 'accounts, bills, jars and receipts · local only',
```

## 7. `src/logic/palette.js` — jump entries + the 0 hint

```js
// the [label, tab, sub] shortcut list: add
['Runway', 'money', 'runway'], ['Jars', 'money', 'jars'], ['Money inbox', 'money', 'inbox'],
// the Go-to row: the hint for the 10th entry is the key that opens it
    const go = NAV.map((n, i) => ({ glyph: n.glyph, label: n.label, hint: i === 9 ? '0' : String(i + 1), run: () => this.go(n.id) }));
```

## 8. `src/logic/whats-new.js` — one CHANGES line

```js
  { text: 'Money is a new space (key 0): breathing room until payday, bills on a runway, jars, and a paste-a-receipt inbox. All local in data/money/, nothing synced.', needs: 'mnyApply' },
```

## 9. `src/selftest.js` — see `tests/selftest-states.md`

## 10. Files that land as-is

| package file | lands at |
|---|---|
| `renderer/money.tpl.js` | `dashboard-v5/src/tpl/money.tpl.js` |
| `renderer/money.vals.js` | `dashboard-v5/src/vals/money.js` |
| `renderer/money.logic.js` | `dashboard-v5/src/logic/money.js` |
| `tests/money.logic.test.mjs` | `dashboard-v5/src/logic/money.test.mjs` (fix its import paths: `./money.js`, `../vals/money.js`) |

No CSS file: like every other v5 fragment, money styles inline with tokens only (`var(--gold)` etc.);
`assets/` is intentionally empty.

## Goldens (re-record, attributed)

- `src/tpl.hash.test.mjs` — moves: the joined template gains the money fragment.
- `src/vals.golden.test.mjs` — moves: every serialized renderVals gains the `mny*` keys (all new, none
  renamed) and `v.money:false`; `screenSub` unchanged on existing tabs. On the money tab itself the
  synthetic store has no `hq.money`, so `mnyOffline:true`.
