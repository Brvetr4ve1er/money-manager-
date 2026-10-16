import { useState } from 'react'
import { fmtDA, fmtMoney } from '../../engine/money.ts'
import type { AuditSummary } from './runwayModel.ts'
import { plural } from './runwayModel.ts'

const PER: Record<string, string> = { weekly: 'a week', monthly: 'a month', yearly: 'a year' }

/**
 * "What repeats" — a mirror, not a verdict. Keep / Rethink is a private
 * thinking aid: it changes nothing stored and cancels nothing.
 */
export function RecurringAudit({ summary }: { summary: AuditSummary }) {
  const [marks, setMarks] = useState<Record<string, 'keep' | 'rethink'>>({})
  const { rows, totalYearlyDA, missingRate } = summary
  if (rows.length === 0) return null
  const rethinkDA = rows.reduce(
    (s, r) => (marks[r.view.obligation.id] === 'rethink' && r.yearlyDA !== null ? s + r.yearlyDA : s),
    0,
  )

  return (
    <section className="card rw-audit" aria-labelledby="rw-audit-title">
      <h2 id="rw-audit-title">What repeats</h2>
      <p className="rw-mirror">
        {rows.length} {plural(rows.length, 'thing repeats', 'things repeat')}, about{' '}
        <strong className="mono">{fmtDA(totalYearlyDA)}</strong> a year
        {missingRate > 0 && ` — plus ${missingRate} in USD without a rate yet`}.
      </p>
      <ul className="rw-audit-list">
        {rows.map((r) => {
          const ob = r.view.obligation
          const mark = marks[ob.id]
          return (
            <li key={ob.id} className={`rw-audit-row${mark ? ` is-${mark}` : ''}`}>
              <div className="rw-audit-text">
                <strong>{ob.name}</strong>
                <span className="rw-sub">
                  {fmtMoney(r.view.estimate, ob.currency)} {PER[ob.cadence] ?? ''} ·{' '}
                  <span className="mono">{r.yearlyDA === null ? 'yearly cost needs the rate' : `${fmtDA(r.yearlyDA)} a year`}</span>
                </span>
              </div>
              <div className="rw-toggle" role="group" aria-label={`${ob.name}: keep or rethink`}>
                {(['keep', 'rethink'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="btn mode-btn"
                    aria-pressed={mark === m}
                    onClick={() => setMarks((x) => ({ ...x, [ob.id]: m }))}
                  >
                    {m === 'keep' ? 'Keep' : 'Rethink'}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
      {rethinkDA > 0 && (
        <p className="rw-sub rw-audit-note" role="status">
          Marked to rethink: about {fmtDA(rethinkDA)} a year. Just a note to yourself — nothing is cancelled here.
        </p>
      )}
    </section>
  )
}
