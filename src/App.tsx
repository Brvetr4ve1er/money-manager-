/**
 * App is composition only: it owns persistence, the day clock (useHealthDay),
 * reward reactions (useRewards) and the room switch. Each room lives in
 * src/routes/ and owns its own cards, so features land as modules instead of
 * effects in one growing file.
 */

import { useEffect, useReducer } from 'react'
import { RESIST_XP_DAILY_CAP } from './engine/xp.ts'
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
import { HeroShell } from './components/HeroShell.tsx'
import { HeroCard } from './components/HeroCard.tsx'
import { XpCard } from './components/XpCard.tsx'
import { LogCard } from './components/LogCard.tsx'
import { QuestCard } from './components/QuestCard.tsx'
import { ProfileCard, type ProfileDraft } from './components/ProfileCard.tsx'
import { Ledger } from './components/Ledger.tsx'
import { NeedsCard } from './components/NeedsCard.tsx'
import { BrakesCard } from './components/BrakesCard.tsx'
import { TrustedCard } from './components/TrustedCard.tsx'
import { ReentryBanner } from './components/ReentryBanner.tsx'
import type { LogOutcome } from './components/LogCard.tsx'
import { holdPurchase, shouldHold, spendVelocity } from './engine/brakes.ts'
import { catchUpTransaction } from './engine/calm.ts'
import { useHealthDay } from './hooks/useHealthDay.ts'
import { useRoute } from './routes/router.ts'
import { Dock } from './components/Dock.tsx'
import { RunwayRoute } from './routes/Runway.tsx'
import { JarsRoute } from './routes/Jars.tsx'
import { LearnRoute } from './routes/Learn.tsx'
import { SocialSection } from './components/social/SocialSection.tsx'
import { InboxSection } from './components/inbox/InboxSection.tsx'
import type { RouteProps } from './routes/types.ts'
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
  // Brake edit-lock clock: a loosening scheduled 48h ago must land without a
  // reload. The reducer returns the same state when nothing is due, so the
  // minute tick is render-free almost always.
  useEffect(() => {
    const tick = () => dispatch({ type: 'BRAKES_TICK', nowISO: new Date().toISOString() })
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const { today, health } = useHealthDay(state, dispatch)
  const route = useRoute()
  const { support } = state
  // Pace vs. the user's own baseline (see brakes.ts). Pure over the ledger;
  // the Ledger card phrases it, and only when it has something to say.
  const velocity = spendVelocity(state.transactions, today)
  // Badge predicates run over the same state every card renders from; the
  // hook persists any newly-earned ids stamped with the hook's `today` (the
  // day every other write in this render believes it is), and the unlock
  // toast + sparkle react to the persisted change in useRewards.
  useAchievements(state, dispatch, today)
  const { toast, xpGain } = useRewards(state)
  // Computed once: the hero shell and the hero card both show the companions
  // and must always agree on the shelf.
  const pets = unlockedPets(state.achievements)
  function logPurchase(
    amountDA: number,
    category: string,
    resisted: boolean,
    impulseFlagged: boolean,
  ): LogOutcome {
    // Hold the door: a purchase matching the user's own brake is queued, not
    // logged — no row, no XP, no score input until the wait passes and the
    // user decides again (see brakes.ts). Resists are never held: resisting
    // IS the brake working.
    if (!resisted && support.brakes !== null && shouldHold(amountDA, category, support.brakes)) {
      const held = holdPurchase(
        { id: newId(), amountDA, category, impulseFlagged },
        support.brakes,
        Date.now(),
      )
      dispatch({ type: 'HOLD_TX', held })
      sfx.blip()
      return { id: held.id, heldHours: support.brakes.delayHours }
    }
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
      // Exact time: account estimates compare it against the balance anchor.
      at: new Date().toISOString(),
    }
    dispatch({ type: 'LOG_TX', tx })
    if (resisted) sfx.sparkle()
    else sfx.blip()
    // The id is LogCard's undo handle for the grace window.
    return { id: tx.id, heldHours: null }
  }

  function undoLog(id: string) {
    // Row and XP grant leave together (see UNDO_TX in the reducer). The blip
    // reinforces the visible change — the ledger row and undo strip vanish.
    // A just-held purchase has no row: the same handle lets it go instead
    // (each reducer path no-ops on an id it does not own).
    dispatch({ type: 'UNDO_TX', id })
    dispatch({ type: 'LET_GO_HELD', id })
    sfx.blip()
  }

  const nowISO = () => new Date().toISOString()

  function catchUp(amountDA: number) {
    // One honest lump for the days away, then the banner goes. Pays the
    // ordinary +5 like any log — showing up after a gap is still showing up.
    dispatch({ type: 'LOG_TX', tx: catchUpTransaction(newId(), amountDA, today) })
    dispatch({ type: 'REENTRY_DISMISS' })
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

  // Cards every mode shows. The low-energy view (see calm.ts) is a strict
  // subset — what is waiting, what to log, what happened — never a
  // different app: the same cards in the same places, with the engagement
  // track (XP, quests, boss, lessons, badges) simply not drawn.
  const brakesCard = (
    <BrakesCard
      rule={support.brakes}
      pending={support.pendingBrakes}
      held={support.held}
      onRequest={(rule) => dispatch({ type: 'BRAKES_REQUEST', rule, nowISO: nowISO() })}
      onRelease={(id) => {
        dispatch({ type: 'RELEASE_HELD', id, date: today })
        sfx.blip()
      }}
      onLetGo={(id) => {
        dispatch({ type: 'LET_GO_HELD', id })
        sfx.blip()
      }}
    />
  )
  const needsCard = (
    <NeedsCard
      needs={support.needs}
      lowEnergy={support.lowEnergy}
      calm={support.calm}
      onSave={(needs) => dispatch({ type: 'NEEDS_SET', needs, nowISO: nowISO() })}
      onLowEnergy={(on) => dispatch({ type: 'LOW_ENERGY_SET', on, nowISO: nowISO() })}
      onCalm={(on) => dispatch({ type: 'CALM_SET', on, nowISO: nowISO() })}
    />
  )

  const routeProps: RouteProps = { state, dispatch, today, health }

  return (
    // data-calm: no animation, no transitions, no visual toast (app.css).
    // The live regions still announce — calm is about surprises, not AT.
    <div className="shell" data-calm={support.calm ? 'true' : undefined}>
      {/* The header carries the page's h1 wordmark: without it the
          accessibility outline starts at the dynamic stage label with no
          page-level heading. Mobile topbar and desktop full-viewport hero
          are the same DOM — see HeroShell. */}
      <HeroShell
        stage={health.stage}
        score={health.score}
        pets={pets}
        muted={state.muted}
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

      {/* <main> landmark: the current room's cards. Rooms switch by hash
          (#/home, #/runway, #/jars, #/learn, #/me) — see routes/router.ts. */}
      <main className="main-stack" data-route={route}>
        {route === 'home' && (
          <>
            {support.reentry && (
              <ReentryBanner
                reentry={support.reentry}
                onCatchUp={catchUp}
                onSkip={() => dispatch({ type: 'REENTRY_DISMISS' })}
              />
            )}
            {support.lowEnergy && (
              <p className="mode-strip" role="status">
                Low-energy view: just the essentials.{' '}
                <button
                  type="button"
                  className="btn undo-btn"
                  onClick={() => dispatch({ type: 'LOW_ENERGY_SET', on: false, nowISO: nowISO() })}
                >
                  Show everything
                </button>
              </p>
            )}
            <HeroCard
              stage={health.stage}
              score={health.score}
              pets={pets}
              components={health.components}
              puff={xpGain !== null}
            />
            {!support.lowEnergy && <XpCard xp={state.xp} gain={xpGain} />}
            <LogCard
              transactions={state.transactions}
              onLog={logPurchase}
              onUndo={undoLog}
              resistXpCapped={
                state.transactions.filter((t) => t.resistedImpulse && t.date === today).length >=
                RESIST_XP_DAILY_CAP
              }
            />
            {/* The held queue is money in limbo — visible on Home in every mode. */}
            {support.held.length > 0 && brakesCard}
            {!support.lowEnergy && (
              <QuestCard quests={state.quests} onComplete={(id) => dispatch({ type: 'COMPLETE_QUEST', id })} />
            )}
            <Ledger
              transactions={state.transactions}
              today={today}
              velocity={velocity}
              trustedName={support.trusted?.name ?? null}
            />
          </>
        )}
        {route === 'runway' && <RunwayRoute {...routeProps} />}
        {route === 'jars' && <JarsRoute {...routeProps} />}
        {route === 'learn' && <LearnRoute {...routeProps} />}
        {route === 'me' && (
          <>
            <ProfileCard profile={state.profile} onSave={saveProfile} />
            {needsCard}
            {support.held.length === 0 && brakesCard}
            <TrustedCard
              trusted={support.trusted}
              input={{
                transactions: state.transactions,
                held: support.held,
                velocity,
                health: { score: health.score, stage: health.stage },
                today,
              }}
              onSave={(trusted) => dispatch({ type: 'TRUSTED_SET', trusted, nowISO: nowISO() })}
            />
            <SocialSection {...routeProps} />
            <InboxSection {...routeProps} />
            <section className="card foot-card">
              <h2>Your data</h2>
              <div className="foot">
                <button className="btn" onClick={downloadExport}>Export my data</button>
                <span className="foot-note">Your data leaves when you do — full export, always.</span>
              </div>
            </section>
          </>
        )}
      </main>

      <Dock route={route} badges={{ me: 0, home: support.held.length }} />
    </div>
  )
}
