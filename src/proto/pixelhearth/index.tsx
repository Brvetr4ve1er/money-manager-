/**
 * PIXELHEARTH — a 16-bit cozy room. The fireplace is your breathing room,
 * bills are furniture, inbox candidates are letters at the mailbox, logging
 * a coffee is buying from an RPG shop. Chunky dialog boxes, steps() motion.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ACCOUNTS, CANDIDATES, DAYS_TO_PAYDAY, FX_DA_PER_USD, OBLIGATIONS, PAYDAY, REPEAT_CHIPS, TODAY,
  TOTAL_HOLDINGS_DA, TRANSACTIONS, fmtDA, fmtMoney, toDA,
  type Candidate, type Obligation, type Transaction,
} from '../data'
import { Chest, Envelope, ICONS, Room, Sprite, type RoomObject } from './sprites'
import './pixelhearth.css'

type Screen = 'home' | 'runway' | 'tray' | 'log'
type Theme = 'auto' | 'day' | 'night'

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap'
const dayOf = (iso: string) => Number(iso.slice(8, 10))
const MONTH_DAYS = 31
const STATUS_WORD: Record<Obligation['status'], string> = { paid: 'paid', due_soon: 'due soon', upcoming: 'upcoming', late: 'waiting', estimated: 'estimate' }
const FLAG_NOTE: Record<NonNullable<Candidate['flag']>, string> = {
  duplicate: 'Two emails, one purchase. If you confirm, it is stored ONCE.',
  not_a_charge: 'This looks like a renewal notice, not a charge. Nothing was taken yet.',
  promo: 'Promo email for $0. Probably not a purchase at all.',
}

/* ---------- small chrome pieces ---------- */

function Box({ title, right, children, more, pop }: { title?: string; right?: ReactNode; children: ReactNode; more?: boolean; pop?: boolean }) {
  return (
    <section className={`ph-box${pop ? ' ph-pop' : ''}`}>
      <div className="ph-in">
        {title && (
          <div className="ph-title">
            <h2 className="ph-h">{title}</h2>
            {right}
          </div>
        )}
        {children}
        {more && <span className="ph-more" aria-hidden="true">▼</span>}
      </div>
    </section>
  )
}

function Meter({ n, of, className }: { n: number; of: number; className: string }) {
  return (
    <span className={className} role="img" aria-label={`${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'on' : undefined} />)}
    </span>
  )
}

function DAeq({ o }: { o: { amount: number; currency: Obligation['currency'] } }) {
  return o.currency === 'USD' ? <span className="ph-dim ph-small"> ≈ {fmtDA(toDA(o.amount, 'USD'))}</span> : null
}

/* ---------- root ---------- */

export default function Pixelhearth() {
  const [screen, setScreen] = useState<Screen>('home')
  const [theme, setTheme] = useState<Theme>('auto')
  const [sysDay, setSysDay] = useState(() => window.matchMedia('(prefers-color-scheme: light)').matches)
  const [paid, setPaid] = useState<Record<string, boolean>>(() => Object.fromEntries(OBLIGATIONS.map((o) => [o.id, o.status === 'paid'])))
  const [tray, setTray] = useState<Candidate[]>(CANDIDATES)
  const [leaving, setLeaving] = useState<Record<string, 'to-chest' | 'burn'>>({})
  const [txs, setTxs] = useState<Transaction[]>(TRANSACTIONS)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const on = (e: MediaQueryListEvent) => setSysDay(e.matches)
    mq.addEventListener('change', on)
    return () => { link.remove(); mq.removeEventListener('change', on) }
  }, [])

  const isDay = theme === 'auto' ? sysDay : theme === 'day'
  const isPaid = (o: Obligation) => paid[o.id] === true

  const extraSpend = useMemo(() => txs.filter((t) => !TRANSACTIONS.includes(t)).reduce((s, t) => s + toDA(t.amount, t.currency), 0), [txs])
  const dueDA = OBLIGATIONS.filter((o) => !isPaid(o) && o.dueDate <= PAYDAY).reduce((s, o) => s + toDA(o.amount, o.currency), 0)
  const room = TOTAL_HOLDINGS_DA - dueDA - extraSpend
  const perDay = Math.floor(room / DAYS_TO_PAYDAY)
  const level = Math.max(0, Math.min(1, room / TOTAL_HOLDINGS_DA)) // 0 = embers, 1 = roaring

  const objects = useMemo<RoomObject[]>(() => {
    const st = (id: string): RoomObject['state'] => {
      const o = OBLIGATIONS.find((x) => x.id === id)!
      return paid[id] ? 'paid' : o.status
    }
    const bubble = (s: RoomObject['state'], late: string) => (s === 'late' ? late : s === 'due_soon' ? '!' : undefined)
    return [
      { id: 'rent', kind: 'frame', x: 106, y: 18, state: st('rent') },
      { id: 'gym', kind: paid.gym ? 'plant' : 'wilted', x: 24, y: 86, state: st('gym'), bubble: bubble(st('gym'), 'water me?') },
      { id: 'netflix', kind: 'plant', x: 116, y: 38, state: st('netflix'), bubble: bubble(st('netflix'), '') },
      { id: 'ai', kind: 'plant', x: 132, y: 38, state: st('ai'), bubble: bubble(st('ai'), '') },
      { id: 'phone-plan', kind: 'piggy', x: 118, y: 96, state: st('phone-plan') },
      { id: 'internet', kind: 'mailbox', x: 140, y: 82, state: st('internet'), bubble: bubble(st('internet'), '') },
    ]
  }, [paid])

  const togglePaid = (id: string) => setPaid((p) => ({ ...p, [id]: !p[id] }))

  const decide = (c: Candidate, how: 'to-chest' | 'burn') => {
    setLeaving((l) => ({ ...l, [c.id]: how }))
    window.setTimeout(() => {
      setTray((t) => t.filter((x) => x.id !== c.id))
      if (how === 'to-chest' && c.amount > 0) {
        setTxs((t) => [{ id: `in-${c.id}`, amount: c.amount, currency: c.currency, category: c.suggestedCategory, merchant: c.merchant, date: c.date, account: c.currency === 'USD' ? 'redotpay' : 'cash', source: 'inbox' }, ...t])
      }
    }, 600)
  }

  const addLog = (amount: number, category: string, account: Transaction['account']) => {
    const currency = account === 'cash' ? 'DA' : 'USD'
    setTxs((t) => [{ id: `m-${Date.now()}`, amount, currency, category, merchant: 'Logged by hand', date: TODAY, account, source: 'manual' }, ...t])
  }

  const nav: { id: Screen; label: string }[] = [{ id: 'home', label: 'Home' }, { id: 'runway', label: 'Map' }, { id: 'tray', label: 'Mail' }, { id: 'log', label: 'Bag' }]
  const iconFor: Record<Screen, string> = { home: 'house', runway: 'map', tray: 'mail', log: 'bag' }

  return (
    <div className="proto-pixelhearth" data-theme={isDay ? 'day' : 'night'}>
      <div className="ph-app">
        <div className="ph-left">
          <header className="ph-top">
            <a className="ph-h" href="#/proto" title="Back to the prototype list">◀ Ember</a>
            <button className="ph-btn ph-flat ph-small" onClick={() => setTheme(isDay ? 'night' : 'day')} aria-label={isDay ? 'Switch to night' : 'Switch to day'}>
              {isDay ? '☾ night' : '☼ day'}
            </button>
          </header>
          <div className="ph-roomwrap">
            <Room level={level} objects={objects} mailCount={tray.length} night={!isDay} />
          </div>
          <nav className="ph-nav" aria-label="Screens">
            {nav.map((n) => (
              <button key={n.id} onClick={() => setScreen(n.id)} aria-current={screen === n.id ? 'page' : undefined}>
                <Sprite rows={ICONS[iconFor[n.id]]} size={24} className="ph-icon" />
                {n.label}
              </button>
            ))}
          </nav>
        </div>
        <main className="ph-screen" key={screen}>
          {screen === 'home' && <Home room={room} perDay={perDay} level={level} isPaid={isPaid} confirmedAt={confirmedAt} onConfirm={() => setConfirmedAt(TODAY)} go={setScreen} trayCount={tray.length} />}
          {screen === 'runway' && <Runway isPaid={isPaid} toggle={togglePaid} room={room} />}
          {screen === 'tray' && <Tray tray={tray} leaving={leaving} decide={decide} />}
          {screen === 'log' && <QuickLog txs={txs} add={addLog} />}
        </main>
      </div>
    </div>
  )
}

/* ---------- 1. HOME ---------- */

function Home({ room, perDay, level, isPaid, confirmedAt, onConfirm, go, trayCount }: {
  room: number; perDay: number; level: number; isPaid: (o: Obligation) => boolean
  confirmedAt: string | null; onConfirm: () => void; go: (s: Screen) => void; trayCount: number
}) {
  const next3 = OBLIGATIONS.filter((o) => !isPaid(o)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3)
  const gym = OBLIGATIONS.find((o) => o.id === 'gym')!
  const [cash, card] = ACCOUNTS
  return (
    <>
      <Box title="Breathing room" right={<span className="ph-dim ph-small">forecast, not a verdict</span>} more pop>
        <div className="ph-big">{fmtDA(room)}</div>
        <div className="ph-row" style={{ marginTop: 6 }}>
          <span>{fmtDA(perDay)} <span className="ph-dim">/ day</span></span>
          <span className="ph-dim">{DAYS_TO_PAYDAY} days to payday</span>
        </div>
        <div className="ph-row" style={{ marginTop: 8 }}>
          <span className="ph-dim ph-small">hearth</span>
          <Meter n={Math.round(level * 8)} of={8} className="ph-flame-bar" />
        </div>
      </Box>

      <Box title="Accounts">
        <div className="ph-two">
          <div className="ph-acct">
            <span className="ph-dim ph-small">{cash.name}</span>
            <span className="ph-num">{fmtDA(cash.estimatedBalance)}</span>
            <span className="ph-small" style={{ color: 'var(--sage)' }}>✓ confirmed today</span>
          </div>
          <div className="ph-acct">
            <span className="ph-dim ph-small">{card.name}</span>
            <span className="ph-num">{fmtMoney(card.estimatedBalance, 'USD')} <span className="ph-dim ph-small">≈ {fmtDA(toDA(card.estimatedBalance, 'USD'))}</span></span>
            <span className="ph-dim ph-small">{confirmedAt ? '✓ confirmed today' : 'estimated · last confirmed 3 days ago'}</span>
            {!confirmedAt && <button className="ph-btn ph-small" style={{ marginTop: 4 }} onClick={onConfirm}>Confirm balance</button>}
          </div>
        </div>
        <p className="ph-dim ph-small" style={{ marginTop: 8 }}>1 USD = {FX_DA_PER_USD} DA (your rate)</p>
      </Box>

      <Box title="Coming up" right={<button className="ph-btn ph-flat ph-small" onClick={() => go('runway')}>open map ▶</button>}>
        <ul className="ph-menu">
          {next3.map((o) => (
            <li key={o.id}>
              <button className="ph-item" onClick={() => go('runway')}>
                <span className="ph-lbl"><span>{o.name}</span><span className={`ph-chip ${o.status}`}>{STATUS_WORD[o.status]}</span></span>
                <span>{fmtMoney(o.amount, o.currency)}<DAeq o={o} /></span>
              </button>
            </li>
          ))}
        </ul>
        {!isPaid(gym) && (
          <p className="ph-note" style={{ marginTop: 8 }}>
            The gym plant is thirsty — {fmtDA(gym.amount)} was due Oct 5. Whenever you get to it. It is already counted in your breathing room.
          </p>
        )}
      </Box>

      <div className="ph-btns">
        <button className="ph-btn ph-primary" onClick={() => go('log')}>▶ Log a spend</button>
        <button className="ph-btn" onClick={() => go('tray')}>{trayCount} letters in the mailbox</button>
      </div>
    </>
  )
}

/* ---------- 2. RUNWAY (overworld path) ---------- */

function Runway({ isPaid, toggle, room }: { isPaid: (o: Obligation) => boolean; toggle: (id: string) => void; room: number }) {
  const [sel, setSel] = useState<string>('internet')
  const today = dayOf(TODAY)
  const payday = dayOf(PAYDAY)
  const byDay = new Map<number, Obligation>(OBLIGATIONS.map((o) => [dayOf(o.dueDate), o]))
  const o = OBLIGATIONS.find((x) => x.id === sel)
  return (
    <>
      <Box title="Overworld path" right={<span className="ph-dim ph-small">Oct 1 → payday Oct {payday}</span>} pop>
        <ol className="ph-path" aria-label="Days of the month">
          {Array.from({ length: MONTH_DAYS }, (_, i) => {
            const d = i + 1
            const ob = byDay.get(d)
            const cls = ['ph-tile', d < today && 'walked', d === today && 'today', d === payday && 'payday', ob && 'has-ob', ob && isPaid(ob) && 'paid', ob && sel === ob.id && 'is-sel'].filter(Boolean).join(' ')
            const inner = (
              <>
                <span className="ph-d" aria-hidden="true">{d}</span>
                {ob && <Sprite rows={ICONS[ob.kind === 'subscription' ? 'bag' : ob.kind === 'installment' ? 'house' : 'mail']} size={16} className={`ph-icon${ob.status === 'estimated' && !isPaid(ob) ? ' ph-ghost' : ''}`} />}
                {ob && <span className="ph-mark" aria-hidden="true">{isPaid(ob) ? '✓' : ob.status === 'late' ? '…' : ob.status === 'due_soon' ? '!' : ob.status === 'estimated' ? '~' : ''}</span>}
                {d === today && !ob && <span aria-hidden="true">●</span>}
                {d === payday && <span className="ph-small" aria-hidden="true">$</span>}
              </>
            )
            return (
              <li key={d} className={ob ? undefined : cls} aria-label={ob ? undefined : `Oct ${d}${d === today ? ', today' : d === payday ? ', payday' : ''}`}>
                {ob ? (
                  <button className={cls} onClick={() => setSel(ob.id)} aria-pressed={sel === ob.id} aria-label={`Oct ${d}: ${ob.name}, ${fmtMoney(ob.amount, ob.currency)}, ${isPaid(ob) ? 'paid' : STATUS_WORD[ob.status]}`}>
                    {inner}
                  </button>
                ) : inner}
              </li>
            )
          })}
        </ol>
        <p className="ph-dim ph-small" style={{ marginTop: 8 }}>● today · ! due soon · ~ estimate · ✓ paid · $ payday. Tap an object to inspect it.</p>
      </Box>

      {o && (
        <Box title={o.name} right={<span className={`ph-chip ${isPaid(o) ? 'paid' : o.status}`}>{isPaid(o) ? 'paid' : STATUS_WORD[o.status]}</span>} more pop key={o.id}>
          <div className="ph-row">
            <span className="ph-num">{fmtMoney(o.amount, o.currency)}<DAeq o={o} /></span>
            <span className="ph-dim">due Oct {dayOf(o.dueDate)}</span>
          </div>
          <div className="ph-stack" style={{ marginTop: 8 }}>
            <div className="ph-row"><span className="ph-dim">from</span><span>{ACCOUNTS.find((a) => a.id === o.account)!.name}</span></div>
            {o.progress && (
              <div className="ph-row"><span className="ph-dim">installment</span><span><Meter n={o.progress.paid} of={o.progress.total} className="ph-hearts" /> {o.progress.paid}/{o.progress.total}</span></div>
            )}
            {o.history && (
              <div className="ph-row">
                <span className="ph-dim">last three</span>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-end' }}>
                  <span className="ph-hist" aria-hidden="true">{o.history.map((h, i) => <i key={i} style={{ height: `${(h / 5300) * 24}px` }} />)}</span>
                  <span className="ph-small">{o.history.map(fmtDA).join(' · ')}</span>
                </span>
              </div>
            )}
            {o.status === 'estimated' && !isPaid(o) && <p className="ph-dim ph-small">A ghost until the real bill lands — the estimate is the average of the last three.</p>}
            {o.status === 'late' && !isPaid(o) && <p className="ph-note ph-small">A little past its day. No rush — the room is already counting it.</p>}
          </div>
          <div className="ph-btns">
            <button className={`ph-btn ${isPaid(o) ? '' : 'ph-primary'}`} onClick={() => toggle(o.id)} aria-pressed={isPaid(o)}>
              {isPaid(o) ? '↶ Mark unpaid' : '✓ Mark paid'}
            </button>
            <span className="ph-dim ph-small" style={{ alignSelf: 'center' }}>room now {fmtDA(room)}</span>
          </div>
        </Box>
      )}
    </>
  )
}

/* ---------- 3. REVIEW TRAY (letters at the mailbox) ---------- */

function Tray({ tray, leaving, decide }: { tray: Candidate[]; leaving: Record<string, 'to-chest' | 'burn'>; decide: (c: Candidate, how: 'to-chest' | 'burn') => void }) {
  const [sel, setSel] = useState<string | null>(tray[0]?.id ?? null)
  const c = tray.find((x) => x.id === sel) ?? tray[0]
  const kept = CANDIDATES.length - tray.length
  return (
    <>
      <Box title="Mailbox" right={<span className="ph-dim ph-small">{tray.length} unopened</span>} pop>
        {tray.length === 0 ? (
          <p>The mailbox is empty. The cat approves.</p>
        ) : (
          <ul className="ph-letters">
            {tray.map((x) => (
              <li key={x.id}>
                <button className={`ph-letter${c?.id === x.id ? ' is-sel' : ''}${leaving[x.id] ? ` ${leaving[x.id]}` : ''}`} onClick={() => setSel(x.id)} aria-pressed={c?.id === x.id}>
                  <span className="ph-env" aria-hidden="true">
                    <Envelope size={28} />
                    {x.sources.length > 1 && <Envelope size={28} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ph-row"><span>{x.merchant}</span><span>{fmtMoney(x.amount, x.currency)}</span></span>
                    <span className="ph-row ph-dim ph-small"><span>Oct {dayOf(x.date)} · {x.sources.length} email{x.sources.length > 1 ? 's' : ''}</span>{x.flag && <span className="ph-chip late">{x.flag.replace('_', ' ')}</span>}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ph-chestrow ph-dim ph-small"><Chest size={24} /> {kept} decided · confirm puts a letter in the chest, reject burns it in the hearth</div>
      </Box>

      {c && !leaving[c.id] && (
        <Box title="A letter" right={<span className="ph-dim ph-small">claim + evidence, you decide</span>} more pop key={c.id}>
          <div className="ph-row">
            <span className="ph-num">{c.merchant}</span>
            <span className="ph-num">{fmtMoney(c.amount, c.currency)}<DAeq o={c} /></span>
          </div>
          <div className="ph-row ph-dim ph-small" style={{ marginBottom: 8 }}>
            <span>Oct {dayOf(c.date)} · {c.suggestedCategory}</span>
            <span>confidence <Meter n={Math.round(c.confidence * 5)} of={5} className="ph-conf" /> {Math.round(c.confidence * 100)}%</span>
          </div>
          <div className="ph-evidence">
            {c.sources.map((s, i) => (
              <div key={i}>
                <div><span className="ph-dim">from </span>{s.from}</div>
                <div><span className="ph-dim">re: </span>{s.subject}</div>
              </div>
            ))}
            {c.flag === 'duplicate' && <div className="ph-small" style={{ color: 'var(--accent-ink)' }}>▲ two envelopes, same purchase — kept once</div>}
          </div>
          {c.flag && <p className="ph-note ph-small" style={{ marginTop: 8 }}>Parser's note: {FLAG_NOTE[c.flag]}</p>}
          <div className="ph-btns">
            <button className="ph-btn ph-primary" onClick={() => decide(c, 'to-chest')}>▶ Keep in chest</button>
            <button className="ph-btn ph-warm" onClick={() => decide(c, 'burn')}>Burn it</button>
          </div>
        </Box>
      )}
    </>
  )
}

/* ---------- 4. QUICK LOG (shop menu) ---------- */

const CATEGORIES = ['coffee', 'transport', 'bread', 'groceries', 'games', 'apps', 'other']

function QuickLog({ txs, add }: { txs: Transaction[]; add: (amount: number, category: string, account: Transaction['account']) => void }) {
  const [amt, setAmt] = useState('')
  const [cat, setCat] = useState('coffee')
  const [acct, setAcct] = useState<Transaction['account']>('cash')
  const [newest, setNewest] = useState<string | null>(null)
  const key = (k: string) => setAmt((a) => (k === '⌫' ? a.slice(0, -1) : k === '.' && (a.includes('.') || acct === 'cash') ? a : (a + k).slice(0, 8)))
  const buy = (amount: number, category: string, account: Transaction['account']) => {
    if (!(amount > 0)) return
    add(amount, category, account)
    setNewest(`${amount}-${category}-${Date.now()}`)
    setAmt('')
  }
  return (
    <>
      <Box title="Shop · quick log" right={<span className="ph-dim ph-small">one tap for the usual</span>} pop>
        <div className="ph-slots" role="group" aria-label="Repeat items">
          {REPEAT_CHIPS.map((r, i) => (
            <button key={i} className="ph-slot" onClick={() => buy(r.amount, r.category, 'cash')}>
              <span>{r.category}</span><span>{fmtDA(r.amount)}</span>
            </button>
          ))}
        </div>
        <hr className="ph-sep" />
        <div className="ph-row ph-small" style={{ marginBottom: 6 }}>
          <span className="ph-seg" role="group" aria-label="Account">
            {ACCOUNTS.map((a) => <button key={a.id} className="ph-btn ph-small" aria-pressed={acct === a.id} onClick={() => { setAcct(a.id); setAmt('') }}>{a.currency}</button>)}
          </span>
          <select className="ph-btn ph-small" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="ph-amount" aria-live="polite">{amt || '0'} <span className="ph-num">{acct === 'cash' ? 'DA' : 'USD'}</span></div>
        <div className="ph-keypad" style={{ marginTop: 6 }} role="group" aria-label="Keypad">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((k) => (
            <button key={k} className="ph-key" onClick={() => key(k)} aria-label={k === '⌫' ? 'Delete' : k}>{k}</button>
          ))}
        </div>
        <div className="ph-btns">
          <button className="ph-btn ph-primary" style={{ flex: 1 }} onClick={() => buy(Number(amt), cat, acct)} disabled={!(Number(amt) > 0)}>▶ Log {amt ? fmtMoney(Number(amt), acct === 'cash' ? 'DA' : 'USD') : 'it'}</button>
        </div>
      </Box>

      <Box title="Recent" right={<span className="ph-dim ph-small">{txs.length} entries</span>}>
        <ul className="ph-recent">
          {txs.slice(0, 8).map((t, i) => (
            <li key={t.id} className={i === 0 && newest ? 'new' : undefined}>
              <span>{t.category} <span className="ph-dim ph-small">· {t.merchant} · {t.source === 'inbox' ? 'letter' : 'by hand'}</span></span>
              <span>{fmtMoney(t.amount, t.currency)}</span>
            </li>
          ))}
        </ul>
      </Box>
    </>
  )
}
