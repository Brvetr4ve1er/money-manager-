import { ACHIEVEMENTS } from '../engine/achievements.ts'
import type { AchievementUnlock } from '../state/store.ts'
import { Glyph } from './Glyph.tsx'

/**
 * The badge shelf — earn-only, like everything on the engagement track: no
 * purchase path, no countdowns, no FOMO. Unlike the codex, locked tiles show
 * their name AND hint on purpose: the hint names the earning action, so the
 * shelf doubles as a map of what the app can do.
 */
export function AchievementsCard({ unlocks }: { unlocks: AchievementUnlock[] }) {
  const dateById = new Map(unlocks.map((u) => [u.id, u.date]))
  // Count against the canonical roster, not the raw unlock list: the
  // sanitizer already drops unknown ids, but the denominator must be the
  // roster's (same rule as CodexCard).
  const count = ACHIEVEMENTS.filter((a) => dateById.has(a.id)).length
  return (
    // id: hero nav anchor target (desktop).
    <section className="card" id="badges">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">ACH—11</span>
      <div className="ach-head">
        <h2>Achievements</h2>
        {/* INDEX ROLL (§9 move 4) — the `33/36` index label from §1 trait 10. */}
        <span className="ach-count mono index-roll" key={count}>
          {count} / {ACHIEVEMENTS.length} earned
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
  )
}
