# money — preload + main wiring (frontend lane, `fe:`)

## `dashboard/preload.js` — one allowlisted group

Add inside `contextBridge.exposeInMainWorld('hq', { … })`, right after the `studio: { … }` group closes (its last
member is `onOpenRealm`; `studio` is the last group, so this is just before the closing `});`):

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

Next to the other `require('./…').init(…)` lines inside `app.whenReady()` (at `76a7d1a`: right after the
`require('./accounts-view').init(…)` line, before `navBridge = require('./nav-bridge').init(…)`):

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

Test command to add to the README list (a real line, not an "only" comment — no other line reaches these 229 tests):
`node --test dashboard/money/*.test.mjs`. `dashboard/money.test.mjs` already rides `node --test dashboard/*.test.mjs`
and `src/logic/money.test.mjs` rides the v5 line.

## `.gitignore`

`data/` is already ignored wholesale; `data/money/state.json` and `state.json.corrupt` need nothing new.

## `dashboard-v5/tools/fake-preload.js` — recording fake

Paste the generated fixture near the top — right after `const WRITE = 'write', SEND = 'send';` (a sandboxed preload
can't require a .json file):

```js
// the fake preload is sandboxed (no require of JSON): paste main/fake-preload.money.snippet.js (one line: const MONEY = {empty, full})
```

Add to the method table (the `[method path, kind]` list inside `createFake`; at its end, after the `studio.*` rows).
`tools/fake-preload.test.mjs` fails until the fake exposes exactly the real preload's paths:

```js
    ['money.read', () => ({ view: MONEY.full })],
    ['money.apply', (intent) => (intent && intent.type === 'log' && !intent.amount ? { error: 'amount needs a number above 0.' } : { view: MONEY.full, note: 'saved' })],
    ['money.importFile', () => ({ canceled: true })], ['money.exportFile', () => ({ canceled: true })],
```

A scenario that needs the empty first-run screen: `hqFake.set('money.read', { view: <MONEY.empty> }, { persist: true })`
(the fixture's `empty` view is in the same JSON; cdp-scenarios.md reads it from there).
