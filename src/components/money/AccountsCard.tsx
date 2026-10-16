import { useState } from 'react'
import type { Dispatch } from 'react'
import type { AppAction } from '../../state/reducer.ts'
import type { Account, Currency, MoneySettings } from '../../state/slices/money.ts'
import { newId } from '../../state/store.ts'
import type { AccountBalance } from '../../engine/money.ts'
import { fmtDA, fmtMoney } from '../../engine/money.ts'

/**
 * Accounts and the two settings the forecast depends on (FX rate, payday).
 * Balances are anchors the user typed; spend since then moves an estimate,
 * labelled as such with how long ago it was confirmed. Confirming takes one
 * number — it is the honest replacement for the bank sync Ember never does.
 */
export function AccountsCard({
  balances,
  settings,
  dispatch,
}: {
  balances: AccountBalance[]
  settings: MoneySettings
  dispatch: Dispatch<AppAction>
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  return (
    <section className="card accounts" aria-labelledby="accounts-title">
      <h2 id="accounts-title">Accounts</h2>
      <ul className="acc-list">
        {balances.map((b) => (
          <li key={b.account.id} className="acc-row">
            <div className="acc-head">
              <span className="acc-name">{b.account.name}</span>
              <span className={`acc-pill${b.isEstimate ? ' is-est' : ''}`}>
                {b.isEstimate ? 'estimated' : 'typed by you'}
              </span>
            </div>
            <p className="acc-num mono">{fmtMoney(b.balance, b.account.currency)}</p>
            {b.account.currency === 'USD' && (
              <p className="acc-sub">
                {b.balanceDA === null ? 'set your rate to see it in DA' : `≈ ${fmtDA(b.balanceDA)} at your rate`}
              </p>
            )}
            <p className="acc-meta">
              {b.daysSinceConfirmed === 0
                ? 'confirmed today'
                : `last confirmed ${b.daysSinceConfirmed} day${b.daysSinceConfirmed === 1 ? '' : 's'} ago`}
            </p>
            {confirming === b.account.id ? (
              <ConfirmForm
                account={b.account}
                current={b.balance}
                onDone={(n) => {
                  if (n !== null) {
                    const now = new Date().toISOString()
                    dispatch({
                      type: 'money/account-upsert',
                      account: { ...b.account, anchorBalance: n, anchorAt: now, updatedAt: now },
                    })
                  }
                  setConfirming(null)
                }}
              />
            ) : (
              <button type="button" className="btn undo-btn" onClick={() => setConfirming(b.account.id)}>
                Confirm balance
              </button>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <AddAccount
          onDone={(acc) => {
            if (acc) dispatch({ type: 'money/account-upsert', account: acc })
            setAdding(false)
          }}
        />
      ) : (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Add an account
        </button>
      )}
      <SettingsForm settings={settings} dispatch={dispatch} />
    </section>
  )
}

function ConfirmForm({
  account,
  current,
  onDone,
}: {
  account: Account
  current: number
  onDone: (n: number | null) => void
}) {
  const [value, setValue] = useState(String(Math.round(current * 100) / 100))
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="log-row acc-confirm"
      onSubmit={(e) => {
        e.preventDefault()
        const n = Number(value)
        if (!Number.isFinite(n) || n < 0) {
          setError('Type the balance you see right now.')
          return
        }
        onDone(n)
      }}
    >
      <label className="field-wrap">
        <span className="field-label">Balance now ({account.currency})</span>
        <input
          className="field mono"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          aria-invalid={error !== null}
          autoFocus
        />
      </label>
      <button type="submit" className="btn btn-flame">
        Save
      </button>
      <button type="button" className="btn" onClick={() => onDone(null)}>
        Cancel
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

function AddAccount({ onDone }: { onDone: (a: Account | null) => void }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [balance, setBalance] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="log-row acc-add"
      onSubmit={(e) => {
        e.preventDefault()
        const n = Number(balance)
        if (name.trim() === '') return setError('Give it a short name.')
        if (balance.trim() === '' || !Number.isFinite(n) || n < 0) return setError('Type its balance now.')
        const now = new Date().toISOString()
        onDone({ id: newId(), name: name.trim(), currency, anchorBalance: n, anchorAt: now, archived: false, updatedAt: now })
      }}
    >
      <label className="field-wrap">
        <span className="field-label">Name</span>
        <input className="field" value={name} placeholder="RedotPay card" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field-wrap">
        <span className="field-label">Currency</span>
        <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          <option value="DA">DA</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className="field-wrap">
        <span className="field-label">Balance now</span>
        <input className="field mono" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-flame">
        Add
      </button>
      <button type="button" className="btn" onClick={() => onDone(null)}>
        Cancel
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

function SettingsForm({ settings, dispatch }: { settings: MoneySettings; dispatch: Dispatch<AppAction> }) {
  const [fx, setFx] = useState(settings.fxDaPerUsd?.toString() ?? '')
  const [payday, setPayday] = useState(settings.paydayDay?.toString() ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="acc-settings"
      onSubmit={(e) => {
        e.preventDefault()
        const rate = fx.trim() === '' ? null : Number(fx)
        if (rate !== null && !(Number.isFinite(rate) && rate > 0)) return setError('The rate is DA for one dollar, e.g. 245.')
        const day = payday === '' ? null : Number(payday)
        setError(null)
        dispatch({
          type: 'money/settings',
          settings: { fxDaPerUsd: rate, paydayDay: day, split: settings.split },
          nowISO: new Date().toISOString(),
        })
        setSaved(true)
      }}
    >
      <div className="log-row">
        <label className="field-wrap">
          <span className="field-label">DA per 1 USD (your rate)</span>
          <input
            className="field mono"
            inputMode="decimal"
            placeholder="e.g. 245"
            value={fx}
            onChange={(e) => {
              setFx(e.target.value)
              setSaved(false)
            }}
            aria-invalid={error !== null}
          />
        </label>
        <label className="field-wrap">
          <span className="field-label">Payday (day of month)</span>
          <select
            className="field"
            value={payday}
            onChange={(e) => {
              setPayday(e.target.value)
              setSaved(false)
            }}
          >
            <option value="">End of month / irregular</option>
            {Array.from({ length: 28 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="acc-meta">
        The official and street rates differ, so this rate is yours to set — Ember never fetches one.
      </p>
      <div className="log-actions">
        <button type="submit" className="btn">
          Save settings
        </button>
        {saved && (
          <span className="support-saved" role="status">
            Saved.
          </span>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
