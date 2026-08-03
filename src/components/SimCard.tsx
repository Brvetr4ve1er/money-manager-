import { useState } from 'react'
import { runSimulation, describeResult } from '../engine/simulator.ts'
import { buildSimProfile, type UserProfile } from '../engine/profile.ts'
import * as sfx from '../audio/chiptune.ts'

export function SimCard({
  profile,
  isDemo,
  onRun,
}: {
  profile: UserProfile
  /** True while the projection still runs on DEMO_PROFILE (setup incomplete). */
  isDemo: boolean
  onRun: () => void
}) {
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
    // id: hero nav anchor target (desktop).
    <section className="card sim-card" id="simulator">
      {/* §11 corner mark. Rides in the window bar — this card's top edge is
          the plate, not the reserved strip the other cards use. */}
      <span className="spec-label" aria-hidden="true">SIM—07</span>
      <div className="window-bar mono">DECISION_SIM.EXE</div>
      <div className="sim-body">
        {/* Honesty gap guard: the result copy speaks in second person, so the
            card must always say whose numbers it projects — the demo profile
            until setup completes, the user's own after. Claiming
            personalization it doesn't have would break the trust rules. */}
        {/* Grotesk, not mono: this is a sentence, not an index label — see
            .sim-note in app.css. */}
        <p className="sim-note">
          {isDemo
            ? `Projected on the demo profile. ${profile.monthlyIncome.toLocaleString()} DA/mo income. Your own numbers arrive with setup.`
            : `Projected on your numbers. ${profile.monthlyIncome.toLocaleString()} DA/mo income. Edit them any time in My numbers.`}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run()
          }}
        >
          <div className="log-row">
            {/* Visible caption (WCAG 3.3.2): a placeholder-as-label vanishes
                on the first keystroke; the wrapping <label> names the field
                for AT and sighted users alike. type="text" +
                inputMode="decimal" for the same reasons as the log amount
                field (see LogCard). */}
            <label className="field-wrap">
              <span className="field-label">Purchase amount (DA)</span>
              <input
                className="field mono"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={simAmount}
                onChange={(e) => {
                  setSimAmount(e.target.value)
                  setError(null)
                }}
                aria-invalid={error !== null}
                aria-describedby={error ? 'sim-error' : undefined}
              />
            </label>
            <button type="submit" className="btn btn-teal">Run simulation</button>
          </div>
          {error && (
            <p className="field-error" id="sim-error" role="alert">{error}</p>
          )}
        </form>
        {/* Permanently mounted sr-only live region (same pattern as the XP
            region in App): screen readers announce text CHANGES inside an
            existing region, so the projection must land in an already-mounted
            element — otherwise "Run simulation" is silent for AT users and
            the reveal sound carries the moment alone. It must stay in the
            accessibility tree while empty (the clip pattern does; hiding the
            visual panel with display:none would not), so the visible teal
            panel below is a separate, aria-hidden element that mounts only
            once a result exists. */}
        <p className="sr-only" role="status" aria-label="Simulation result">{simText}</p>
        {simText !== null && (
          <p className="sim-result" aria-hidden="true">{simText}</p>
        )}
      </div>
    </section>
  )
}
