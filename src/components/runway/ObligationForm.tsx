import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isValidDayKey } from '../../engine/dates.ts'
import { newId } from '../../state/store.ts'
import type {
  Account,
  Cadence,
  Currency,
  Obligation,
  ObligationKind,
} from '../../state/slices/money.ts'

const KINDS: ReadonlyArray<{ id: ObligationKind; label: string }> = [
  { id: 'bill', label: 'Bill (same amount)' },
  { id: 'variable', label: 'Variable bill (amount changes)' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'installment', label: 'Installment' },
]
const CADENCES: ReadonlyArray<{ id: Cadence; label: string }> = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'once', label: 'Once' },
]

interface Draft {
  name: string
  kind: ObligationKind
  amount: string
  currency: Currency
  cadence: Cadence
  firstDue: string
  accountId: string
  total: string
  paidBefore: string
  nextStep: string
}

type Field = 'name' | 'amount' | 'firstDue' | 'total' | 'paidBefore'
type Errors = Partial<Record<Field, string>>

function draftFrom(ob: Obligation | null, today: string, accounts: Account[]): Draft {
  if (ob === null) {
    return {
      name: '',
      kind: 'bill',
      amount: '',
      currency: 'DA',
      cadence: 'monthly',
      firstDue: today,
      accountId: accounts[0]?.id ?? '',
      total: '',
      paidBefore: '0',
      nextStep: '',
    }
  }
  return {
    name: ob.name,
    kind: ob.kind,
    amount: String(ob.amount),
    currency: ob.currency,
    cadence: ob.cadence,
    firstDue: ob.firstDue,
    accountId: ob.accountId ?? '',
    total: ob.installment ? String(ob.installment.total) : '',
    paidBefore: ob.installment ? String(ob.installment.paidBefore) : '0',
    nextStep: ob.nextStep,
  }
}

const isWhole = (s: string) => /^\d+$/.test(s.trim())

export function validateDraft(d: Draft): Errors {
  const e: Errors = {}
  if (d.name.trim() === '') e.name = 'Give it a name you will recognise, like "Idoom" or "Rent".'
  else if (d.name.trim().length > 60) e.name = 'Keep the name under 60 characters.'
  const amount = Number(d.amount)
  if (d.amount.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
    e.amount = d.kind === 'variable' ? 'Add your best guess — a number above 0. Real amounts land when you pay.' : 'The amount needs to be a number above 0.'
  }
  if (!isValidDayKey(d.firstDue)) e.firstDue = 'Pick a real date for the first due day.'
  if (d.kind === 'installment') {
    const total = Number(d.total)
    if (!isWhole(d.total) || total < 1) e.total = 'How many payments in all? A whole number, 1 or more.'
    else if (!isWhole(d.paidBefore) || Number(d.paidBefore) > total) {
      e.paidBefore = `Already paid can be from 0 up to ${total}.`
    }
  }
  return e
}

const ORDER: Field[] = ['name', 'amount', 'firstDue', 'total', 'paidBefore']

interface Props {
  /** The obligation being edited; null = adding a new one. */
  editing: Obligation | null
  accounts: Account[]
  today: string
  /** Focus the name field on mount (opened by a tap, not the empty state). */
  autoFocus: boolean
  onSave: (ob: Obligation) => void
  onCancel: (() => void) | null
  onArchive: (ob: Obligation) => void
}

export function ObligationForm({ editing, accounts, today, autoFocus, onSave, onCancel, onArchive }: Props) {
  const uid = useId()
  const fid = (f: string) => `${uid}-${f}`
  const [d, setD] = useState<Draft>(() => draftFrom(editing, today, accounts))
  const [errors, setErrors] = useState<Errors>({})
  const [tried, setTried] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus()
  }, [autoFocus])

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    const next = { ...d, [k]: v }
    setD(next)
    // After a first failed save, errors follow the typing so a fixed field
    // clears at once — but nothing shouts before the user has tried.
    if (tried) setErrors(validateDraft(next))
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    const errs = validateDraft(d)
    setTried(true)
    setErrors(errs)
    const first = ORDER.find((f) => errs[f])
    if (first) {
      document.getElementById(fid(first))?.focus()
      return
    }
    const isInstallment = d.kind === 'installment'
    const ob: Obligation = {
      id: editing?.id ?? newId(),
      name: d.name.trim(),
      amount: Number(d.amount),
      currency: d.currency,
      kind: d.kind,
      cadence: d.cadence,
      firstDue: d.firstDue,
      accountId: d.accountId === '' ? null : d.accountId,
      installment: isInstallment ? { total: Number(d.total), paidBefore: Number(d.paidBefore) } : null,
      nextStep: d.nextStep.trim(),
      archived: false,
      updatedAt: new Date().toISOString(),
    }
    onSave(ob)
    if (!editing) {
      setD(draftFrom(null, today, accounts))
      setTried(false)
      setErrors({})
    }
  }

  const err = (f: Field) =>
    errors[f] ? (
      <p className="field-error" id={fid(`${f}-err`)}>
        {errors[f]}
      </p>
    ) : null
  const a11y = (f: Field) => ({
    id: fid(f),
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': errors[f] ? fid(`${f}-err`) : undefined,
  })

  return (
    <form ref={formRef} className="rw-form" onSubmit={submit} noValidate aria-label={editing ? `Edit ${editing.name}` : 'Add something that repeats'}>
      <div className="rw-form-grid">
        <div className="field-wrap rw-span">
          <label className="field-label" htmlFor={fid('name')}>Name</label>
          <input
            ref={nameRef}
            className="field"
            {...a11y('name')}
            value={d.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Idoom internet"
            autoComplete="off"
          />
          {err('name')}
        </div>

        <div className="field-wrap">
          <label className="field-label" htmlFor={fid('kind')}>Kind</label>
          <select id={fid('kind')} className="field" value={d.kind} onChange={(e) => set('kind', e.target.value as ObligationKind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </div>

        <div className="field-wrap">
          <label className="field-label" htmlFor={fid('cadence')}>Repeats</label>
          <select id={fid('cadence')} className="field" value={d.cadence} onChange={(e) => set('cadence', e.target.value as Cadence)}>
            {CADENCES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="field-wrap">
          <label className="field-label" htmlFor={fid('amount')}>
            {d.kind === 'variable' ? 'Usual amount (estimate)' : 'Amount'}
          </label>
          <input
            className="field mono"
            {...a11y('amount')}
            inputMode="decimal"
            value={d.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder={d.currency === 'USD' ? '9.99' : '2500'}
          />
          {err('amount')}
        </div>

        <div className="field-wrap">
          <label className="field-label" htmlFor={fid('currency')}>Currency</label>
          <select id={fid('currency')} className="field" value={d.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
            <option value="DA">DA</option>
            <option value="USD">USD (card)</option>
          </select>
        </div>

        <div className="field-wrap">
          <label className="field-label" htmlFor={fid('firstDue')}>
            {d.kind === 'installment' ? 'Next unpaid due date' : 'First due date'}
          </label>
          <input
            type="date"
            className="field"
            {...a11y('firstDue')}
            value={d.firstDue}
            onChange={(e) => set('firstDue', e.target.value)}
          />
          {err('firstDue')}
        </div>

        <div className="field-wrap">
          <label className="field-label" htmlFor={fid('account')}>Paid from</label>
          <select id={fid('account')} className="field" value={d.accountId} onChange={(e) => set('accountId', e.target.value)}>
            <option value="">Not chosen</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {d.kind === 'installment' && (
          <>
            <div className="field-wrap">
              <label className="field-label" htmlFor={fid('total')}>Payments in all</label>
              <input
                className="field mono"
                {...a11y('total')}
                inputMode="numeric"
                value={d.total}
                onChange={(e) => set('total', e.target.value)}
                placeholder="12"
              />
              {err('total')}
            </div>
            <div className="field-wrap">
              <label className="field-label" htmlFor={fid('paidBefore')}>Already paid</label>
              <input
                className="field mono"
                {...a11y('paidBefore')}
                inputMode="numeric"
                value={d.paidBefore}
                onChange={(e) => set('paidBefore', e.target.value)}
              />
              {err('paidBefore')}
            </div>
          </>
        )}

        <div className="field-wrap rw-span">
          <label className="field-label" htmlFor={fid('nextStep')}>Next step (optional)</label>
          <input
            id={fid('nextStep')}
            className="field"
            value={d.nextStep}
            onChange={(e) => set('nextStep', e.target.value)}
            placeholder="open BaridiMob → Idoom → pay"
            autoComplete="off"
          />
        </div>
      </div>

      {tried && Object.keys(errors).length > 0 && (
        <p className="sr-only" role="alert">
          {Object.keys(errors).length === 1 ? 'One field needs a look.' : `${Object.keys(errors).length} fields need a look.`}
        </p>
      )}

      <div className="log-actions">
        <button type="submit" className="btn btn-flame">{editing ? 'Save changes' : 'Add to the runway'}</button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        )}
        {editing && !confirmArchive && (
          <button type="button" className="btn rw-quiet" onClick={() => setConfirmArchive(true)}>Archive…</button>
        )}
      </div>
      {editing && confirmArchive && (
        <div className="rw-confirm" role="group" aria-label={`Archive ${editing.name}?`}>
          <p>Archive {editing.name}? It leaves the runway; payments already made stay in your ledger.</p>
          <div className="log-actions">
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => onArchive({ ...editing, archived: true, updatedAt: new Date().toISOString() })}
            >
              Yes, archive it
            </button>
            <button type="button" className="btn" onClick={() => setConfirmArchive(false)}>Keep it</button>
          </div>
        </div>
      )}
    </form>
  )
}
