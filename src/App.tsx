/**
 * App is composition only: cards live in src/components/, the day-clock +
 * health-rollover logic in useHealthDay, and the XP/toast/sound reactions in
 * useRewards — so the roadmap features (onboarding, boss battles, "I bought
 * it anyway") add modules instead of effects in one growing file.
 */

import { useEffect, useMemo, useReducer, useState, type RefObject } from 'react'
import { RESIST_XP_DAILY_CAP } from './engine/xp.ts'
import { historyDays } from './engine/profile.ts'
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
import { HeroShell } from './components/HeroShell.tsx'
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
import { MonthCard } from './components/MonthCard.tsx'
import { Ledger } from './components/Ledger.tsx'
import { useHealthDay } from './hooks/useHealthDay.ts'
import { useBossBattle } from './hooks/useBossBattle.ts'
import { useAchievements } from './hooks/useAchievements.ts'
import { useRewards } from './hooks/useRewards.ts'
import { useAnnouncer } from './hooks/useAnnouncer.ts'
import './styles/tokens.css'
import './styles/app.css'

export default function App({
  /**
   * Handed down by the cold-start gate (Root.tsx) so it can move focus into
   * the app after the landing that had focus is unmounted. Optional, and every
   * test renders <App /> without it: the app must stand alone, and nothing in
   * here may depend on being gated.
   */
  mainRef,
}: {
  mainRef?: RefObject<HTMLElement>
} = {}) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadState)

  // A failed write is a product failure, not a logging detail: setItem throws
  // on an exhausted quota and in privacy modes that grant none at all, and
  // until now the app confirmed the save anyway (row rendered, undo strip
  // read "Logged 4,200 DA", live region announced the XP) while storage stayed
  // untouched. State stays in memory either way — the row must not vanish out
  // from under the user, and export reads the same in-memory state.
  // Set unconditionally rather than guarded: React bails out of a setState
  // that lands on the identical value, so the healthy path costs no extra
  // render, and writing it every time is what makes the fault CLEAR itself
  // the moment a write lands again (quota freed, private window closed).
  const [persistFailed, setPersistFailed] = useState(false)
  // Export outcome — see downloadExport. Announced through the foot's region.
  const [exportMsg, announceExport] = useAnnouncer()
  useEffect(() => {
    setPersistFailed(!saveState(state))
  }, [state])
  // A second open tab also saves on every change; without re-syncing, this
  // tab's next save would overwrite the peer's transactions with its own
  // stale list (silent data loss — see mergeStates in the store).
  useEffect(
    () => subscribeToPeerWrites((incoming) => dispatch({ type: 'HYDRATE', incoming })),
    [],
  )
  useEffect(() => sfx.setMuted(state.muted), [state.muted])

  // Real numbers once the setup card completed, DEMO_PROFILE until then — the
  // hook resolves it once and hands it down, so the simulator and the score
  // cannot read different profiles and the object identity is stable across
  // renders that changed neither.
  const { today, health, profile, isDemo } = useHealthDay(state, dispatch)
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
  // Computed once: the hero shell and the hero card both show the companions
  // and must always agree on the shelf.
  // MEMOISED, like every derivation below it: useRewards holds the toast queue
  // and the +XP chip in App-level state, so each grant schedules two further
  // renders of this whole tree (chip clear at 1800ms, toast shift at 2600ms)
  // in which no state field these read has changed. Un-memoised they redid a
  // full transaction scan — and minted a fresh array/Set/object identity —
  // three times per grant instead of once.
  const pets = useMemo(() => unlockedPets(state.achievements), [state.achievements])
  // Deterministic pick for the hook's day — same lesson on every render,
  // reload, and tab of that day, and stable across "Got it" (lessonForDay
  // keeps today's own entry in the pool on purpose).
  const todayLesson = lessonForDay(today, state.lessonsSeen)
  const lessonReadToday = state.quests.some((q) => q.id === 'lesson' && q.done)
  // Memoised like `pets`, and computed off the hook's `today` rather than a
  // fresh todayISO() for the same reason every other date in this render is.
  // Trust Rule 5's calibration count, read by the health readout — the ledger
  // no longer takes it: a day total is an exact fact from day one, so a 90-day
  // index on that card made accurate figures look provisional (see Ledger).
  const loggedDays = useMemo(() => historyDays(state.transactions, today), [state.transactions, today])
  // Counting loop with an early exit, not filter().length: the old form
  // allocated an intermediate array over the whole ledger to answer one
  // boolean, and it answers the same after the third resist of the day as
  // after the three-hundredth.
  // COUNTS GRANTS, NOT ROWS, and that is the fix rather than an optimisation:
  // the authoritative fold (xpFromLog) caps on resist GRANTS, so counting rows
  // here drifted the moment a paid resist was undone — UNDO_TX removes the row
  // AND its grant, leaving the row count high and suppressing a grant the cap
  // still allowed. The reducer now reads the same evidence (see LOG_TX), and
  // this label reads it too so the button can never promise or refuse XP the
  // reducer disagrees about.
  const resistXpCapped = useMemo(() => {
    let n = 0
    for (const g of state.xpLog) {
      if (g.action === 'resistImpulse' && g.date === today && ++n >= RESIST_XP_DAILY_CAP) return true
    }
    return false
  }, [state.xpLog, today])
  const collectedLessonIds = useMemo(
    () => new Set(state.lessonsSeen.map((e) => e.id)),
    [state.lessonsSeen],
  )

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
    note?: string,
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
      // What it was, in the user's words — the one field on the row that
      // answers a question the amount cannot. Passed through as typed; the
      // reducer caps and trims it (withSanitizedNote), and an empty or
      // whitespace-only entry lands as no note at all rather than a blank
      // second line. It pays NO XP: the grant in LOG_TX is keyed on the
      // action, not on how much the user wrote, so charging for a memory
      // field would tax logging and paying for it would make memory an
      // engagement lever (Trust Rule 1).
      note,
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

  // Trust Rule 7's headline action confirmed NOTHING to anyone who cannot see
  // a browser download shelf — the sweep measured zero announcements — and it
  // had no failure path at all. createObjectURL throws in some privacy
  // configurations: that is the same class of failure saveState already handles
  // above (persist-fault), handled the same way. Both outcomes land in the
  // mounted region in the foot.
  //
  // WHAT THE SUCCESS LINE MAY CLAIM is the narrower question, and the previous
  // wording got it wrong. a.click() is a silent no-op when downloads are
  // blocked — no throw, no event, nothing observable — so "Export written."
  // asserted a file on a disk this app cannot see. On the one action the
  // product's whole pitch rests on, that is the app claiming an outcome it has
  // no evidence for. It now claims only the act it performed: the blob was
  // built and handed to the browser. There is no honest stronger signal
  // available without keeping the object URL alive and rendering a visible
  // fallback link, which is a feature, not a wording fix.
  function downloadExport() {
    const name = `ember-export-${todayISO()}.json`
    try {
      const blob = new Blob([exportJSON(state)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      // Names the file, so "where did it go" has an answer (§7 rule 1: lead
      // with the object, state the fact, stop) — and names only the fact this
      // code observed. See the note above the function.
      announceExport(`Export built. ${name} handed to the browser.`)
    } catch {
      // §7's error exemplar, and the same two-fragment shape as the storage
      // fault: name the failure, name where it happened, stop. No blame — the
      // block is the device's, not the tap's.
      announceExport("That didn't go through. Export blocked on this device.")
    }
  }

  return (
    <div className="shell">
      {/* The header carries the page's h1 wordmark: without it the
          accessibility outline starts at the dynamic stage label with no
          page-level heading. Mobile topbar and desktop full-viewport hero
          are the same DOM — see HeroShell. */}
      <HeroShell
        stage={health.stage}
        score={health.score}
        pets={pets}
        muted={state.muted}
        // The desktop hero owns the stage badge/name/rating at ≥1024px, so it
        // owns the "whose numbers are these" disclosure there too — see
        // HeroCard for why the stage is not the user's until setup lands.
        isDemo={isDemo}
        onToggleMute={() => dispatch({ type: 'TOGGLE_MUTE' })}
      />

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
      {/* tabIndex -1 makes the landmark programmatically focusable without
          putting it in the tab order — the target Root.tsx moves focus to when
          the cold-start gate dismisses and the button that had focus goes
          away. It is inert for every other user of this component. */}
      <main className="main-stack" ref={mainRef} tabIndex={-1}>
        {/* Storage fault. role="status", not "alert": assertive would
            interrupt, and the first thing it would interrupt is the app's own
            boot announcement — in a zero-quota privacy mode this region is
            already filled on the very first commit. The polite queue reaches
            the user right after the tap that failed, which is when it means
            something. ("alert" is also already spoken for by LogCard's inline
            validation, and two of them would be one too many.)

            Permanently mounted and mounted EMPTY, for the same reason as the
            toast: screen readers announce text CHANGES inside an existing
            region. Deliberately NOT folded into the toast region — that one is
            a fixed-position banner in 24px display caps that clears itself
            after 2.6s, and this condition does not clear itself. It stays in
            flow, in reading order above the cards, until a write lands.

            The message names the failure and the recovery and stops there
            (§7.1): the log itself is fine and still on screen, so blaming the
            tap would be a lie as well as a scold. "Export my data" in the foot
            reads the same in-memory state and still works. */}
        <p className="persist-fault" role="status" aria-label="Storage">
          {persistFailed
            ? "That didn't go through. Nothing is saving to this device. Export to keep it."
            : ''}
        </p>
        <HeroCard
          stage={health.stage}
          score={health.score}
          pets={pets}
          components={health.components}
          // Trust Rule 5, both halves: the score names its own calibration
          // state under 90 days, AND names whose numbers it is scoring while
          // the profile is still DEMO_PROFILE. Same flag SimCard reads, so
          // the score and the simulator can never disagree about it.
          historyDays={loggedDays}
          isDemo={isDemo}
        />
        <XpCard xp={state.xp} gain={xpGain} />
        <LogCard
          transactions={state.transactions}
          onLog={logPurchase}
          onUndo={undoLog}
          resistXpCapped={resistXpCapped}
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
        {/* Opens the archive half of the stack (see .month-card's macro-break
            in app.css). Same `today` as every other date in this render, and
            for the stronger reason: this card states which day of the month it
            is, so a fresh clock read here would let the page say "Day 5 / 31"
            over a row it had just stamped the 4th.
            It is handed transactions and a day and NOTHING else — no profile,
            so no budget figure can ever reach it (§12.3/§12.6). */}
        <MonthCard transactions={state.transactions} today={today} />
        {/* `today` is the hook's day, not a fresh clock read: it decides which
            group is headed "Today" and which is "Yesterday", and a list that
            re-reads the wall clock would disagree with the day this render's
            logs were stamped with in the minute after midnight. */}
        <Ledger transactions={state.transactions} today={today} />
        <CodexCard collectedIds={collectedLessonIds} />
        <AchievementsCard unlocks={state.achievements} />
      </main>

      <footer className="foot">
        <button className="btn" onClick={downloadExport}>Export my data</button>
        {/* Permanently mounted and mounted EMPTY, like every other status
            region here: a region that arrives already holding its message is
            silent. The visible twin below is aria-hidden so the outcome is
            read once, not twice — the pattern SimCard uses for its result. */}
        <p className="sr-only" role="status" aria-label="Export">{exportMsg}</p>
        {/* .export-note, NOT .foot-note: the outcome — including the failure —
            used to render in the same 11px quiet register as the boilerplate
            line below it, so a blocked export looked like a footnote next to
            the promise it was contradicting. See .export-note in app.css. */}
        {exportMsg !== '' && (
          <p className="export-note" aria-hidden="true">{exportMsg}</p>
        )}
        {/* Trust Rule 7, verbatim in substance. Fragmented for §7 rule 2;
            "always" is the promise, not an intensifier, so it stays. */}
        <span className="foot-note">Your data leaves when you do. Full export, always.</span>
      </footer>
    </div>
  )
}
