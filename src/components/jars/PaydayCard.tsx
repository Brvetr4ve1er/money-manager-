import { useEffect, useId, useState, type CSSProperties, type FormEvent } from 'react'
import type { Account, Jar, MoneySettings, PaydaySplitRow } from '../../state/slices/money.ts'
import { fmtDA, toDA } from '../../engine/money.ts'
import { parseAmount, splitTotal } from './helpers.ts'

export interface PaydayResult {
  landed: number
  intoJars: number
  rows: Array<{ jar: Jar; amount: number }>
}

interface Props {
  jars: Jar[]
  accounts: Account[]
  settings: MoneySettings
  /** Persist the split (full settings minus savedAt; caller keeps fx/payday). */
  onSaveSplit: (split: PaydaySplitRow[]) => void
  /** Record the income + one payday move per row. Returns nothing; the card
   *  shows its own summary from the numbers it validated. */
  onRun: (accountId: string, amount: number, split: PaydaySplitRow[]) => void
}

type SplitDraft = Record<string, string>

function draftFrom(split: PaydaySplitRow[]): SplitDraft {
  const d: SplitDraft = {}
  for (const r of split) d[r.jarId] = String(r.amount)
  return d
}

/** The payday ritual: income lands, the saved split gives every dinar a job. */
export function PaydayCard({ jars, accounts, settings, onSaveSplit, onRun }: Props) {
  const id = useId()
  const [draft, setDraft] = useState<SplitDraft>(() => draftFrom(settings.split))
  const [income, setIncome] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [splitNote, setSplitNote] = useState<string | null>(null)
  const [result, setResult] = useState<PaydayResult | null>(null)
  const [run, setRun] = useState(0)

  // A peer tab (or a save) changed the split: adopt it.
  const savedKey = JSON.stringify(settings.split)
  useEffect(() => setDraft(draftFrom(settings.split)), [savedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!accounts.some((a) => a.id === accountId)) setAccountId(accounts[0]?.id ?? '')
  }, [accounts, accountId])

  /** The draft as split rows; null when a typed amount is not a number. */
  function rowsFromDraft(): PaydaySplitRow[] | null {
    const rows: PaydaySplitRow[] = []
    for (const j of jars) {
      const raw = (draft[j.id] ?? '').trim()
      if (raw === '' || raw === '0') continue
      const n = parseAmount(raw)
      if (n === null) return null
      rows.push({ jarId: j.id, amount: n })
    }
    return rows
  }

  const rows = rowsFromDraft()
  const total = rows ? splitTotal(rows) : null
  const dirty = rows !== null && JSON.stringify(rows) !== JSON.stringify(settings.split.filter((r) => jars.some((j) => j.id === r.jarId)))

  function saveSplit(e?: FormEvent) {
    e?.preventDefault()
    if (rows === null) {
      setSplitNote('Each split amount should be a number in DA.')
      return
    }
    onSaveSplit(rows)
    setSplitNote('Split saved. It runs every payday until you change it.')
  }

  function runSplit() {
    setResult(null)
    const amount = parseAmount(income)
    const account = accounts.find((a) => a.id === accountId)
    if (amount === null) return setError('How much landed? Type the income in the account’s currency.')
    if (!account) return setError('Pick the account the income landed in.')
    if (rows === null) return setError('Each split amount should be a number in DA.')
    const landedDA = toDA(amount, account.currency, settings.fxDaPerUsd)
    if (landedDA === null) return setError(`${account.name} is in USD and no DA rate is set yet, so the split can’t be checked against it.`)
    const into = splitTotal(rows)
    if (into > landedDA) {
      return setError(
        `Your split (${fmtDA(into)}) is more than this income (${fmtDA(landedDA)}). Trim a row so every dinar has somewhere real to go.`,
      )
    }
    setError(null)
    if (dirty) onSaveSplit(rows)
    onRun(account.id, amount, rows)
    setResult({
      landed: landedDA,
      intoJars: into,
      rows: rows.map((r) => ({ jar: jars.find((j) => j.id === r.jarId)!, amount: r.amount })),
    })
    setRun((n) => n + 1)
    setIncome('')
  }

  return (
    <section className="card jars-payday" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Payday</h2>
      <p className="support-lead">Income lands, your split runs, every dinar gets a job. You set the split once; tweak it whenever.</p>

      {jars.length === 0 ? (
        <p className="support-lead">Make a jar first — the split needs somewhere to send money.</p>
      ) : (
        <form className="payday-split" onSubmit={saveSplit} noValidate aria-label="Payday split">
          <ul className="payday-rows">
            {jars.map((j) => (
              <li key={j.id} className="payday-row">
                <label htmlFor={`${id}-s-${j.id}`}>
                  <span aria-hidden="true">{j.emoji}</span> {j.name}
                  <span className="sr-only"> split amount</span>
                </label>
                <input
                  id={`${id}-s-${j.id}`}
                  className="field mono payday-amt"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={draft[j.id] ?? ''}
                  onChange={(e) => {
                    setDraft({ ...draft, [j.id]: e.target.value })
                    setSplitNote(null)
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="log-actions">
            <span className="payday-total">
              Split: <b className="mono">{total === null ? '—' : fmtDA(total)}</b>
            </span>
            <button type="submit" className="btn" disabled={!dirty}>Save split</button>
          </div>
          <p className="support-saved" role="status">{splitNote ?? ''}</p>
        </form>
      )}

      {accounts.length === 0 ? (
        <p className="payday-guide">
          Income needs an account first — it lands somewhere real. <a href="#/home">Add an account on Home</a>, then come back for the ritual.
        </p>
      ) : (
        jars.length > 0 && (
          <div className="payday-run">
            <div className="log-row">
              <div className="field-wrap">
                <label className="field-label" htmlFor={`${id}-inc`}>Income amount</label>
                <input
                  id={`${id}-inc`}
                  className="field mono"
                  inputMode="numeric"
                  autoComplete="off"
                  value={income}
                  onChange={(e) => {
                    setIncome(e.target.value)
                    setError(null)
                  }}
                  aria-invalid={error !== null}
                  aria-describedby={error ? `${id}-err` : undefined}
                />
              </div>
              <div className="field-wrap">
                <label className="field-label" htmlFor={`${id}-acc`}>Landed in</label>
                <select id={`${id}-acc`} className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="field-error" id={`${id}-err`} role="alert">{error}</p>}
            <div className="log-actions">
              <button type="button" className="btn btn-flame payday-go" onClick={runSplit}>
                Income landed — run my split
              </button>
            </div>
          </div>
        )
      )}

      {result && (
        <div className="payday-done" key={run}>
          <div className="payday-arc" aria-hidden="true">
            <span className="payday-hearth">🔥</span>
            <ol className="payday-targets">
              {result.rows.map((r, i) => (
                <li key={r.jar.id} style={{ '--i': i } as CSSProperties}>
                  <span className="payday-coin" />
                  <span className="payday-mini">{r.jar.emoji}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="payday-summary" role="status">
            <b className="mono">{fmtDA(result.landed)}</b> landed · <b className="mono">{fmtDA(result.intoJars)}</b> into jars ·{' '}
            <b className="mono">{fmtDA(result.landed - result.intoJars)}</b> left to breathe
          </p>
        </div>
      )}
    </section>
  )
}
