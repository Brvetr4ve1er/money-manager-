import { xpForLevel, levelTitle, type XpState } from '../engine/xp.ts'

/**
 * THE ENGAGEMENT TRACK, IN ONE STRIP — level, title, XP into level, and a bar.
 *
 * IT IS NOT A CARD, AND THAT IS THE CHANGE. QST—03 "Today's quests" was a card:
 * a heading, an all-complete chip, this level line, this bar, and a three-row
 * quest list. Measured on the phone at tree 12bbf5e it ran 404px — 7.7% of the
 * document — and carried ONE control, which is the one the app should never
 * have shipped:
 *
 *   `log` — "Log every purchase today" — paid 5 XP for a tap. The app can see
 *   rows arrive in the ledger; it cannot see whether EVERY purchase was logged.
 *   That is the same shape as the `review` quest this codebase already deleted
 *   ("a daily grant with no observable referent is the engagement track paying
 *   for nothing"), and the roster's own comment stood one entry above it.
 *
 * The other two rows were `verified: true` and rendered as inert status lines
 * mirroring state the owning card already shows — the "Collected" chip on the
 * lesson card, the record row in the simulator. Delete the self-report quest
 * and the card has zero controls, which is the exact verdict the deleted
 * XpCard got from this file's predecessor: it was a header stat wearing a card.
 * So it stops wearing one.
 *
 * WHAT DID NOT GO. The two daily grants the verified rows carried — readLesson
 * and runSimulation — are paid by the actions themselves now, once per local
 * day, on deterministic `lesson:<day>` / `sim:<day>` grant ids (see the
 * reducer). An honest log pays exactly what it paid before (Trust Rule 3), and
 * every historical `quest:*` grant still folds at full value (Trust Rule 7 —
 * see reviewRecent in engine/xp.ts).
 *
 * HONEST COLD START (Trust Rule 5). Day one is `Level 1 · Spark` and `0 / 100
 * XP` with an empty bar. There is no "0 / 3 quests" to fill, no streak, no
 * "you missed today" (Trust Rule 6). The strip states what it has and stops.
 *
 * TRUST RULE 1 — this is engagement, and it lives here and nowhere else. It is
 * on --reward like every other engagement mark, and it may not migrate onto
 * HeroCard, the hero plate or ArchiveCard: those are money surfaces and
 * App.test holds all three to "no XP, no level, no streak", the strip included.
 *
 * CONSTRAINT §2.1b — it stands on .counter-plate, the counter ground (Espresso
 * in light, Bone in dark). QuestCard was held on the READING ground on the
 * argument that it was the app's most-tapped list and the reading ground is
 * where the hands go. It has no controls now, so that argument is spent, and
 * the plate is the right answer for the reason §2.1b gives: a plate is the
 * ground's opposite, so one plate moves both themes the right way at once, and
 * this one lands in the middle of the longest Bone run on the light phone
 * (window @812, 66.90% Bone at tree 71b5608) which is the same place as the
 * longest Espresso run on the dark one. The bar's own contrast survives the
 * move on both halves — see .xp-fill in app.css.
 */
export function XpStrip({ xp, gain }: { xp: XpState; gain: number | null }) {
  return (
    // No heading, no landmark, no §11 corner mark: a corner mark is a CARD's
    // printed position (§1 trait 10) and App.test derives the 01..n run from
    // the cards, so stamping one here would put an index on something that is
    // not in that sequence.
    <div className="xp-strip counter-plate">
      <div className="xp-head">
        <p className="xp-level">Level {xp.level} · {levelTitle(xp.level)}</p>
        <span className="xp-numbers">
          {/* Transient +XP chip: the discrete visible moment for a gain. A
              state swap, not an animation, so it reads under reduced motion
              and with sound muted — the bar nudge (sub-pixel at high levels)
              and the blip never carry the reward alone. */}
          {gain !== null && <span className="xp-gain mono index-roll">+{gain} XP</span>}
          {/* INDEX ROLL (§9 move 4): keyed on the value so the counter
              re-indexes on every grant. Level is in the key too — the bar
              resets to 0 on a level-up, and 0 → 0 across the boundary must
              still click over. */}
          <span className="mono index-roll" key={`${xp.level}:${xp.xpIntoLevel}`}>
            {xp.xpIntoLevel} / {xpForLevel(xp.level)} XP
          </span>
        </span>
      </div>
      {/* The page's ONE progressbar, and it carries its own computed name —
          there is no heading here to borrow one from. */}
      <div className="xp-track" role="progressbar"
        aria-valuenow={xp.xpIntoLevel} aria-valuemin={0} aria-valuemax={xpForLevel(xp.level)}
        aria-label={`Level ${xp.level} progress: ${xp.xpIntoLevel} of ${xpForLevel(xp.level)} XP`}>
        {/* Not rendered at 0 XP: the fill's ink leading edge (the 1.4.11
            fill/empty boundary — see .xp-fill) would otherwise show as a
            phantom 3px sliver of progress on an empty bar. */}
        {xp.xpIntoLevel > 0 && (
          <div
            className="xp-fill"
            style={{ width: `${Math.min(100, (xp.xpIntoLevel / xpForLevel(xp.level)) * 100)}%` }}
          />
        )}
      </div>
    </div>
  )
}
