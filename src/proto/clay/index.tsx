/**
 * CLAY — soft 3D toy / claymorphism. Everything is a squishy object on a
 * shelf: the ember mascot, two jars, parcels for obligations, postcards on a
 * doormat for the review tray, a chunky tray for the quick log.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ACCOUNTS, CANDIDATES, DAYS_TO_PAYDAY, FX_DA_PER_USD, OBLIGATIONS, PAYDAY, REPEAT_CHIPS,
  TODAY, TOTAL_HOLDINGS_DA, TRANSACTIONS, fmtDA, fmtMoney, fmtUSD, toDA,
  type Candidate, type Obligation, type Transaction,
} from '../data.ts'
import './clay.css'

type Tab = 'home' | 'shelf' | 'tray' | 'log'
type Tone = 'butter' | 'peach' | 'mint' | 'lilac' | 'sky' | 'rose'

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800;900&display=swap'
const dayOf = (iso: string) => Number(iso.slice(8, 10))
const TODAY_DAY = dayOf(TODAY)
const PAYDAY_DAY = dayOf(PAYDAY)
const monthDay = (iso: string) => `Oct ${dayOf(iso)}`

const CATEGORY_TONE: Record<string, Tone> = {
  coffee: 'butter', transport: 'sky', bread: 'peach', groceries: 'mint', games: 'lilac',
  apps: 'lilac', fees: 'rose', shopping: 'peach', subscriptions: 'lilac',
}
const toneOf = (cat: string): Tone => CATEGORY_TONE[cat] ?? 'mint'

const FLAG_STICKER: Record<NonNullable<Candidate['flag']>, string> = {
  duplicate: 'two emails, one purchase — stored once',
  not_a_charge: 'just a reminder, not a charge',
  promo: 'promo, not a payment',
}

/* ---------------- little clay pieces ---------------- */

function Ember({ room, puffKey }: { room: number; puffKey: number }) {
  const t = Math.max(0, Math.min(1, room / 60_000))
  const scale = 0.78 + 0.42 * t
  const [puff, setPuff] = useState(false)
  useEffect(() => {
    if (puffKey === 0) return
    setPuff(true)
    const id = setTimeout(() => setPuff(false), 520)
    return () => clearTimeout(id)
  }, [puffKey])
  return (
    <div className={`ember${puff ? ' -puff' : ''}`} style={{ transform: `scale(${scale})` }} aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <defs>
          <radialGradient id="cl-flame" cx="45%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#ffe3a3" />
            <stop offset="70%" stopColor="#ffb48a" />
            <stop offset="100%" stopColor="#f08e72" />
          </radialGradient>
        </defs>
        <ellipse cx="60" cy="112" rx="34" ry="6" fill="rgba(0,0,0,.14)" />
        <path
          d="M60 10 C70 28 92 40 92 70 C92 92 78 110 60 110 C42 110 28 92 28 70 C28 48 46 40 48 24 C50 34 56 36 60 10 Z"
          fill="url(#cl-flame)"
        />
        <path d="M60 46 C66 56 76 62 76 76 C76 88 68 96 60 96 C52 96 44 88 44 76 C44 64 54 58 60 46 Z" fill="#fff0c2" opacity="0.55" />
        <ellipse cx="50" cy="74" rx="3.4" ry="4.4" fill="#2b2140" />
        <ellipse cx="70" cy="74" rx="3.4" ry="4.4" fill="#2b2140" />
        <circle cx="51.2" cy="72.4" r="1.1" fill="#fff" />
        <circle cx="71.2" cy="72.4" r="1.1" fill="#fff" />
        <path d="M53 84 Q60 90 67 84" stroke="#2b2140" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <circle cx="42" cy="82" r="4" fill="#ff8f9c" opacity="0.5" />
        <circle cx="78" cy="82" r="4" fill="#ff8f9c" opacity="0.5" />
      </svg>
    </div>
  )
}

function Bow() {
  return (
    <svg className="bow" viewBox="0 0 34 24" aria-hidden="true">
      <path d="M17 12 C8 2 0 6 4 13 C7 18 14 15 17 12 Z" fill="#ff8f9c" />
      <path d="M17 12 C26 2 34 6 30 13 C27 18 20 15 17 12 Z" fill="#ff8f9c" />
      <path d="M17 12 L11 23 M17 12 L23 23" stroke="#ff8f9c" strokeWidth="4" strokeLinecap="round" />
      <circle cx="17" cy="12" r="4" fill="#ff6f85" />
    </svg>
  )
}

function Dial({ value }: { value: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <span className="dial" title={`parser confidence ${Math.round(value * 100)}%`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(0,0,0,.12)" strokeWidth="7" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="#2b2140" strokeOpacity="0.75" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      {Math.round(value * 100)}% sure
    </span>
  )
}

const ICONS: Record<Tab, ReactNode> = {
  home: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 11 12 4l8 7v8a2 2 0 0 1-2 2h-3v-5H9v5H6a2 2 0 0 1-2-2z" /></svg>,
  shelf: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="14" width="18" height="4" rx="2" /><rect x="5" y="6" width="6" height="7" rx="2" /><rect x="13" y="8" width="6" height="5" rx="2" /></svg>,
  tray: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm2 .5V8l7 4.5L19 8v-.5l-7 4.2z" /></svg>,
  log: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="10" y="4" width="4" height="16" rx="2" /><rect x="4" y="10" width="16" height="4" rx="2" /></svg>,
}
const TAB_LABEL: Record<Tab, string> = { home: 'Home', shelf: 'Shelf', tray: 'Mail', log: 'Log' }

/* ---------------- obligation parcel ---------------- */

function Parcel({ o, paid, onToggle, compact }: { o: Obligation; paid: boolean; onToggle: () => void; compact?: boolean }) {
  const status = paid ? 'paid' : o.status
  const diff = dayOf(o.dueDate) - TODAY_DAY
  const when =
    status === 'paid' ? `paid · ${monthDay(o.dueDate)}`
    : status === 'late' ? `was ${monthDay(o.dueDate)}`
    : diff === 0 ? 'today'
    : diff === 1 ? 'tomorrow'
    : `in ${diff} days · ${monthDay(o.dueDate)}`
  const tone: Tone =
    status === 'paid' ? 'mint' : status === 'late' ? 'peach' : status === 'due_soon' ? 'butter'
    : status === 'estimated' ? 'sky' : o.currency === 'USD' ? 'lilac' : 'sky'
  const cls = [
    'clay', 'box', `-${tone}`,
    status === 'paid' && '-paid',
    status === 'due_soon' && '-wobble',
    status === 'late' && '-late',
    status === 'estimated' && '-ghost',
  ].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={onToggle} aria-pressed={paid}
      aria-label={`${o.name}, ${fmtMoney(o.amount, o.currency)}, ${when}. Tap to mark ${paid ? 'unpaid' : 'paid'}`}>
      {status === 'paid' && <><span className="tape" /><Bow /></>}
      <span className="name">{o.name}</span>
      <span className="amt">
        {fmtMoney(o.amount, o.currency)}
        {o.currency === 'USD' && <span className="when"> ≈ {fmtDA(toDA(o.amount, o.currency))}</span>}
      </span>
      <span className="when">{status === 'estimated' ? `estimate · ${monthDay(o.dueDate)}` : when}</span>
      {o.progress && (
        <span className="beads" aria-label={`${o.progress.paid} of ${o.progress.total} paid`}>
          {Array.from({ length: compact ? 6 : o.progress.total }, (_, i) => (
            <i key={i} className={`bead${i < o.progress!.paid ? ' -on' : ''}`} />
          ))}
          {compact && <span className="when">{o.progress.paid}/{o.progress.total}</span>}
        </span>
      )}
      {o.history && (
        <span className="beads" aria-label="last three bills">
          {o.history.map((h, i) => <i key={i} className="bead -hist">{(h / 1000).toFixed(1)}k</i>)}
        </span>
      )}
      {status === 'late' && !compact && <span className="nudge">hey, me? still here from the 5th</span>}
      {status === 'late' && compact && <span className="nudge">hey, me?</span>}
    </button>
  )
}

/* ---------------- the prototype ---------------- */

export default function ClayProto() {
  const [tab, setTab] = useState<Tab>('home')
  const [paid, setPaid] = useState<Set<string>>(() => new Set(OBLIGATIONS.filter((o) => o.status === 'paid').map((o) => o.id)))
  const [candidates, setCandidates] = useState<Candidate[]>(CANDIDATES)
  const [leaving, setLeaving] = useState<Record<string, 'go' | 'bye'>>({})
  const [txns, setTxns] = useState<Transaction[]>(TRANSACTIONS)
  const [extraSpendDA, setExtraSpendDA] = useState(0)
  const [puffKey, setPuffKey] = useState(0)
  const [sheet, setSheet] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('coffee')
  const [account, setAccount] = useState<'cash' | 'redotpay'>('cash')
  const [usdConfirmed, setUsdConfirmed] = useState(false)

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  const dueDA = useMemo(
    () => OBLIGATIONS.filter((o) => !paid.has(o.id) && o.dueDate <= PAYDAY).reduce((s, o) => s + toDA(o.amount, o.currency), 0),
    [paid],
  )
  const holdings = TOTAL_HOLDINGS_DA - extraSpendDA
  const room = holdings - dueDA
  const perDay = Math.floor(room / DAYS_TO_PAYDAY)
  const puff = () => setPuffKey((k) => k + 1)

  const togglePaid = (id: string) => {
    setPaid((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
    puff()
  }
  const next3 = OBLIGATIONS.filter((o) => !paid.has(o.id)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3)

  const decide = (c: Candidate, keep: boolean) => {
    setLeaving((l) => ({ ...l, [c.id]: keep ? 'go' : 'bye' }))
    setTimeout(() => {
      setCandidates((cs) => cs.filter((x) => x.id !== c.id))
      if (keep) {
        setExtraSpendDA((d) => d + toDA(c.amount, c.currency))
        setTxns((t) => [{ id: `in-${c.id}`, amount: c.amount, currency: c.currency, category: c.suggestedCategory, merchant: c.merchant, date: c.date, account: c.currency === 'DA' ? 'cash' : 'redotpay', source: 'inbox' }, ...t])
        puff()
      }
    }, keep ? 450 : 350)
  }

  const addLog = (amt: number, cat: string, acc: 'cash' | 'redotpay' = account) => {
    if (!amt || amt <= 0) return
    const currency = acc === 'cash' ? 'DA' : 'USD'
    setTxns((t) => [{ id: `m${Date.now()}`, amount: amt, currency, category: cat, merchant: cat === 'coffee' ? 'Café du Coin' : cat[0].toUpperCase() + cat.slice(1), date: TODAY, account: acc, source: 'manual' }, ...t])
    setExtraSpendDA((d) => d + toDA(amt, currency))
    setAmount('')
    setSheet(false)
    puff()
  }

  const cash = ACCOUNTS[0]
  const card = ACCOUNTS[1]
  const todayBeads = txns.filter((t) => t.date === TODAY)

  const navButton = (t: Tab) => (
    <button key={t} type="button" className={`clay nav ${tab === t ? `-on -${t === 'log' ? 'butter' : 'lilac'}` : ''}`}
      aria-current={tab === t ? 'page' : undefined}
      onClick={() => { setTab(t); if (t === 'log') setSheet(true) }}>
      {ICONS[t]}<span>{TAB_LABEL[t]}</span>
    </button>
  )

  /* ---------- screens ---------- */

  const Home = (
    <section className="screen home-grid" aria-label="Home">
      <div className="clay hero">
        <p className="muted">breathing room until payday · a forecast, not a verdict</p>
        <div className="hero-row">
          <Ember room={room} puffKey={puffKey} />
          <div>
            <div className="big">{fmtDA(room)}</div>
            <p className="muted" style={{ marginTop: 6 }}>about <b>{fmtDA(perDay)}</b> a day · {DAYS_TO_PAYDAY} days to go</p>
          </div>
        </div>
        <div className="split" role="img" aria-label={`${fmtDA(room)} free of ${fmtDA(holdings)} held; ${fmtDA(dueDA)} committed to bills before payday`}>
          <div className="split-track">
            <div className="split-fill" style={{ width: `${Math.max(0, Math.min(100, (room / holdings) * 100))}%` }} />
          </div>
          <div className="split-labels">
            <span><i style={{ background: 'var(--mint)' }} />free · {fmtDA(room)}</span>
            <span><i style={{ background: 'var(--shelf)' }} />committed to bills · {fmtDA(dueDA)}</span>
          </div>
        </div>
        <div className="hero-foot">
          <button type="button" className="clay pill -sky" onClick={() => setTab('shelf')}>see the shelf →</button>
          <button type="button" className="clay pill -lilac" onClick={() => setTab('tray')}>{candidates.length} parcels in the mail</button>
          <button type="button" className="clay pill -butter" onClick={() => { setTab('log'); setSheet(true) }}>+ log something</button>
        </div>
      </div>

      <div className="jars" aria-label="Accounts">
        <div className="clay jar -butter">
          <div className="clay jar-lid -peach" />
          <div className="jar-glass">
            <div className="jar-fill" style={{ height: '62%', background: 'var(--butter)' }} />
            <i className="jar-coin" style={{ left: 18, bottom: 14 }} /><i className="jar-coin" style={{ left: 48, bottom: 10 }} /><i className="jar-coin" style={{ left: 34, bottom: 34 }} />
          </div>
          <div>
            <div className="sub">{cash.name} · DA</div>
            <div className="big">{fmtDA(cash.estimatedBalance)}</div>
            <div className="sub">typed by you · confirmed today</div>
          </div>
        </div>
        <div className="clay jar -sky">
          <div className="clay jar-lid -lilac" />
          <div className="jar-glass">
            <div className="jar-fill" style={{ height: '48%', background: 'var(--sky)' }} />
            <i className="jar-card" />
          </div>
          <div>
            <div className="sub">{card.name} · USD</div>
            <div className="big">{fmtUSD(card.estimatedBalance)}</div>
            <div className="sub">≈ {fmtDA(toDA(card.estimatedBalance, 'USD'))} at {FX_DA_PER_USD} DA/$</div>
            <div className="sub">{usdConfirmed ? 'confirmed just now' : 'estimated · last confirmed 3 days ago'}</div>
          </div>
          <button type="button" className={`clay btn -sm ${usdConfirmed ? '-mint' : '-lilac'}`} onClick={() => setUsdConfirmed(true)}>
            {usdConfirmed ? 'balance confirmed' : 'Confirm balance'}
          </button>
        </div>
      </div>

      <div>
        <h2>Next up on the shelf</h2>
        <div className="boxes">
          {next3.map((o) => <Parcel key={o.id} o={o} paid={paid.has(o.id)} onToggle={() => togglePaid(o.id)} compact />)}
        </div>
      </div>
    </section>
  )

  const Shelf = (
    <section className="screen" aria-label="Runway">
      <div>
        <h1>The shelf</h1>
        <p className="muted">Oct {TODAY_DAY} → payday Oct {PAYDAY_DAY}. Tap a parcel to mark it paid; the ember puffs up.</p>
      </div>
      <div className="clay shelf-scroll">
        <div className="shelf-track">
          <div className="shelf-plank" />
          <div className="flag" style={{ left: `${((TODAY_DAY - 0.5) / 30) * 100}%` }}>
            <b className="clay pill -peach">today</b><i />
          </div>
          <div className="flag -pay" style={{ left: `${((PAYDAY_DAY - 0.5) / 30) * 100}%` }}>
            <b className="clay pill -butter">payday</b><i />
          </div>
          {OBLIGATIONS.map((o, i) => {
            const prev = OBLIGATIONS[i - 1]
            const lifted = !!prev && dayOf(o.dueDate) - dayOf(prev.dueDate) <= 2
            const left = `${((dayOf(o.dueDate) - 0.5) / 30) * 100}%`
            return (
              <div key={o.id} style={{ display: 'contents' }}>
                {lifted && <div className="riser" style={{ left }} aria-hidden="true" />}
                <div className={`on-shelf${lifted ? ' -up' : ''}`} style={{ left }}>
                  <Parcel o={o} paid={paid.has(o.id)} onToggle={() => togglePaid(o.id)} compact />
                </div>
              </div>
            )
          })}
          <div className="pegs" aria-hidden="true">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <span key={d} className={`peg${d === TODAY_DAY ? ' -today' : ''}${d === PAYDAY_DAY ? ' -pay' : ''}`}><i />{d}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="legend" aria-label="legend">
        <span className="pill -mint">paid · bow</span>
        <span className="pill -butter">due soon · wobbles</span>
        <span className="pill -peach">late · a little deflated</span>
        <span className="pill -sky">estimate · see-through, last 3 bills</span>
        <span className="pill -lilac">USD · with DA equivalent</span>
      </div>
      <p className="muted">Still to pay before payday: <b>{fmtDA(dueDA)}</b> · breathing room <b>{fmtDA(room)}</b></p>
    </section>
  )

  const Tray = (
    <section className="screen" aria-label="Review tray">
      <div>
        <h1>On the doormat</h1>
        <p className="muted">Parsed from your inbox. Each one is a claim with its evidence — nothing is stored until you say so.</p>
      </div>
      <div className="clay mat -shelf">
        {candidates.map((c) => {
          const tone: Tone = c.flag === 'promo' ? 'rose' : c.flag === 'not_a_charge' ? 'lilac' : c.currency === 'USD' ? 'sky' : 'butter'
          return (
            <article key={c.id} className={`clay postcard -${tone}${leaving[c.id] ? ` -${leaving[c.id]}` : ''}`}>
              <div className="pc-head">
                <div>
                  <div className="muted">{monthDay(c.date)} · {c.suggestedCategory}</div>
                  <div className="big" style={{ fontSize: 22 }}>{c.merchant}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="big">{fmtMoney(c.amount, c.currency)}</div>
                  {c.currency === 'USD' && <div className="muted">≈ {fmtDA(toDA(c.amount, c.currency))}</div>}
                </div>
              </div>
              <div className="stamps" aria-label="source emails">
                {c.sources.map((s) => <span key={s.subject} className="stamp">{s.from}<small>{s.subject}</small></span>)}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <Dial value={c.confidence} />
                {c.flag && <span className="sticker">{FLAG_STICKER[c.flag]}</span>}
              </div>
              <div className="pc-actions">
                <button type="button" className="clay btn -mint" onClick={() => decide(c, true)} disabled={!!leaving[c.id]}>
                  {c.flag === 'duplicate' ? 'Yes, store once' : 'Yes, that was me'}
                </button>
                <button type="button" className="clay btn" onClick={() => decide(c, false)} disabled={!!leaving[c.id]}>
                  {c.flag === 'not_a_charge' || c.flag === 'promo' ? 'Not a charge' : 'Nope'}
                </button>
              </div>
            </article>
          )
        })}
        {candidates.length === 0 && <p className="empty">Doormat is clear. Nice.</p>}
      </div>
    </section>
  )

  const Log = (
    <section className="screen log-grid" aria-label="Quick log">
      <div style={{ display: 'grid', gap: 14 }}>
        <div>
          <h1>Today's string</h1>
          <p className="muted">Every log is a bead. The coffee is one tap.</p>
        </div>
        <div className="clay string -shelf" aria-label="today's beads">
          {todayBeads.map((t) => <span key={t.id} className={`sbead clay -${toneOf(t.category)}`} title={`${t.merchant} ${fmtMoney(t.amount, t.currency)}`}>{t.currency === 'DA' ? t.amount : `$${t.amount}`}</span>)}
          <span className="line" />
        </div>
        <button type="button" className="clay btn -butter" onClick={() => setSheet(true)}>+ Log something</button>
      </div>
      <div>
        <h2>Recent</h2>
        <ul className="recent">
          {txns.slice(0, 8).map((t) => (
            <li key={t.id} className="clay row">
              <span className={`sbead clay -${toneOf(t.category)}`}>{t.category.slice(0, 3)}</span>
              <span className="who">{t.merchant}<small>{t.category} · {monthDay(t.date)} · {t.source === 'inbox' ? 'from email' : 'typed'}</small></span>
              <span className="amt">{fmtMoney(t.amount, t.currency)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )

  return (
    <div className="proto-clay">
      <header className="top">
        <div className="wordmark"><span className="dot" />ember</div>
        <a className="back" href="#/proto">← all prototypes</a>
      </header>

      <nav className="clay side" aria-label="Sections">
        {(['home', 'shelf', 'tray', 'log'] as Tab[]).map(navButton)}
        <div className="clay mini -in">
          FX {FX_DA_PER_USD} DA per $ · set by you<br />
          {DAYS_TO_PAYDAY} days to payday
        </div>
      </nav>

      <main className="main" key={tab}>
        {tab === 'home' && Home}
        {tab === 'shelf' && Shelf}
        {tab === 'tray' && Tray}
        {tab === 'log' && Log}
      </main>

      <nav className="clay dock" aria-label="Sections">
        {(['home', 'shelf', 'tray', 'log'] as Tab[]).map(navButton)}
      </nav>

      {sheet && (
        <>
          <div className="sheet-back" onClick={() => setSheet(false)} />
          <form className="clay sheet" role="dialog" aria-label="Quick log" onSubmit={(e) => { e.preventDefault(); addLog(Number(amount), category) }}>
            <div className="sheet-grip" />
            <div className="stamps-row" aria-label="one-tap repeats">
              {REPEAT_CHIPS.map((r, i) => (
                <button key={i} type="button" className={`clay tstamp -${toneOf(r.category)}`} onClick={() => addLog(r.amount, r.category, 'cash')}>
                  {r.amount}<small>{r.category}</small>
                </button>
              ))}
            </div>
            <label className="lbl" htmlFor="cl-amount">amount in {account === 'cash' ? 'DA' : 'USD'}</label>
            <div className="clay amount-pill -in">
              <input id="cl-amount" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <b>{account === 'cash' ? 'DA' : '$'}</b>
            </div>
            <span className="lbl">category</span>
            <div className="chips" role="group" aria-label="category">
              {['coffee', 'transport', 'bread', 'groceries', 'games', 'apps'].map((c) => (
                <button key={c} type="button" className={`clay chip ${category === c ? `-${toneOf(c)} pressed` : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
            <span className="lbl">from which jar</span>
            <div className="chips" role="group" aria-label="account">
              {ACCOUNTS.map((a) => (
                <button key={a.id} type="button" className={`clay chip ${account === a.id ? '-butter pressed' : ''}`} aria-pressed={account === a.id} onClick={() => setAccount(a.id)}>{a.name}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="clay btn -mint" style={{ flex: 1 }}>Add bead</button>
              <button type="button" className="clay btn" onClick={() => setSheet(false)}>Close</button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
