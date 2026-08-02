import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import App from './App.tsx'
import * as sfx from './audio/chiptune.ts'
import { computeHealthScore } from './engine/healthScore.ts'
import { deriveHealthInputs, finalizeHealthThrough, DEMO_PROFILE } from './engine/profile.ts'
import { LESSONS, lessonForDay } from './content/lessons.ts'
import { todayISO, type Transaction } from './state/store.ts'

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
    const text = screen.getByText('Look back over your recent purchases')
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

  it('renders a completed quest inert via aria-disabled — focus is never dropped', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Mark done: Log every purchase today/ }))
    const done = screen.getByRole('button', { name: /Log every purchase today — done/ })
    // aria-disabled, NOT the disabled attribute: disabling the button the
    // user just activated silently drops keyboard focus to <body>.
    expect((done as HTMLButtonElement).disabled).toBe(false)
    expect(done.getAttribute('aria-disabled')).toBe('true')
    expect(done.getAttribute('aria-pressed')).toBeNull()
    // Activation on the done quest is a guarded no-op — no double grant.
    fireEvent.click(done)
    expect(xpNow()).toBe(5)
  })

  it('completes the sim quest when a simulation actually runs (verified, not self-reported)', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Purchase amount (DA)'), { target: { value: '5000' } })
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
    // The lesson quest is verified (no tap target on the quest row), so
    // complete it by actually reading today's lesson…
    fireEvent.click(screen.getByRole('button', { name: /^Got it:/ }))
    // …and the sim quest likewise via a real run.
    fireEvent.change(screen.getByLabelText('Purchase amount (DA)'), { target: { value: '5000' } })
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
    expect(screen.getByLabelText('Amount (DA)').getAttribute('aria-invalid')).toBe('true')
    expect(xpNow()).toBe(0)
  })

  it('submits on Enter via the form (no button click needed)', () => {
    render(<App />)
    const input = screen.getByLabelText('Amount (DA)')
    fireEvent.change(input, { target: { value: '1500' } })
    fireEvent.submit(input.closest('form')!)
    expect(xpNow()).toBe(5)
    expect(screen.getByText('1,500 DA')).toBeTruthy()
  })

  it('clears the error once the user types again', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '2' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('records a typed amount on a resist as the avoided amount — never silently discarded', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    expect(xpNow()).toBe(50)
    expect(screen.getByText('500 DA avoided')).toBeTruthy()
    expect((screen.getByLabelText('Amount (DA)') as HTMLInputElement).value).toBe('')
  })

  it('still resists with an empty amount (the amount is optional for resists)', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    expect(xpNow()).toBe(50)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('rejects a typed-but-invalid amount on a resist instead of silently discarding it', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount first.')
    expect(xpNow()).toBe(0)
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy()
  })

  it('rejects an amount that parses to Infinity instead of logging it', () => {
    // '1e999' → Infinity: it would grant XP, then JSON round-trip as null and
    // silently vanish from the ledger on the next reload.
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '1e999' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount first.')
    expect(xpNow()).toBe(0)
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy()
  })
})

describe('logging quick wins', () => {
  const logAmount = (value: string) => {
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
  }

  it('flags a yielded impulse via the checkbox — honesty pays the normal +5, never less', () => {
    render(<App />)
    const box = () => screen.getByLabelText('This was an impulse I gave in to') as HTMLInputElement
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '300' } })
    fireEvent.click(box())
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(xpNow()).toBe(5)
    // The ledger row carries a factual marker and the flag persists — the
    // yielded side of Impulse Control is now real data.
    expect(screen.getByText('impulse')).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved.transactions[0].impulseFlagged).toBe(true)
    // The checkbox resets per entry: the flag is a deliberate choice each time.
    expect(box().checked).toBe(false)
  })

  it('offers one-tap repeat chips once an (amount, category) pair repeats', () => {
    render(<App />)
    // No chips before anything repeats — one-offs are not habits.
    expect(screen.queryByRole('button', { name: /DA · / })).toBeNull()
    for (let i = 0; i < 2; i++) {
      fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '80' } })
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Transport' } })
      fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    }
    // One tap logs the pair with no typing — the daily bus fare in one press.
    fireEvent.click(screen.getByRole('button', { name: '80 DA · Transport' }))
    expect(xpNow()).toBe(15)
    const saved = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved.transactions).toHaveLength(3)
    expect(saved.transactions[0].category).toBe('Transport')
    expect(saved.transactions[0].amountDA).toBe(80)
  })

  it('undoes the last log within the grace window — row and XP both revert', () => {
    render(<App />)
    logAmount('500')
    expect(xpNow()).toBe(5)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(xpNow()).toBe(0)
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved.transactions).toHaveLength(0)
    // The grant leaves with the row — log→undo cycles farm nothing.
    expect(saved.xpLog).toHaveLength(0)
  })

  it('retires the Undo affordance after the 5s grace window', () => {
    vi.useFakeTimers()
    render(<App />)
    logAmount('500')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('sums resisted amounts into a kept-this-month line — mirror, not score input', () => {
    render(<App />)
    expect(screen.queryByText(/kept this month/)).toBeNull()
    for (const value of ['500', '300']) {
      fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    }
    expect(screen.getByText('800 DA kept this month')).toBeTruthy()
  })
})

describe('health explainability drawer', () => {
  it('expands a component breakdown that explains, never advises', () => {
    render(<App />)
    const why = screen.getByRole('button', { name: /Why this stage/ })
    expect(why.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Savings rate')).toBeNull()
    fireEvent.click(why)
    expect(why.getAttribute('aria-expanded')).toBe('true')
    for (const label of ['Savings rate', 'Budget', 'Emergency fund', 'Debt trend']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    // No flagged impulse events yet: IC is structurally excluded and must
    // read as honest absence, never as a zero counting against the user.
    expect(screen.getByText('Impulse control').closest('li')!.textContent).toContain(
      'not counted',
    )
  })
})

describe('daily lesson + codex', () => {
  it('pays readLesson XP exactly once per day through the verified lesson quest', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Got it:/ }))
    expect(xpNow()).toBe(15)
    // The button goes inert (aria-disabled, never the disabled attribute) and
    // a second activation is a guarded no-op.
    const collected = screen.getByRole('button', { name: /— collected$/ })
    expect((collected as HTMLButtonElement).disabled).toBe(false)
    expect(collected.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(collected)
    expect(xpNow()).toBe(15)
  })

  it('renders the lesson quest as verified — a tap on the quest row grants nothing', () => {
    render(<App />)
    const text = screen.getByText("Read today's lesson")
    expect(text.closest('button')).toBeNull()
    fireEvent.click(text)
    expect(xpNow()).toBe(0)
    // Got it marks the verified row done, like SimCard does for the sim quest.
    fireEvent.click(screen.getByRole('button', { name: /^Got it:/ }))
    expect(text.closest('li')!.className).toContain('done')
  })

  it('collects the lesson into the codex and persists it', () => {
    render(<App />)
    expect(screen.getByText('0 / 30 collected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Got it:/ }))
    expect(screen.getByText('1 / 30 collected')).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved.lessonsSeen).toEqual([{ id: lessonForDay(todayISO(), []).id, date: todayISO() }])
  })

  it('celebrates every fifth collected lesson with a toast the sparkle reinforces', () => {
    // Seed four codex entries dated TODAY: same-day entries never shrink
    // today's pool (see lessonForDay), so today's pick is unchanged and the
    // Got it below lands collection #5 — the first milestone.
    const today = todayISO()
    const pick = lessonForDay(today, [])
    const seeded = LESSONS.filter((l) => l.id !== pick.id)
      .slice(0, 4)
      .map((l) => ({ id: l.id, date: today }))
    localStorage.setItem('ember-state-v1', JSON.stringify({ lessonsSeen: seeded }))
    render(<App />)
    vi.mocked(sfx.sparkle).mockClear()
    fireEvent.click(screen.getByRole('button', { name: /^Got it:/ }))
    expect(screen.getByText('5 / 30 collected')).toBeTruthy()
    // The sparkle never carries the milestone alone — the toast announces it
    // through the live region.
    expect(sfx.sparkle).toHaveBeenCalled()
    expect(
      screen.getByRole('status', { name: 'Announcements' }).textContent,
    ).toBe('Codex: 5 / 30 lessons collected!')
  })

  it('shows locked lessons as silhouettes without leaking their titles', () => {
    render(<App />)
    const locked = screen.getAllByLabelText('Locked lesson')
    expect(locked).toHaveLength(30)
    for (const tile of locked.slice(0, 3)) {
      expect(tile.textContent).toBe('?')
    }
  })
})

describe('simulator honesty', () => {
  it('discloses that projections run on the demo profile', () => {
    render(<App />)
    expect(screen.getByText(/demo profile/i).textContent).toContain('90,000 DA/mo')
  })

  it('rejects an Infinity amount instead of projecting nonsense', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Purchase amount (DA)'), { target: { value: '1e999' } })
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }))
    expect(screen.getByRole('alert').textContent).toBe('Enter an amount first.')
    expect(xpNow()).toBe(0)
  })

  it('announces the projection through a live region, not just visually', () => {
    render(<App />)
    // Mounted empty before the run: live regions announce content CHANGES.
    const region = screen.getByRole('status', { name: 'Simulation result' })
    expect(region.textContent).toBe('')
    fireEvent.change(screen.getByLabelText('Purchase amount (DA)'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }))
    expect(region.textContent).not.toBe('')
  })
})

describe('profile setup', () => {
  const save = () => fireEvent.click(screen.getByRole('button', { name: /Save my numbers/ }))

  it('flips the sim honesty note from demo numbers to your numbers after setup', () => {
    render(<App />)
    expect(screen.getByText(/demo profile/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Monthly income (DA)'), { target: { value: '75000' } })
    fireEvent.change(screen.getByLabelText('Monthly essentials (DA)'), { target: { value: '40000' } })
    save()
    expect(screen.queryByText(/demo profile/i)).toBeNull()
    expect(screen.getByText(/your numbers/i).textContent).toContain('75,000 DA/mo')
    // The setup card flips to the saved summary…
    expect(screen.getByRole('button', { name: /Edit my numbers/ })).toBeTruthy()
    // …and the profile persists.
    const saved = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved.profile.monthlyIncome).toBe(75_000)
    expect(saved.profile.efBalance).toBeNull() // blank stayed not-entered
    // Setup pays no XP — the profile is data, never an XP lever.
    expect(xpNow()).toBe(0)
  })

  it('shows an inline error instead of saving on invalid required numbers', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Monthly income (DA)'), { target: { value: 'abc' } })
    save()
    expect(screen.getByRole('alert').textContent).toContain('Monthly income')
    expect(screen.getByLabelText('Monthly income (DA)').getAttribute('aria-invalid')).toBe('true')
    expect(JSON.parse(localStorage.getItem('ember-state-v1')!).profile).toBeNull()
  })

  it('keeps a typed-but-invalid optional field as an error, never silently blank', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Monthly income (DA)'), { target: { value: '75000' } })
    fireEvent.change(screen.getByLabelText('Monthly essentials (DA)'), { target: { value: '40000' } })
    fireEvent.change(screen.getByLabelText('Emergency fund (DA)'), { target: { value: '1e999' } })
    save()
    expect(screen.getByRole('alert').textContent).toContain('Emergency fund')
    expect(JSON.parse(localStorage.getItem('ember-state-v1')!).profile).toBeNull()
  })

  it('edits reopen the form seeded with the saved numbers', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Monthly income (DA)'), { target: { value: '75000' } })
    fireEvent.change(screen.getByLabelText('Monthly essentials (DA)'), { target: { value: '40000' } })
    save()
    fireEvent.click(screen.getByRole('button', { name: /Edit my numbers/ }))
    expect((screen.getByLabelText('Monthly income (DA)') as HTMLInputElement).value).toBe('75000')
    fireEvent.change(screen.getByLabelText('Monthly income (DA)'), { target: { value: '90000' } })
    save()
    expect(JSON.parse(localStorage.getItem('ember-state-v1')!).profile.monthlyIncome).toBe(90_000)
  })
})

describe('xp gain visibility', () => {
  it('shows a transient +XP chip so muted / reduced-motion users see the gain', () => {
    vi.useFakeTimers()
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(screen.getAllByText('+5 XP').length).toBeGreaterThan(0)
    act(() => {
      vi.advanceTimersByTime(1800)
    })
    expect(screen.queryByText('+5 XP')).toBeNull()
  })

  it('announces non-level-up gains through a live region — never sound alone', () => {
    // The +XP chip is visual-only and the blip is sound-only: without this
    // region a screen-reader user who marks a quest done hears nothing.
    vi.useFakeTimers()
    render(<App />)
    const region = screen.getByRole('status', { name: 'XP gains' })
    expect(region.textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /Mark done: Log every purchase today/ }))
    expect(region.textContent).toBe('+5 XP')
    act(() => {
      vi.advanceTimersByTime(1800)
    })
    expect(region.textContent).toBe('')
  })
})

describe('multi-tab sync', () => {
  it('merges a peer tab write instead of letting the next save clobber it', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    // A second tab — still holding the state it loaded earlier — saves a
    // payload that lacks the transaction above but carries one of its own.
    const today = new Date()
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const peer = {
      transactions: [{ id: 'peer-tx', amountDA: 777, category: 'Fun', date: day }],
    }
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'ember-state-v1',
          newValue: JSON.stringify(peer),
        }),
      )
    })
    // Both rows render, and the merged union — not either tab's partial list —
    // is what lands back in storage.
    expect(screen.getByText('1,500 DA')).toBeTruthy()
    expect(screen.getByText('777 DA')).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved.transactions).toHaveLength(2)
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
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '5000' } })
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
    // Two resisted impulses = 100 XP = level 2 exactly. The first resist also
    // earns the Held the Line badge, whose toast takes the queue's first turn.
    const resist = screen.getByRole('button', { name: /I resisted an impulse/ })
    fireEvent.click(resist)
    fireEvent.click(resist)
    const toast = () => screen.getByRole('status', { name: 'Announcements' })
    expect(toast().textContent).toMatch(/^Held the Line earned/)
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(toast().textContent).toMatch(/^Level 2/)
    // XP within the dismiss window used to cancel the timer and strand the
    // toast (and the live region content) on screen. (This log also earns the
    // First Spark badge, queued behind the level-up.)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(toast().textContent).toMatch(/^Level 2/)
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(toast().textContent).toMatch(/^First Spark earned/)
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(toast().textContent).toBe('')
  })

  it('queues the level-up when the final quest completes and levels up in one commit', () => {
    vi.useFakeTimers()
    render(<App />)
    // Sim quest (verified): +15.
    fireEvent.change(screen.getByLabelText('Purchase amount (DA)'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /Run simulation/ }))
    // Lesson quest (verified): +15 → 30.
    fireEvent.click(screen.getByRole('button', { name: /^Got it:/ }))
    // Log quest: +5 → 35.
    fireEvent.click(screen.getByRole('button', { name: /Mark done: Log every purchase today/ }))
    // Prime the bar just below the level-2 boundary: 12 × +5 → 95 total.
    for (let i = 0; i < 12; i++) {
      fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    }
    const toast = () => screen.getByRole('status', { name: 'Announcements' })
    // The FINAL quest (+10 → 105) crosses the boundary, so the level-up and
    // all-quests-complete toasts land in the same commit. The quest toast
    // used to stomp the level-up before the live region ever carried it —
    // leaving the fanfare to announce the level alone.
    fireEvent.click(
      screen.getByRole('button', { name: /Mark done: Look back over your recent purchases/ }),
    )
    // The actions above also earned three badges (first sim, first purchase,
    // ten purchases), each queued at its own moment — drain their turns first.
    for (const badge of [/^Future Sight earned/, /^First Spark earned/, /^Ten in the Ledger earned/]) {
      expect(toast().textContent).toMatch(badge)
      act(() => {
        vi.advanceTimersByTime(2600)
      })
    }
    expect(toast().textContent).toMatch(/^Level 2/)
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(toast().textContent).toBe('All quests complete!')
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

  it('wraps the card stack in a <main> landmark with header and footer as siblings', () => {
    render(<App />)
    const main = screen.getByRole('main')
    // The primary content — every card — lives inside the landmark…
    expect(main.querySelectorAll('.card').length).toBeGreaterThanOrEqual(5)
    // …while the topbar and foot stay sibling landmarks, not descendants.
    expect(main.querySelector('header, footer')).toBeNull()
  })
})

describe('resist day-source consistency', () => {
  it('enforces the resist XP cap against the same day the label reports across midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 1, 23, 59, 0)) // Aug 1, just before midnight
    render(<App />)
    const resist = () => screen.getByRole('button', { name: /I resisted an impulse/ })
    fireEvent.click(resist())
    fireEvent.click(resist()) // 2 × 50 XP = level 2 exactly → bar reads 0
    expect(resist().textContent).toContain('XP capped today')
    expect(xpNow()).toBe(0)
    // Midnight passes, but no sync (60s interval / focus / visibility) has
    // landed yet: the label still says capped, so a tap must grant nothing —
    // the tx date and cap check use the hook's day, not a fresh clock read.
    vi.setSystemTime(new Date(2026, 7, 2, 0, 0, 30))
    fireEvent.click(resist())
    expect(xpNow()).toBe(0)
  })
})

describe('peer-origin rewards', () => {
  it('suppresses celebration sounds in a hidden tab when a peer write levels up', () => {
    render(<App />)
    vi.mocked(sfx.fanfare).mockClear()
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    try {
      // A peer tab's write carries enough XP evidence to level this tab up.
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'ember-state-v1',
            newValue: JSON.stringify({ xp: { totalXp: 100 } }),
          }),
        )
      })
      // No fanfare in a tab the user never touched — but the toast/live
      // region still announces (sound never carries information alone).
      expect(sfx.fanfare).not.toHaveBeenCalled()
      expect(
        screen.getByRole('status', { name: 'Announcements' }).textContent,
      ).toMatch(/^Level 2/)
    } finally {
      delete (document as { visibilityState?: string }).visibilityState
    }
  })
})

describe('weekly boss battle', () => {
  it('shows the honest sizing-up state instead of fake numbers under two weeks of data', () => {
    render(<App />)
    expect(screen.getByText(/still sizing you up/)).toBeTruthy()
    expect(screen.getByText(/no numbers on you yet/)).toBeTruthy()
    // No invented opponent total anywhere on the card.
    expect(screen.queryByText(/\/ 0 DA/)).toBeNull()
  })

  it('runs the battle against last week with beatable framing — never shame copy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 12, 12, 0, 0)) // Wed Aug 12; week = Aug 10–16
    localStorage.setItem(
      'ember-state-v1',
      JSON.stringify({
        transactions: [
          { id: 'lw', amountDA: 6_000, category: 'Fun', date: '2026-08-05' }, // last week
          { id: 'tw', amountDA: 1_500, category: 'Other', date: '2026-08-11' }, // this week
        ],
      }),
    )
    render(<App />)
    expect(screen.getByText('1,500 / 6,000 DA')).toBeTruthy()
    expect(screen.getByText(/Stay under that through Sunday and he goes down/)).toBeTruthy()
    // Trust rule: the card never shames.
    expect(screen.queryByText(/wasted/i)).toBeNull()
  })

  it('claims a won week exactly once — fanfare, toast, and a single persisted 150 XP grant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 12, 12, 0, 0)) // the week after the win
    localStorage.setItem(
      'ember-state-v1',
      JSON.stringify({
        transactions: [
          { id: 'b', amountDA: 6_000, category: 'Fun', date: '2026-07-29' }, // opponent week
          { id: 'w', amountDA: 4_000, category: 'Fun', date: '2026-08-05' }, // won week
        ],
      }),
    )
    vi.mocked(sfx.fanfare).mockClear()
    render(<App />)
    const saved = () => JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved().xpLog).toEqual([
      { id: 'boss:2026-08-03', action: 'weeklyBoss', amount: 150, date: '2026-08-12' },
    ])
    expect(saved().xp.totalXp).toBe(150)
    // +150 XP crosses the level boundary in the same commit: both toasts
    // queue (level first, then the boss), but the fanfare plays once — two
    // stacked fanfares would double every note's gain.
    expect(sfx.fanfare).toHaveBeenCalledTimes(1)
    const toast = () => screen.getByRole('status', { name: 'Announcements' })
    expect(toast().textContent).toMatch(/^Level 2/)
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(toast().textContent).toBe('Impulse Monster beaten — lighter week than last!')
    // The card carries the persistent claimed-win marker past the toast.
    expect(screen.getByText('Beaten last week +150 XP')).toBeTruthy()
    // A reload (remount over the persisted grant) never pays the week twice.
    cleanup()
    render(<App />)
    expect(saved().xp.totalXp).toBe(150)
    expect(saved().xpLog).toHaveLength(1)
  })
})
