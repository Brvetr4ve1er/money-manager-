# money — store slice (`dashboard-v5/src/live/store.js`)

The money space keeps **no money data in the renderer model**. Main owns `data/money/state.json`;
the store holds the last view main returned (`hq:money:read` / `apply` / `import` all answer
`{ view, note? } | { error } | { canceled }`). The view is display-ready (strings + flags), built by
`dashboard/money/view.mjs` — vals only map it.

## live keys

Add to the `live` object literal in `createStore` (next to `social`):

```js
    money: { view: null, error: '', loaded: false },   // money space: last view from hq:money:* (main owns the data)
```

`view === null && !error` = loading · `error` = the read failed (shown with Retry) · no `hq.money` at all = offline (vals decides, store untouched).

## functions (inside `createStore`, after `refreshSocial`)

```js
  // money space (spec: space-port-money). Main owns the data; every answer carries a fresh view.
  function takeMoney(r) {
    if (r && typeof r.error === 'string') { if (!live.money.view) live.money = { view: null, error: r.error, loaded: true }; return r; }
    if (r && r.view) live.money = { view: r.view, error: '', loaded: true };
    return r;
  }
  function refreshMoney() {
    if (!hq || !hq.money || !hq.money.read) return Promise.resolve();
    return pull(() => hq.money.read(), (r) => { takeMoney(r); });
  }
  // writes: resolve main's answer as-is (logic/money.js toasts r.error / r.note); never reject
  function applyMoney(intent) {
    if (!hq || !hq.money || !hq.money.apply) return Promise.resolve({ error: 'money needs the desktop bridge' });
    return Promise.resolve().then(() => hq.money.apply(intent)).then(takeMoney, (e) => ({ error: (e && e.message) || String(e) })).finally(emit);
  }
  function importMoney() {
    if (!hq || !hq.money || !hq.money.importFile) return Promise.resolve({ error: 'money needs the desktop bridge' });
    return Promise.resolve().then(() => hq.money.importFile()).then(takeMoney, (e) => ({ error: (e && e.message) || String(e) })).finally(emit);
  }
```

Note on `takeMoney` + a write error: a refused write (`{ error }`) must NOT blank a view that is
already on screen — the refusal is toasted by logic, the last good numbers stay. Only a failed
*first* read shows the error state.

## start()

In `start()`, next to `reads.push(refreshSocial(), refreshLlm(false));`:

```js
    if (hq.money) reads.push(refreshMoney());
```

## exports

Add `refreshMoney, applyMoney, importMoney` to the returned object (the line with `refreshSocial`).

## refresh on arrival (`src/app.js` componentDidUpdate)

Next to `if (moved && S.tab === 'life') this.store.refreshSocial();`:

```js
    if (moved && S.tab === 'money') this.store.refreshMoney();   // money: "today" moves on its own (due dates, payday) — re-read on arrival
```

## reload survival

- Saved data: in main (`data/money/state.json`), re-read by `start()` after every window reload. Nothing to restore.
- Current sub-tab: already survives via `whq3-place` (`S.sub` is persisted there).
- Half-typed drafts (`S.mny.*`): intentionally **not** persisted — nothing is saved until the owner presses a
  button, and a reload is the app's normal "fresh screen". No toast claims a draft was kept.
- `S.mny.busy` (double-submit guard) starts false on every load, so a reload mid-write can't wedge the screen.
