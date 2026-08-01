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
              <span>{t.resistedImpulse ? '🛡 Resisted' : t.category}</span>
              <span className="mono">
                {t.resistedImpulse ? '—' : `${t.amountDA.toLocaleString()} DA`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
