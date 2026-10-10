import { useState } from 'react'
import { NEEDS, type NeedId } from '../engine/needs.ts'

/**
 * "What helps you" — the needs picker. Phrased by need, never by diagnosis
 * (see needs.ts): nobody owes the app a label to get the mechanics. Each
 * pick composes defaults the two mode switches below can override at any
 * time, and the brake rule has its own card.
 */
export function NeedsCard({
  needs,
  lowEnergy,
  calm,
  onSave,
  onLowEnergy,
  onCalm,
}: {
  needs: NeedId[]
  lowEnergy: boolean
  calm: boolean
  onSave: (needs: NeedId[]) => void
  onLowEnergy: (on: boolean) => void
  onCalm: (on: boolean) => void
}) {
  const [draft, setDraft] = useState<Set<NeedId>>(() => new Set(needs))
  const [saved, setSaved] = useState(false)
  function toggle(id: NeedId) {
    setSaved(false)
    setDraft((d) => {
      const n = new Set(d)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  return (
    <section className="card" id="support">
      <h2>What helps you</h2>
      <p className="support-lead">
        Pick anything that fits. You can change these whenever you like, and none of them
        changes your score.
      </p>
      <ul className="need-list">
        {NEEDS.map((n) => (
          <li key={n.id}>
            <label className="need-row">
              <input type="checkbox" checked={draft.has(n.id)} onChange={() => toggle(n.id)} />
              <span>
                <span className="need-label">{n.label}</span>
                <span className="need-hint">{n.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="log-actions">
        <button
          type="button"
          className="btn btn-teal"
          onClick={() => {
            onSave([...draft])
            setSaved(true)
          }}
        >
          Save what helps
        </button>
        {saved && <span className="support-saved" role="status">Saved.</span>}
      </div>
      <div className="mode-row" role="group" aria-label="Modes">
        <button
          type="button"
          className="btn mode-btn"
          aria-pressed={lowEnergy}
          onClick={() => onLowEnergy(!lowEnergy)}
        >
          {lowEnergy ? 'Low-energy view: on' : 'Low-energy view: off'}
        </button>
        <button type="button" className="btn mode-btn" aria-pressed={calm} onClick={() => onCalm(!calm)}>
          {calm ? 'Calm mode: on' : 'Calm mode: off'}
        </button>
      </div>
    </section>
  )
}
