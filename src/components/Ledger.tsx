import type { Transaction } from '../state/store.ts'
import { Glyph } from './Glyph.tsx'

export function Ledger({ transactions, today }: { transactions: Transaction[]; today: string }) {
  // "Kept, not spent": resisted amounts finally compound into one visible
  // number instead of scattering per-row. Current calendar month, resists
  // with a typed amount only. A motivational mirror over self-reported data —
  // deliberately NOT a Health Score input (the two-track rule): the score
  // reads financial reality, this line reads the user's own resist story.
  const month = today.slice(0, 7)
  const keptDA = transactions
    .filter((t) => t.resistedImpulse && t.amountDA > 0 && t.date.slice(0, 7) === month)
    .reduce((s, t) => s + t.amountDA, 0)
  return (
    <section className="card ledger-card">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">LDG—09</span>
      <div className="ledger-head">
        <h2>Recent</h2>
        {/* INDEX ROLL (§9 move 4): the kept total clicks up with each resist. */}
        {keptDA > 0 && (
          <span className="kept-chip mono index-roll" key={keptDA}>
            {keptDA.toLocaleString()} DA kept this month
          </span>
        )}
      </div>
      {transactions.length === 0 ? (
        <p className="empty">Nothing logged yet. First log is +5 XP.</p>
      ) : (
        <ul className="tx-list">
          {transactions.slice(0, 8).map((t) => (
            <li key={t.id} className="tx">
              <span>
                {/* aria-hidden mark, matching the mute button and stage
                    flame — screen readers must not read "shield Resisted";
                    the word beside it is the alternative. */}
                {t.resistedImpulse ? (
                  <>
                    {/* .mark: §1 trait 01 — the shield sits in a keyline
                        badge instead of floating in the row. */}
                    <span className="mark" aria-hidden="true">
                      <Glyph name="shield" />
                    </span>{' '}
                    Resisted
                  </>
                ) : (
                  <>
                    {t.category}
                    {/* Yielded-impulse marker: factual, lowercase, never a
                        shame color — the row already paid its normal XP. */}
                    {t.impulseFlagged && <span className="tx-impulse">impulse</span>}
                  </>
                )}
              </span>
              {/* INDEX ROLL (§9 move 4): a new row's amount indexes in. */}
              <span className="mono index-roll">
                {/* A resist logged with a typed amount records what the tap
                    avoided spending — shown, not silently dropped. */}
                {t.resistedImpulse
                  ? t.amountDA > 0
                    ? `${t.amountDA.toLocaleString()} DA avoided`
                    : '—'
                  : `${t.amountDA.toLocaleString()} DA`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
