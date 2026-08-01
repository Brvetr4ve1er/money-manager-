import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import App from './App.tsx'
import { computeHealthScore } from './engine/healthScore.ts'
import { deriveHealthInputs, finalizeHealthThrough, DEMO_PROFILE } from './engine/profile.ts'
import type { Transaction } from './state/store.ts'

// Sounds are reinforcement only; jsdom has no AudioContext, so stub the module.
vi.mock('./audio/chiptune.ts', () => ({
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

const xpNow = () =>
  Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))

describe('quest completion', () => {
  it('never double-grants XP on a rapid double click', () => {
    render(<App />)
    const quest = screen.getByRole('button', { name: /Mark done: Log every purchase today/ })
    fireEvent.click(quest)
    fireEvent.click(quest)
    expect(xpNow()).toBe(5)
  })

  it('completes a self-report quest from a tap on the quest text (whole row is the button)', () => {
    render(<App />)
    const text = screen.getByText('Review yesterday')
    expect(text.closest('button')).not.toBeNull()
    fireEvent.click(text)
    expect(xpNow()).toBe(10)
  })

  it('renders the verified sim quest without a tappable row — no XP from a tap', () => {
    render(<App />)
    const text = screen.getByText('Run one decision simulation')
    expect(text.closest('button')).toBeNull()
    fireEvent.click(text)
    expect(xpNow()).toBe(0)
  })

  it('renders a completed quest as disabled, without toggle semantics', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Mark done: Log every purchase today/ }))
    const done = screen.getByRole('button', { name: /Log every purchase today — done/ })
    expect((done as HTMLButtonElement).disabled).toBe(true)
    expect(done.getAttribute('aria-pressed')).toBeNull()
  })

  it('completes the sim quest when a simulation actually runs (verified, not self-reported)', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Purchase amount in DA'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }))
    expect(xpNow()).toBe(15)
    // Done state renders on the static (never tappable) verified row.
    const row = screen.getByText('Run one decision simulation').closest('li')!
    expect(row.className).toContain('done')
  })

  it('shows a visible all-complete state, not just the arpeggio', () => {
    render(<App />)
    for (const btn of screen.getAllByRole('button', { name: /^Mark done:/ })) {
      fireEvent.click(btn)
    }
    // The sim quest is verified (no tap target), so complete it via a run.
    fireEvent.change(screen.getByLabelText('Purchase amount in DA'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }))
    expect(screen.getByText(/All complete/)).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Announcements' }).textContent).toBe(
      'All quests complete!',
    )
  })
})

describe('logging flow', () => {
  it('shows an inline error instead of failing silently on an empty amount', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount first.')
    expect(screen.getByLabelText('Amount in DA').getAttribute('aria-invalid')).toBe('true')
    expect(xpNow()).toBe(0)
  })

  it('submits on Enter via the form (no button click needed)', () => {
    render(<App />)
    const input = screen.getByLabelText('Amount in DA')
    fireEvent.change(input, { target: { value: '1500' } })
    fireEvent.submit(input.closest('form')!)
    expect(xpNow()).toBe(5)
    expect(screen.getByText('1,500 DA')).toBeTruthy()
  })

  it('clears the error once the user types again', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    fireEvent.change(screen.getByLabelText('Amount in DA'), { target: { value: '2' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects an amount that parses to Infinity instead of logging it', () => {
    // '1e999' → Infinity: it would grant XP, then JSON round-trip as null and
    // silently vanish from the ledger on the next reload.
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount in DA'), { target: { value: '1e999' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount first.')
    expect(xpNow()).toBe(0)
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy()
  })
})

describe('simulator honesty', () => {
  it('discloses that projections run on the demo profile', () => {
    render(<App />)
    expect(screen.getByText(/demo profile/i).textContent).toContain('90,000 DA/mo')
  })

  it('rejects an Infinity amount instead of projecting nonsense', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Purchase amount in DA'), { target: { value: '1e999' } })
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }))
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount first.')
    expect(xpNow()).toBe(0)
  })

  it('announces the projection through a live region, not just visually', () => {
    render(<App />)
    // Mounted empty before the run: live regions announce content CHANGES.
    const region = screen.getByRole('status', { name: 'Simulation result' })
    expect(region.textContent).toBe('')
    fireEvent.change(screen.getByLabelText('Purchase amount in DA'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }))
    expect(region.textContent).not.toBe('')
  })
})

describe('xp gain visibility', () => {
  it('shows a transient +XP chip so muted / reduced-motion users see the gain', () => {
    vi.useFakeTimers()
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount in DA'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(screen.getByText('+5 XP')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1800)
    })
    expect(screen.queryByText('+5 XP')).toBeNull()
  })
})

describe('day rollover health smoothing', () => {
  it('persists yesterday’s final score at midnight — smooth() applies once per day, not twice', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0)) // Aug 1, local noon
    localStorage.setItem(
      'ember-state-v1',
      JSON.stringify({
        prevHealthScore: 30,
        stage: 'ember',
        healthDate: '2026-08-01',
        questsDate: '2026-08-01',
      }),
    )
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount in DA'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))

    const txs: Transaction[] = [
      { id: 'x', amountDA: 5_000, category: 'Food', date: '2026-08-01', resistedImpulse: false },
    ]
    const day1 = computeHealthScore(
      deriveHealthInputs(txs, DEMO_PROFILE, '2026-08-01'),
      30,
      'ember',
    )
    expect(screen.getByText(`Health ${day1.score.toFixed(1)}`)).toBeTruthy()

    // Midnight passes; the focus listener notices the new day.
    vi.setSystemTime(new Date(2026, 7, 2, 0, 5, 0))
    act(() => {
      fireEvent.focus(window)
    })

    const persisted = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(persisted.healthDate).toBe('2026-08-02')
    // The snapshot is yesterday's FINAL rendered score, not a re-smoothed
    // copy computed against today's blend.
    expect(persisted.prevHealthScore).toBeCloseTo(day1.score, 10)
    // Today renders exactly one smoothing step from that base.
    const day2 = computeHealthScore(
      deriveHealthInputs(txs, DEMO_PROFILE, '2026-08-02'),
      day1.score,
      day1.stage,
    )
    expect(screen.getByText(`Health ${day2.score.toFixed(1)}`)).toBeTruthy()
  })

  it('chains one smoothing step per elapsed day after a multi-day absence', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0)) // Aug 1, local noon
    localStorage.setItem(
      'ember-state-v1',
      JSON.stringify({
        prevHealthScore: 30,
        stage: 'ember',
        healthDate: '2026-07-25', // last opened a week ago
        questsDate: '2026-07-25',
      }),
    )
    render(<App />)
    const persisted = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(persisted.healthDate).toBe('2026-08-01')
    // Seven elapsed days → seven chained steps, the same trajectory a daily
    // opener would have banked (app-open frequency never moves the score).
    const expected = finalizeHealthThrough([], DEMO_PROFILE, '2026-07-25', '2026-08-01', 30, 'ember')
    expect(persisted.prevHealthScore).toBeCloseTo(expected.score, 10)
    expect(persisted.stage).toBe(expected.stage)
  })
})

describe('level-up toast lifecycle', () => {
  it('dismisses the toast even when more XP lands inside the 2.6s window', () => {
    vi.useFakeTimers()
    render(<App />)
    // Two resisted impulses = 100 XP = level 2 exactly.
    const resist = screen.getByRole('button', { name: /I resisted an impulse/ })
    fireEvent.click(resist)
    fireEvent.click(resist)
    const toast = () => screen.getByRole('status', { name: 'Announcements' })
    expect(toast().textContent).toMatch(/^Level 2/)
    // XP within the dismiss window used to cancel the timer and strand the
    // toast (and the live region content) on screen.
    fireEvent.change(screen.getByLabelText('Amount in DA'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(toast().textContent).toMatch(/^Level 2/)
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(toast().textContent).toBe('')
  })
})

describe('page heading structure', () => {
  it('exposes the wordmark as the single page-level h1', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ember')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
