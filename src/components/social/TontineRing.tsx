import type { TontineView } from '../../engine/social.ts'

/**
 * The round ring: members sit around a circle in payout order. Light marks
 * state — paid rounds glow softly, the current round is lit, my turn wears
 * a ring. Decorative detail is in the SVG; the aria-label carries the facts.
 */
export function TontineRing({ view, sprung }: { view: TontineView; sprung: boolean }) {
  const { tontine, rounds, currentRound, started } = view
  const size = 168
  const c = size / 2
  const radius = 62
  const dot = Math.max(5, Math.min(13, radius * Math.sin(Math.PI / rounds) * 0.75))
  const paid = new Set(view.paidRounds)
  const showInitials = rounds <= 12
  const label =
    `${tontine.name}: ${started ? `round ${currentRound} of ${rounds}` : `starts with round 1 of ${rounds}`}, ` +
    `${view.paidRounds.length} paid, your turn is round ${tontine.myTurn}`
  return (
    <svg
      className={`tontine-ring${sprung ? ' is-sprung' : ''}`}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
    >
      <circle className="ring-track" cx={c} cy={c} r={radius} />
      {tontine.members.map((m, i) => {
        const round = i + 1
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / rounds
        const x = c + radius * Math.cos(a)
        const y = c + radius * Math.sin(a)
        const cls = [
          'ring-dot',
          paid.has(round) ? 'is-paid' : '',
          started && round === currentRound ? 'is-current' : '',
          round === tontine.myTurn ? 'is-mine' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <g key={`${m}-${i}`} className={cls}>
            {round === tontine.myTurn && <circle className="ring-mine" cx={x} cy={y} r={dot + 4} />}
            <circle className="ring-node" cx={x} cy={y} r={dot} />
            {showInitials && (
              <text className="ring-initial" x={x} y={y} dy="0.35em" textAnchor="middle" aria-hidden="true">
                {m === 'Me' ? 'Me' : m.slice(0, 1).toUpperCase()}
              </text>
            )}
          </g>
        )
      })}
      <text className="ring-centre" x={c} y={c - 4} textAnchor="middle" aria-hidden="true">
        {started ? `${currentRound}/${rounds}` : `0/${rounds}`}
      </text>
      <text className="ring-centre-sub" x={c} y={c + 14} textAnchor="middle" aria-hidden="true">
        {started ? 'round' : 'not started'}
      </text>
    </svg>
  )
}
