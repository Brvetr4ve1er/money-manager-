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
import {
  loadState,
  saveState,
  exportJSON,
  subscribeToPeerWrites,
  todayISO,
  type Transaction,
} from './state/store.ts'
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
  // A second open tab also saves on every change; without re-syncing, this
  // tab's next save would overwrite the peer's transactions with its own
  // stale list (silent data loss — see mergeStates in the store).
  useEffect(
    () => subscribeToPeerWrites((incoming) => dispatch({ type: 'HYDRATE', incoming })),
    [],
  )
  useEffect(() => sfx.setMuted(state.muted), [state.muted])

  const { today, health } = useHealthDay(state, dispatch)
  const { toast, xpGain } = useRewards(state)

  function logPurchase(amountDA: number, category: string, resisted: boolean) {
    const tx: Transaction = {
      id: crypto.randomUUID(),
      amountDA,
      category,
      // The hook's `today`, NOT a fresh todayISO(): the resist button's label
      // ("XP capped today") and the reducer's cap check both key off this
      // date. A fresh wall-clock read in the minute after midnight — before
      // the hook's interval/focus sync lands — would stamp the new day while
      // the label still promises the old day's cap state, granting XP the
      // label just said was capped (or vice versa).
      date: today,
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
          for AT users and the fanfare sound carries it alone. Faded via
          .toast:empty (opacity, never display/visibility — those would drop
          the empty region from the accessibility tree and mute the
          announcement) while there is no message. */}
      <div className="toast" role="status" aria-label="Announcements">{toast}</div>

      {/* Visually-hidden counterpart to the +XP chip: the chip is sighted-only
          and the blip is sound-only, so without this region a non-level-up
          grant (quest done, purchase logged) is never announced — sound would
          carry the confirmation alone for screen-reader users. Permanently
          mounted for the same announce-on-change reason as the toast. */}
      <div className="sr-only" role="status" aria-label="XP gains">
        {xpGain !== null ? `+${xpGain} XP` : ''}
      </div>

      {/* <main> landmark so AT users get a "jump to main content" target —
          the card stack is the page's primary content, with the topbar and
          foot as sibling landmarks. .main-stack carries the shell's column
          rhythm inside the landmark. */}
      <main className="main-stack">
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
      </main>

      <footer className="foot">
        <button className="btn" onClick={downloadExport}>Export my data</button>
        <span className="foot-note">Your data leaves when you do — full export, always.</span>
      </footer>
    </div>
  )
}
