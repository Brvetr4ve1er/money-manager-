import { LESSONS } from '../content/lessons.ts'
import { ACHIEVEMENTS } from '../engine/achievements.ts'
import type { AchievementUnlock } from '../state/store.ts'
import { Glyph } from './Glyph.tsx'

/**
 * THE COLLECTION — the lesson codex and the badge shelf, one sheet.
 *
 * They were two cards (CDX—11, ACH—12), adjacent, on the same §5B spec sheet,
 * with the same `N / M` mono count, the same locked/unlocked tile grid and the
 * same interaction: none. Two card containers for one idea is breadth, and on a
 * 375px column it is two keylines, two headings and two scroll stops for a
 * surface nobody operates.
 *
 * They keep their own ids, names and headings — #codex and #badges are hero jump
 * targets and stay real, focusable, named sections — so nothing is lost for
 * assistive tech or for the nav. Only the container merged.
 *
 * Both halves are earn-only, like everything on the engagement track: no
 * purchase path, no countdowns, no FOMO. The two differ on purpose in one place
 * — a locked lesson hides its title (it would spoil the lesson), a locked badge
 * shows its name AND hint (the hint names the earning action, so the shelf
 * doubles as a map of what the app can do).
 */
export function CollectionCard({
  collectedIds,
  unlocks,
}: {
  collectedIds: ReadonlySet<string>
  unlocks: AchievementUnlock[]
}) {
  // Count against the canonical roster, not the raw set size: the sanitizer
  // already drops unknown ids, but the denominator must be the roster's.
  const lessonCount = LESSONS.filter((l) => collectedIds.has(l.id)).length
  const dateById = new Map(unlocks.map((u) => [u.id, u.date]))
  const badgeCount = ACHIEVEMENTS.filter((a) => dateById.has(a.id)).length
  return (
    // spec-sheet: §5 layout B — "a 4-up grid of badges on espresso, captioned
    // with mono index labels". This card is the literal subject of that
    // sentence, twice over. See .spec-sheet in tokens.css; it re-scopes the
    // surface tokens rather than repainting, so every tile rule re-derives.
    <section className="card spec-sheet collection-card">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">COL—09</span>
      <h2>Collection</h2>

      {/* Nested <section>s, not bare <div>s: #codex and #badges are jump
          targets from the desktop hero nav, and the sweep measured focus
          landing on <body> when a target was not focusable and not named.
          tabIndex -1 + aria-labelledby is the same fix every other jump target
          in the app carries — see LogCard. */}
      <section
        className="collection-part"
        id="codex"
        tabIndex={-1}
        aria-labelledby="codex-title"
      >
        <div className="codex-head">
          {/* h3 under the card's h2: the collection names itself once, and its
              two halves hang off it. The page keeps exactly one h1. */}
          <h3 id="codex-title">Lesson codex</h3>
          {/* INDEX ROLL (§9 move 4) — the literal `33/36` case from §1 trait 10. */}
          <span className="codex-count mono index-roll" key={lessonCount}>
            {lessonCount} / {LESSONS.length} collected
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
                 everywhere and still leaks no lesson title — the same pattern the
                 badge shelf below uses for the same state. */
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

      <section
        className="collection-part"
        id="badges"
        tabIndex={-1}
        aria-labelledby="badges-title"
      >
        <div className="ach-head">
          <h3 id="badges-title">Achievements</h3>
          {/* INDEX ROLL (§9 move 4) — the `33/36` index label from §1 trait 10. */}
          <span className="ach-count mono index-roll" key={badgeCount}>
            {badgeCount} / {ACHIEVEMENTS.length} earned
          </span>
        </div>
        <ul className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const date = dateById.get(a.id)
            return date !== undefined ? (
              <li key={a.id} className="ach-tile">
                {/* Medal + companion are decoration: the sr prefix + name + date
                    carry the state, so AT never depends on the marks. Drawn
                    glyphs (§8), inheriting the tile's --on-accent ink — an emoji
                    brought its own colours and no contrast anyone could measure. */}
                <span className="ach-medal" aria-hidden="true">
                  <Glyph name="medal" />
                  <Glyph name={a.pet.glyph} />
                </span>
                <span className="ach-name">
                  <span className="sr-only">Earned: </span>
                  {a.name}
                </span>
                <span className="ach-date mono">{date}</span>
              </li>
            ) : (
              <li key={a.id} className="ach-tile ach-locked">
                <span className="ach-name">
                  <span className="sr-only">Not yet earned: </span>
                  {a.name}
                </span>
                <span className="ach-hint">{a.hint}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </section>
  )
}
