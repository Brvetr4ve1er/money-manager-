import { useEffect, useState } from 'react'
import {
  BRAKE_EDIT_LOCK_HOURS,
  DELAY_OPTIONS_HOURS,
  describeRule,
  hoursUntilRelease,
  isReleasable,
  type BrakeRule,
  type HeldPurchase,
  type PendingRule,
} from '../engine/brakes.ts'

export const BRAKE_CATEGORIES = ['Food', 'Transport', 'Fun', 'Bills', 'Health', 'Other']

function fmtHours(h: number): string {
  if (h === 0) return 'ready now'
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.ceil(h / 24)
  return `${d} day${d === 1 ? '' : 's'}`
}

/**
 * Hold the door — the brake rule and the held queue. Editing is deliberately
 * asymmetric (see brakes.ts): tightening is instant, loosening waits
 * BRAKE_EDIT_LOCK_HOURS, and the card says so before the user commits. The
 * queue never nags: a held purchase shows how long it waits, then "still
 * want it" or "let it go" — both plain, neither punished.
 */
export function BrakesCard({
  rule,
  pending,
  held,
  onRequest,
  onRelease,
  onLetGo,
}: {
  rule: BrakeRule | null
  pending: PendingRule | null
  held: HeldPurchase[]
  onRequest: (rule: BrakeRule | null) => void
  onRelease: (id: string) => void
  onLetGo: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [threshold, setThreshold] = useState(rule?.thresholdDA?.toString() ?? '')
  const [cats, setCats] = useState<Set<string>>(() => new Set(rule?.categories ?? []))
  const [delay, setDelay] = useState(rule?.delayHours ?? 24)
  const [error, setError] = useState<string | null>(null)
  // Releasability is a function of wall-clock time, not state: re-check on
  // a slow tick so a queued purchase turns releasable without a reload.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (held.length === 0) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [held.length])

  function submit() {
    const thr = threshold.trim() === '' ? null : Number(threshold)
    if (thr !== null && !(Number.isFinite(thr) && thr > 0)) {
      setError('Enter a whole amount in DA, or leave it blank.')
      return
    }
    setError(null)
    const next: BrakeRule = { thresholdDA: thr, categories: [...cats], delayHours: delay }
    onRequest(thr === null && cats.size === 0 ? null : next)
    setEditing(false)
  }

  return (
    <section className="card" id="brakes">
      <h2>Hold the door</h2>
      <p className="support-lead">
        A brake you set for yourself: matching purchases wait before they count, then you decide
        again. Making it stricter happens now; loosening it waits {BRAKE_EDIT_LOCK_HOURS} hours
        — so a calm day protects a loud one.
      </p>
      <p className="brake-rule mono">{describeRule(rule)}</p>
      {pending && (
        <p className="brake-pending" role="status">
          Change scheduled: {pending.rule === null ? 'brakes off' : describeRule(pending.rule)}{' '}
          from {new Date(pending.effectiveAt).toLocaleString()}.{' '}
          <button type="button" className="btn undo-btn" onClick={() => onRequest(rule)}>
            Keep current brakes
          </button>
        </p>
      )}
      {!editing ? (
        <div className="log-actions">
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            {rule ? 'Change the brake' : 'Set a brake'}
          </button>
        </div>
      ) : (
        <form
          className="brake-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="field-wrap">
            <span className="field-label">Hold anything from (DA)</span>
            <input
              className="field mono"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 5000"
              value={threshold}
              onChange={(e) => {
                setThreshold(e.target.value)
                setError(null)
              }}
              aria-invalid={error !== null}
            />
          </label>
          <fieldset className="brake-cats">
            <legend className="field-label">Always hold these</legend>
            <div className="chip-row">
              {BRAKE_CATEGORIES.map((c) => (
                <label key={c} className={`chip-check${cats.has(c) ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={cats.has(c)}
                    onChange={() =>
                      setCats((s) => {
                        const n = new Set(s)
                        if (n.has(c)) n.delete(c)
                        else n.add(c)
                        return n
                      })
                    }
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field-wrap">
            <span className="field-label">Wait</span>
            <select className="field" value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
              {DELAY_OPTIONS_HOURS.map((h) => (
                <option key={h} value={h}>
                  {fmtHours(h)}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="log-actions">
            <button type="submit" className="btn btn-teal">
              Save brake
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {held.length > 0 && (
        <>
          <h3 className="held-title">Waiting ({held.length})</h3>
          <ul className="held-list">
            {held.map((h) => {
              const ready = isReleasable(h, now)
              const wait = hoursUntilRelease(h, now)
              return (
                <li key={h.id} className="held-row">
                  <span>
                    <span className="mono">{h.amountDA.toLocaleString()} DA</span> · {h.category}
                    <span className="held-when">{ready ? 'ready — your call' : `opens in ${fmtHours(wait)}`}</span>
                  </span>
                  <span className="held-actions">
                    <button
                      type="button"
                      className="btn undo-btn"
                      disabled={!ready}
                      onClick={() => onRelease(h.id)}
                    >
                      Still want it
                    </button>
                    <button type="button" className="btn undo-btn" onClick={() => onLetGo(h.id)}>
                      Let it go
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
