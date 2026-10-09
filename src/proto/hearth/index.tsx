/**
 * HEARTH — warm futurism / solarpunk. The app is your home at dusk: the
 * breathing room is an ember in the hearth, every obligation is a light in
 * the room, and the review tray is a stack of paper slips that warm into the
 * ledger when you confirm them.
 */

import { useEffect, useState, type FormEvent } from 'react'
import {
  ACCOUNTS, CANDIDATES, DAYS_TO_PAYDAY, FX_DA_PER_USD, MONTHLY_INCOME_DA, OBLIGATIONS, PAYDAY,
  REPEAT_CHIPS, TODAY, TOTAL_HOLDINGS_DA, TRANSACTIONS, fmtDA, fmtMoney, toDA,
  type Candidate, type Obligation, type ObligationStatus, type Transaction,
} from '../data.ts'
import { Ember, Icon, RoomObject, type ObjectKind, type ObjectState } from './objects.tsx'
import './hearth.css'

type Screen = 'home' | 'runway' | 'tray' | 'log'
type Theme = 'auto' | 'dark' | 'light'

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CATEGORIES = ['coffee', 'transport', 'bread', 'groceries', 'games', 'apps', 'fees', 'shopping', 'other']

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}
function ago(iso: string): string {
  const n = daysBetween(iso, TODAY)
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const STATUS_LABEL: Record<ObligationStatus, string> = {
  paid: 'lit · paid',
  due_soon: 'due soon',
  upcoming: 'upcoming',
  late: 'went out',
  estimated: 'estimated',
}
const STATE_OF: Record<ObligationStatus, ObjectState> = {
  paid: 'lit',
  due_soon: 'flicker',
  upcoming: 'dim',
  late: 'out',
  estimated: 'hazy',
}
const FLAG_TEXT: Record<NonNullable<Candidate['flag']>, string> = {
  duplicate: 'Two emails, one purchase. Confirming stores it once.',
  not_a_charge: 'A renewal notice, not a charge. Netflix bills on 20 Oct.',
  promo: 'A promotion for $0. Nothing was charged.',
}

function kindOf(o: Obligation): ObjectKind {
  if (o.id === 'rent') return 'window'
  if (o.kind === 'variable') return 'plant'
  if (o.kind === 'installment') return 'ring'
  return 'lantern'
}

export default function Hearth() {
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  const [screen, setScreen] = useState<Screen>('home')
  const [theme, setTheme] = useState<Theme>('auto')
  const [paid, setPaid] = useState<Set<string>>(
    () => new Set(OBLIGATIONS.filter((o) => o.status === 'paid').map((o) => o.id)),
  )
  const [candidates, setCandidates] = useState<Candidate[]>(CANDIDATES)
  const [leaving, setLeaving] = useState<Record<string, 'warm' | 'fade'>>({})
  const [txs, setTxs] = useState<Transaction[]>(TRANSACTIONS)
  const [redotConfirmed, setRedotConfirmed] = useState(false)
  const [litJustNow, setLitJustNow] = useState<string | null>(null)

  const statusOf = (o: Obligation): ObligationStatus =>
    paid.has(o.id) ? 'paid' : o.status === 'paid' ? 'upcoming' : o.status

  const localSpend = txs.filter((t) => !TRANSACTIONS.includes(t)).reduce((s, t) => s + toDA(t.amount, t.currency), 0)
  const dueAhead = OBLIGATIONS.filter((o) => !paid.has(o.id) && o.dueDate <= PAYDAY)
    .reduce((s, o) => s + toDA(o.amount, o.currency), 0)
  const room = TOTAL_HOLDINGS_DA - localSpend - dueAhead
  const perDay = Math.floor(room / DAYS_TO_PAYDAY)
  const warmth = Math.min(1, Math.max(0.12, room / (MONTHLY_INCOME_DA * 0.5)))

  const togglePaid = (id: string) => {
    setPaid((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else {
        next.add(id)
        setLitJustNow(id)
        window.setTimeout(() => setLitJustNow((cur) => (cur === id ? null : cur)), 900)
      }
      return next
    })
  }

  const settle = (c: Candidate, how: 'warm' | 'fade') => {
    setLeaving((l) => ({ ...l, [c.id]: how }))
    window.setTimeout(() => {
      setCandidates((cs) => cs.filter((x) => x.id !== c.id))
      if (how === 'warm') {
        setTxs((t) => [{
          id: `in-${c.id}`, amount: c.amount, currency: c.currency, category: c.suggestedCategory,
          merchant: c.merchant, date: c.date, account: c.currency === 'USD' ? 'redotpay' : 'cash', source: 'inbox',
        }, ...t])
      }
    }, 560)
  }

  const addLog = (amount: number, category: string, account: 'cash' | 'redotpay') => {
    if (!(amount > 0)) return
    setTxs((t) => [{
      id: `log-${Date.now()}`, amount, currency: account === 'cash' ? 'DA' : 'USD', category,
      merchant: 'Quick log', date: TODAY, account, source: 'manual',
    }, ...t])
  }

  const nextTheme: Record<Theme, Theme> = { auto: 'dark', dark: 'light', light: 'auto' }
  const unpaid = OBLIGATIONS.filter((o) => statusOf(o) !== 'paid').sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return (
    <div className="proto-hearth" data-theme={theme} data-screen={screen}>
      <div className="sky" aria-hidden="true" />
      <header className="top">
        <a href="#/proto" className="back"><Icon name="back" size={16} /> prototypes</a>
        <span className="eyebrow">Thursday {fmtDate(TODAY)} · dusk</span>
        <button className="icon-btn" onClick={() => setTheme(nextTheme[theme])} aria-label={`Theme: ${theme}. Switch.`}>
          <Icon name={theme === 'auto' ? 'auto' : theme === 'dark' ? 'moon' : 'sun'} size={18} />
        </button>
      </header>

      <div className="room">
        <aside className="hearth-col">
          <section className="hero">
            <div className="ember-wrap"><Ember warmth={warmth} /></div>
            <p className="eyebrow">Breathing room · a forecast, not a verdict</p>
            <p className="hero-num">{fmtDA(room)}</p>
            <p className="hero-sub">
              <strong>{fmtDA(perDay)}</strong> a day · <strong>{DAYS_TO_PAYDAY} days</strong> to payday, {fmtDate(PAYDAY)}
            </p>
          </section>

          <section className="accounts" aria-label="Accounts">
            {ACCOUNTS.map((a) => {
              const usd = a.currency === 'USD'
              const typed = a.kind === 'manual' || redotConfirmed
              return (
                <article key={a.id} className="glass account">
                  <div className="row">
                    <span className="eyebrow">{a.name}</span>
                    <span className={`pill ${typed ? 'pill-lit' : ''}`}>{typed ? 'typed by you' : 'estimated'}</span>
                  </div>
                  <p className="acc-num">{fmtMoney(a.estimatedBalance, a.currency)}</p>
                  {usd && <p className="acc-sub">≈ {fmtDA(toDA(a.estimatedBalance, 'USD'))} at your rate of {FX_DA_PER_USD} DA/$</p>}
                  <p className="acc-meta">
                    {typed ? `confirmed ${redotConfirmed && usd ? 'today' : ago(a.anchorDate)}` : `anchor ${fmtMoney(a.anchorBalance, 'USD')} minus email spend · last confirmed ${ago(a.anchorDate)}`}
                  </p>
                  {usd && !redotConfirmed && (
                    <button className="btn btn-soft" onClick={() => setRedotConfirmed(true)}>Confirm balance</button>
                  )}
                </article>
              )
            })}
          </section>
        </aside>

        <main className="stage" key={screen}>
          {screen === 'home' && (
            <HomeRoom unpaid={unpaid} statusOf={statusOf} togglePaid={togglePaid} litJustNow={litJustNow}
              trayCount={candidates.length} go={setScreen} />
          )}
          {screen === 'runway' && (
            <Runway room={room} statusOf={statusOf} togglePaid={togglePaid} litJustNow={litJustNow} />
          )}
          {screen === 'tray' && <Tray candidates={candidates} leaving={leaving} settle={settle} />}
          {screen === 'log' && <LogSheet txs={txs} addLog={addLog} close={() => setScreen('home')} />}
        </main>
      </div>

      <nav className="dock" aria-label="Screens">
        {(['home', 'runway', 'tray', 'log'] as const).map((s) => (
          <button key={s} className={`dock-btn ${screen === s ? 'is-on' : ''}`} onClick={() => setScreen(s)} aria-current={screen === s ? 'page' : undefined}>
            <Icon name={s} />
            <span>{s}</span>
            {s === 'tray' && candidates.length > 0 && <i className="badge">{candidates.length}</i>}
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ------------------------------------------------------------------ Home */

interface RoomProps {
  statusOf: (o: Obligation) => ObligationStatus
  togglePaid: (id: string) => void
  litJustNow: string | null
}

function HomeRoom({ unpaid, statusOf, togglePaid, litJustNow, trayCount, go }:
  RoomProps & { unpaid: Obligation[]; trayCount: number; go: (s: Screen) => void }) {
  const next = unpaid.slice(0, 3)
  return (
    <>
      <section className="block">
        <h2 className="h">In the room</h2>
        <p className="lede">Every bill is a light in the house. Paid ones glow, the next ones wait, and one has gone out.</p>
        <ul className="shelf">
          {next.map((o) => {
            const st = statusOf(o)
            return (
              <li key={o.id} className={`glass obj-card st-${st} ${litJustNow === o.id ? 'bloom' : ''}`}>
                <RoomObject kind={kindOf(o)} state={STATE_OF[st]} progress={o.progress} />
                <div className="obj-text">
                  <strong>{o.name}</strong>
                  <span className="mute">
                    {st === 'late' ? `quiet since ${fmtDate(o.dueDate)}` : `${fmtDate(o.dueDate)} · ${STATUS_LABEL[st]}`}
                  </span>
                  <span className="amt">{fmtMoney(o.amount, o.currency)}</span>
                </div>
                <button className={`btn ${st === 'late' ? 'btn-warm' : 'btn-soft'}`} onClick={() => togglePaid(o.id)}>
                  {st === 'late' ? 'Relight?' : 'Light it'}
                </button>
              </li>
            )
          })}
        </ul>
        {next.some((o) => statusOf(o) === 'late') && (
          <p className="whisper">The gym lantern went out on 5 Oct. No rush — relight it when it is paid.</p>
        )}
      </section>

      <section className="block">
        <h2 className="h">Elsewhere in the house</h2>
        <div className="doors">
          <button className="glass door" onClick={() => go('runway')}>
            <Icon name="runway" /><strong>Runway</strong><span className="mute">{DAYS_TO_PAYDAY} days · {unpaid.length} lights ahead</span>
          </button>
          <button className="glass door" onClick={() => go('tray')}>
            <Icon name="tray" /><strong>Review tray</strong><span className="mute">{trayCount === 0 ? 'nothing waiting' : `${trayCount} slips waiting`}</span>
          </button>
          <button className="glass door" onClick={() => go('log')}>
            <Icon name="log" /><strong>Quick log</strong><span className="mute">coffee is one tap</span>
          </button>
        </div>
      </section>
    </>
  )
}

/* ---------------------------------------------------------------- Runway */

function Runway({ room, statusOf, togglePaid, litJustNow }: RoomProps & { room: number }) {
  const sorted = [...OBLIGATIONS].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const firstAhead = sorted.findIndex((o) => o.dueDate >= TODAY)
  return (
    <section className="block">
      <h2 className="h">Runway</h2>
      <p className="lede">A thread of light from tonight to payday. Tap a light to mark it paid; the ember answers.</p>
      <p className="runway-room"><span className="eyebrow">Breathing room now</span><strong>{fmtDA(room)}</strong></p>
      <ol className="thread">
        {sorted.map((o, i) => {
          const st = statusOf(o)
          const behind = o.dueDate < TODAY
          const usd = o.currency === 'USD'
          return (
            <li key={o.id} className={`node st-${st} ${behind ? 'behind' : ''}`}>
              {i === firstAhead && <div className="marker"><i /><span>Tonight · {fmtDate(TODAY)}</span></div>}
              <div className={`node-row ${litJustNow === o.id ? 'bloom' : ''}`}>
                <span className="knot"><RoomObject kind={kindOf(o)} state={STATE_OF[st]} progress={o.progress} size={44} /></span>
                <button className="glass node-body" onClick={() => togglePaid(o.id)} aria-pressed={st === 'paid'}>
                  <span className="row">
                    <strong>{o.name}</strong>
                    <span className="amt">{fmtMoney(o.amount, o.currency)}{usd && <small> ≈ {fmtDA(toDA(o.amount, 'USD'))}</small>}</span>
                  </span>
                  <span className="row meta">
                    <span>{fmtDate(o.dueDate)}{behind ? ' · behind us' : ''}</span>
                    <span className={`pill ${st === 'paid' ? 'pill-lit' : ''}`}>{STATUS_LABEL[st]}</span>
                  </span>
                  {o.history && (
                    <span className="hist">
                      {o.history.map((h, j) => <em key={j} style={{ height: 6 + (h / 5300) * 18 }} title={fmtDA(h)} />)}
                      <span className="mute">last three: {o.history.map((h) => h.toLocaleString('en-US')).join(' · ')} · real amount lands on the bill</span>
                    </span>
                  )}
                  {o.progress && <span className="mute">{o.progress.paid} of {o.progress.total} paid · {o.progress.total - o.progress.paid} to go</span>}
                </button>
              </div>
            </li>
          )
        })}
        <li className="node payday">
          <div className="marker"><i /><span>Payday · {fmtDate(PAYDAY)} · +{fmtDA(MONTHLY_INCOME_DA)}</span></div>
        </li>
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------ Tray */

function Tray({ candidates, leaving, settle }:
  { candidates: Candidate[]; leaving: Record<string, 'warm' | 'fade'>; settle: (c: Candidate, how: 'warm' | 'fade') => void }) {
  return (
    <section className="block">
      <h2 className="h">Review tray</h2>
      <p className="lede">
        {candidates.length === 0
          ? 'Nothing waiting. The slips you confirmed are in the ledger.'
          : `${candidates.length} slips read from your inbox. Each is a claim with its evidence — nothing is stored until you say so.`}
      </p>
      <ul className="slips">
        {candidates.map((c) => {
          const usd = c.currency === 'USD'
          const dup = c.flag === 'duplicate'
          return (
            <li key={c.id} className={`slip ${leaving[c.id] ? `leave-${leaving[c.id]}` : ''}`}>
              <div className="row">
                <strong>{c.merchant}</strong>
                <span className="amt">{fmtMoney(c.amount, c.currency)}{usd && c.amount > 0 && <small> ≈ {fmtDA(toDA(c.amount, 'USD'))}</small>}</span>
              </div>
              <div className="row meta">
                <span>{fmtDate(c.date)} · {c.suggestedCategory}</span>
                <span className="conf" title={`parser confidence ${Math.round(c.confidence * 100)}%`}>
                  <i style={{ width: `${c.confidence * 100}%` }} />
                  <span>{Math.round(c.confidence * 100)}% sure</span>
                </span>
              </div>
              {c.flag && <p className="flag">{FLAG_TEXT[c.flag]}</p>}
              <div className={`receipts ${dup ? 'merge' : ''}`}>
                {c.sources.map((s) => (
                  <div key={s.from} className="receipt">
                    <span className="from">{s.from}</span>
                    <span className="subj">{s.subject}</span>
                  </div>
                ))}
                {dup && <span className="merge-note">two receipts → one entry</span>}
              </div>
              <div className="actions">
                <button className="btn btn-warm" onClick={() => settle(c, 'warm')}>Confirm · warm it in</button>
                <button className="btn btn-ghost" onClick={() => settle(c, 'fade')}>{c.flag && c.flag !== 'duplicate' ? 'Not a spend' : 'Reject'}</button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------- Quick log */

function LogSheet({ txs, addLog, close }:
  { txs: Transaction[]; addLog: (amount: number, category: string, account: 'cash' | 'redotpay') => void; close: () => void }) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('coffee')
  const [account, setAccount] = useState<'cash' | 'redotpay'>('cash')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    addLog(Number(amount), category, account)
    setAmount('')
  }
  return (
    <section className="sheet glass" aria-label="Quick log">
      <button className="handle" onClick={close} aria-label="Close quick log" />
      <h2 className="h">Quick log</h2>
      <p className="lede">The usual ones are one tap.</p>
      <div className="chips">
        {REPEAT_CHIPS.map((c) => (
          <button key={`${c.amount}-${c.category}`} className="chip" onClick={() => addLog(c.amount, c.category, 'cash')}>
            <strong>{fmtDA(c.amount)}</strong><span>{c.category}</span>
          </button>
        ))}
      </div>
      <form className="log-form" onSubmit={submit}>
        <label className="field">
          <span className="eyebrow">Amount</span>
          <input type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required />
        </label>
        <label className="field">
          <span className="eyebrow">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Account">
          {ACCOUNTS.map((a) => (
            <button type="button" key={a.id} className={account === a.id ? 'is-on' : ''} onClick={() => setAccount(a.id)} aria-pressed={account === a.id}>
              {a.name} · {a.currency}
            </button>
          ))}
        </div>
        <button type="submit" className="btn btn-warm">Log it</button>
      </form>
      <h3 className="eyebrow">Recent</h3>
      <ul className="recent">
        {txs.slice(0, 7).map((t, i) => (
          <li key={t.id} className={i === 0 && !TRANSACTIONS.includes(t) ? 'is-new' : ''}>
            <span className="dot" />
            <span className="grow"><strong>{cap(t.category)}</strong><span className="mute"> · {t.merchant === 'Quick log' ? 'logged by you' : t.merchant}{t.source === 'inbox' ? ' · from inbox' : ''}</span></span>
            <span className="amt">{fmtMoney(t.amount, t.currency)}</span>
            <span className="mute">{fmtDate(t.date)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
