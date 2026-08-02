import { useEffect, useRef, useState } from 'react'
import * as sfx from '../audio/chiptune.ts'
import type { ProfileData } from '../state/store.ts'

/** What the form hands back — App stamps savedDate (it owns the day clock). */
export type ProfileDraft = Omit<ProfileData, 'savedDate'>

const DA = (n: number) => `${n.toLocaleString()} DA`

/**
 * 'invalid' is distinct from null on purpose: a blank optional field means
 * "not entered" (the component stays out of the Health Score), while typed
 * garbage must error instead of being silently treated as blank — the same
 * never-discard-typed-input rule the resist amount follows in LogCard.
 */
function parseMoney(s: string): number | null | 'invalid' {
  if (s.trim() === '') return null
  const n = parseFloat(s)
  // isFinite, not !isNaN: '1e999' parses to Infinity and must never persist.
  return Number.isFinite(n) && n >= 0 ? n : 'invalid'
}

type FieldKey =
  | 'income'
  | 'essentials'
  | 'ef'
  | 'debtBalance'
  | 'debtMinimum'
  | 'goalName'
  | 'goalTarget'
  | 'goalCurrent'
  | 'goalContribution'

export function ProfileCard({
  profile,
  onSave,
}: {
  profile: ProfileData | null
  onSave: (draft: ProfileDraft) => void
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<{ field: FieldKey; text: string } | null>(null)
  // Persistent (not timed) save confirmation: the sr-only status region below
  // announces the change for AT users while the visible confirmation is the
  // card flipping to the summary; cleared when editing resumes.
  const [savedMsg, setSavedMsg] = useState('')

  const [income, setIncome] = useState('')
  const [essentials, setEssentials] = useState('')
  const [ef, setEf] = useState('')
  const [debtBalance, setDebtBalance] = useState('')
  const [debtMinimum, setDebtMinimum] = useState('')
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalCurrent, setGoalCurrent] = useState('')
  const [goalContribution, setGoalContribution] = useState('')

  // Focus lands on Edit after a save (and back on the first field after Edit):
  // the button the user just pressed unmounts with the form, and without a
  // hand-off keyboard focus silently drops to <body>.
  const editBtnRef = useRef<HTMLButtonElement>(null)
  const incomeRef = useRef<HTMLInputElement>(null)
  const [focusTarget, setFocusTarget] = useState<'edit' | 'form' | null>(null)
  useEffect(() => {
    if (focusTarget === 'edit') editBtnRef.current?.focus()
    if (focusTarget === 'form') incomeRef.current?.focus()
    setFocusTarget(null)
  }, [focusTarget])

  const showForm = profile === null || editing

  function startEdit() {
    // Seed from the saved profile so Edit shows the numbers in force; a blank
    // (never-entered) section seeds as blank, keeping the blank ≠ 0 contract.
    if (profile !== null) {
      setIncome(String(profile.monthlyIncome))
      setEssentials(String(profile.monthlyEssentials))
      setEf(profile.efBalance === null ? '' : String(profile.efBalance))
      setDebtBalance(profile.debt === null ? '' : String(profile.debt.balance))
      setDebtMinimum(profile.debt === null ? '' : String(profile.debt.minimum))
      setGoalName(profile.goal?.name ?? '')
      setGoalTarget(profile.goal === null ? '' : String(profile.goal.target))
      setGoalCurrent(profile.goal === null ? '' : String(profile.goal.current))
      setGoalContribution(profile.goal === null ? '' : String(profile.goal.monthlyContribution))
    }
    setSavedMsg('')
    setEditing(true)
    setFocusTarget('form')
  }

  function fail(field: FieldKey, text: string) {
    setError({ field, text })
    sfx.deny()
  }

  function submit() {
    const incomeN = parseMoney(income)
    if (incomeN === null || incomeN === 'invalid') {
      return fail('income', 'Monthly income needs a number (0 or more).')
    }
    const essentialsN = parseMoney(essentials)
    if (essentialsN === null || essentialsN === 'invalid') {
      return fail('essentials', 'Monthly essentials needs a number (0 or more).')
    }
    const efN = parseMoney(ef)
    if (efN === 'invalid') {
      return fail('ef', 'Emergency fund needs a number 0 or more — or leave it blank.')
    }
    const debtBalanceN = parseMoney(debtBalance)
    if (debtBalanceN === 'invalid') {
      return fail('debtBalance', 'Debt balance needs a number 0 or more — or leave it blank.')
    }
    const debtMinimumN = parseMoney(debtMinimum)
    if (debtMinimumN === 'invalid') {
      return fail('debtMinimum', 'Minimum payment needs a number 0 or more — or leave it blank.')
    }
    if (debtBalanceN === null && debtMinimumN !== null) {
      return fail('debtBalance', 'Add the debt balance too, or clear the minimum payment.')
    }
    const goalTargetN = parseMoney(goalTarget)
    if (goalTargetN === 'invalid') {
      return fail('goalTarget', 'Goal target needs a number 0 or more — or leave the goal blank.')
    }
    const goalCurrentN = parseMoney(goalCurrent)
    if (goalCurrentN === 'invalid') {
      return fail('goalCurrent', 'Saved so far needs a number 0 or more — or leave it blank.')
    }
    const goalContributionN = parseMoney(goalContribution)
    if (goalContributionN === 'invalid') {
      return fail('goalContribution', 'Monthly contribution needs a number 0 or more — or leave it blank.')
    }
    const goalTouched =
      goalName.trim() !== '' || goalTargetN !== null || goalCurrentN !== null || goalContributionN !== null
    if (goalTouched && goalTargetN === null) {
      return fail('goalTarget', 'A goal needs a target amount — or clear the other goal fields.')
    }
    setError(null)
    onSave({
      monthlyIncome: incomeN,
      monthlyEssentials: essentialsN,
      efBalance: efN,
      debt: debtBalanceN === null ? null : { balance: debtBalanceN, minimum: debtMinimumN ?? 0 },
      goal: goalTouched
        ? {
            name: goalName.trim() === '' ? 'Savings goal' : goalName.trim(),
            target: goalTargetN as number,
            current: goalCurrentN ?? 0,
            monthlyContribution: goalContributionN ?? 0,
          }
        : null,
    })
    setSavedMsg('Numbers saved — your Health Score and simulator now use them.')
    setEditing(false)
    setFocusTarget('edit')
  }

  // Wires the per-field a11y state to the single inline error, matching the
  // aria-invalid/aria-describedby pattern of the log and sim amount fields.
  function fieldA11y(key: FieldKey) {
    const invalid = error?.field === key
    return {
      'aria-invalid': invalid || undefined,
      'aria-describedby': invalid ? 'profile-error' : undefined,
    }
  }
  const clearError = () => setError(null)

  return (
    <section className="card">
      <h2>My numbers</h2>
      {/* Permanently mounted status region (same announce-on-change rule as
          the toast/XP regions in App): the visible save confirmation is the
          card flipping to the summary, which a screen reader won't narrate. */}
      <p className="sr-only" role="status" aria-label="Profile status">{savedMsg}</p>

      {showForm ? (
        <>
          {profile === null && (
            <p className="profile-note">
              Your Health Score and simulator run on demo numbers until you replace
              them. Two amounts are enough to start — everything stays on this device.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="log-row">
              <label className="field-wrap">
                <span className="field-label">Monthly income (DA)</span>
                <input
                  className="field mono"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  ref={incomeRef}
                  value={income}
                  onChange={(e) => {
                    setIncome(e.target.value)
                    clearError()
                  }}
                  {...fieldA11y('income')}
                />
              </label>
              <label className="field-wrap">
                <span className="field-label">Monthly essentials (DA)</span>
                <input
                  className="field mono"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={essentials}
                  onChange={(e) => {
                    setEssentials(e.target.value)
                    clearError()
                  }}
                  {...fieldA11y('essentials')}
                />
              </label>
            </div>

            <fieldset className="profile-group">
              <legend className="field-label">Emergency fund — optional</legend>
              <label className="field-wrap">
                <span className="field-label">Emergency fund (DA)</span>
                <input
                  className="field mono"
                  type="text"
                  inputMode="decimal"
                  placeholder="Blank = not counted"
                  value={ef}
                  onChange={(e) => {
                    setEf(e.target.value)
                    clearError()
                  }}
                  {...fieldA11y('ef')}
                />
              </label>
            </fieldset>

            <fieldset className="profile-group">
              <legend className="field-label">Revolving debt — optional</legend>
              <div className="log-row">
                <label className="field-wrap">
                  <span className="field-label">Debt balance (DA)</span>
                  <input
                    className="field mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="Blank = not counted"
                    value={debtBalance}
                    onChange={(e) => {
                      setDebtBalance(e.target.value)
                      clearError()
                    }}
                    {...fieldA11y('debtBalance')}
                  />
                </label>
                <label className="field-wrap">
                  <span className="field-label">Minimum payment (DA/mo)</span>
                  <input
                    className="field mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={debtMinimum}
                    onChange={(e) => {
                      setDebtMinimum(e.target.value)
                      clearError()
                    }}
                    {...fieldA11y('debtMinimum')}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="profile-group">
              <legend className="field-label">Savings goal — optional</legend>
              <div className="log-row">
                <label className="field-wrap">
                  <span className="field-label">Goal name</span>
                  <input
                    className="field"
                    type="text"
                    placeholder="e.g. Laptop"
                    value={goalName}
                    onChange={(e) => {
                      setGoalName(e.target.value)
                      clearError()
                    }}
                    {...fieldA11y('goalName')}
                  />
                </label>
                <label className="field-wrap">
                  <span className="field-label">Target (DA)</span>
                  <input
                    className="field mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={goalTarget}
                    onChange={(e) => {
                      setGoalTarget(e.target.value)
                      clearError()
                    }}
                    {...fieldA11y('goalTarget')}
                  />
                </label>
              </div>
              <div className="log-row">
                <label className="field-wrap">
                  <span className="field-label">Saved so far (DA)</span>
                  <input
                    className="field mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={goalCurrent}
                    onChange={(e) => {
                      setGoalCurrent(e.target.value)
                      clearError()
                    }}
                    {...fieldA11y('goalCurrent')}
                  />
                </label>
                <label className="field-wrap">
                  <span className="field-label">Monthly contribution (DA)</span>
                  <input
                    className="field mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={goalContribution}
                    onChange={(e) => {
                      setGoalContribution(e.target.value)
                      clearError()
                    }}
                    {...fieldA11y('goalContribution')}
                  />
                </label>
              </div>
            </fieldset>

            {error && (
              <p className="field-error" id="profile-error" role="alert">{error.text}</p>
            )}
            <div className="log-actions">
              <button type="submit" className="btn btn-flame">Save my numbers</button>
              {profile !== null && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setError(null)
                    setEditing(false)
                    setFocusTarget('edit')
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            {/* Blank ≠ 0 is the contract the whole card runs on — say it. */}
            <p className="profile-note">
              Leave an optional section blank and it stays out of your Health Score.
              A typed 0 counts as real data.
            </p>
          </form>
        </>
      ) : (
        <>
          <ul className="profile-rows">
            <li className="profile-row">
              <span>Income</span>
              <span className="mono">{DA(profile.monthlyIncome)}/mo</span>
            </li>
            <li className="profile-row">
              <span>Essentials</span>
              <span className="mono">{DA(profile.monthlyEssentials)}/mo</span>
            </li>
            <li className="profile-row">
              <span>Emergency fund</span>
              {profile.efBalance !== null ? (
                <span className="mono">{DA(profile.efBalance)}</span>
              ) : (
                <span className="profile-unset">Not entered — kept out of your score</span>
              )}
            </li>
            <li className="profile-row">
              <span>Debt</span>
              {profile.debt !== null ? (
                <span className="mono">
                  {DA(profile.debt.balance)} · min {DA(profile.debt.minimum)}/mo
                </span>
              ) : (
                <span className="profile-unset">Not entered — kept out of your score</span>
              )}
            </li>
            <li className="profile-row">
              <span>Goal</span>
              {profile.goal !== null ? (
                <span className="mono">
                  {profile.goal.name}: {DA(profile.goal.current)} of {DA(profile.goal.target)}
                </span>
              ) : (
                <span className="profile-unset">None</span>
              )}
            </li>
          </ul>
          <button className="btn" ref={editBtnRef} onClick={startEdit}>
            Edit my numbers
          </button>
        </>
      )}
    </section>
  )
}
