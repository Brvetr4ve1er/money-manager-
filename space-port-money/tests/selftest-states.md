# money — selftest states (`dashboard-v5/src/selftest.js`)

The NAV × SUBS cross product picks up `money/today`, `money/runway`, `money/jars`, `money/inbox`
automatically once `catalog.mjs` has the entry — with the fake preload those render the **full**
fixture (2 accounts incl. a USD card, a late + a due-soon + an installment bill, 2 jars one off-pace,
a normal slip + a promo slip). Without a preload they render the offline line.

Three edits, all inside `run()`:

1. **Load the fixture once**, right after `const offsets = …` / before the sweep. It is a JSON *module* import
   resolved against `src/selftest.js` — `fetch()` cannot read `file://` in Electron (the page is loaded with
   `loadFile`), and a failed fetch here crashes the whole selftest with 0 combos:

```js
    // the money fixture (tools/money.fake-views.json): a JSON module — fetch() can't read file:// in Electron
    const MONEY = (await import('../tools/money.fake-views.json', { with: { type: 'json' } })).default;
```

2. **Snapshot `LV.money`** with the rest of the live slices, so the selftest leaves the store as it found it
   (it is read-only by construction): in the `const LV = W.store.live, savedLive = { … }` line append
   `money: LV.money` (after `candidates: LV.candidates`).

3. **The block**, inside the `for (const theme of ['dark', 'light'])` loop that ends the Phase 3 `try`, right
   after the Studio-with-captures `for` (so `theme`, `combo`, `LV`, `CLEAR`, `base`, `rendered`, `sleep` are in
   scope and the `finally` puts `LV` back). The fixture views are `MV` — `M` is already the model in `run()`.
   Arriving on the money tab or a new sub re-reads money (`app.js` componentDidUpdate → `refreshMoney()`); its
   answer lands a few ms later and would overwrite the synthetic state (measured: `money-empty` never rendered),
   so the loop lands on each sub first and waits, the same idiom as the Studio block:

```js
        // Money: every load state + every inline form / flag the cross product doesn't reach
        const MV = { ready: { view: MONEY.full, error: '', loaded: true }, empty: { view: MONEY.empty, error: '', loaded: true },
          error: { view: null, error: 'selftest: synthetic read error', loaded: true }, loading: { view: null, error: '', loaded: false } };
        const o0 = MONEY.full.obligations[0], j0 = MONEY.full.jars[0], promo = MONEY.full.slips.find((c) => c.warn);
        for (const [name, sub, money, mny, extra] of [
          ['money-empty', 'today', MV.empty, {}],
          ['money-error', 'today', MV.error, {}],
          ['money-loading', 'today', MV.loading, {}],
          ['money-acct-new', 'today', MV.ready, { acct: { name: '', currency: 'DA', balance: '' } }],
          ['money-acct-confirm', 'today', MV.ready, { acct: { id: MONEY.full.accounts[1].id, name: 'Card', currency: 'USD', balance: '' } }],
          ['money-ask', 'today', MV.ready, { ask: { type: 'account-archive', payload: { id: 'x' }, question: 'Archive Cash? Its history stays.' } }],
          ['money-scrubbed', 'today', MV.ready, {}, { snapOffset: 1 }],
          ['money-bill-new', 'runway', MV.ready, { bill: { name: '', amount: '', currency: 'DA', kind: 'bill', cadence: 'monthly', firstDue: '2026-11-20', accountId: '' } }],
          ['money-bill-installment', 'runway', MV.ready, { bill: { name: 'Phone plan', amount: '4000', currency: 'DA', kind: 'installment', cadence: 'monthly', firstDue: '2026-11-15', accountId: '', installmentTotal: '12', paidBefore: '4' } }],
          ['money-pay-open', 'runway', MV.ready, { pay: { id: o0.id, amount: '', accountId: '' } }],
          ['money-runway-empty', 'runway', MV.empty, {}],
          ['money-jar-new', 'jars', MV.ready, { jar: { name: '', target: '', targetDate: '' } }],
          ['money-jar-move', 'jars', MV.ready, { move: { jarId: j0.id, kind: 'withdraw', amount: '' } }],
          ['money-jar-cover', 'jars', MV.ready, { cover: { toJarId: j0.id, fromJarId: '', amount: '500' } }],
          ['money-payday-open', 'jars', MV.ready, { payday: { amount: '', accountId: '' } }],
          ['money-jars-empty', 'jars', MV.empty, {}],
          ['money-slip-armed', 'inbox', MV.ready, { armed: { [promo.id]: true } }],
          ['money-inbox-empty', 'inbox', MV.empty, {}],
        ]) {
          // arriving on money (or another sub) re-reads it (app.js componentDidUpdate): let that answer land first
          if (L.state.tab !== 'money' || L.state.sub.money !== sub) { L.go('money', sub); await rendered(); await sleep(250); }
          await combo([theme, 'p3:' + name].join(' '), () => {
            LV.money = money;
            L.go('money', sub); L.setState(Object.assign({}, CLEAR, base, { themePref: theme, snapOffset: 0, mny }, extra || {}));
          });
        }
```

Add `mny: {}` to `CLEAR` (the state reset object at the top) so earlier combos never leak a draft.

Expectation: **0 errors, 0 unresolved bindings** across all of the above in dark and light.
`money-scrubbed` forces `snapOffset: 1`, so it needs `maxOff ≥ 1` (two or more scans in `dashboard/data.js`).
It must show the blue "money isn't part of the scan" line and keep every button live.

**Run it with a scan bundle.** Without `dashboard/data.js` (gitignored, baked from the owner's scans) every
screen is the app's "no scan data" error, so the money markup is never rendered and a clean result proves
nothing. On a machine without real scans, bake a synthetic one from the golden fixtures (the `DATA()` builder in
`src/vals.golden.test.mjs`, 4 scans) — never commit it.

Measured at `76a7d1a` + this package (Electron 33, xvfb, synthetic 4-scan `data.js`): 2660 → **3000 combos**
(+340: the cross product's 4 money subs × 19 overlays × 2 time-machine ends × 2 themes = 304, plus these
18 × 2 themes), **0 errors, 0 unresolved, 0 failures**, both with `--preload=fake` and with no preload.
