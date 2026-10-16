import { useEffect, useRef, useState } from 'react'
import {
  CHARACTERS,
  WEEKS,
  advance as advanceWeek,
  availableChoices,
  characterById,
  choose,
  currentEvent,
  isGameState,
  isOver,
  newGame,
  summary,
  type CharacterId,
  type GameState,
  type Notice,
  weekDone,
} from '../../engine/monthGame.ts'
import { fmtDA } from '../../engine/money.ts'
import './hearthMonth.css'

/**
 * Hearth Month — a replayable, seeded month in someone else's life. A toy,
 * not financial data: the in-progress game lives in its own localStorage key,
 * outside the app state, and anything unreadable there just starts fresh.
 */

export const MONTH_GAME_KEY = 'ember-month-game-v1'

interface Saved {
  v: 1
  game: GameState
  /** True while the last choice's consequence is on screen (before "Next"). */
  showingOutcome: boolean
  plays: number
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(MONTH_GAME_KEY)
    if (!raw) return null
    const x = JSON.parse(raw) as Partial<Saved>
    if (!x || x.v !== 1 || !isGameState(x.game) || typeof x.showingOutcome !== 'boolean') {
      localStorage.removeItem(MONTH_GAME_KEY)
      return null
    }
    return { v: 1, game: x.game, showingOutcome: x.showingOutcome, plays: typeof x.plays === 'number' ? x.plays : 0 }
  } catch {
    try {
      localStorage.removeItem(MONTH_GAME_KEY)
    } catch {
      /* storage unavailable: play without saving */
    }
    return null
  }
}

function save(s: Saved | null): void {
  try {
    if (s) localStorage.setItem(MONTH_GAME_KEY, JSON.stringify(s))
    else localStorage.removeItem(MONTH_GAME_KEY)
  } catch {
    /* private mode / quota: the game still plays, it just won't resume */
  }
}

function freshSeed(base: number | undefined, plays: number): number {
  if (base !== undefined) return (base + plays * 7919) >>> 0
  // UI-side entropy is fine; the engine itself stays deterministic per seed.
  return Math.floor(Math.random() * 2 ** 32) >>> 0
}

/** The warmth ember: brightens and grows with warmth (0–100). */
function WarmthEmber({ warmth }: { warmth: number }) {
  const w = Math.max(0, Math.min(100, warmth)) / 100
  return (
    <svg className="hm-ember" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" style={{ ['--hm-w' as string]: w }}>
      <defs>
        <radialGradient id="hm-ember-g" cx="50%" cy="65%" r="55%">
          <stop offset="0%" stopColor="var(--peach)" />
          <stop offset="55%" stopColor="var(--amber)" />
          <stop offset="100%" stopColor="var(--flame)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="hm-ember-halo" cx="20" cy="22" r="17" fill="url(#hm-ember-g)" />
      <path
        className="hm-ember-flame"
        d="M20 8c4 6 9 9 9 16a9 9 0 0 1-18 0c0-5 3-7 5-11 1 3 2 4 4 5-1-4-1-7 0-10z"
        fill="var(--amber)"
      />
    </svg>
  )
}

function Meter({ label, value, max, text, tone }: { label: string; value: number; max: number; text: string; tone: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className={`hm-meter hm-${tone}`}>
      <span className="hm-meter-k">{label}</span>
      <span className="hm-meter-v mono">{text}</span>
      <span className="hm-track" aria-hidden="true">
        <span className="hm-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

function NoticeList({ notices, label }: { notices: Notice[]; label: string }) {
  if (notices.length === 0) return null
  return (
    <div className="hm-notices">
      <p className="hm-notices-k">{label}</p>
      <ul>
        {notices.map((n, i) => (
          <li key={i} className={`hm-notice hm-n-${n.kind}`}>
            {n.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HearthMonth({ seed }: { seed?: number } = {}) {
  const [saved, setSaved] = useState<Saved | null>(() => load())
  const [announce, setAnnounce] = useState('')
  const plays = useRef(saved?.plays ?? 0)
  const focusRef = useRef<HTMLElement | null>(null)
  const wantFocus = useRef(false)

  useEffect(() => save(saved), [saved])
  useEffect(() => {
    if (wantFocus.current && focusRef.current) {
      focusRef.current.focus()
      wantFocus.current = false
    }
  })

  const setFocusTarget = (el: HTMLElement | null) => {
    focusRef.current = el
  }

  function start(id: CharacterId) {
    plays.current += 1
    const game = newGame(id, freshSeed(seed, plays.current))
    const c = characterById(id)
    wantFocus.current = true
    setSaved({ v: 1, game, showingOutcome: false, plays: plays.current })
    setAnnounce(`A month as ${c?.name ?? id} begins. Week 1 of ${WEEKS}.`)
  }

  function pick(choiceId: string) {
    if (!saved) return
    const next = choose(saved.game, choiceId)
    if (next === saved.game) return
    wantFocus.current = true
    setSaved({ ...saved, game: next, showingOutcome: true })
    const o = next.lastOutcome
    setAnnounce([o?.text, ...(o?.notes ?? [])].filter(Boolean).join(' '))
  }

  function advance() {
    if (!saved) return
    const g = weekDone(saved.game) ? advanceWeek(saved.game) : saved.game
    wantFocus.current = true
    setSaved({ ...saved, game: g, showingOutcome: false })
    if (isOver(g)) setAnnounce(`The month is over: ${summary(g).title}.`)
    else if (g !== saved.game) setAnnounce([`Week ${g.week} of ${WEEKS}.`, ...g.notices.map((n) => n.text)].join(' '))
    else setAnnounce('')
  }

  function playAgain() {
    if (!saved) return
    start(saved.game.characterId)
  }

  function anotherLife() {
    wantFocus.current = true
    setSaved(null)
    setAnnounce('Choose a life to play.')
  }

  const game = saved?.game ?? null
  const char = game ? characterById(game.characterId) : null

  let body: JSX.Element
  if (!game || !char) {
    body = (
      <>
        <p className="support-lead">
          Live one month of someone else's life in DA — rent, bills, Eid, a friend who needs a loan. No way to lose:
          just choices, and what they traded.
        </p>
        <h3 className="hm-h3" tabIndex={-1} ref={setFocusTarget}>
          Choose a life
        </h3>
        <ul className="hm-chars">
          {CHARACTERS.map((c) => (
            <li key={c.id}>
              <button type="button" className="hm-char" onClick={() => start(c.id)}>
                <span className="hm-char-name">{c.name}</span>
                <span className="hm-char-who">{c.who}</span>
                <span className="hm-char-sit">{c.situation}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  } else if (isOver(game)) {
    const s = summary(game)
    body = (
      <div className="hm-summary">
        <p className="hm-eyebrow">End of {char.name}'s month</p>
        <h3 className="hm-title" tabIndex={-1} ref={setFocusTarget}>
          {s.title}
        </h3>
        <p className="hm-title-line">{s.titleLine}</p>
        <NoticeList notices={game.notices} label="As the month turned" />
        <dl className="hm-stats">
          <div>
            <dt>Cash</dt>
            <dd className="mono">{fmtDA(s.cash)}</dd>
          </div>
          <div>
            <dt>Jar</dt>
            <dd className="mono">
              {fmtDA(s.jar)}
              <span className="hm-delta">
                {' '}
                ({s.jarDelta >= 0 ? '+' : '−'}
                {fmtDA(Math.abs(s.jarDelta))})
              </span>
            </dd>
          </div>
          <div>
            <dt>Bills handled</dt>
            <dd className="mono">
              {s.billsPaid} of {s.billsTotal}
            </dd>
          </div>
          <div>
            <dt>Warmth</dt>
            <dd className="mono">{s.warmth}</dd>
          </div>
          {s.owed > 0 && (
            <div>
              <dt>Owed to family</dt>
              <dd className="mono">{fmtDA(s.owed)}</dd>
            </div>
          )}
          {s.owedToMe > 0 && (
            <div>
              <dt>Lent, still out</dt>
              <dd className="mono">{fmtDA(s.owedToMe)}</dd>
            </div>
          )}
        </dl>
        {s.catchUp.length > 0 && (
          <div className="hm-list">
            <p className="hm-notices-k">Catch-up for next month</p>
            <ul>
              {s.catchUp.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {s.ahead.length > 0 && (
          <div className="hm-list">
            <p className="hm-notices-k">Already on next month</p>
            <ul>
              {s.ahead.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <h4 className="hm-h4">What this month taught</h4>
        <ul className="hm-lessons">
          {s.lessons.map((l) => (
            <li key={l.nodeId}>
              <a href={`#/learn?node=${l.nodeId}`} className="hm-lesson">
                {l.text}
                <span className="hm-lesson-go" aria-hidden="true">
                  {' '}
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="hm-forecast">Forecasts, not verdicts: a different week of luck would tell a different story.</p>
        <div className="hm-actions">
          <button type="button" className="btn btn-flame" onClick={playAgain}>
            Play again
          </button>
          <button type="button" className="btn" onClick={anotherLife}>
            Try another life
          </button>
        </div>
      </div>
    )
  } else {
    const ev = currentEvent(game)
    const choices = availableChoices(game)
    const between = weekDone(game)
    const outcome = saved?.showingOutcome || between ? game.lastOutcome : null
    const shownWeek = game.week
    const jarMax = Math.max(10_000 * char.scale, char.startJar * 2, game.jar)
    const cashMax = Math.max(60_000 * char.scale, game.cash)
    body = (
      <>
        <div className="hm-top">
          <p className="hm-who">
            <strong>{char.name}</strong> <span>{char.who}</span>
          </p>
          <ol className="hm-weeks" aria-label={`Week ${Math.min(shownWeek, WEEKS)} of ${WEEKS}`}>
            {Array.from({ length: WEEKS }, (_, i) => i + 1).map((w) => (
              <li
                key={w}
                className={w < shownWeek ? 'is-done' : w === shownWeek ? 'is-now' : ''}
                aria-current={w === shownWeek ? 'step' : undefined}
              >
                <span className="sr-only">Week {w}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="hm-meters">
          <Meter label="Cash" value={game.cash} max={cashMax} text={fmtDA(game.cash)} tone="cash" />
          <Meter label="Jar" value={game.jar} max={jarMax} text={fmtDA(game.jar)} tone="jar" />
          <div className="hm-meter hm-warmth">
            <span className="hm-meter-k">Warmth</span>
            <span className="hm-warmth-row">
              <WarmthEmber warmth={game.warmth} />
              <span className="hm-meter-v mono">{game.warmth}</span>
            </span>
          </div>
        </div>
        {(game.owed > 0 || game.owedToMe > 0) && (
          <p className="hm-ious">
            {game.owed > 0 && <span>You owe family {fmtDA(game.owed)}</span>}
            {game.owedToMe > 0 && <span>Lent out {fmtDA(game.owedToMe)}</span>}
          </p>
        )}
        {outcome ? (
          <div className="hm-outcome">
            <p className="hm-outcome-text">{outcome.text}</p>
            {outcome.notes.map((n) => (
              <p key={n} className="hm-outcome-note">
                {n}
              </p>
            ))}
            <button type="button" className="btn btn-gold" onClick={advance} ref={setFocusTarget}>
              {!between ? 'Next' : game.week >= WEEKS ? 'See how the month went' : `On to week ${game.week + 1}`}
            </button>
          </div>
        ) : (
          ev && (
            <>
              {game.eventIdx === 0 && <NoticeList notices={game.notices} label={`Week ${game.week} begins`} />}
              <article className="hm-event">
                <h3 className="hm-event-title" tabIndex={-1} ref={setFocusTarget}>
                  {ev.title}
                </h3>
                <p className="hm-story">{ev.story}</p>
                <div className="hm-choices" role="group" aria-label="Your choice">
                  {choices.map((c) => (
                    <button key={c.id} type="button" className="hm-choice" onClick={() => pick(c.id)}>
                      <span className="hm-choice-label">{c.label}</span>
                      {c.hints.length > 0 && <span className="hm-choice-hints">{c.hints.join(' · ')}</span>}
                    </button>
                  ))}
                </div>
              </article>
            </>
          )
        )}
      </>
    )
  }

  return (
    <section className="card wide hearth-month" aria-labelledby="hm-heading">
      <h2 id="hm-heading">Hearth Month</h2>
      {body}
      <p className="sr-only" aria-live="polite" role="status">
        {announce}
      </p>
    </section>
  )
}
