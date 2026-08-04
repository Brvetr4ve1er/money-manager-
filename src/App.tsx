/**
 * App is composition only: cards live in src/components/, the day-clock +
 * health-rollover logic in useHealthDay, and the XP/toast/sound reactions in
 * useRewards — so the roadmap features (onboarding, boss battles, "I bought
 * it anyway") add modules instead of effects in one growing file.
 */

import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react'
import { RESIST_XP_DAILY_CAP } from './engine/xp.ts'
import { historyDays } from './engine/profile.ts'
import * as sfx from './audio/chiptune.ts'
import {
  loadState,
  newDecisionId,
  newId,
  saveState,
  exportJSON,
  subscribeToPeerWrites,
  todayISO,
  type CheckBackAnswer,
  type DecisionOutcome,
  type Transaction,
} from './state/store.ts'
import { appReducer } from './state/reducer.ts'
import { unlockedPets } from './engine/achievements.ts'
import { lessonForDay, LESSON_IDS, LESSONS } from './content/lessons.ts'
import { HeroShell } from './components/HeroShell.tsx'
import { HeroCard } from './components/HeroCard.tsx'
import { LessonCard } from './components/LessonCard.tsx'
import { LogCard } from './components/LogCard.tsx'
import { XpStrip } from './components/XpStrip.tsx'
import { BossCard } from './components/BossCard.tsx'
import { SimCard } from './components/SimCard.tsx'
import { ProfileCard, type ProfileDraft } from './components/ProfileCard.tsx'
import { ArchiveCard } from './components/ArchiveCard.tsx'
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
  // MEMOISED like every derivation around it, and for the reason spelled out
  // above `pets`: useRewards schedules two extra renders of this whole tree per
  // grant (chip clear at 1800ms, toast shift at 2600ms), and unmemoised this
  // rebuilt a Set of every collected lesson and re-filtered the 30-lesson
  // roster on each of them. It was the one derivation left in this render body
  // without a memo — the pick is deterministic, so the answer was always the
  // one already on screen.
  const todayLesson = useMemo(
    () => lessonForDay(today, state.lessonsSeen),
    [today, state.lessonsSeen],
  )
  // READ FROM THE GRANT LOG, NOT FROM A FLAG. The verified lesson quest used
  // to carry this ("is today's quest done"); the quest is gone and the daily
  // readLesson grant is now keyed `lesson:<day>` (see the reducer), so the
  // evidence IS the answer. It is also the only form that stays right once the
  // 30-lesson roster wraps and lessonForDay serves a lesson already in the
  // codex: "collected at some point" would render the card as read on a day
  // nobody read it. Same discipline as resistXpCapped below — the label and
  // the reducer read one source, so the button can never promise or refuse XP
  // the reducer disagrees about.
  const lessonReadToday = useMemo(
    () => state.xpLog.some((g) => g.id === `lesson:${today}`),
    [state.xpLog, today],
  )
  // Memoised like `pets`, and computed off the hook's `today` rather than a
  // fresh todayISO() for the same reason every other date in this render is.
  // Trust Rule 5's calibration count, read by the health readout — the ledger
  // no longer takes it: a day total is an exact fact from day one, so a 90-day
  // index on that card made accurate figures look provisional (see ArchiveCard).
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
  // Codex progress as ONE COUNT, which is all that is left of it. The 32-tile
  // grid and the 9-tile badge shelf were 60% of this app's DOM and carried zero
  // controls; they are deleted (see the card stack below). The count survives
  // because useRewards still celebrates every fifth collected lesson, and §10
  // is absolute — a sound may never carry a moment alone, so the milestone
  // needs a persistent visible counterpart somewhere. One line on LessonCard is
  // that counterpart. Counted against the roster, never the raw set size: the
  // sanitizer drops unknown ids, but the denominator has to be the roster's.
  const collectedLessons = useMemo(
    () => state.lessonsSeen.filter((e) => LESSON_IDS.has(e.id)).length,
    [state.lessonsSeen],
  )
  // Transaction id → the note the user typed on that row, for the decision
  // record's check-back. Notes only: it is the single field on a money row that
  // says WHAT something was, and the check-back has nothing else to name an
  // object with (see SimCard's noteById).
  const noteById = useMemo(() => {
    const byId = new Map<string, string>()
    for (const t of state.transactions) {
      if (t.note !== undefined) byId.set(t.id, t.note)
    }
    return byId
  }, [state.transactions])

  function readLesson() {
    // ONE dispatch, one tap. It was two — READ_LESSON to collect the lesson and
    // COMPLETE_QUEST('lesson') to pay the day's XP — and the second is gone
    // with the quest list. READ_LESSON now collects AND pays, each under its
    // own guard (once ever / once per local day), so a double tap, a StrictMode
    // double-invoke and a peer tab's merge all land the same single grant. The
    // +XP chip comes from useRewards; the codex milestone sparkle fires there
    // too when the collection crosses a multiple of five.
    dispatch({ type: 'READ_LESSON', id: todayLesson.id, date: today })
  }

  // A decision closed as "Bought it" hands its amount to the log form and waits
  // for the row so the record can point at the real money event. A ref, not
  // state: it must not re-render anything, and the very NEXT log consumes it
  // exactly once — a link that survived several logs would eventually staple
  // the record to an unrelated purchase.
  //
  // IT CARRIES THE AMOUNT, and that is the whole guard. "Consumed by the next
  // log" is not enough on its own: the form has no dismiss, so answering
  // "Bought it" on a 180,000 DA decision, walking away, and logging an
  // unrelated 200 DA coffee an hour later stapled that coffee's id to the
  // decision. Nothing on screen would contradict it, because txId has no
  // reader — its only surface is the export the user is promised under Trust
  // Rule 7, which makes a wrong link a false claim in the one artifact that
  // has to be right. So the link lands only on a row that matches the amount
  // the record handed over. Editing the prefilled figure before logging drops
  // the link, deliberately: an unlinked row states less than a mis-linked one,
  // and less is the honest side to err on.
  const pendingDecisionRef = useRef<{ id: string; amountDA: number } | null>(null)
  // Bumped seq, not a bare amount: pressing "Bought it" twice on two decisions
  // of the same size must still refill the field (see LogCard's prefill effect).
  const [logPrefill, setLogPrefill] = useState<{ amountDA: number; seq: number } | null>(null)

  function logPurchase(
    amountDA: number,
    category: string,
    resisted: boolean,
    impulseFlagged: boolean,
    note?: string,
    /** Set only by the decision record's resist branch; the log form's own
     *  path picks the pending link up from the ref above. */
    decisionId?: string,
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
    // Claimed once, and only by a matching row. Reading and clearing in the
    // same breath is what makes the link land on at most one row; the amount
    // check is what makes that row the right one (see pendingDecisionRef).
    const pending = pendingDecisionRef.current
    pendingDecisionRef.current = null
    const link =
      decisionId ?? (pending !== null && pending.amountDA === amountDA ? pending.id : undefined)
    // The link stamps a txId onto the decision and touches nothing else — the
    // XP branch inside LOG_TX is computed from the transaction alone, so a
    // linked log pays exactly what the same log pays unlinked (§12.1).
    dispatch({ type: 'LOG_TX', tx, decisionId: link })
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

  /**
   * A simulation ran. ONE dispatch, one press — the same shape readLesson has:
   * RUN_SIM persists the decision AND pays the day's runSimulation grant, each
   * under its own guard. The record is data and the grant is capped, so the
   * second run of a day still files its decision and pays nothing.
   */
  function runSim(run: { amountDA: number; line: string }) {
    dispatch({
      type: 'RUN_SIM',
      decision: {
        // Time-ordered, so two runs on one day render newest-first — see
        // newDecisionId. It builds on newId, which is why crypto.randomUUID is
        // never called directly here (see logPurchase).
        id: newDecisionId(),
        // The hook's `today`, like every other date written in this render:
        // the record labels this day back to the user ("Ran Today"), and a
        // fresh clock read would stamp the new day while the card still
        // believes it is the old one.
        date: today,
        amountDA: run.amountDA,
        // FROZEN (§12.5). The string the card showed, stored verbatim; nothing
        // ever recomputes it against a later profile.
        line: run.line,
        // …and frozen WITH its provenance, for the same reason (Trust Rule 5).
        // The live `isDemo` flag says whose numbers the NEXT run uses; stamping
        // it here is what lets a row run before setup keep saying it was
        // projected on placeholders after setup lands. See Decision.demo.
        demo: isDemo,
        outcome: 'open',
      },
    })
  }

  /**
   * What happened, recorded. NO XP CROSSES HERE (§12.1): CLOSE_DECISION pays
   * nothing, and the resist branch's grant is the ordinary capped resist grant
   * an identical row typed into the log form would earn — the record does not
   * add a payout, it just gives the row provenance.
   */
  function closeDecision(
    id: string,
    outcome: Exclude<DecisionOutcome, 'open'>,
    amountDA: number,
  ) {
    dispatch({ type: 'CLOSE_DECISION', id, outcome, date: today })
    if (outcome === 'resisted') {
      // An ordinary resist row: same category vocabulary the picker can
      // produce, same capped XP path, same IC contribution. The ledger renders
      // it as "Resisted" like any other.
      logPurchase(amountDA, 'Other', true, false, undefined, id)
    } else if (outcome === 'bought') {
      // Prefill, never auto-log: the app did not see a purchase, the user said
      // one happened. It goes in the form where the user confirms it, and the
      // link lands when the row does.
      pendingDecisionRef.current = { id, amountDA }
      setLogPrefill((cur) => ({ amountDA, seq: (cur?.seq ?? 0) + 1 }))
    } else {
      // "Waited" is a money non-event. Nothing is logged, nothing is paid, and
      // the record simply holds the answer.
      sfx.blip()
    }
  }

  /**
   * THE CHECK-BACK, ANSWERED. Fourteen days after a decision was closed as
   * "Bought it", the record asks one factual question about the object and
   * files the answer beside the projection it froze on the day.
   *
   * NOTHING CROSSES HERE (§12.1), and this is the shortest handler in the file
   * for exactly that reason: one dispatch, no XP, no grant, no health input, no
   * counter. It is the same discipline CLOSE_DECISION follows, one step further
   * out — a decision at least produces a money row on one of its three
   * branches; a check-back produces nothing at all. The blip is the ordinary
   * confirmation cue for a visible change (the buttons are replaced by the
   * answer), never information on its own (§10).
   */
  function answerCheckBack(id: string, answer: CheckBackAnswer) {
    // The hook's `today`, like every other date written in this render: the row
    // labels the answer's day back to the user, and a fresh clock read in the
    // minute after midnight would stamp a day the card does not believe it is.
    dispatch({ type: 'ANSWER_CHECK_BACK', id, answer, date: today })
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

  /**
   * THE CARD STACK.
   *
   * A keyed array rather than inline JSX, and the keys are the point: a card
   * that changes position inside a keyed list is MOVED by the reconciler
   * instead of unmounted and remounted, so its state, its focus effects and its
   * pending announcements survive the move. Nothing reorders today (see the
   * note below), but the structure is what a reorder would need, and the
   * alternative — two JSX slots for one card — silently drops focus to <body>
   * on the exact commit that moves it.
   *
   * ORDER IS ALSO THE §11 CORNER INDEX. Each card prints its own position
   * (HLT—01 … ARC—07) as decorative truth-telling (§1 trait 10), and App.test
   * asserts the printed run is 01..n in this order. That coupling is why the
   * order here is not conditional on state — see the note in App.test.
   */
  const cardStack = [
    <HeroCard
      key="health"
      stage={health.stage}
      score={health.score}
      pets={pets}
      components={health.components}
      // Trust Rule 5, both halves: the score names its own calibration state
      // under 90 days, AND names whose numbers it is scoring while the profile
      // is still DEMO_PROFILE. Same flag SimCard reads, so the score and the
      // simulator can never disagree about it.
      historyDays={loggedDays}
      isDemo={isDemo}
    />,
    <LogCard
      key="log"
      transactions={state.transactions}
      onLog={logPurchase}
      onUndo={undoLog}
      resistXpCapped={resistXpCapped}
      // Handed over by the decision record's "Bought it" (see closeDecision).
      // The card fills its amount field and takes focus, which is also the
      // focus hand-off for the button that just unmounted in the simulator.
      prefill={logPrefill}
    />,
    // THE ENGAGEMENT TRACK, AND IT IS NOT A CARD (see XpStrip). QST—03 was:
    // 404px, 7.7% of the phone document, one control, and that control paid for
    // a claim the app cannot observe. What is left is the level line and the
    // bar — about 90px — which is what the surface always was.
    //
    // IT IS STILL IN THE KEYED STACK, at the same position, because position 3
    // is between the app's primary action and its deepest engine and the stack
    // is where a card would go if one ever earned this slot back.
    <XpStrip key="xp" xp={state.xp} gain={xpGain} />,
    <BossCard key="boss" battle={battle} wonLastWeek={wonLastWeek} />,
    // "Got it" pays the day's readLesson grant directly now — the tap lands on
    // today's actual lesson content, so the app observes the action instead of
    // taking it on self-report, which is what made the deleted quest row
    // `verified` in the first place. The codex count beside it is all that
    // remains of the deleted collection sheet (see collectedLessons above).
    <LessonCard
      key="lesson"
      lesson={todayLesson}
      readToday={lessonReadToday}
      onRead={readLesson}
      collected={collectedLessons}
      total={LESSONS.length}
    />,
    // THE DECISION RECORD AND ITS CHECK-BACK ride inside this card rather than
    // becoming further surfaces: the simulator is the deepest engine in the
    // app, and the fix for a shallow surface over a deep engine is depth, not
    // breadth. See SimCard.
    <SimCard
      key="simulator"
      profile={profile}
      isDemo={isDemo}
      today={today}
      decisions={state.decisions}
      noteById={noteById}
      onRun={runSim}
      onClose={closeDecision}
      onCheckBack={answerCheckBack}
    />,
    <ProfileCard key="numbers" profile={state.profile} onSave={saveProfile} />,
    // Opens the archive half of the stack (see .archive-card's macro-break in
    // app.css) and, since the collection sheet was deleted, closes it too. The
    // month figures and the days inside them are ONE surface — see ArchiveCard
    // for why they stopped being two cards. Same `today` as every other date in
    // this render, and for the stronger reason: this card states which day of
    // the month it is and which group is headed "Today", so a fresh clock read
    // here would let the page say "Day 5 / 31" over a row it had just stamped
    // the 4th. It is handed transactions and a day and NOTHING else — no
    // profile, so no budget figure can ever reach it (§12.3/§12.6).
    <ArchiveCard key="archive" transactions={state.transactions} today={today} />,
  ]

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
          grant (lesson read, purchase logged) is never announced — sound would
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
        {cardStack}
      </main>

      {/* spec-sheet: §5 layout B, and the closing plate of the archive it sits
          under. The foot's only control is a plain .btn — no accent, no CTA
          plate — so the sheet closes at TWO tones here (Espresso field, Bone
          form) and the export button keeps exactly the depth it had: it draws
          `background: var(--field)`, so on the Bone foot it was already the
          card's own colour separated by a keyline, and it still is. The
          export-outcome bar stays Flare on Espresso at 4.41:1. */}
      <footer className="foot spec-sheet">
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
