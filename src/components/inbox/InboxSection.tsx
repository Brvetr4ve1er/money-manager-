import { useCallback, useEffect, useRef, useState } from 'react'
import type { RouteProps } from '../../routes/types.ts'
import type { InboxCandidate } from '../../state/slices/inbox.ts'
import { liveAccounts } from '../../engine/money.ts'
import { alreadyLogged } from '../../engine/inbox/dedupe.ts'
import { PasteCard } from './PasteCard.tsx'
import { GmailNote } from './GmailNote.tsx'
import { Slip, SlipFace, type Leave } from './Slip.tsx'
import './inbox.css'

const LEAVE_MS = 650

function motionOk(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: no-preference)').matches
}

/** Newest purchase first; id breaks ties so the order is stable. */
const byDateDesc = (a: InboxCandidate, b: InboxCandidate) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/**
 * Inbox on the Me room: paste a message, review what was read. The tray is
 * the only door to the ledger — every slip shows its evidence and waits for
 * the user's Confirm or Reject. Nothing is ever read automatically.
 */
export function InboxSection({ state, dispatch }: RouteProps) {
  const fx = state.money.settings.fxDaPerUsd
  const accounts = liveAccounts(state.money)
  const pending = state.inbox.candidates.filter((c) => c.status === 'pending' && !c.cleared)
  const handled = state.inbox.candidates.filter((c) => c.status !== 'pending' && !c.cleared).length

  // Resolved slips linger briefly as inert ghosts so they can glide out.
  const [ghosts, setGhosts] = useState<Array<{ c: InboxCandidate; how: Leave }>>([])
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const drop = useCallback((id: string) => setGhosts((g) => g.filter((x) => x.c.id !== id)), [])
  const onLeave = useCallback(
    (c: InboxCandidate, how: Leave) => {
      if (!motionOk()) return
      setGhosts((g) => [...g.filter((x) => x.c.id !== c.id), { c, how }])
      timers.current.push(window.setTimeout(() => drop(c.id), LEAVE_MS + 100))
    },
    [drop],
  )

  const rows = [
    ...pending.map((c) => ({ c, ghost: null as Leave | null })),
    ...ghosts.filter((g) => !pending.some((p) => p.id === g.c.id)).map((g) => ({ c: g.c, ghost: g.how })),
  ].sort((a, b) => byDateDesc(a.c, b.c))

  return (
    <section className="card inbox wide" aria-labelledby="inbox-title">
      <h2 id="inbox-title">Inbox</h2>
      <div className="inbox-grid">
        <div className="inbox-side">
          <PasteCard inbox={state.inbox} dispatch={dispatch} />
          <GmailNote />
        </div>
        <div className="inbox-tray">
          <h3 className="inbox-tray-title">Review tray</h3>
          <p className="inbox-lede">
            {pending.length === 0
              ? 'Nothing waiting. Ember never reads your messages on its own — paste a receipt and it lands here for you to confirm or reject.'
              : `${pending.length} ${pending.length === 1 ? 'slip' : 'slips'} to review. Each is a claim with its evidence — nothing is stored until you say so.`}
          </p>
          {rows.length > 0 && (
            <ul className="slips">
              {rows.map(({ c, ghost }) =>
                ghost ? (
                  <li key={c.id} className={`slip is-leaving leave-${ghost}`} aria-hidden="true" onAnimationEnd={() => drop(c.id)}>
                    <SlipFace c={c} fx={fx} />
                  </li>
                ) : (
                  <Slip
                    key={c.id}
                    c={c}
                    fx={fx}
                    accounts={accounts}
                    logged={alreadyLogged(c, state.transactions, fx)}
                    dispatch={dispatch}
                    onLeave={onLeave}
                  />
                ),
              )}
            </ul>
          )}
          {handled > 0 && (
            <button
              type="button"
              className="btn inbox-clear"
              onClick={() => dispatch({ type: 'inbox/clear-resolved', nowISO: new Date().toISOString() })}
            >
              Clear handled ({handled})
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
