import { useState } from 'react'
import type { Dispatch } from 'react'
import type { AppAction } from '../../state/reducer.ts'
import type { ZakatSettings } from '../../state/slices/social.ts'
import { NISAB_GOLD_GRAMS, ZAKAT_RATE, zakatEstimate } from '../../engine/social.ts'
import { fmtDA } from '../../engine/money.ts'
import { Field } from './TontinesCard.tsx'
import { nowISO, parseDA } from './parse.ts'

/**
 * Zakat helper — arithmetic only. The gold price is the user's own figure
 * (Ember never fetches prices); the savings figure stays in this form and is
 * not stored. The disclaimer is part of the card, not small print.
 */
export function ZakatCard({ zakat, dispatch }: { zakat: ZakatSettings; dispatch: Dispatch<AppAction> }) {
  const [gold, setGold] = useState(zakat.goldPricePerGram === null ? '' : String(zakat.goldPricePerGram))
  const [savings, setSavings] = useState('')
  const [saved, setSaved] = useState(false)
  const goldN = parseDA(gold)
  const savingsN = parseDA(savings)
  const goldErr = gold.trim() !== '' && (goldN === null || goldN <= 0) ? 'Type a price per gram, in DA.' : undefined
  const savingsErr = savings.trim() !== '' && (savingsN === null || savingsN < 0) ? 'Type an amount, in DA.' : undefined
  const est = zakatEstimate(savingsErr ? null : savingsN, goldErr ? null : goldN)
  const storedSame = goldN !== null && goldN === zakat.goldPricePerGram

  return (
    <section className="card zakat" aria-labelledby="zakat-title">
      <h2 id="zakat-title">Zakat helper</h2>
      <p className="zakat-note" id="zakat-note">
        An estimate to help you plan, not a ruling — ask a scholar you trust about your situation.
      </p>
      <form
        className="social-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (goldErr || goldN === null) return
          dispatch({ type: 'social/zakat-settings', goldPricePerGram: goldN, nowISO: nowISO() })
          setSaved(true)
        }}
      >
        <div className="log-row">
          <Field
            id="zakat-gold"
            label="Gold price per gram (DA)"
            hint="Your own figure, from a jeweller or source you trust."
            error={goldErr}
          >
            <input
              id="zakat-gold"
              className="field mono"
              inputMode="decimal"
              value={gold}
              onChange={(e) => {
                setGold(e.target.value)
                setSaved(false)
              }}
              aria-invalid={!!goldErr}
              aria-describedby={`zakat-gold-hint${goldErr ? ' zakat-gold-err' : ''}`}
            />
          </Field>
          <Field
            id="zakat-savings"
            label="Savings held for a lunar year (DA)"
            hint="Used here only — not saved."
            error={savingsErr}
          >
            <input
              id="zakat-savings"
              className="field mono"
              inputMode="decimal"
              value={savings}
              onChange={(e) => setSavings(e.target.value)}
              aria-invalid={!!savingsErr}
              aria-describedby={`zakat-savings-hint${savingsErr ? ' zakat-savings-err' : ''}`}
            />
          </Field>
        </div>
        <div className="log-actions">
          <button type="submit" className="btn" disabled={!!goldErr || goldN === null || storedSame}>
            Save my gold price
          </button>
          {saved && storedSame && (
            <span className="support-saved" role="status">
              Gold price kept on this device.
            </span>
          )}
        </div>
      </form>
      <dl className="zakat-out" aria-live="polite">
        <div>
          <dt>Nisab ({NISAB_GOLD_GRAMS} g of gold)</dt>
          <dd className="mono">{est.nisab === null ? '—' : fmtDA(est.nisab)}</dd>
        </div>
        <div>
          <dt>Your savings</dt>
          <dd>
            {est.eligible === null
              ? 'Add both figures to compare'
              : est.eligible
                ? 'reach the nisab'
                : 'are below the nisab'}
          </dd>
        </div>
        <div className={est.eligible ? 'zakat-est is-lit' : 'zakat-est'}>
          <dt>Estimate at {ZAKAT_RATE * 100}%</dt>
          <dd className="mono">{est.estimate === null ? '—' : fmtDA(est.estimate)}</dd>
        </div>
      </dl>
    </section>
  )
}
