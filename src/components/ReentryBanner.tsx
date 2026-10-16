import { useState } from 'react'
import { REENTRY_COPY, type Reentry } from '../engine/calm.ts'

/**
 * The guilt-free return (see calm.ts). Shown once after days away; the user
 * dismisses it. It asks for at most ONE rough number and accepts skipping as
 * a full answer — back-filling a week is exactly the wall that stops people
 * reopening the app.
 */
export function ReentryBanner({
  reentry,
  onCatchUp,
  onSkip,
}: {
  reentry: Reentry
  onCatchUp: (amountDA: number) => void
  onSkip: () => void
}) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  function submit() {
    const amt = Number(amount)
    if (!(Number.isFinite(amt) && amt > 0)) {
      setError('A rough number is fine — or just skip.')
      return
    }
    onCatchUp(amt)
  }
  return (
    <section className="card reentry" aria-labelledby="reentry-title">
      <h2 id="reentry-title">{REENTRY_COPY.title}</h2>
      <p className="reentry-body">
        {REENTRY_COPY.body} It has been {reentry.days} days.
      </p>
      <p className="reentry-body">{REENTRY_COPY.prompt}</p>
      <form
        className="log-row"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="field-wrap">
          <span className="field-label">Roughly, while away (DA)</span>
          <input
            className="field mono"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 4000"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            aria-invalid={error !== null}
          />
        </label>
        <button type="submit" className="btn btn-teal">
          Add it
        </button>
        <button type="button" className="btn" onClick={onSkip}>
          {REENTRY_COPY.skip}
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
