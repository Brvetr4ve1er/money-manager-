import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import App from '../App.tsx'
import { addDaysISO, addMonthsISO, shortDay } from '../engine/dates.ts'
import { nextPayday } from '../engine/money.ts'
import { todayISO } from '../state/store.ts'
import type { Obligation, Payment } from '../state/slices/money.ts'

// Sounds are reinforcement only; jsdom has no AudioContext, so stub the module.
vi.mock('../audio/chiptune.ts', () => ({
  setMuted: vi.fn(),
  blip: vi.fn(),
  arpeggio: vi.fn(),
  fanfare: vi.fn(),
  sparkle: vi.fn(),
  deny: vi.fn(),
  reveal: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
  if (typeof globalThis.crypto.randomUUID !== 'function') {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => `${Math.random()}`.slice(2),
      configurable: true,
    })
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Switch rooms the way a dock tap does: set the hash, fire hashchange. */
const goto = (route: 'home' | 'runway' | 'jars' | 'learn' | 'me') =>
  act(() => {
    window.location.hash = `#/${route}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

/* ------------------------------ fixtures ------------------------------ */

const ISO = '2026-01-01T00:00:00.000Z'
const ACCOUNT = { id: 'acc-ccp', name: 'CCP', currency: 'DA', anchorBalance: 50000, anchorAt: ISO, archived: false, updatedAt: ISO }

function ob(p: Partial<Obligation> & { id: string }): Obligation {
  return {
    name: p.id,
    amount: 1000,
    currency: 'DA',
    kind: 'bill',
    cadence: 'monthly',
    firstDue: todayISO(),
    accountId: 'acc-ccp',
    installment: null,
    nextStep: '',
    archived: false,
    updatedAt: ISO,
    ...p,
  }
}

interface Seed {
  obligations?: Obligation[]
  payments?: Payment[]
  fx?: number | null
  paydayDay?: number | null
}
function seed({ obligations = [], payments = [], fx = null, paydayDay = null }: Seed) {
  localStorage.setItem(
    'ember-state-v1',
    JSON.stringify({
      money: {
        accounts: [ACCOUNT],
        obligations,
        payments,
        settings: { fxDaPerUsd: fx, paydayDay, split: [], savedAt: ISO },
      },
    }),
  )
}

const stored = () => JSON.parse(localStorage.getItem('ember-state-v1') ?? '{}')

function openRunway() {
  render(<App />)
  goto('runway')
}

/** The header's "likely to go out before payday" figure. */
const dueTotal = () => document.querySelectorAll('.rw-stat-num')[1]?.textContent

/** The thread node for an obligation (its <li>). */
const node = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement

/* -------------------------------- tests -------------------------------- */

describe('Runway: empty state and adding', () => {
  it('explains itself, opens the form, and persists a new obligation', () => {
    seed({})
    openRunway()
    expect(screen.getByText(/A thread of light from today to payday/)).toBeTruthy()
    const form = screen.getByRole('form', { name: 'Add something that repeats' })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Idoom' } })
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '2500' } })
    fireEvent.change(within(form).getByLabelText('Next step (optional)'), { target: { value: 'open BaridiMob → Idoom → pay' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add to the runway' }))

    const obs = stored().money.obligations
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({
      name: 'Idoom',
      amount: 2500,
      currency: 'DA',
      kind: 'bill',
      cadence: 'monthly',
      firstDue: todayISO(),
      accountId: 'acc-ccp',
      nextStep: 'open BaridiMob → Idoom → pay',
      archived: false,
    })
    // On the thread now, with its next step under the due label.
    const n = node('Idoom')
    expect(within(n).getByText('open BaridiMob → Idoom → pay')).toBeTruthy()
    expect(within(n).getByText(/due today/)).toBeTruthy()
  })

  it('validates inline and saves nothing while a field is wrong', () => {
    openRunway()
    const form = screen.getByRole('form', { name: 'Add something that repeats' })
    fireEvent.click(within(form).getByRole('button', { name: 'Add to the runway' }))
    expect(within(form).getByText(/Give it a name/)).toBeTruthy()
    expect(within(form).getByText(/amount needs to be a number above 0/)).toBeTruthy()
    expect(within(form).getByLabelText('Name').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(within(form).getByLabelText('Name'))
    expect(stored().money?.obligations ?? []).toHaveLength(0)

    // Installment fields appear only for installments, and are checked too.
    expect(within(form).queryByLabelText('Payments in all')).toBeNull()
    fireEvent.change(within(form).getByLabelText('Kind'), { target: { value: 'installment' } })
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Phone' } })
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '4000' } })
    fireEvent.change(within(form).getByLabelText('Payments in all'), { target: { value: '6' } })
    fireEvent.change(within(form).getByLabelText('Already paid'), { target: { value: '9' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add to the runway' }))
    expect(within(form).getByText('Already paid can be from 0 up to 6.')).toBeTruthy()
    expect(within(form).queryByText(/Give it a name/)).toBeNull()
    expect(stored().money.obligations).toHaveLength(0)

    fireEvent.change(within(form).getByLabelText('Already paid'), { target: { value: '2' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add to the runway' }))
    expect(stored().money.obligations[0]).toMatchObject({ name: 'Phone', kind: 'installment', installment: { total: 6, paidBefore: 2 } })
  })

  it('edits and archives behind a confirm', () => {
    seed({ obligations: [ob({ id: 'rent', name: 'Rent', amount: 20000, firstDue: addDaysISO(todayISO(), 10) })] })
    openRunway()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rent' }))
    const form = screen.getByRole('form', { name: 'Edit Rent' })
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '22000' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }))
    expect(stored().money.obligations[0].amount).toBe(22000)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Rent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive…' }))
    expect(stored().money.obligations[0].archived).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, archive it' }))
    expect(stored().money.obligations[0].archived).toBe(true)
    expect(screen.queryByRole('heading', { level: 3, name: 'Rent' })).toBeNull()
  })
})

describe('Runway: the thread', () => {
  it('shows a late bill as gone out, with a gentle Relight', () => {
    seed({ obligations: [ob({ id: 'idoom', name: 'Idoom', firstDue: addDaysISO(todayISO(), -4) })] })
    openRunway()
    const n = node('Idoom')
    expect(within(n).getByText(/4 days late/)).toBeTruthy()
    expect(within(n).getByText('Gone out')).toBeTruthy()
    expect(within(n).getByRole('button', { name: 'Relight? Pay Idoom' }).textContent).toBe('Relight?')
    expect(n.querySelector('svg.obj')?.getAttribute('data-state')).toBe('out')
  })

  it('places Today and Payday markers on the thread in order', () => {
    const today = todayISO()
    const payday = nextPayday({ fxDaPerUsd: null, paydayDay: 28, split: [], savedAt: '' }, today)
    seed({
      paydayDay: 28,
      obligations: [
        ob({ id: 'before', name: 'Before', firstDue: addDaysISO(today, -1) }),
        ob({ id: 'soon', name: 'Soon', firstDue: payday }),
        ob({ id: 'after', name: 'After', firstDue: addDaysISO(payday, 3) }),
      ],
    })
    openRunway()
    const marker = screen.getByText(`Payday · ${shortDay(payday)}`)
    expect(marker).toBeTruthy()
    const order = Array.from(document.querySelectorAll('.rw-thread > li')).map(
      (li) => li.querySelector('h3')?.textContent ?? li.textContent,
    )
    expect(order).toEqual(['Before', `Today · ${shortDay(today)}`, 'Soon', `Payday · ${shortDay(payday)}`, 'After'])
    // Header counts the two cycles due on or before payday.
    expect(dueTotal()).toBe('2,000 DA')
  })

  it('paying logs a Bills transaction, advances the due date, and Undo voids it', () => {
    const due = addDaysISO(todayISO(), 2)
    seed({ obligations: [ob({ id: 'idoom', name: 'Idoom', amount: 2500, firstDue: due })] })
    openRunway()
    fireEvent.click(screen.getByRole('button', { name: 'Pay Idoom' }))
    const form = screen.getByRole('form', { name: 'Pay Idoom' })
    expect((within(form).getByLabelText(/Amount/) as HTMLInputElement).value).toBe('2500')
    expect((within(form).getByLabelText('Paid from') as HTMLSelectElement).value).toBe('acc-ccp')
    fireEvent.click(within(form).getByRole('button', { name: 'Confirm payment' }))

    const s = stored()
    expect(s.transactions).toHaveLength(1)
    const tx = s.transactions[0]
    expect(tx).toMatchObject({ amountDA: 2500, category: 'Bills', obligationId: 'idoom', accountId: 'acc-ccp', date: todayISO() })
    expect(s.money.payments).toHaveLength(1)
    expect(s.money.payments[0]).toMatchObject({ obligationId: 'idoom', due, paidOn: todayISO(), amount: 2500, txId: tx.id, void: false })

    const n = node('Idoom')
    expect(within(n).getByText(new RegExp(shortDay(addMonthsISO(due, 1))))).toBeTruthy()
    expect(n.className).toContain('is-bloom')
    expect(within(n).getByText('Lit')).toBeTruthy()

    fireEvent.click(within(n).getByRole('button', { name: 'Undo' }))
    const after = stored()
    expect(after.transactions).toHaveLength(0)
    expect(after.money.payments[0].void).toBe(true)
    expect(within(node('Idoom')).getByText(new RegExp(shortDay(due)))).toBeTruthy()
  })

  it('takes the real amount for a variable bill and shows its history', () => {
    const today = todayISO()
    const payments: Payment[] = [3000, 3400, 2900].map((amount, i) => ({
      id: `p${i}`,
      obligationId: 'sonelgaz',
      due: addMonthsISO(addDaysISO(today, -60), i),
      paidOn: addMonthsISO(addDaysISO(today, -60), i),
      amount,
      currency: 'DA',
      txId: `t${i}`,
      void: false,
      updatedAt: ISO,
    }))
    seed({ obligations: [ob({ id: 'sonelgaz', name: 'Sonelgaz', kind: 'variable', amount: 3000, firstDue: addDaysISO(today, -60) })], payments })
    openRunway()
    const n = node('Sonelgaz')
    expect(within(n).getByText(/Last three: 3,000 DA · 3,400 DA · 2,900 DA/)).toBeTruthy()
    fireEvent.click(within(n).getByRole('button', { name: /Pay Sonelgaz/ }))
    const amt = within(n).getByLabelText(/Amount/) as HTMLInputElement
    expect(amt.value).toBe('3100') // mean of the last three
    fireEvent.change(amt, { target: { value: '' } })
    fireEvent.click(within(n).getByRole('button', { name: 'Confirm payment' }))
    expect(within(n).getByText('The amount needs to be a number above 0.')).toBeTruthy()
    fireEvent.change(amt, { target: { value: '3650' } })
    fireEvent.click(within(n).getByRole('button', { name: 'Confirm payment' }))
    expect(stored().transactions[0]).toMatchObject({ amountDA: 3650, category: 'Bills', obligationId: 'sonelgaz' })
  })

  it('Undo is offered for 5 seconds, then the node rests', () => {
    vi.useFakeTimers()
    seed({ obligations: [ob({ id: 'idoom', name: 'Idoom', firstDue: addDaysISO(todayISO(), 1) })] })
    openRunway()
    fireEvent.click(screen.getByRole('button', { name: 'Pay Idoom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(stored().transactions).toHaveLength(1)
  })

  it('blocks a USD payment without a rate, and converts it once a rate is set', () => {
    const obligations = [ob({ id: 'netflix', name: 'Netflix', kind: 'subscription', currency: 'USD', amount: 9.99, firstDue: addDaysISO(todayISO(), 1) })]
    seed({ obligations })
    openRunway()
    expect(screen.getByText(/Missing rate: 1 USD bill isn’t counted/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pay Netflix' }))
    expect(screen.getByRole('alert').textContent).toMatch(/no DA rate is set yet\. Set the rate on Home/)
    const confirm = screen.getByRole('button', { name: 'Confirm payment' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(stored().transactions ?? []).toHaveLength(0)
    cleanup()

    seed({ obligations, fx: 250 })
    openRunway()
    expect(screen.queryByText(/Missing rate/)).toBeNull()
    expect(within(node('Netflix')).getByText(/≈ 2,498 DA/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pay Netflix' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }))
    expect(stored().transactions[0]).toMatchObject({ amountDA: 2498, original: { amount: 9.99, currency: 'USD' } })
  })

  it('an installment ring shows paid/total and leaves "due" once complete', () => {
    seed({
      obligations: [
        ob({ id: 'phone', name: 'Phone', kind: 'installment', amount: 3000, firstDue: addDaysISO(todayISO(), 1), installment: { total: 12, paidBefore: 11 } }),
      ],
    })
    openRunway()
    const n = node('Phone')
    expect(within(n).getByText('11 of 12 paid · 1 to go')).toBeTruthy()
    expect(n.querySelector('svg.obj-ring')).toBeTruthy()
    expect(dueTotal()).toBe('3,000 DA')

    fireEvent.click(within(n).getByRole('button', { name: 'Pay Phone' }))
    fireEvent.click(within(n).getByRole('button', { name: 'Confirm payment' }))
    const done = node('Phone')
    expect(within(done).getByText('12 of 12 paid')).toBeTruthy()
    expect(within(done).getByText('Paid off')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pay Phone' })).toBeNull()
    // Header: nothing left due before payday.
    expect(dueTotal()).toBe('0 DA')
    // And it no longer counts as something that repeats.
    expect(screen.queryByRole('heading', { name: 'What repeats' })).toBeNull()
  })
})

describe('Runway: what repeats', () => {
  it('totals yearly cost, sorts biggest first, and toggles keep/rethink locally', () => {
    seed({
      obligations: [
        ob({ id: 'm', name: 'Idoom', amount: 1000, firstDue: addDaysISO(todayISO(), 5) }),
        ob({ id: 'w', name: 'Taxi', cadence: 'weekly', amount: 500, firstDue: addDaysISO(todayISO(), 5) }),
        ob({ id: 'y', name: 'Insurance', cadence: 'yearly', amount: 5000, firstDue: addDaysISO(todayISO(), 5) }),
        ob({ id: 'o', name: 'Visa fee', cadence: 'once', amount: 9000, firstDue: addDaysISO(todayISO(), 5) }),
      ],
    })
    openRunway()
    const card = screen.getByRole('heading', { name: 'What repeats' }).closest('section') as HTMLElement
    expect(card.querySelector('.rw-mirror')?.textContent).toBe('3 things repeat, about 43,000 DA a year.')
    const names = Array.from(card.querySelectorAll('.rw-audit-row strong')).map((e) => e.textContent)
    expect(names).toEqual(['Taxi', 'Idoom', 'Insurance'])
    expect(within(card).getByText('26,000 DA a year')).toBeTruthy()

    const before = localStorage.getItem('ember-state-v1')
    const rethink = within(card).getAllByRole('button', { name: 'Rethink' })[0]
    fireEvent.click(rethink)
    expect(rethink.getAttribute('aria-pressed')).toBe('true')
    expect(within(card).getByText(/Marked to rethink: about 26,000 DA a year/)).toBeTruthy()
    // UI only: the persisted state is untouched.
    expect(localStorage.getItem('ember-state-v1')).toBe(before)
  })
})
