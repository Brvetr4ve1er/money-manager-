import type { BossBattle } from '../engine/boss.ts'
import { XP_REWARDS } from '../engine/xp.ts'
import { Glyph } from './Glyph.tsx'

const fmt = (n: number): string => n.toLocaleString()

/**
 * The Weekly Boss — the Impulse Monster. His HP is this week's impulse-prone
 * spend; staying under last week's total to Sunday beats him. Copy rules
 * (trust invariants, not style): beatable framing always — a lost round costs
 * nothing and offers a rematch, never "you wasted"; and under two weeks of
 * data the card says so honestly instead of inventing an opponent number.
 */
export function BossCard({
  battle,
  wonLastWeek,
}: {
  battle: BossBattle
  wonLastWeek: boolean
}) {
  return (
    // spec-sheet: §5 layout B, same rule as the collection sheet — the card carries no
    // control, so it is a read surface and stands on the sheet (see
    // .spec-sheet in tokens.css). Three tones: Espresso field, Bone form, and
    // the monster's Flare HP bar, which is a core colour rather than an accent
    // and needs no --on-accent ink because nothing is drawn on it. Flare on
    // the sheet's Espresso track is 4.41:1, the widest surface offset in the
    // app, so the fill/empty boundary clears WCAG 1.4.11 before the leading
    // keyline is counted. The claimed-win chip is the allowed 4th colour —
    // §1 trait 06's "event" — for the same reason .kept-chip is on the ledger.
    // Trust Rule 6 is untouched by the ground swap: the sheet reads as a plate,
    // not as a warning, and none of the beatable framing changes.
    <section className="card spec-sheet">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">BOS—03</span>
      <div className="boss-head">
        <h2>Weekly boss</h2>
        {/* Persistent marker for a claimed win — the fanfare/toast's visible
            counterpart, same family as the quest all-done chip. */}
        {wonLastWeek && <span className="boss-won">Beaten last week +{XP_REWARDS.weeklyBoss} XP</span>}
      </div>
      {battle.kind === 'sizing-up' ? (
        <>
          <p className="boss-name">
            {/* aria-hidden mark, matching the stage flame and ledger shield —
                screen readers must not read the glyph before "The Impulse
                Monster"; the sentence beside it is the alternative. .mark puts
                it in a keyline badge: §1 trait 01, nothing floats. */}
            <span className="mark" aria-hidden="true">
              <Glyph name="monster" />
            </span>{' '}
            The Impulse Monster is still sizing you up
          </p>
          {/* Trust 5 in four fragments. "No numbers on you yet" is the honest
              cold start and cannot be compressed away — without it the card
              would have to invent an opponent number to fill the sentence. */}
          <p className="boss-copy">
            He feeds on impulse spending. No numbers on you yet. Log a week of
            purchases. He steps into the ring Monday.
          </p>
        </>
      ) : (
        <>
          <div className="boss-row">
            <span className="boss-name">
              <span className="mark" aria-hidden="true">
                <Glyph name="monster" />
              </span>{' '}
              Impulse Monster
            </span>
            {/* INDEX ROLL (§9 move 4): this week's total clicks up against
                last week's as purchases land. */}
            <span className="mono index-roll" key={battle.thisWeekSpend}>
              {fmt(battle.thisWeekSpend)} / {fmt(battle.lastWeekSpend)} DA
            </span>
          </div>
          {/* Decorative HP bar (xp-track pattern, monster palette): the mono
              numbers above carry the data, so the bar is aria-hidden — it must
              not add a second progressbar/meter to the page for a value AT
              users already got as text. Fill skipped at 0 like the XP bar so
              the ink leading edge never shows as a phantom sliver. */}
          <div className="boss-track" aria-hidden="true">
            {battle.thisWeekSpend > 0 && (
              <div
                className="boss-fill"
                style={{
                  width: `${Math.min(
                    100,
                    (battle.thisWeekSpend /
                      Math.max(battle.lastWeekSpend, battle.thisWeekSpend)) *
                      100,
                  )}%`,
                }}
              />
            )}
          </div>
          <p className="boss-copy">
            {battle.lastWeekSpend === 0
              ? // No strict win exists against a 0 target — say what holds him
                // down instead of promising a prize the rules can't pay.
                'He went hungry last week — 0 DA. Keep his plate empty and he stays down.'
              : battle.thisWeekSpend < battle.lastWeekSpend
                ? `Last week he ate ${fmt(battle.lastWeekSpend)} DA. Stay under it through Sunday. He goes down (+${XP_REWARDS.weeklyBoss} XP).`
                : // Past the line: his round, zero cost, rematch framing. The
                  // subject stays HE in every fragment — §7.1's punitive
                  // example ("You blew the budget again") is exactly what a
                  // second-person rewrite of this line would become.
                  `He's past last week's ${fmt(battle.lastWeekSpend)} DA. This round is his. Fresh fight Monday.`}
          </p>
        </>
      )}
    </section>
  )
}
