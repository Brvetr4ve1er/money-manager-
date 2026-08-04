import type { Quest } from '../state/store.ts'
import { xpForLevel, levelTitle, type XpState } from '../engine/xp.ts'
import { Glyph } from './Glyph.tsx'

/**
 * THE ENGAGEMENT CARD — level, XP and today's quests on one surface.
 *
 * XpCard used to be a card of its own, second in the stack: a heading, a
 * counter and a bar, with no control on it, sitting between the health readout
 * and the log form and pushing the app's primary action further down a 375px
 * column. It was a header stat wearing a card.
 *
 * It belongs here and nowhere else. §12.1 draws the two tracks in colour:
 * --reward is engagement (XP, quests, codex, badges) and --data is financial
 * reality. Level and quests are the same track measuring the same thing, and
 * folding them together is the one merge that does not put an engagement number
 * on a money surface — HeroCard and the archive card are both held to
 * "no XP, no level, no streak" by assertions in App.test.
 */
export function QuestCard({
  quests,
  onComplete,
  xp,
  gain,
}: {
  quests: Quest[]
  onComplete: (id: string) => void
  xp: XpState
  gain: number | null
}) {
  const allDone = quests.length > 0 && quests.every((q) => q.done)
  return (
    // id: hero nav anchor target (desktop).
    // tabIndex -1 + aria-labelledby: see LogCard — the hero's jump links
    // landed focus on <body> because the target sections were not focusable.
    <section className="card" id="quests" tabIndex={-1} aria-labelledby="quests-title">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">QST—03</span>
      <div className="quest-head">
        <h2 id="quests-title">Today's quests</h2>
        {/* Persistent visual counterpart to the completion arpeggio — sound
            never carries the moment alone. */}
        {/* No trailing ✓: the mark is not aria-hidden here, so a screen
            reader read it as "All complete check mark" — a glyph inside
            announced text, which §7.4 bans and §8 has no place for. The chip
            plate is the visual marker; the words are the whole message. */}
        {allDone && <span className="quest-alldone">All complete</span>}
      </div>
      {/* The level line, and it is a LINE, not a second heading: the card names
          itself once (§11 / the single-outline rule App.test enforces), and a
          stat is not a section. The progressbar below carries the same figures
          for assistive tech, so nothing is lost by dropping the old h2. */}
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
      <ul className="quest-list">
        {quests.map((q) => (
          <li key={q.id} className={q.done ? 'quest done' : 'quest'}>
            {q.verified ? (
              /* Verified quests complete only when the app observes the action
                 itself (SimCard dispatches on a real run). A button here would
                 let a tap self-report a quest the code promises is verified —
                 so this is a static status row, not a disabled button (which
                 would imply it might enable). */
              <div className="quest-row">
                {/* Drawn mark, not '✓' (§8 retires character glyphs as UI
                    iconography). The box is aria-hidden either way — the row's
                    own label carries "— done". */}
                <span className="quest-box" aria-hidden="true">{q.done && <Glyph name="check" />}</span>
                <span className="quest-text">{q.text}</span>
                {/* Visible "auto" tag: the row deliberately lacks the
                    pressable shadow (see app.css), and this names why — it
                    completes on a real run, not a tap. */}
                <span className="quest-auto">Auto</span>
              </div>
            ) : (
              /* The whole row is the button: the quest text is the natural tap
                 target, and the 48px row pitch prevents cross-quest mis-taps.
                 Completion is irreversible, so a done quest is inert — but via
                 aria-disabled plus an onClick guard, NOT the disabled
                 attribute: disabling the button the user just activated drops
                 keyboard focus to <body>, silently losing their place, and
                 hides the state change from screen readers. aria-pressed is
                 still wrong (it would imply the quest can be un-pressed). */
              <button
                className="quest-row"
                onClick={() => {
                  if (q.done) return
                  onComplete(q.id)
                }}
                aria-disabled={q.done}
                aria-label={q.done ? `${q.text} — done` : `Mark done: ${q.text}`}
              >
                <span className="quest-box" aria-hidden="true">{q.done && <Glyph name="check" />}</span>
                <span className="quest-text">{q.text}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
