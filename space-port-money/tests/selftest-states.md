# money — selftest states (`dashboard-v5/src/selftest.js`)

The NAV × SUBS cross product picks up `money/today`, `money/runway`, `money/jars`, `money/inbox`
automatically once `catalog.mjs` has the entry — with the fake preload those render the **full**
fixture (2 accounts incl. a USD card, a late + a due-soon + an installment bill, 2 jars one off-pace,
a normal slip + a promo slip). Without a preload they render the offline line.

Add one block next to the Studio block (same `combo` / `LV` / `CLEAR` / `base` idiom), both themes.
`MONEY` = the fixture (`dashboard-v5/tools/money.fake-views.json`, fetched once at the top of the sweep —
`await (await fetch('../tools/money.fake-views.json')).json()`).

```js
        // Money: every load state + every inline form / flag the cross product doesn't reach
        const M = { ready: { view: MONEY.full, error: '', loaded: true }, empty: { view: MONEY.empty, error: '', loaded: true },
          error: { view: null, error: 'selftest: synthetic read error', loaded: true }, loading: { view: null, error: '', loaded: false } };
        const o0 = MONEY.full.obligations[0], j0 = MONEY.full.jars[0], promo = MONEY.full.slips.find((c) => c.warn);
        for (const [name, sub, money, mny, extra] of [
          ['money-empty', 'today', M.empty, {}],
          ['money-error', 'today', M.error, {}],
          ['money-loading', 'today', M.loading, {}],
          ['money-acct-new', 'today', M.ready, { acct: { name: '', currency: 'DA', balance: '' } }],
          ['money-acct-confirm', 'today', M.ready, { acct: { id: MONEY.full.accounts[1].id, name: 'Card', currency: 'USD', balance: '' } }],
          ['money-ask', 'today', M.ready, { ask: { type: 'account-archive', payload: { id: 'x' }, question: 'Archive Cash? Its history stays.' } }],
          ['money-scrubbed', 'today', M.ready, {}, { snapOffset: 1 }],
          ['money-bill-new', 'runway', M.ready, { bill: { name: '', amount: '', currency: 'DA', kind: 'bill', cadence: 'monthly', firstDue: '2026-11-20', accountId: '' } }],
          ['money-bill-installment', 'runway', M.ready, { bill: { name: 'Phone plan', amount: '4000', currency: 'DA', kind: 'installment', cadence: 'monthly', firstDue: '2026-11-15', accountId: '', installmentTotal: '12', paidBefore: '4' } }],
          ['money-pay-open', 'runway', M.ready, { pay: { id: o0.id, amount: '', accountId: '' } }],
          ['money-runway-empty', 'runway', M.empty, {}],
          ['money-jar-new', 'jars', M.ready, { jar: { name: '', target: '', targetDate: '' } }],
          ['money-jar-move', 'jars', M.ready, { move: { jarId: j0.id, kind: 'withdraw', amount: '' } }],
          ['money-jar-cover', 'jars', M.ready, { cover: { toJarId: j0.id, fromJarId: '', amount: '500' } }],
          ['money-payday-open', 'jars', M.ready, { payday: { amount: '', accountId: '' } }],
          ['money-jars-empty', 'jars', M.empty, {}],
          ['money-slip-armed', 'inbox', M.ready, { armed: { [promo.id]: true } }],
          ['money-inbox-empty', 'inbox', M.empty, {}],
        ]) {
          await combo([theme, 'p3:' + name].join(' '), () => {
            LV.money = money;
            L.go('money', sub); L.setState(Object.assign({}, CLEAR, base, { themePref: theme, snapOffset: 0, mny }, extra || {}));
          });
        }
```

Add `mny: {}` to `CLEAR` (the state reset object at the top) so earlier combos never leak a draft.

Expectation: **0 errors, 0 unresolved bindings** across all of the above in dark and light.
`money-scrubbed` needs `maxOff ≥ 1` in the synthetic store (it has several snapshots); it must show the
blue "money isn't part of the scan" line and keep every button live.
