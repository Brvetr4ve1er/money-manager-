import { LESSONS } from '../content/lessons.ts'
import { Glyph } from './Glyph.tsx'

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
    // spec-sheet: §5 layout B — a grid of badge tiles on Espresso under a mono
    // index count. See .spec-sheet in tokens.css; it re-scopes the surface
    // tokens rather than repainting, so every tile rule below re-derives.
    // tabIndex -1 + aria-labelledby: see LogCard — the hero's jump links
    // landed focus on <body> because the target sections were not focusable.
    <section
      className="card spec-sheet"
      id="codex"
      tabIndex={-1}
      aria-labelledby="codex-title"
    >
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">CDX—11</span>
      <div className="codex-head">
        <h2 id="codex-title">Lesson codex</h2>
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
              {/* A drawn mark in a keyline badge, not the character '?': §8
                  retires character glyphs as UI iconography, and thirty '?'s
                  down a page read as an error state rather than as an index of
                  what is still ahead. .mark is the same 1:1 container every
                  other loose glyph in the app sits in (§1 trait 01). */}
              <span className="mark" aria-hidden="true">
                <Glyph name="locked" />
              </span>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
