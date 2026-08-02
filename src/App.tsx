/**
 * App is composition only: cards live in src/components/, the day-clock +
 * health-rollover logic in useHealthDay, and the XP/toast/sound reactions in
 * useRewards — so the roadmap features (onboarding, boss battles, "I bought
 * it anyway") add modules instead of effects in one growing file.
 */

import { useEffect, useReducer } from 'react'
import { RESIST_XP_DAILY_CAP } from './engine/xp.ts'
import { resolveProfile } from './engine/profile.ts'
import * as sfx from './audio/chiptune.ts'
import {
  loadState,
  newId,
  saveState,
  exportJSON,
  subscribeToPeerWrites,
  todayISO,
  type Transaction,
} from './state/store.ts'
import { appReducer } from './state/reducer.ts'
import { unlockedPets } from './engine/achievements.ts'
import { lessonForDay } from './content/lessons.ts'
import { HeroCard } from './components/HeroCard.tsx'
import { LessonCard } from './components/LessonCard.tsx'
import { CodexCard } from './components/CodexCard.tsx'
import { AchievementsCard } from './components/AchievementsCard.tsx'
import { XpCard } from './components/XpCard.tsx'
import { LogCard } from './components/LogCard.tsx'
import { QuestCard } from './components/QuestCard.tsx'
import { BossCard } from './components/BossCard.tsx'
import { SimCard } from './components/SimCard.tsx'
import { ProfileCard, type ProfileDraft } from './components/ProfileCard.tsx'
import { Ledger } from './components/Ledger.tsx'
import { useHealthDay } from './hooks/useHealthDay.ts'
import { useBossBattle } from './hooks/useBossBattle.ts'
import { useAchievements } from './hooks/useAchievements.ts'
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
  // The hook's `today` (like logPurchase uses), so the battle week can never
  // disagree with the day every other card believes it is. The hook also
  // claims a just-completed winning week — the toast/fanfare react to the
  // resulting grant in useRewards.
  const { battle, wonLastWeek } = useBossBattle(state, dispatch, today)
  // Badge predicates run over the same state every card renders from; the
  // hook persists any newly-earned ids stamped with the hook's `today` (the
  // day every other write in this render believes it is), and the unlock
  // toast + sparkle react to the persisted change in useRewards.
  useAchievements(state, dispatch, today)
  const { toast, xpGain } = useRewards(state)
  // Real numbers once the setup card completed, DEMO_PROFILE until then —
  // the same resolution useHealthDay applies, so the simulator and the score
  // can never speak from different profiles.
  const { profile, isDemo } = resolveProfile(state.profile)
  // Deterministic pick for the hook's day — same lesson on every render,
  // reload, and tab of that day, and stable across "Got it" (lessonForDay
  // keeps today's own entry in the pool on purpose).
  const todayLesson = lessonForDay(today, state.lessonsSeen)
  const lessonReadToday = state.quests.some((q) => q.id === 'lesson' && q.done)

  function readLesson() {
    // Two dispatches, one tap: READ_LESSON collects the lesson into the codex
    // (no XP — see the reducer), and the verified lesson quest carries the
    // daily readLesson grant through COMPLETE_QUEST's atomic double-grant
    // guard, exactly like SimCard's onRun does for the sim quest. The quest
    // blip and +XP chip come from useRewards; the codex milestone sparkle
    // fires there too when the collection crosses a multiple of five.
    dispatch({ type: 'READ_LESSON', id: todayLesson.id, date: today })
    dispatch({ type: 'COMPLETE_QUEST', id: 'lesson' })
  }

  function logPurchase(
    amountDA: number,
    category: string,
    resisted: boolean,
    impulseFlagged: boolean,
  ): string {
    const tx: Transaction = {
      // newId, not bare crypto.randomUUID: randomUUID is undefined outside
      // secure contexts (plain-http hosting), and a throw here would fail the
      // core logging action silently — see newId in the store.
      id: newId(),
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
      // "I bought it anyway" — the yielded side of Impulse Control. Same XP,
      // same blip as any log: self-reporting against yourself is never
      // punished, and the flag is what makes IC genuine two-sided data.
      impulseFlagged,
    }
    dispatch({ type: 'LOG_TX', tx })
    if (resisted) sfx.sparkle()
    else sfx.blip()
    // The id is LogCard's undo handle for the grace window.
    return tx.id
  }

  function undoLog(id: string) {
    // Row and XP grant leave together (see UNDO_TX in the reducer). The blip
    // reinforces the visible change — the ledger row and undo strip vanish.
    dispatch({ type: 'UNDO_TX', id })
    sfx.blip()
  }

  function saveProfile(draft: ProfileDraft) {
    const firstSetup = state.profile === null
    // The hook's `today` for the same reason logPurchase uses it: savedDate
    // arbitrates profile recency in mergeStates, and it must agree with the
    // day every other write in this render believes it is.
    dispatch({ type: 'PROFILE_SET', profile: { ...draft, savedDate: today } })
    // Sparkle only on the setup that retires the demo profile — the bigger
    // visible change (sim note flips, EF/DT join the score); edits get the
    // ordinary confirmation blip.
    if (firstSetup) sfx.sparkle()
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
        <HeroCard
          stage={health.stage}
          score={health.score}
          pets={unlockedPets(state.achievements)}
          components={health.components}
        />
        <XpCard xp={state.xp} gain={xpGain} />
        <LogCard
          transactions={state.transactions}
          onLog={logPurchase}
          onUndo={undoLog}
          resistXpCapped={
            state.transactions.filter((t) => t.resistedImpulse && t.date === today).length >=
            RESIST_XP_DAILY_CAP
          }
        />
        <QuestCard quests={state.quests} onComplete={(id) => dispatch({ type: 'COMPLETE_QUEST', id })} />
        <BossCard battle={battle} wonLastWeek={wonLastWeek} />
        {/* "Got it" genuinely completes the verified lesson quest — the tap
            lands on today's actual lesson content, so the app observes the
            action instead of taking it on self-report. */}
        <LessonCard lesson={todayLesson} readToday={lessonReadToday} onRead={readLesson} />
        {/* Running a simulation genuinely completes the sim quest — a
            daily quest the app verifies instead of taking on self-report, so
            QuestCard renders it without a tap-to-complete button. */}
        <SimCard
          profile={profile}
          isDemo={isDemo}
          onRun={() => dispatch({ type: 'COMPLETE_QUEST', id: 'sim' })}
        />
        <ProfileCard profile={state.profile} onSave={saveProfile} />
        <Ledger transactions={state.transactions} today={today} />
        <CodexCard collectedIds={new Set(state.lessonsSeen.map((e) => e.id))} />
        <AchievementsCard unlocks={state.achievements} />
      </main>

      <footer className="foot">
        <button className="btn" onClick={downloadExport}>Export my data</button>
        <span className="foot-note">Your data leaves when you do — full export, always.</span>
      </footer>
    </div>
  )
}
