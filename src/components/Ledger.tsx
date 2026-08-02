import type { Transaction } from '../state/store.ts'

export function Ledger({ transactions }: { transactions: Transaction[] }) {
  return (
    <section className="card ledger-card">
      <h2>Recent</h2>
      {transactions.length === 0 ? (
        <p className="empty">Nothing logged yet. First log is +5 XP.</p>
      ) : (
        <ul className="tx-list">
          {transactions.slice(0, 8).map((t) => (
            <li key={t.id} className="tx">
              <span>
                {/* aria-hidden emoji, matching the mute button and stage
                    flame — screen readers must not read "shield Resisted". */}
                {t.resistedImpulse ? (
                  <>
                    <span aria-hidden="true">🛡 </span>Resisted
                  </>
                ) : (
                  t.category
                )}
              </span>
              <span className="mono">
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
