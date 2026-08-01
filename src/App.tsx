import { useEffect, useMemo, useState } from 'react'
import {
  computeHealthScore,
  savingsRateScore,
  budgetAdherenceScore,
  emergencyFundScore,
  debtTrendScore,
  impulseControlScore,
  type HealthInputs,
  type Stage,
} from './engine/healthScore.ts'
import { runSimulation, describeResult, type SimProfile } from './engine/simulator.ts'
import { grantXp, xpForLevel, levelTitle, type XpAction } from './engine/xp.ts'
import * as sfx from './audio/chiptune.ts'
import {
  loadState,
  saveState,
  exportJSON,
  todayISO,
  type AppState,
  type Transaction,
} from './state/store.ts'
import './styles/tokens.css'
import './styles/app.css'

/**
 * Demo profile powering score components until onboarding exists. Transaction
 * logging is live; income/budget/EF/debt setup ships next.
 */
const DEMO = {
  monthlyIncome: 90_000,
  monthlyEssentials: 52_000,
  monthlyDiscretionary: 15_000,
  budgeted: 62_000,
  efBalance: 45_000,
  debtStart: 12_000,
  debtNow: 9_500,
  liquidBalance: 60_000,
  debtMinimum: 500,
  extraDebtPayment: 2_000,
  goal: { target: 500_000, current: 150_000, monthlyContribution: 12_000 },
}

const STAGE_META: Record<Stage, { label: string; stars: number; color: string; colorSh: string }> = {
  ember: { label: 'Ember', stars: 1, color: 'var(--flame)', colorSh: 'var(--flame-sh)' },
  hearth: { label: 'Hearth-fire', stars: 2, color: 'var(--gold)', colorSh: 'var(--gold-sh)' },
  bonfire: { label: 'Bonfire', stars: 3, color: 'var(--pink)', colorSh: 'var(--pink-sh)' },
  beacon: { label: 'Beacon', stars: 4, color: 'var(--violet)', colorSh: 'var(--violet-sh)' },
}

const CATEGORIES = ['Food', 'Transport', 'Fun', 'Bills', 'Health', 'Other']

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [simText, setSimText] = useState<string | null>(null)
  const [simAmount, setSimAmount] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => saveState(state), [state])
  useEffect(() => sfx.setMuted(state.muted), [state.muted])

  const health = useMemo(() => {
    const today = todayISO()
    const monthSpend = state.transactions
      .filter((t) => t.date.slice(0, 7) === today.slice(0, 7) && !t.resistedImpulse)
      .reduce((s, t) => s + t.amountDA, 0)
    const resisted = state.transactions.filter((t) => t.resistedImpulse).length
    const yielded = state.transactions.filter(
      (t) => !t.resistedImpulse && t.category === 'Fun',
    ).length

    const inputs: HealthInputs = {
      SR: {
        structurallyUndefined: false,
        raw: savingsRateScore(DEMO.monthlyIncome, DEMO.monthlyEssentials + monthSpend),
        confidence: 1,
      },
      BA: {
        structurallyUndefined: false,
        raw: budgetAdherenceScore([{ budgeted: DEMO.budgeted, actual: DEMO.monthlyEssentials + monthSpend }]),
        confidence: 1,
      },
      EF: {
        structurallyUndefined: false,
        raw: emergencyFundScore(DEMO.efBalance, DEMO.monthlyEssentials),
        confidence: 1,
      },
      DT: {
        structurallyUndefined: false,
        raw: debtTrendScore(DEMO.debtStart, DEMO.debtNow),
        confidence: 1,
      },
      IC: {
        structurallyUndefined: resisted + yielded === 0,
        raw: impulseControlScore(resisted, yielded),
        confidence: Math.min(1, (resisted + yielded) / 10),
      },
    }
    return computeHealthScore(inputs, state.prevHealthScore, state.stage)
  }, [state.transactions, state.prevHealthScore, state.stage])

  const stageMeta = STAGE_META[health.stage]

  function grant(action: XpAction) {
    setState((s) => {
      const { next, leveledUp } = grantXp(s.xp, action)
      if (leveledUp) {
        sfx.fanfare()
        setToast(`Level ${next.level} — ${levelTitle(next.level)}!`)
        setTimeout(() => setToast(null), 2600)
      }
      return { ...s, xp: next }
    })
  }

  function logPurchase(resisted: boolean) {
    const amt = parseFloat(amount)
    if (!resisted && (Number.isNaN(amt) || amt <= 0)) return
    const tx: Transaction = {
      id: crypto.randomUUID(),
      amountDA: resisted ? 0 : amt,
      category,
      date: todayISO(),
      resistedImpulse: resisted,
    }
    setState((s) => ({ ...s, transactions: [tx, ...s.transactions] }))
    if (resisted) {
      sfx.sparkle()
      grant('resistImpulse')
    } else {
      sfx.blip()
      grant('logExpense')
    }
    setAmount('')
  }

  function completeQuest(id: string) {
    setState((s) => {
      const quest = s.quests.find((q) => q.id === id)
      if (!quest || quest.done) return s
      sfx.blip()
      const quests = s.quests.map((q) => (q.id === id ? { ...q, done: true } : q))
      if (quests.every((q) => q.done)) setTimeout(sfx.arpeggio, 180)
      return { ...s, quests }
    })
    const quest = state.quests.find((q) => q.id === id)
    if (quest && !quest.done) grant(quest.xpAction)
  }

  function runSim() {
    const amt = parseFloat(simAmount)
    if (Number.isNaN(amt) || amt <= 0) return
    const profile: SimProfile = {
      monthlyIncome: DEMO.monthlyIncome,
      monthlyEssentials: DEMO.monthlyEssentials,
      monthlyDiscretionary: DEMO.monthlyDiscretionary,
      liquidBalance: DEMO.liquidBalance,
      efBalance: DEMO.efBalance,
      debtBalance: DEMO.debtNow,
      debtMinimum: DEMO.debtMinimum,
      extraDebtPayment: DEMO.extraDebtPayment,
      goal: DEMO.goal,
    }
    const result = runSimulation(profile, { amount: amt, funding: 'lump' })
    sfx.reveal()
    setSimText(describeResult(result))
  }

  function downloadExport() {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ember-export-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">Ember</span>
        <button
          className="btn"
          onClick={() => setState((s) => ({ ...s, muted: !s.muted }))}
          aria-pressed={state.muted}
        >
          {state.muted ? '🔇' : '🔊'}
        </button>
      </header>

      {toast && <div className="toast" role="status">{toast}</div>}

      <section className="card hero-card">
        <div
          className="stage-badge"
          style={{ background: stageMeta.color, boxShadow: `6px 6px 0 ${stageMeta.colorSh}` }}
        >
          <span className="stage-flame" aria-hidden="true">🔥</span>
        </div>
        <div className="stage-info">
          <h2>{stageMeta.label}</h2>
          <div className="stars" aria-label={`${stageMeta.stars} of 4 stars`}>
            {'★'.repeat(stageMeta.stars)}
          </div>
          <div className="mono score-line">
            Health {health.score.toFixed(1)}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="xp-head">
          <h3>Level {state.xp.level} · {levelTitle(state.xp.level)}</h3>
          <span className="mono">{state.xp.xpIntoLevel} / {xpForLevel(state.xp.level)} XP</span>
        </div>
        <div className="xp-track" role="progressbar"
          aria-valuenow={state.xp.xpIntoLevel} aria-valuemin={0} aria-valuemax={xpForLevel(state.xp.level)}>
          <div
            className="xp-fill"
            style={{ width: `${Math.min(100, (state.xp.xpIntoLevel / xpForLevel(state.xp.level)) * 100)}%` }}
          />
        </div>
      </section>

      <section className="card">
        <h3>Log it</h3>
        <div className="log-row">
          <input
            className="field mono"
            type="number"
            inputMode="decimal"
            placeholder="Amount (DA)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount in DA"
          />
          <select
            className="field"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="log-actions">
          <button className="btn btn-flame" onClick={() => logPurchase(false)}>
            Log purchase (+5 XP)
          </button>
          <button className="btn btn-gold" onClick={() => logPurchase(true)}>
            I resisted an impulse (+50 XP)
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Today's quests</h3>
        <ul className="quest-list">
          {state.quests.map((q) => (
            <li key={q.id} className={q.done ? 'quest done' : 'quest'}>
              <button
                className="quest-box"
                onClick={() => completeQuest(q.id)}
                aria-pressed={q.done}
                aria-label={q.done ? `${q.text} — done` : `Mark done: ${q.text}`}
              >
                {q.done ? '✓' : ''}
              </button>
              <span className="quest-text">{q.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card sim-card">
        <div className="window-bar mono">DECISION_SIM.EXE</div>
        <div className="sim-body">
          <div className="log-row">
            <input
              className="field mono"
              type="number"
              inputMode="decimal"
              placeholder="Purchase amount (DA)"
              value={simAmount}
              onChange={(e) => setSimAmount(e.target.value)}
              aria-label="Purchase amount in DA"
            />
            <button className="btn btn-teal" onClick={runSim}>Run simulation</button>
          </div>
          {simText && <p className="sim-result">{simText}</p>}
        </div>
      </section>

      <section className="card ledger-card">
        <h3>Recent</h3>
        {state.transactions.length === 0 ? (
          <p className="empty">Nothing logged yet. First log is +5 XP.</p>
        ) : (
          <ul className="tx-list">
            {state.transactions.slice(0, 8).map((t) => (
              <li key={t.id} className="tx">
                <span>{t.resistedImpulse ? '🛡 Resisted' : t.category}</span>
                <span className="mono">
                  {t.resistedImpulse ? '—' : `${t.amountDA.toLocaleString()} DA`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="foot">
        <button className="btn" onClick={downloadExport}>Export my data</button>
        <span className="foot-note">Your data leaves when you do — full export, always.</span>
      </footer>
    </div>
  )
}
