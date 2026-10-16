import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import App from '../../App.tsx'

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

const saved = () => JSON.parse(localStorage.getItem('ember-state-v1') ?? '{}')

const JUMIA_EMAIL = 'From: orders@jumia.dz\nYour order #JM-48213 is confirmed\nThanks for shopping on Jumia.\nTotal : 5 600 DA\nDate: 09/10/2026'
const BARIDI_SMS = 'BaridiMob : Paiement de 5 600,00 DA effectué vers Jumia le 09/10/2026.'

function paste(text: string) {
  fireEvent.change(screen.getByLabelText('Paste a receipt, email or SMS'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Read it' }))
}

const tray = () => screen.getByRole('heading', { name: 'Review tray' }).parentElement as HTMLElement

describe('Inbox on the Me room', () => {
  it('shows the empty tray and the Gmail explainer without a Connect button', () => {
    render(<App />)
    goto('me')
    expect(screen.getByText(/Ember never reads your messages on its own/)).toBeTruthy()
    expect(screen.getByText('Connect Gmail (coming)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull()
  })

  it('says kindly when it cannot find an amount, and saves nothing', () => {
    render(<App />)
    goto('me')
    paste('See you tomorrow at the café!')
    expect(screen.getByText(/Couldn't find an amount/)).toBeTruthy()
    expect(saved().inbox?.candidates ?? []).toHaveLength(0)
  })

  it('two messages for one purchase become one slip with two sources', () => {
    render(<App />)
    goto('me')
    paste(`${JUMIA_EMAIL}\n---\n${BARIDI_SMS}`)
    expect(screen.getByText(/Read 2 messages/)).toBeTruthy()
    const slips = within(tray()).getAllByRole('listitem')
    expect(slips).toHaveLength(1)
    expect(within(slips[0]).getByText('two messages, one purchase — stored once')).toBeTruthy()
    expect(within(slips[0]).getByText('orders@jumia.dz')).toBeTruthy()
    expect(within(slips[0]).getByText('BaridiMob')).toBeTruthy()
    const c = saved().inbox.candidates
    expect(c).toHaveLength(1)
    expect(c[0].sources).toHaveLength(2)
  })

  it('confirm logs a ledger transaction and resolves the slip with its id', () => {
    render(<App />)
    goto('me')
    paste(BARIDI_SMS)
    const slip = within(tray()).getByRole('listitem')
    fireEvent.change(within(slip).getByLabelText('Category'), { target: { value: 'Bills' } })
    fireEvent.click(within(slip).getByRole('button', { name: 'Confirm' }))
    const s = saved()
    const tx = s.transactions.find((t: { note?: string }) => t.note === 'from inbox')
    expect(tx).toMatchObject({ amountDA: 5600, category: 'Bills', date: '2026-10-09' })
    expect(typeof tx.at).toBe('string')
    expect(s.inbox.candidates[0]).toMatchObject({ status: 'confirmed', txId: tx.id })
    expect(within(tray()).queryAllByRole('listitem')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Clear handled (1)' }))
    expect(saved().inbox.candidates[0]).toMatchObject({ cleared: true, sources: [] })
  })

  it('reject resolves without touching the ledger', () => {
    render(<App />)
    goto('me')
    const before = saved().transactions?.length ?? 0
    paste(BARIDI_SMS)
    fireEvent.click(within(tray()).getByRole('button', { name: 'Reject' }))
    const s = saved()
    expect(s.inbox.candidates[0]).toMatchObject({ status: 'rejected', txId: null })
    expect(s.transactions.length).toBe(before)
  })

  it('a promotion needs a second tap to confirm', () => {
    render(<App />)
    goto('me')
    paste('Get 3 months of Premium for $0. Offer ends soon.\n')
    const slip = within(tray()).getByRole('listitem')
    expect(within(slip).getByText('a promotion, nothing was charged')).toBeTruthy()
    fireEvent.click(within(slip).getByRole('button', { name: 'Confirm' }))
    expect(saved().inbox.candidates[0].status).toBe('pending')
    expect(within(slip).getByRole('alert').textContent).toMatch(/promotion/)
    fireEvent.click(within(slip).getByRole('button', { name: 'Confirm anyway' }))
    expect(saved().inbox.candidates[0].status).toBe('confirmed')
  })

  it('a USD slip is blocked until the rate is set', () => {
    render(<App />)
    goto('me')
    paste('RedotPay\nCard transaction: USD 12.49 at STEAMGAMES.COM on 08/10/2026.')
    const slip = within(tray()).getByRole('listitem')
    expect(within(slip).getByText(/set your rate on Home for DA/)).toBeTruthy()
    fireEvent.click(within(slip).getByRole('button', { name: 'Confirm' }))
    expect(within(slip).getByRole('alert').textContent).toMatch(/set your rate on Home/)
    const s = saved()
    expect(s.inbox.candidates[0].status).toBe('pending')
    expect((s.transactions ?? []).some((t: { note?: string }) => t.note === 'from inbox')).toBe(false)
  })
})
