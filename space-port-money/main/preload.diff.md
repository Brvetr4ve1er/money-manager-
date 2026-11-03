# money — preload + main wiring (frontend lane, `fe:`)

## `dashboard/preload.js` — one allowlisted group

Add inside `contextBridge.exposeInMainWorld('hq', { … })`, next to `studio: { … }`:

```js
  // money space (IPC-CONTRACT hq:money:*). Intents only — main validates every field.
  money: {
    read: () => ipcRenderer.invoke('hq:money:read'),
    apply: (intent) => ipcRenderer.invoke('hq:money:apply', intent),
    importFile: () => ipcRenderer.invoke('hq:money:import'),
    exportFile: () => ipcRenderer.invoke('hq:money:export'),
  },
```

## `dashboard/main.js` — one line, no logic

Next to the other `require('./claude-vault').init(…)`-style lines inside `app.whenReady()`:

```js
  require('./money').init({ ipcMain, dataDir: DATA, getWin: () => win });   // money space: data/money/state.json (IPC-CONTRACT hq:money:*)
```

## Files that land as-is

| package file | lands at |
|---|---|
| `main/money.js` | `dashboard/money.js` |
| `main/money.test.mjs` | `dashboard/money.test.mjs` |
| `main/money/*.mjs` (incl. `*.test.mjs`, `vitest-shim.mjs`) | `dashboard/money/` |
| `main/money.fake-views.json` | `dashboard-v5/tools/money.fake-views.json` (readable form of the snippet below; `src/logic/money.test.mjs` and the cdp scenarios read it — the sandboxed fake preload uses the pasted snippet) |

Test command to add to the README list: `node --test dashboard/money.test.mjs dashboard/money/*.test.mjs`.

## `.gitignore`

`data/` is already ignored wholesale; `data/money/state.json` and `state.json.corrupt` need nothing new.

## `dashboard-v5/tools/fake-preload.js` — recording fake

Paste the generated fixture near the top (a sandboxed preload can't require a .json file):

```js
// the fake preload is sandboxed (no require of JSON): paste main/fake-preload.money.snippet.js (one line: const MONEY = {empty, full})
```

Add to the method table:

```js
    ['money.read', () => ({ view: MONEY.full })],
    ['money.apply', (intent) => (intent && intent.type === 'log' && !intent.amount ? { error: 'amount needs a number above 0.' } : { view: MONEY.full, note: 'saved' })],
    ['money.importFile', () => ({ canceled: true })], ['money.exportFile', () => ({ canceled: true })],
```

A scenario that needs the empty first-run screen: `hqFake.set('money.read', { view: <MONEY.empty> }, { persist: true })`
(the fixture's `empty` view is in the same JSON; cdp-scenarios.md reads it from there).
