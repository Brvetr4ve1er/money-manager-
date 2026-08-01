import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { computeHealthScore, type Stage } from './engine/healthScore.ts'
import { runSimulation, describeResult } from './engine/simulator.ts'
import { xpForLevel, levelTitle, RESIST_XP_DAILY_CAP, type XpState } from './engine/xp.ts'
import { deriveHealthInputs, buildSimProfile, DEMO_PROFILE, type UserProfile } from './engine/profile.ts'
import * as sfx from './audio/chiptune.ts'
import {
  loadState,
  saveState,
  exportJSON,
  todayISO,
  type Quest,
  type Transaction,
} from './state/store.ts'
import { appReducer } from './state/reducer.ts'
import './styles/tokens.css'
import './styles/app.css'

const STAGE_META: Record<Stage, { label: string; stars: number; color: string; colorSh: string }> = {
  ember: { label: 'Ember', stars: 1, color: 'var(--flame)', colorSh: 'var(--flame-sh)' },
  hearth: { label: 'Hearth-fire', stars: 2, color: 'var(--gold)', colorSh: 'var(--gold-sh)' },
  bonfire: { label: 'Bonfire', stars: 3, color: 'var(--pink)', colorSh: 'var(--pink-sh)' },
  beacon: { label: 'Beacon', stars: 4, color: 'var(--violet)', colorSh: 'var(--violet-sh)' },
}

const CATEGORIES = ['Food', 'Transport', 'Fun', 'Bills', 'Health', 'Other']

function HeroCard({ stage, score }: { stage: Stage; score: number }) {
  const meta = STAGE_META[stage]
  return (
    <section className="card hero-card">
      <div
        className="stage-badge"
        style={{ background: meta.color, boxShadow: `6px 6px 0 ${meta.colorSh}` }}
      >
        <span className="stage-flame" aria-hidden="true">🔥</span>
      </div>
      <div className="stage-info">
        <h2>{meta.label}</h2>
        <div className="stars" aria-label={`${meta.stars} of 4 stars`}>
          {'★'.repeat(meta.stars)}
        </div>
        <div className="mono score-line">
          Health {score.toFixed(1)}
        </div>
      </div>
    </section>
  )
}

function XpCard({ xp, gain }: { xp: XpState; gain: number | null }) {
  return (
    <section className="card">
      <div className="xp-head">
        <h3>Level {xp.level} · {levelTitle(xp.level)}</h3>
        <span className="xp-numbers">
          {/* Transient +XP chip: the discrete visible moment for a gain. A
              state swap, not an animation, so it reads under reduced motion
              and with sound muted — the bar nudge (sub-pixel at high levels)
              and the blip never carry the reward alone. */}
          {gain !== null && <span className="xp-gain mono">+{gain} XP</span>}
          <span className="mono">{xp.xpIntoLevel} / {xpForLevel(xp.level)} XP</span>
        </span>
      </div>
      <div className="xp-track" role="progressbar"
        aria-valuenow={xp.xpIntoLevel} aria-valuemin={0} aria-valuemax={xpForLevel(xp.level)}
        aria-label={`Level ${xp.level} progress: ${xp.xpIntoLevel} of ${xpForLevel(xp.level)} XP`}>
        <div
          className="xp-fill"
          style={{ width: `${Math.min(100, (xp.xpIntoLevel / xpForLevel(xp.level)) * 100)}%` }}
        />
      </div>
    </section>
  )
}

function LogCard({
  onLog,
  resistXpCapped,
}: {
  onLog: (amountDA: number, category: string, resisted: boolean) => void
  resistXpCapped: boolean
}) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [error, setError] = useState<string | null>(null)

  // The app's most-used action must never fail silently: invalid input gets
  // an inline error (plus a denial blip reinforcing it, never replacing it).
  function submit(resisted: boolean) {
    const amt = parseFloat(amount)
    if (!resisted && (Number.isNaN(amt) || amt <= 0)) {
      setError('Enter an amount first.')
      sfx.deny()
      return
    }
    setError(null)
    onLog(resisted ? 0 : amt, category, resisted)
    setAmount('')
  }

  return (
    <section className="card">
      <h3>Log it</h3>
      {/* A real <form> so Enter / the mobile keyboard's done key submits. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
      >
        <div className="log-row">
          <input
            className="field mono"
            type="number"
            inputMode="decimal"
            placeholder="Amount (DA)"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            aria-label="Amount in DA"
            aria-invalid={error !== null}
            aria-describedby={error ? 'log-error' : undefined}
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
        {error && (
          <p className="field-error" id="log-error" role="alert">{error}</p>
        )}
        <div className="log-actions">
          <button type="submit" className="btn btn-flame">
            Log purchase (+5 XP)
          </button>
          {/* The label must not promise XP the capped grant won't pay —
              resists past the daily cap still log, they just earn nothing. */}
          <button type="button" className="btn btn-gold" onClick={() => submit(true)}>
            {resistXpCapped
              ? 'I resisted an impulse (XP capped today)'
              : 'I resisted an impulse (+50 XP)'}
          </button>
        </div>
      </form>
    </section>
  )
}

function QuestCard({ quests, onComplete }: { quests: Quest[]; onComplete: (id: string) => void }) {
  const allDone = quests.length > 0 && quests.every((q) => q.done)
  return (
    <section className="card">
      <div className="quest-head">
        <h3>Today's quests</h3>
        {/* Persistent visual counterpart to the completion arpeggio — sound
            never carries the moment alone. */}
        {allDone && <span className="quest-alldone">All complete ✓</span>}
      </div>
      <ul className="quest-list">
        {quests.map((q) => (
          <li key={q.id} className={q.done ? 'quest done' : 'quest'}>
            {/* The whole row is the button: the quest text is the natural tap
                target, and the 48px row pitch prevents cross-quest mis-taps.
                Completion is irreversible, so a done quest is disabled — not a
                still-pressable toggle: aria-pressed would tell screen-reader
                users it can be un-pressed, and an active press animation on an
                inert control breaks the "pressed = something happened"
                contract. */}
            <button
              className="quest-row"
              onClick={() => onComplete(q.id)}
              disabled={q.done}
              aria-label={q.done ? `${q.text} — done` : `Mark done: ${q.text}`}
            >
              <span className="quest-box" aria-hidden="true">{q.done ? '✓' : ''}</span>
              <span className="quest-text">{q.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SimCard({ profile, onRun }: { profile: UserProfile; onRun: () => void }) {
  const [simAmount, setSimAmount] = useState('')
  const [simText, setSimText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function run() {
    const amt = parseFloat(simAmount)
    if (Number.isNaN(amt) || amt <= 0) {
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
            <input
              className="field mono"
              type="number"
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
        {simText && <p className="sim-result">{simText}</p>}
      </div>
    </section>
  )
}

function Ledger({ transactions }: { transactions: Transaction[] }) {
  return (
    <section className="card ledger-card">
      <h3>Recent</h3>
      {transactions.length === 0 ? (
        <p className="empty">Nothing logged yet. First log is +5 XP.</p>
      ) : (
        <ul className="tx-list">
          {transactions.slice(0, 8).map((t) => (
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
  )
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => saveState(state), [state])
  useEffect(() => sfx.setMuted(state.muted), [state.muted])

  // The current local day lives in React state so a tab kept open past
  // midnight re-renders on its own: a timer plus visibility/focus listeners
  // notice the date change, which recomputes health and fires the rollover
  // effect below — instead of waiting for the next transaction edit.
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const sync = () =>
      setToday((prev) => {
        const now = todayISO()
        return prev === now ? prev : now
      })
    const id = window.setInterval(sync, 60_000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  // Live health: exactly one smoothing step from the persisted snapshot
  // (yesterday's final score) toward today's raw blend.
  const health = useMemo(
    () =>
      computeHealthScore(
        deriveHealthInputs(state.transactions, DEMO_PROFILE, today),
        state.prevHealthScore,
        state.stage,
      ),
    [state.transactions, state.prevHealthScore, state.stage, today],
  )

  // Day rollover (quests + once-per-day health snapshot) is a reducer action;
  // the reducer returns the same state on no-op days, so this dispatch is
  // render-free until the day actually changes. The snapshot persisted is the
  // FINAL score of the previous snapshot day — the blend re-windowed at that
  // day, one smooth() step from its own base. Persisting today's live score
  // instead would apply smooth() twice against the same raw blend (once into
  // the snapshot, once again in the memo above), moving ~75%/28% of the delta
  // per day instead of the documented 50%/15% and promoting stages the
  // persisted state never reached.
  useEffect(() => {
    if (state.healthDate === today && state.questsDate === today) return
    const finalized =
      state.healthDate === '' || state.healthDate === today
        ? health // first run (or quests-only roll): nothing to finalize
        : computeHealthScore(
            deriveHealthInputs(state.transactions, DEMO_PROFILE, state.healthDate),
            state.prevHealthScore,
            state.stage,
          )
    dispatch({ type: 'ROLL_DAY', today, healthScore: finalized.score, healthStage: finalized.stage })
  }, [state.healthDate, state.questsDate, state.transactions, state.prevHealthScore, state.stage, health, today])

  // Level-up fanfare/toast as a reaction to xp changes, never inside a state
  // transition (StrictMode double-invokes reducers in dev). The same effect
  // derives the transient +XP chip from the totalXp delta, so every grant —
  // whatever action produced it — gets a visible moment.
  const [xpGain, setXpGain] = useState<{ amount: number; at: number } | null>(null)
  const prevXp = useRef(state.xp)
  useEffect(() => {
    const prev = prevXp.current
    prevXp.current = state.xp
    if (state.xp.totalXp > prev.totalXp) {
      // `at` forces a fresh object per grant so back-to-back equal gains
      // still reset the dismiss timer below.
      setXpGain({ amount: state.xp.totalXp - prev.totalXp, at: Date.now() })
    }
    if (state.xp.level > prev.level) {
      sfx.fanfare()
      setToast(`Level ${state.xp.level} — ${levelTitle(state.xp.level)}!`)
    }
  }, [state.xp])

  // Chip dismissal owns its own timer, keyed on the gain (same pattern and
  // rationale as the toast timer below).
  useEffect(() => {
    if (xpGain === null) return
    const t = setTimeout(() => setXpGain(null), 1800)
    return () => clearTimeout(t)
  }, [xpGain])

  // Toast dismissal owns its own timer, keyed on the toast itself. It must
  // NOT live in the XP effect above: any XP gain within 2.6s of a level-up
  // (e.g. +5 for logging a purchase) would run that effect's cleanup, cancel
  // the dismiss timer, and strand the toast — and the role="status" live
  // region content — on screen until the next level-up.
  useEffect(() => {
    if (toast === null) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Quest-completion sounds, likewise driven by state changes only.
  const prevQuestsDone = useRef(state.quests.filter((q) => q.done).length)
  useEffect(() => {
    const doneCount = state.quests.filter((q) => q.done).length
    const prev = prevQuestsDone.current
    prevQuestsDone.current = doneCount
    if (doneCount > prev) {
      sfx.blip()
      if (state.quests.every((q) => q.done)) {
        // The arpeggio never carries the moment alone: the toast announces it
        // through the live region and QuestCard shows a persistent badge.
        setToast('All quests complete!')
        const t = setTimeout(sfx.arpeggio, 180)
        return () => clearTimeout(t)
      }
    }
  }, [state.quests])

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
        <span className="wordmark">Ember</span>
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
      <div className="toast" role="status">{toast}</div>

      <HeroCard stage={health.stage} score={health.score} />
      <XpCard xp={state.xp} gain={xpGain?.amount ?? null} />
      <LogCard
        onLog={logPurchase}
        resistXpCapped={
          state.transactions.filter((t) => t.resistedImpulse && t.date === today).length >=
          RESIST_XP_DAILY_CAP
        }
      />
      <QuestCard quests={state.quests} onComplete={(id) => dispatch({ type: 'COMPLETE_QUEST', id })} />
      {/* Running a simulation genuinely completes the sim quest — the one
          daily quest the app can verify instead of taking on self-report. */}
      <SimCard profile={DEMO_PROFILE} onRun={() => dispatch({ type: 'COMPLETE_QUEST', id: 'sim' })} />
      <Ledger transactions={state.transactions} />

      <footer className="foot">
        <button className="btn" onClick={downloadExport}>Export my data</button>
        <span className="foot-note">Your data leaves when you do — full export, always.</span>
      </footer>
    </div>
  )
}
