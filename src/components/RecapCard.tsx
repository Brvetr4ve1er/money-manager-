import { useState } from 'react'
import type { AppState } from '../state/store.ts'
import { activeMonths, monthRecap } from '../engine/recap.ts'

const fmt = (n: number) => `${Math.round(n).toLocaleString('en-US')} DA`

/**
 * The moon ceremony: a calm monthly mirror. Highlights are positive and
 * factual; the spend line is a number, never a grade.
 */
export function RecapCard({ state, today, month: fixedMonth }: { state: AppState; today: string; month?: string }) {
  const months = activeMonths(state, today)
  const [picked, setPicked] = useState(fixedMonth ?? months[0])
  const r = monthRecap(state, fixedMonth ?? picked)
  return (
    <section className="card recap wide" aria-labelledby={`recap-${r.month}`}>
      <div className="recap-head">
        <h2 id={`recap-${r.month}`}>
          <span aria-hidden="true">🌙 </span>
          {r.label}
        </h2>
        {!fixedMonth && months.length > 1 && (
          <label className="recap-pick">
            <span className="sr-only">Month</span>
            <select className="field" value={picked} onChange={(e) => setPicked(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ul className="recap-highlights">
        {r.highlights.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <div className="recap-grid">
        <div>
          <span className="recap-k">Spent</span>
          <span className="recap-v mono">{fmt(r.spentDA)}</span>
          <span className="recap-s">
            {r.logs} log{r.logs === 1 ? '' : 's'}
            {r.deltaDA !== null && ` · ${r.deltaDA > 0 ? '+' : r.deltaDA < 0 ? '−' : '±'}${fmt(Math.abs(r.deltaDA))} vs the month before`}
          </span>
        </div>
        <div>
          <span className="recap-k">Into jars</span>
          <span className="recap-v mono">{fmt(r.savedToJarsDA)}</span>
          <span className="recap-s">{r.jarsReached} reached</span>
        </div>
        <div>
          <span className="recap-k">Kept, not spent</span>
          <span className="recap-v mono">{fmt(r.keptDA)}</span>
          <span className="recap-s">{r.resists} resisted</span>
        </div>
      </div>
      {r.topCategories.length > 0 && (
        <ul className="recap-cats" aria-label="Where it went">
          {r.topCategories.map((c) => (
            <li key={c.category}>
              <span className="recap-cat">{c.category}</span>
              <span className="recap-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(c.share * 100)}%` }} />
              </span>
              <span className="mono">{fmt(c.amountDA)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
