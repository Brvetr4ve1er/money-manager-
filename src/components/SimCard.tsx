import { useState } from 'react'
import { runSimulation, describeResult } from '../engine/simulator.ts'
import { buildSimProfile, type UserProfile } from '../engine/profile.ts'
import * as sfx from '../audio/chiptune.ts'

export function SimCard({ profile, onRun }: { profile: UserProfile; onRun: () => void }) {
  const [simAmount, setSimAmount] = useState('')
  const [simText, setSimText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // isFinite, not !isNaN: '1e999' parses to Infinity, and the simulator must
  // never produce confident-sounding copy for a nonsense amount.
  function run() {
    const amt = parseFloat(simAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount first.')
      sfx.deny()
      return
    }
    setError(null)
    const result = runSimulation(buildSimProfile(profile), { amount: amt, funding: 'lump' })
    sfx.reveal()
    setSimText(describeResult(result))
    onRun()
  }

  return (
    <section className="card sim-card">
      <div className="window-bar mono">DECISION_SIM.EXE</div>
      <div className="sim-body">
        {/* Honesty gap guard: the result copy speaks in second person, but the
            projection runs on the demo profile until onboarding ships — the
            card must say so, or it claims a personalization it doesn't have. */}
        <p className="sim-note mono">
          Projected on the demo profile ({profile.monthlyIncome.toLocaleString()} DA/mo
          income) — your own numbers arrive with setup.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run()
          }}
        >
          <div className="log-row">
            {/* type="text" + inputMode="decimal" for the same reasons as the
                log amount field (see LogCard). */}
            <input
              className="field mono"
              type="text"
              inputMode="decimal"
              placeholder="Purchase amount (DA)"
              value={simAmount}
              onChange={(e) => {
                setSimAmount(e.target.value)
                setError(null)
              }}
              aria-label="Purchase amount in DA"
              aria-invalid={error !== null}
              aria-describedby={error ? 'sim-error' : undefined}
            />
            <button type="submit" className="btn btn-teal">Run simulation</button>
          </div>
          {error && (
            <p className="field-error" id="sim-error" role="alert">{error}</p>
          )}
        </form>
        {/* Permanently mounted live region (same pattern as the toast in App):
            screen readers announce text CHANGES inside an existing region, so
            the projection must land in an already-mounted element — otherwise
            "Run simulation" is silent for AT users and the reveal sound
            carries the moment alone. Hidden via .sim-result:empty. */}
        <p className="sim-result" role="status" aria-label="Simulation result">{simText}</p>
      </div>
    </section>
  )
}
