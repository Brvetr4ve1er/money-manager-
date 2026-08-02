import { LESSONS } from '../content/lessons.ts'

/**
 * The lesson collection — a completionism hook with no FOMO mechanics: locked
 * tiles carry no dates, no countdowns, and no way to buy their way open. One
 * lesson unlocks per day by reading it; that is the entire economy.
 */
export function CodexCard({ collectedIds }: { collectedIds: ReadonlySet<string> }) {
  // Count against the canonical roster, not the raw set size: the sanitizer
  // already drops unknown ids, but the denominator must be the roster's.
  const count = LESSONS.filter((l) => collectedIds.has(l.id)).length
  return (
    <section className="card">
      <div className="codex-head">
        <h2>Lesson codex</h2>
        <span className="codex-count mono">{count} / {LESSONS.length} collected</span>
      </div>
      <ul className="codex-grid">
        {LESSONS.map((l) =>
          collectedIds.has(l.id) ? (
            <li key={l.id} className="codex-tile">
              <span className="codex-tile-title">{l.title}</span>
              <span className="codex-tile-line">{l.oneLiner}</span>
            </li>
          ) : (
            /* Silhouette: no title spoiler. The "?" is decoration; the
               aria-label names the state for AT without leaking the lesson. */
            <li key={l.id} className="codex-tile codex-locked" aria-label="Locked lesson">
              <span className="codex-tile-title" aria-hidden="true">?</span>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
