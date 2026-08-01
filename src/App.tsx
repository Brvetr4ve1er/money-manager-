import { useEffect, useMemo, useRef, useState } from 'react'
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
  daysAgoISO,
  rollQuests,
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
    // Impulse Control counts only explicitly flagged events (per the IC
    // contract: resisted / total flagged), scoped to a trailing 30 days like
    // the month-scoped inputs above. Ordinary spending — Fun included — was
    // never flagged as an impulse and must not drag IC down. No UI sets
    // impulseFlagged yet ("I bought it anyway" ships later), so yielded stays
    // 0 and IC confidence stays honestly low.
    const icCutoff = daysAgoISO(30)
    const resisted = state.transactions.filter(
      (t) => t.resistedImpulse && t.date >= icCutoff,
    ).length
    const yielded = state.transactions.filter(
      (t) => t.impulseFlagged && !t.resistedImpulse && t.date >= icCutoff,
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

  // Persist a once-per-day health snapshot so asymmetric smoothing and stage
  // hysteresis actually compound day over day. Keyed on healthDate: persisting
  // per render would re-apply smooth() many times within a single day. Quests
  // roll here too — the same day-change signal — so a tab kept open past
  // midnight can't advance the health day while yesterday's quests stay done.
  useEffect(() => {
    const today = todayISO()
    setState((s) => {
      if (s.healthDate === today && s.questsDate === today) return s
      const rolled = rollQuests(s, today)
      return s.healthDate === today
        ? rolled
        : { ...rolled, prevHealthScore: health.score, stage: health.stage, healthDate: today }
    })
  }, [health])

  // Level-up fanfare/toast as a reaction to xp changes, never inside a state
  // updater (StrictMode double-invokes updaters in dev).
  const prevXp = useRef(state.xp)
  useEffect(() => {
    const prev = prevXp.current
    prevXp.current = state.xp
    if (state.xp.level > prev.level) {
      sfx.fanfare()
      setToast(`Level ${state.xp.level} — ${levelTitle(state.xp.level)}!`)
      const t = setTimeout(() => setToast(null), 2600)
      return () => clearTimeout(t)
    }
  }, [state.xp])

  // Quest-completion sounds, likewise driven by state changes only.
  const prevQuestsDone = useRef(state.quests.filter((q) => q.done).length)
  useEffect(() => {
    const doneCount = state.quests.filter((q) => q.done).length
    const prev = prevQuestsDone.current
    prevQuestsDone.current = doneCount
    if (doneCount > prev) {
      sfx.blip()
      if (state.quests.every((q) => q.done)) {
        const t = setTimeout(sfx.arpeggio, 180)
        return () => clearTimeout(t)
      }
    }
  }, [state.quests])

  const stageMeta = STAGE_META[health.stage]

  function grant(action: XpAction) {
    setState((s) => ({ ...s, xp: grantXp(s.xp, action).next }))
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
    // Quest flag and XP grant happen in one atomic functional update: a second
    // call before re-render sees done === true and is a no-op, so rapid double
    // clicks can never double-grant XP. Sounds fire from the effects above.
    setState((s) => {
      const quest = s.quests.find((q) => q.id === id)
      if (!quest || quest.done) return s
      const quests = s.quests.map((q) => (q.id === id ? { ...q, done: true } : q))
      return { ...s, quests, xp: grantXp(s.xp, quest.xpAction).next }
    })
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
          aria-label="Mute sound"
        >
          <span aria-hidden="true">{state.muted ? '🔇' : '🔊'}</span>
        </button>
      </header>

      {/* Permanently mounted live region: most screen readers only announce
          text CHANGES inside an existing live region, so the element must not
          mount already containing its text — otherwise the level-up is silent
          for AT users and the fanfare sound carries it alone. Hidden via
          .toast:empty while there is no message. */}
      <div className="toast" role="status">{toast}</div>

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
          aria-valuenow={state.xp.xpIntoLevel} aria-valuemin={0} aria-valuemax={xpForLevel(state.xp.level)}
          aria-label={`Level ${state.xp.level} progress: ${state.xp.xpIntoLevel} of ${xpForLevel(state.xp.level)} XP`}>
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
