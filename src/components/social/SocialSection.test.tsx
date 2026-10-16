import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import App from '../../App.tsx'

// Sounds are reinforcement only; jsdom has no AudioContext, so stub the module.
vi.mock('../../audio/chiptune.ts', () => ({
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

const goto = (route: 'home' | 'runway' | 'jars' | 'learn' | 'me') =>
  act(() => {
    window.location.hash = `#/${route}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

const saved = () => JSON.parse(localStorage.getItem('ember-state-v1') ?? '{}').social

const card = (title: string) => screen.getByRole('heading', { name: title, level: 2 }).closest('section') as HTMLElement

describe('tontines', () => {
  it('validates, creates a tontine, and marks a round paid', () => {
    render(<App />)
    goto('me')
    const tontines = within(card('Tontines'))
    fireEvent.click(tontines.getByRole('button', { name: 'Add a tontine' }))
    fireEvent.change(tontines.getByLabelText('Tontine name'), { target: { value: 'Family daret' } })
    fireEvent.change(tontines.getByLabelText('Each round (DA)'), { target: { value: '5000' } })
    // Only me → inline error, nothing saved
    fireEvent.click(tontines.getByRole('button', { name: 'Save tontine' }))
    expect(tontines.getByRole('alert').textContent).toMatch(/at least 2 people/)
    fireEvent.change(tontines.getByLabelText('Other members, in payout order'), {
      target: { value: 'Amina, Yacine' },
    })
    fireEvent.change(tontines.getByLabelText('My turn (round)'), { target: { value: '5' } })
    fireEvent.click(tontines.getByRole('button', { name: 'Save tontine' }))
    expect(tontines.getByRole('alert').textContent).toMatch(/from 1 to 3/)
    expect(saved().tontines).toEqual([])

    fireEvent.change(tontines.getByLabelText('My turn (round)'), { target: { value: '2' } })
    fireEvent.click(tontines.getByRole('button', { name: 'Save tontine' }))
    const t = saved().tontines[0]
    expect(t).toMatchObject({ name: 'Family daret', contribution: 5000, members: ['Amina', 'Me', 'Yacine'], myTurn: 2 })
    expect(tontines.getByText(/15,000 DA/)).toBeTruthy() // pot = 5,000 × 3
    expect(tontines.getByRole('img', { name: /your turn is round 2/ })).toBeTruthy()

    fireEvent.click(tontines.getByRole('button', { name: /Mark this round paid/ }))
    expect(saved().contributions).toHaveLength(1)
    expect(saved().contributions[0]).toMatchObject({ tontineId: t.id, round: 1, paid: true })
    expect(tontines.getByRole('status').textContent).toMatch(/Round logged/)
    expect(tontines.getByRole('button', { name: /^Mark this round paid \(round 2, Family daret\)$/ })).toBeTruthy()
  })
})

describe('IOUs', () => {
  it('adds a loan and records a partial repayment', () => {
    render(<App />)
    goto('me')
    const ious = within(card('Lent & borrowed'))
    expect(ious.getByText(/about the relationship/)).toBeTruthy()
    fireEvent.click(ious.getByRole('button', { name: 'Add lent or borrowed' }))
    fireEvent.change(ious.getByLabelText('Person'), { target: { value: 'Karim' } })
    fireEvent.change(ious.getByLabelText('How much (DA)'), { target: { value: '10000' } })
    fireEvent.click(ious.getByRole('button', { name: 'Save' }))
    expect(saved().ious[0]).toMatchObject({ person: 'Karim', direction: 'lent', amount: 10000, dueDate: null })

    const owed = within(ious.getByRole('region', { name: /Owed to me/ }))
    expect(owed.getByText('Karim', { selector: '.iou-person' })).toBeTruthy()
    fireEvent.click(owed.getByRole('button', { name: 'Add a repayment for Karim' }))
    fireEvent.change(owed.getByLabelText('Repayment (DA)'), { target: { value: '15000' } })
    fireEvent.click(owed.getByRole('button', { name: 'Save repayment' }))
    expect(owed.getByRole('alert').textContent).toMatch(/more than/)
    fireEvent.change(owed.getByLabelText('Repayment (DA)'), { target: { value: '4000' } })
    fireEvent.click(owed.getByRole('button', { name: 'Save repayment' }))
    expect(saved().settlements).toHaveLength(1)
    expect(saved().settlements[0].amount).toBe(4000)
    expect(owed.getAllByText('6,000 DA').length).toBeGreaterThan(0)
    expect(owed.getByText(/4,000 DA of 10,000 DA back/)).toBeTruthy()
  })
})

describe('zakat helper', () => {
  it('shows nisab, eligibility and a 2.5% estimate with the disclaimer, storing only the gold price', () => {
    render(<App />)
    goto('me')
    const zakat = within(card('Zakat helper'))
    expect(
      zakat.getByText('An estimate to help you plan, not a ruling — ask a scholar you trust about your situation.'),
    ).toBeTruthy()
    fireEvent.change(zakat.getByLabelText('Gold price per gram (DA)'), { target: { value: '20000' } })
    fireEvent.change(zakat.getByLabelText('Savings held for a lunar year (DA)'), { target: { value: '2000000' } })
    expect(zakat.getByText('1,700,000 DA')).toBeTruthy()
    expect(zakat.getByText('reach the nisab')).toBeTruthy()
    expect(zakat.getByText('50,000 DA')).toBeTruthy()
    fireEvent.change(zakat.getByLabelText('Savings held for a lunar year (DA)'), { target: { value: '1000000' } })
    expect(zakat.getByText('are below the nisab')).toBeTruthy()

    fireEvent.click(zakat.getByRole('button', { name: 'Save my gold price' }))
    expect(saved().zakat.goldPricePerGram).toBe(20000)
    expect(JSON.stringify(saved())).not.toContain('1000000')
  })
})
