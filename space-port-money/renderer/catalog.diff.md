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
// KEYS (the ? cheat sheet): the destinations row names the new key
  ['1 – 9, 0', 'Destinations'],      // was ['1 – 9', 'Destinations']
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
// componentDidUpdate, next to the refreshSocial line (money.store.md shows the same line with its comment — add it ONCE):
    if (moved && S.tab === 'money') this.store.refreshMoney();   // money: "today" moves on its own (due dates, payday) — re-read on arrival
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

In the side-rail `nav` builder (`const nav = H.NAV.map((n, i) => {`), the digit and the tooltip must show the
key that opens the 10th entry (`0`), not `10`:

```js
    const a = S.tab === n.id && !onPage, b = navBadge[n.id], key = i === 9 ? '0' : String(i + 1);   // the 10th destination's key is 0
//  digit: String(i + 1)                    →  digit: key
//  title: n.label + ' (' + (i + 1) + ')'   →  title: n.label + ' (' + key + ')'
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

## 8b. `src/elements/hq-v3.js` — the nav icon

`<hq-icon name="money">` has no path set and falls back to the Home glyph. Add a ◈ to the `I` table (before `search:`)
and a hover to `HOVER` (before `settings:`):

```js
    money: ['M12 1.5 22.5 12 12 22.5 1.5 12zm0 2.9L4.4 12l7.6 7.6 7.6-7.6z', 'M12 7.6 16.4 12 12 16.4 7.6 12z'],   // ◈ (money space)
    money: p => p[1] && p[1].animate([{ transform: 'rotate(0)' }, { transform: 'rotate(90deg)' }], { duration: 380, easing: 'cubic-bezier(.3,1.5,.5,1)' }),
```

## 9. `src/selftest.js` — see `tests/selftest-states.md`

## 10. Files that land as-is

| package file | lands at |
|---|---|
| `renderer/money.tpl.js` | `dashboard-v5/src/tpl/money.tpl.js` |
| `renderer/money.vals.js` | `dashboard-v5/src/vals/money.js` |
| `renderer/money.logic.js` | `dashboard-v5/src/logic/money.js` |
| `tests/money.logic.test.mjs` | `dashboard-v5/src/logic/money.test.mjs` (its imports are already written for that path) |

No CSS file: like every other v5 fragment, money styles inline with tokens only (`var(--gold)` etc.);
`assets/` is intentionally empty.

## Goldens (re-record, attributed)

- `src/vals.golden.test.mjs` — first add `'money'` to its hard-coded `TABS` list (the tab scenarios don't come from
  NAV), so the money tab gets `tab.money.{today,runway,jars,inbox}`: synthetic store, `hq = null` → `v.money:true`,
  `mnyOffline:true`, `screenSub` "accounts, bills, jars and receipts · local only".
  Attribute before re-recording: dump before (a clean checkout) and after with `GOLDEN_DUMP=<dir outside the repo>`, then
  `node dashboard-v5/tools/golden-diff.mjs <before> <after> --allow '^mny' --allow '^onMny' --allow '^v\.money$' --allow '^nav\[9\]$' --allow '^moreNav\[5\]$' --allow '^whatsNew\.changes\[14\]$' --allow '^keys\[2\]\.k$'`
  must say "every change is attributed", 0 removed, 4 added. What moves, in all 195 existing scenarios: the 137 new
  `mny*`/`onMny*` keys, `v.money:false`, the 10th `nav` / last `moreNav` entry (Money, digit `0`), the What's new line
  (`mnyApply` exists, so it shows) and the cheat-sheet row `1 – 9, 0`. `screenSub` is unchanged on every existing
  scenario. Then `UPDATE_GOLDEN=1 node --test dashboard-v5/src/vals.golden.test.mjs` (195 → 199 hashes).
- `src/tpl.hash.test.mjs` — the joined template gains the money fragment and nothing else: +57015 chars / +57084
  bytes (at `76a7d1a`: length 290971 → 347986, UTF-8 bytes 291497 → 348581). Recompute the sha256 of
  `app.tpl.js`'s default export, update the three constants and add a dated comment line, as the earlier entries do.
