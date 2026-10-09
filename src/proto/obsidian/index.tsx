/**
 * OBSIDIAN — a ship's console. Breathing room is the reactor; accounts are
 * fuel cells; obligations are scheduled burns on a mission clock. Cold
 * instrumentation with one warm thing in the middle: the ember core.
 */
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ACCOUNTS,
  BREATHING_ROOM_DA,
  CANDIDATES,
  DAYS_TO_PAYDAY,
  FX_DA_PER_USD,
  OBLIGATIONS,
  PAYDAY,
  REPEAT_CHIPS,
  TODAY,
  TOTAL_HOLDINGS_DA,
  TRANSACTIONS,
  fmtDA,
  fmtMoney,
  fmtUSD,
  toDA,
  type Candidate,
  type Obligation,
  type Transaction,
} from '../data.ts'
import { Icon, Keycap, Panel, ReactorGauge, StatusDot, dayOf, fmtDay, pad2, useCountUp, useReducedMotion } from './parts.tsx'
import './obsidian.css'

type Tab = 'home' | 'runway' | 'review' | 'log'
const TABS: { id: Tab; label: string; code: string }[] = [
  { id: 'home', label: 'Console', code: '01' },
  { id: 'runway', label: 'Radar', code: '02' },
  { id: 'review', label: 'Inbox', code: '03' },
  { id: 'log', label: 'Log', code: '04' },
]

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@200;300;400;500;600&family=Barlow+Condensed:wght@500;600&display=swap'

const TODAY_D = dayOf(TODAY)
const PAYDAY_D = dayOf(PAYDAY)
const AXIS_START = 1

const FLAG_TAG: Record<NonNullable<Candidate['flag']>, [string, string]> = {
  duplicate: ['[DUP ×2 → 1]', 'two emails, one purchase — stored once'],
  not_a_charge: ['[NOT A CHARGE]', 'renewal notice; no money moved'],
  promo: ['[PROMO]', 'marketing mail, $0 — likely not a charge'],
}

/* ---------------- root ---------------- */

export default function ObsidianProto() {
  const [tab, setTab] = useState<Tab>('home')
  const [paid, setPaid] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(OBLIGATIONS.map((o) => [o.id, o.status === 'paid'])),
  )
  const [rdpConfirmed, setRdpConfirmed] = useState(false)
  const [logs, setLogs] = useState<Transaction[]>([])
  const reduced = useReducedMotion()

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
    return () => {
      document.head.removeChild(link)
    }
  }, [])

  const dueDA = useMemo(
    () => OBLIGATIONS.filter((o) => !paid[o.id] && o.dueDate <= PAYDAY).reduce((s, o) => s + toDA(o.amount, o.currency), 0),
    [paid],
  )
  const loggedDA = useMemo(() => logs.reduce((s, t) => s + toDA(t.amount, t.currency), 0), [logs])
  const room = TOTAL_HOLDINGS_DA - dueDA - loggedDA
  const perDay = Math.floor(room / DAYS_TO_PAYDAY)

  const togglePaid = (id: string) => setPaid((p) => ({ ...p, [id]: !p[id] }))
  const addLog = (t: Omit<Transaction, 'id' | 'date'>) =>
    setLogs((l) => [{ ...t, id: `l${Date.now()}`, date: TODAY }, ...l])

  return (
    <div className="proto-obsidian">
      <div className="ob-frame">
        <header className="ob-strip">
          <span className="ob-brand">
            <StatusDot tone="amber" blink={!reduced} /> EMBER <em>//</em> CONSOLE
          </span>
          <span className="ob-strip-data">
            <span>T-{pad2(DAYS_TO_PAYDAY)} PAYDAY</span>
            <span>FX {FX_DA_PER_USD} DA/USD</span>
            <span>{fmtDay(TODAY)} 2026</span>
            <a className="ob-back-strip" href="#/proto">← PROTOS</a>
          </span>
        </header>

        <nav className="ob-rail" aria-label="Modules">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ob-rail-btn ${tab === t.id ? 'is-on' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.id} />
              <span className="ob-rail-label">{t.label}</span>
              <span className="ob-rail-code">{t.code}</span>
            </button>
          ))}
          <a className="ob-back" href="#/proto">
            ← PROTOS
          </a>
        </nav>

        <main className="ob-main">
          {tab === 'home' && (
            <Home room={room} perDay={perDay} paid={paid} togglePaid={togglePaid} rdpConfirmed={rdpConfirmed} onConfirm={() => setRdpConfirmed(true)} go={setTab} reduced={reduced} />
          )}
          {tab === 'runway' && <Runway room={room} paid={paid} togglePaid={togglePaid} reduced={reduced} />}
          {tab === 'review' && <Review onCommit={addLog} />}
          {tab === 'log' && <QuickLog logs={logs} onAdd={addLog} room={room} />}
        </main>
      </div>
    </div>
  )
}

/* ---------------- screen 1: console ---------------- */

function Readout({ value, unit, label, tone }: { value: number; unit: string; label: string; tone?: 'amber' }) {
  const v = useCountUp(value)
  return (
    <div className={`ob-readout ${tone ? `ob-readout-${tone}` : ''}`}>
      <span className="ob-micro">{label}</span>
      <span className="ob-readout-num">
        {Math.round(v).toLocaleString('en-US')}
        <small>{unit}</small>
      </span>
    </div>
  )
}

function Home({
  room, perDay, paid, togglePaid, rdpConfirmed, onConfirm, go, reduced,
}: {
  room: number
  perDay: number
  paid: Record<string, boolean>
  togglePaid: (id: string) => void
  rdpConfirmed: boolean
  onConfirm: () => void
  go: (t: Tab) => void
  reduced: boolean
}) {
  const shown = useCountUp(room)
  const delta = room - BREATHING_ROOM_DA
  const next = OBLIGATIONS.filter((o) => !paid[o.id]).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3)
  const [cash, rdp] = ACCOUNTS

  return (
    <div className="ob-grid ob-grid-home">
      <Panel title="Reactor" meta={<><StatusDot tone="cyan" blink={!reduced} /> FORECAST · NOT A VERDICT</>} className="ob-reactor">
        <div className="ob-reactor-body">
          <ReactorGauge value={shown} max={TOTAL_HOLDINGS_DA} reduced={reduced} />
          <div className="ob-reactor-read">
            <span className="ob-micro">BREATHING ROOM · FREE BEFORE PAYDAY</span>
            <div className="ob-hero">
              {Math.round(shown).toLocaleString('en-US')}
              <small>DA</small>
            </div>
            {delta !== 0 && (
              <span className="ob-delta">
                Δ {delta > 0 ? '+' : '−'}
                {Math.abs(delta).toLocaleString('en-US')} vs baseline
              </span>
            )}
            <div className="ob-readout-row">
              <Readout value={perDay} unit="DA/DAY" label="BURN RATE" />
              <Readout value={DAYS_TO_PAYDAY} unit="DAYS" label="TO PAYDAY" />
            </div>
            <p className="ob-note">holdings {fmtDA(TOTAL_HOLDINGS_DA)} − scheduled burns = free. every number is explainable.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Fuel cells" meta="2 / 2 ONLINE" className="ob-cells">
        <FuelCell
          name={cash.name}
          main={fmtDA(cash.estimatedBalance)}
          sub="MANUAL · CONFIRMED TODAY"
          level={1}
          tone="cyan"
        />
        <FuelCell
          name={rdp.name}
          main={fmtUSD(rdp.estimatedBalance)}
          sub={
            rdpConfirmed
              ? `≈ ${fmtDA(toDA(rdp.estimatedBalance, 'USD'))} · MANUAL · CONFIRMED TODAY`
              : `≈ ${fmtDA(toDA(rdp.estimatedBalance, 'USD'))} · ESTIMATED · LAST CONFIRMED 3D AGO`
          }
          level={rdp.estimatedBalance / rdp.anchorBalance}
          tone={rdpConfirmed ? 'cyan' : 'amber'}
          action={!rdpConfirmed && <Keycap tone="amber" onClick={onConfirm}>CONFIRM BALANCE</Keycap>}
        />
      </Panel>

      <Panel title="Next burns" meta={<button type="button" className="ob-link" onClick={() => go('runway')}>FULL RADAR →</button>} className="ob-next">
        <ul className="ob-burns">
          {next.map((o) => (
            <BurnRow key={o.id} o={o} paid={false} onToggle={() => togglePaid(o.id)} />
          ))}
        </ul>
        {next.length === 0 && <p className="ob-note">all scheduled burns complete.</p>}
      </Panel>

      <Panel title="Modules" className="ob-modules">
        <div className="ob-module-row">
          <Keycap tone="cyan" onClick={() => go('review')}>INBOX · {CANDIDATES.length} PENDING</Keycap>
          <Keycap onClick={() => go('log')}>QUICK LOG ›</Keycap>
        </div>
      </Panel>
    </div>
  )
}

function FuelCell({ name, main, sub, level, tone, action }: { name: string; main: string; sub: string; level: number; tone: 'cyan' | 'amber'; action?: ReactNode }) {
  const pct = useCountUp(level * 100)
  return (
    <div className={`ob-cell ob-cell-${tone}`}>
      <div className="ob-cell-top">
        <span className="ob-micro">{name}</span>
        <span className="ob-micro">{Math.round(pct)}%</span>
      </div>
      <div className="ob-cell-main">{main}</div>
      <div className="ob-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="ob-cell-foot">
        <span className="ob-micro ob-muted">{sub}</span>
        {action}
      </div>
    </div>
  )
}

function statusTag(o: Obligation, isPaid: boolean): { text: string; tone: 'cyan' | 'amber' | 'red' | 'dim' } {
  const d = dayOf(o.dueDate) - TODAY_D
  if (isPaid) return { text: 'PAID', tone: 'dim' }
  if (d < 0) return { text: `OVERDUE ${Math.abs(d)}D`, tone: 'red' }
  if (o.status === 'estimated') return { text: `EST · T-${pad2(d)}`, tone: 'amber' }
  if (d <= 3) return { text: `DUE · T-${pad2(d)}`, tone: 'amber' }
  return { text: `T-${pad2(d)}`, tone: 'cyan' }
}

function BurnRow({ o, paid, onToggle }: { o: Obligation; paid: boolean; onToggle: () => void }) {
  const tag = statusTag(o, paid)
  const late = tag.tone === 'red'
  return (
    <li>
      <button type="button" className={`ob-burn ${paid ? 'is-paid' : ''} ${late ? 'is-late' : ''}`} onClick={onToggle} aria-pressed={paid}>
        <span className="ob-burn-date">{fmtDay(o.dueDate)}</span>
        <span className="ob-burn-name">
          {o.name}
          {o.progress && (
            <span className="ob-seg" aria-label={`${o.progress.paid} of ${o.progress.total} paid`}>
              {Array.from({ length: o.progress.total }, (_, i) => (
                <i key={i} className={i < o.progress!.paid ? 'on' : ''} />
              ))}
              <small>{o.progress.paid}/{o.progress.total}</small>
            </span>
          )}
          {o.history && <small className="ob-muted"> [{(o.history[0] / 1000).toFixed(1)}k–{(Math.max(...o.history) / 1000).toFixed(1)}k]</small>}
        </span>
        <span className="ob-burn-amt">
          {fmtMoney(o.amount, o.currency)}
          {o.currency === 'USD' && <small>≈ {fmtDA(toDA(o.amount, 'USD'))}</small>}
        </span>
        <span className={`ob-tag ob-tag-${tag.tone}`}>
          <StatusDot tone={tag.tone} /> {tag.text}
        </span>
        {late && <span className="ob-nudge">still open — mark it when it's done, no rush</span>}
      </button>
    </li>
  )
}

/* ---------------- screen 2: radar ---------------- */

function Runway({ room, paid, togglePaid, reduced }: { room: number; paid: Record<string, boolean>; togglePaid: (id: string) => void; reduced: boolean }) {
  const shown = useCountUp(room)
  const span = PAYDAY_D - AXIS_START
  const x = (iso: string) => ((dayOf(iso) - AXIS_START) / span) * 100
  const sorted = [...OBLIGATIONS].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return (
    <div className="ob-grid ob-grid-runway">
      <Panel title="Mission clock" meta={<>{fmtDay(TODAY)} → {fmtDay(PAYDAY)} · <strong>{Math.round(shown).toLocaleString('en-US')} DA</strong> FREE</>} className="ob-radar-panel">
        <div className={`ob-radar ${reduced ? '' : 'ob-radar-sweep'}`}>
          <div className="ob-axis">
            {Array.from({ length: span + 1 }, (_, i) => (
              <i key={i} className={`ob-axis-tick ${i % 7 === 0 ? 'major' : ''}`} style={{ left: `${(i / span) * 100}%` }} />
            ))}
            <span className="ob-axis-lbl" style={{ left: 0 }}>01</span>
            <span className="ob-axis-lbl" style={{ left: `${x(PAYDAY)}%` }}>30 · PAYDAY</span>
          </div>
          <div className="ob-past" style={{ width: `${x(TODAY)}%` }} />
          <div className="ob-now" style={{ left: `${x(TODAY)}%` }}>
            <span>NOW</span>
          </div>
          {sorted.map((o, i) => {
            const isPaid = paid[o.id]
            const tag = statusTag(o, isPaid)
            const lvl = i % 3
            return (
              <button
                key={o.id}
                type="button"
                className={`ob-mark ob-mark-${tag.tone} lvl-${lvl} ${isPaid ? 'is-paid' : ''}`}
                style={{ left: `${x(o.dueDate)}%` }}
                onClick={() => togglePaid(o.id)}
                aria-pressed={isPaid}
                aria-label={`${o.name}, ${fmtMoney(o.amount, o.currency)}, ${fmtDay(o.dueDate)}, ${tag.text}`}
              >
                <i className="ob-mark-line" />
                <span className="ob-mark-lbl">
                  {o.name}
                  <b>{o.history ? `[${(o.history[0] / 1000).toFixed(1)}k–${(Math.max(...o.history) / 1000).toFixed(1)}k]` : fmtMoney(o.amount, o.currency)}</b>
                </span>
                <i className="ob-mark-pt" />
              </button>
            )
          })}
        </div>
        <p className="ob-note">tap a target to toggle paid · the reactor re-sweeps · paid rent sits behind the NOW line</p>
      </Panel>

      <Panel title="Burn schedule" meta={`${sorted.filter((o) => !paid[o.id]).length} OPEN`}>
        <ul className="ob-burns">
          {sorted.map((o) => (
            <BurnRow key={o.id} o={o} paid={paid[o.id]} onToggle={() => togglePaid(o.id)} />
          ))}
        </ul>
        {OBLIGATIONS.filter((o) => o.history).map((o) => (
          <p key={o.id} className="ob-note">
            {o.name.toUpperCase()} is variable: last {o.history!.map((h) => fmtDA(h)).join(' → ')}. estimate holds the latest until the real bill lands.
          </p>
        ))}
      </Panel>
    </div>
  )
}

/* ---------------- screen 3: inbox review ---------------- */

type Leaving = 'commit' | 'reject'

function Review({ onCommit }: { onCommit: (t: Omit<Transaction, 'id' | 'date'>) => void }) {
  const [rows, setRows] = useState<Candidate[]>(CANDIDATES)
  const [open, setOpen] = useState<string | null>(CANDIDATES[1].id)
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({})
  const reduced = useReducedMotion()

  const settle = (c: Candidate, how: Leaving) => {
    if (how === 'commit') {
      onCommit({ amount: c.amount, currency: c.currency, category: c.suggestedCategory, merchant: c.merchant, account: c.currency === 'DA' ? 'cash' : 'redotpay', source: 'inbox' })
    }
    const remove = () => setRows((r) => r.filter((x) => x.id !== c.id))
    if (reduced) return remove()
    setLeaving((l) => ({ ...l, [c.id]: how }))
    window.setTimeout(remove, 260)
  }

  return (
    <div className="ob-grid">
      <Panel title="Inbox parser" meta={`${rows.length} CLAIMS · YOU DECIDE`} className="ob-tray">
        <div className="ob-table-h ob-row-grid">
          <span>MERCHANT</span><span>AMOUNT</span><span>DATE</span><span>CONF</span><span />
        </div>
        {rows.length === 0 && <p className="ob-note">tray clear. nothing was committed without you.</p>}
        {rows.map((c) => {
          const isOpen = open === c.id
          const flag = c.flag ? FLAG_TAG[c.flag] : null
          const confTone = c.confidence >= 0.8 ? 'cyan' : c.confidence >= 0.4 ? 'amber' : 'dim'
          return (
            <div key={c.id} className={`ob-row ${leaving[c.id] ? `is-${leaving[c.id]}` : ''}`}>
              <button type="button" className="ob-row-grid ob-row-btn" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen}>
                <span className="ob-row-merchant">
                  <b className="ob-caret">{isOpen ? '▾' : '▸'}</b> {c.merchant}
                  {flag && <span className="ob-flag">{flag[0]}</span>}
                </span>
                <span className="ob-row-amt">
                  {fmtMoney(c.amount, c.currency)}
                  {c.currency === 'USD' && c.amount > 0 && <small>≈ {fmtDA(toDA(c.amount, 'USD'))}</small>}
                </span>
                <span>{fmtDay(c.date)}</span>
                <span className={`ob-conf ob-conf-${confTone}`}>
                  <i style={{ width: `${c.confidence * 100}%` }} /> {Math.round(c.confidence * 100)}%
                </span>
                <span className="ob-row-src">{c.sources.length} SRC</span>
              </button>
              {isOpen && (
                <div className="ob-row-body">
                  <pre className="ob-log">
                    {c.sources.map((s, i) => `FROM  ${s.from}\nSUBJ  ${s.subject}${i < c.sources.length - 1 ? '\n──\n' : ''}`).join('')}
                    {`\nCAT   ${c.suggestedCategory}`}
                    {flag ? `\nFLAG  ${flag[0]} ${flag[1]}` : '\nFLAG  none — parser is fairly sure'}
                  </pre>
                  <div className="ob-row-actions">
                    <Keycap tone="cyan" onClick={() => settle(c, 'commit')} ariaLabel={`Confirm ${c.merchant}`}>
                      ↵ CONFIRM{c.flag === 'duplicate' ? ' ×1' : ''}
                    </Keycap>
                    <Keycap onClick={() => settle(c, 'reject')} ariaLabel={`Reject ${c.merchant}`}>
                      ⌫ REJECT
                    </Keycap>
                    <span className="ob-micro ob-muted">a claim with evidence. nothing commits until you press.</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </Panel>
    </div>
  )
}

/* ---------------- screen 4: quick log ---------------- */

function parseCmd(raw: string): Omit<Transaction, 'id' | 'date'> | null {
  const parts = raw.trim().replace(/^>\s*/, '').split(/\s+/).filter(Boolean)
  const amount = parseFloat(parts[0] ?? '')
  if (!amount || amount <= 0) return null
  const rest = parts.slice(1)
  let account: Transaction['account'] = 'cash'
  const ai = rest.findIndex((w) => /^(cash|ccp|rdp|redotpay|card|usd)$/i.test(w))
  if (ai >= 0) {
    if (/^(rdp|redotpay|card|usd)$/i.test(rest[ai])) account = 'redotpay'
    rest.splice(ai, 1)
  }
  const category = (rest[0] ?? 'misc').toLowerCase()
  const merchant = rest.slice(1).join(' ') || '—'
  return { amount, currency: account === 'cash' ? 'DA' : 'USD', category, merchant, account, source: 'manual' }
}

function QuickLog({ logs, onAdd, room }: { logs: Transaction[]; onAdd: (t: Omit<Transaction, 'id' | 'date'>) => void; room: number }) {
  const [cmd, setCmd] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const all = [...logs, ...TRANSACTIONS]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = parseCmd(cmd)
    if (!t) return setErr('SYNTAX: <amount> <category> [merchant…] [cash|rdp]')
    onAdd(t)
    setCmd('')
    setErr(null)
  }

  return (
    <div className="ob-grid">
      <Panel title="Quick log" meta={<>{Math.round(room).toLocaleString('en-US')} DA FREE</>} className="ob-logpanel">
        <div className="ob-chips">
          <span className="ob-micro ob-muted">REPEAT</span>
          {REPEAT_CHIPS.map((c) => (
            <Keycap key={`${c.amount}-${c.category}`} onClick={() => onAdd({ amount: c.amount, currency: 'DA', category: c.category, merchant: '—', account: 'cash', source: 'manual' })}>
              {c.amount} {c.category.toUpperCase()}
            </Keycap>
          ))}
        </div>
        <form className="ob-cmd" onSubmit={submit}>
          <label htmlFor="ob-cmd-in" className="ob-prompt">&gt;</label>
          <input
            id="ob-cmd-in"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="150 coffee cash"
            autoComplete="off"
            spellCheck={false}
            aria-label="Log a spend: amount, category, optional merchant, optional account"
          />
          <Keycap tone="cyan" className="ob-cmd-go">↵ LOG</Keycap>
        </form>
        <p className={`ob-note ${err ? 'ob-err' : ''}`}>{err ?? 'amount · category · merchant · account (cash | rdp). cash is DA, rdp is USD.'}</p>
        <ol className="ob-feed" aria-live="polite">
          {all.map((t, i) => (
            <li key={t.id} className={i < logs.length ? 'is-new' : ''}>
              <span className="ob-muted">{fmtDay(t.date)}</span>
              <span className="ob-feed-amt">−{fmtMoney(t.amount, t.currency)}</span>
              <span>{t.category}</span>
              <span className="ob-muted">{t.merchant}</span>
              <span className={`ob-tag ob-tag-${t.source === 'inbox' ? 'amber' : 'dim'}`}>{t.source === 'inbox' ? 'INBOX' : 'MANUAL'}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
