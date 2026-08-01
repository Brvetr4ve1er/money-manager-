/**
 * App is composition only: cards live in src/components/, the day-clock +
 * health-rollover logic in useHealthDay, and the XP/toast/sound reactions in
 * useRewards — so the roadmap features (onboarding, boss battles, "I bought
 * it anyway") add modules instead of effects in one growing file.
 */

import { useEffect, useReducer } from 'react'
import { RESIST_XP_DAILY_CAP } from './engine/xp.ts'
import { DEMO_PROFILE } from './engine/profile.ts'
import * as sfx from './audio/chiptune.ts'
import { loadState, saveState, exportJSON, todayISO, type Transaction } from './state/store.ts'
import { appReducer } from './state/reducer.ts'
import { HeroCard } from './components/HeroCard.tsx'
import { XpCard } from './components/XpCard.tsx'
import { LogCard } from './components/LogCard.tsx'
import { QuestCard } from './components/QuestCard.tsx'
import { SimCard } from './components/SimCard.tsx'
import { Ledger } from './components/Ledger.tsx'
import { useHealthDay } from './hooks/useHealthDay.ts'
import { useRewards } from './hooks/useRewards.ts'
import './styles/tokens.css'
import './styles/app.css'

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState)

  useEffect(() => saveState(state), [state])
  useEffect(() => sfx.setMuted(state.muted), [state.muted])

  const { today, health } = useHealthDay(state, dispatch)
  const { toast, xpGain } = useRewards(state)

  function logPurchase(amountDA: number, category: string, resisted: boolean) {
    const tx: Transaction = {
      id: crypto.randomUUID(),
      amountDA,
      category,
      date: todayISO(),
      resistedImpulse: resisted,
    }
    dispatch({ type: 'LOG_TX', tx })
    if (resisted) sfx.sparkle()
    else sfx.blip()
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
        {/* The wordmark is the page's h1: without it the accessibility outline
            starts at the dynamic stage label with no page-level heading. */}
        <h1 className="wordmark">Ember</h1>
        <button
          className="btn"
          onClick={() => dispatch({ type: 'TOGGLE_MUTE' })}
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
      <div className="toast" role="status" aria-label="Announcements">{toast}</div>

      <HeroCard stage={health.stage} score={health.score} />
      <XpCard xp={state.xp} gain={xpGain} />
      <LogCard
        onLog={logPurchase}
        resistXpCapped={
          state.transactions.filter((t) => t.resistedImpulse && t.date === today).length >=
          RESIST_XP_DAILY_CAP
        }
      />
      <QuestCard quests={state.quests} onComplete={(id) => dispatch({ type: 'COMPLETE_QUEST', id })} />
      {/* Running a simulation genuinely completes the sim quest — the one
          daily quest the app verifies instead of taking on self-report, so
          QuestCard renders it without a tap-to-complete button. */}
      <SimCard profile={DEMO_PROFILE} onRun={() => dispatch({ type: 'COMPLETE_QUEST', id: 'sim' })} />
      <Ledger transactions={state.transactions} />

      <footer className="foot">
        <button className="btn" onClick={downloadExport}>Export my data</button>
        <span className="foot-note">Your data leaves when you do — full export, always.</span>
      </footer>
    </div>
  )
}
