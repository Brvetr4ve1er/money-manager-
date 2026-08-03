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
    // id: hero nav anchor target (desktop).
    <section className="card" id="codex">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">CDX—10</span>
      <div className="codex-head">
        <h2>Lesson codex</h2>
        {/* INDEX ROLL (§9 move 4) — the literal `33/36` case from §1 trait 10. */}
        <span className="codex-count mono index-roll" key={count}>
          {count} / {LESSONS.length} collected
        </span>
      </div>
      <ul className="codex-grid">
        {LESSONS.map((l) =>
          collectedIds.has(l.id) ? (
            <li key={l.id} className="codex-tile">
              <span className="codex-tile-title">{l.title}</span>
              <span className="codex-tile-line">{l.oneLiner}</span>
            </li>
          ) : (
            /* Silhouette: no title spoiler. The state is named by an .sr-only
               prefix, not by aria-label on the <li>: role="listitem" does
               support author naming, but AT support for it is inconsistent, and
               where it is ignored the tile computes an EMPTY name and twenty-odd
               locked entries announce as nothing. Name-from-contents works
               everywhere and still leaks no lesson title — the same pattern
               AchievementsCard uses for the same state. */
            <li key={l.id} className="codex-tile codex-locked">
              <span className="sr-only">Locked lesson</span>
              <span className="codex-tile-title" aria-hidden="true">?</span>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
