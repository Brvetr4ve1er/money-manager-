import type { BossBattle } from '../engine/boss.ts'
import { XP_REWARDS } from '../engine/xp.ts'

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
    <section className="card">
      <div className="boss-head">
        <h2>Weekly boss</h2>
        {/* Persistent marker for a claimed win — the fanfare/toast's visible
            counterpart, same family as the quest all-done chip. */}
        {wonLastWeek && <span className="boss-won">Beaten last week +{XP_REWARDS.weeklyBoss} XP</span>}
      </div>
      {battle.kind === 'sizing-up' ? (
        <>
          <p className="boss-name">
            {/* aria-hidden emoji, matching the stage flame and ledger shield —
                screen readers must not read "ogre The Impulse Monster". */}
            <span aria-hidden="true">👹 </span>The Impulse Monster is still sizing you up
          </p>
          <p className="boss-copy">
            He feeds on impulse spending, and he has no numbers on you yet. Log a week of
            purchases and he steps into the ring on Monday.
          </p>
        </>
      ) : (
        <>
          <div className="boss-row">
            <span className="boss-name">
              <span aria-hidden="true">👹 </span>Impulse Monster
            </span>
            <span className="mono">
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
                ? `Last week he ate ${fmt(battle.lastWeekSpend)} DA. Stay under that through Sunday and he goes down (+${XP_REWARDS.weeklyBoss} XP).`
                : // Past the line: his round, zero cost, rematch framing.
                  `He's past last week's ${fmt(battle.lastWeekSpend)} DA — this round is his. Fresh fight starts Monday.`}
          </p>
        </>
      )}
    </section>
  )
}
