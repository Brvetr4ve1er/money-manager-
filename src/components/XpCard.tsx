import { xpForLevel, levelTitle, type XpState } from '../engine/xp.ts'

export function XpCard({ xp, gain }: { xp: XpState; gain: number | null }) {
  return (
    <section className="card">
      <div className="xp-head">
        <h2>Level {xp.level} · {levelTitle(xp.level)}</h2>
        <span className="xp-numbers">
          {/* Transient +XP chip: the discrete visible moment for a gain. A
              state swap, not an animation, so it reads under reduced motion
              and with sound muted — the bar nudge (sub-pixel at high levels)
              and the blip never carry the reward alone. */}
          {gain !== null && <span className="xp-gain mono">+{gain} XP</span>}
          <span className="mono">{xp.xpIntoLevel} / {xpForLevel(xp.level)} XP</span>
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
    </section>
  )
}
