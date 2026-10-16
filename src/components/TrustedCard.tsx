import { useState } from 'react'
import { buildSnapshot, type SnapshotInput, type SnapshotOptions } from '../engine/snapshot.ts'

const OPTION_ROWS: Array<{ key: keyof SnapshotOptions; label: string }> = [
  { key: 'totals', label: 'Total spent this week' },
  { key: 'categories', label: 'Spend by category' },
  { key: 'velocity', label: 'Pace compared with usual' },
  { key: 'health', label: 'Health stage and score' },
  { key: 'held', label: 'Purchases waiting behind the brake' },
]

/**
 * Trusted-person snapshot. The user picks what goes in, previews the exact
 * text, and sends it themselves — copy or the OS share sheet. The app never
 * holds a contact, never sends anything on its own, and says so on the
 * snapshot itself (see snapshot.ts).
 */
export function TrustedCard({
  trusted,
  input,
  onSave,
}: {
  trusted: { name: string; options: SnapshotOptions } | null
  /** Everything buildSnapshot needs except the name (the card owns the name). */
  input: Omit<SnapshotInput, 'trustedName'>
  onSave: (trusted: { name: string; options: SnapshotOptions } | null) => void
}) {
  const [name, setName] = useState(trusted?.name ?? '')
  const [options, setOptions] = useState<SnapshotOptions>(
    trusted?.options ?? { totals: true, categories: true, held: false, velocity: true, health: true },
  )
  const [status, setStatus] = useState<string | null>(null)
  const text = buildSnapshot({ ...input, trustedName: name }, options)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('Copied. Paste it wherever you talk to them.')
    } catch {
      setStatus('Could not copy automatically — select the text above and copy it.')
    }
  }
  async function share() {
    try {
      await navigator.share({ title: 'Ember weekly snapshot', text })
      setStatus('Shared.')
    } catch {
      // The user cancelled the sheet, or it failed — either way, nothing left silently.
      setStatus(null)
    }
  }

  return (
    <section className="card" id="trusted">
      <h2>Someone you trust</h2>
      <p className="support-lead">
        A weekly summary you build and send yourself. Nothing leaves the app unless you press
        copy or share, and only what you tick goes in.
      </p>
      <label className="field-wrap">
        <span className="field-label">Their name (optional)</span>
        <input
          className="field"
          type="text"
          value={name}
          placeholder="e.g. Mum, Yacine, my support worker"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <fieldset className="snap-options">
        <legend className="field-label">Include</legend>
        {OPTION_ROWS.map((o) => (
          <label key={o.key} className="need-row compact">
            <input
              type="checkbox"
              checked={options[o.key]}
              onChange={(e) => setOptions((s) => ({ ...s, [o.key]: e.target.checked }))}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <pre className="snap-preview" aria-label="Snapshot preview">{text}</pre>
      <div className="log-actions">
        <button type="button" className="btn btn-teal" onClick={copy}>
          Copy snapshot
        </button>
        {canShare && (
          <button type="button" className="btn" onClick={share}>
            Share…
          </button>
        )}
        <button type="button" className="btn" onClick={() => onSave({ name, options })}>
          Remember these choices
        </button>
      </div>
      {status && (
        <p className="support-saved" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
