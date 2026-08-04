import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import App from './App.tsx'
import * as sfx from './audio/chiptune.ts'
import { computeHealthScore } from './engine/healthScore.ts'
import { deriveHealthInputs, finalizeHealthThrough, DEMO_PROFILE } from './engine/profile.ts'
import { LESSONS, lessonForDay } from './content/lessons.ts'
import { NOTE_MAX_LEN, todayISO, type Transaction } from './state/store.ts'

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
    // Fake timers so the toast queue can be drained a turn at a time: every
    // completion that does NOT finish the set now takes its own turn in the
    // live region first (a11y sweep finding 6).
    vi.useFakeTimers()
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
    const toast = () => screen.getByRole('status', { name: 'Announcements' })
    // A completion used to reach a screen reader only as "+10 XP" plus the
    // focused button's accessible name changing under the user — which NVDA
    // announces, VoiceOver frequently does not, and JAWS handles
    // inconsistently. Each one now names its quest, in completion order.
    for (const done of [
      'Quest done. Log every purchase today',
      'Quest done. Look back over your recent purchases',
      "Quest done. Read today's lesson",
    ]) {
      expect(toast().textContent).toBe(done)
      act(() => {
        vi.advanceTimersByTime(2600)
      })
    }
    // §7.4 bans exclamation marks outright, and this string is announced
    // through a live region — the toast rewrite is deliberate, and the
    // assertion stays exact-equality so the ban cannot regress unnoticed.
    // It is also the ONLY toast for the completion that finishes the set:
    // two writes to one polite region in a single tick is how a live region
    // interrupts itself.
    expect(toast().textContent).toBe('All quests complete.')
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
    // Copy change, deliberate: the checkbox label is "I bought it anyway" —
    // the Trust Rule 3 phrasing Landing and README already quote. The old
    // label made the user write a concession verb about themselves.
    const box = () => screen.getByLabelText('I bought it anyway') as HTMLInputElement
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

  it('makes the LABEL the 48px target the 24px checkbox cannot be', () => {
    render(<App />)
    const box = screen.getByLabelText('I bought it anyway') as HTMLInputElement
    // §11's 48px floor is met by the surrounding label, not by the control: a
    // 24px box is half the floor and growing it would put a checkbox the size
    // of a button on the log card. A pixel audit flagged the 24x24 hit area, so
    // what has to hold is that the label is what receives the pointer — which
    // requires IMPLICIT association (input nested inside the label). A `for`/id
    // pairing would label the control correctly and still leave the text
    // outside the target, which is exactly the failure being ruled out here.
    const label = box.closest('label')
    expect(label).not.toBeNull()
    expect(label!.className).toContain('impulse-check')
    expect(label!.contains(box)).toBe(true)
    // The whole label toggles it — this is the assertion that fails if the
    // markup is ever flattened to a sibling input + span.
    fireEvent.click(label!.querySelector('span')!)
    expect(box.checked).toBe(true)
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

  it('sums resisted amounts into a resisted-this-month line — mirror, not score input', () => {
    render(<App />)
    expect(screen.queryByText(/this month/)).toBeNull()
    for (const value of ['500', '300']) {
      fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    }
    // "resisted", never "kept": this sums the prices of things the user SAYS
    // they did not buy, so the verb must name the observed action (the tap)
    // rather than assert an unverifiable outcome. The chip is the loudest
    // number on the card; the noun is what makes it honest.
    expect(screen.getByText('800 DA resisted this month')).toBeTruthy()
    expect(screen.queryByText(/kept this month/)).toBeNull()
  })
})

describe('health explainability drawer', () => {
  it('states the calibration period instead of projecting unearned confidence', () => {
    // Trust Rule 5. The disclosure is NOT behind the drawer and not inside
    // .hero-main (which app.css hides at >=1024px): a calibration state that
    // blinks out at a breakpoint, or waits for a tap, is not a disclosure.
    render(<App />)
    // Scoped to the health card: the ledger now carries the SAME Day n / 90
    // index in its own disclosure, and this assertion is about the score's.
    const hero = () => screen.getByRole('main').querySelector('.hero-card') as HTMLElement
    expect(within(hero()).getByText(/Score still calibrating/)).toBeTruthy()
    expect(within(hero()).getByText(/Day 0 \/ 90/)).toBeTruthy()
    // A logged day is day 1 of 90, never day 0 and never "ready".
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '900' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(within(hero()).getByText(/Day 1 \/ 90/)).toBeTruthy()
  })

  it('names whose numbers it is scoring while the profile is still the demo one', () => {
    // Trust Rule 5's other half. A fresh install renders "Health 59.0",
    // "Bonfire" and "3 of 4 stars" at the d2 display tier off DEMO_PROFILE's
    // invented 90,000 DA income, 45,000 DA fund and 12,000 -> 9,500 DA debt
    // paydown — numbers no user ever entered. "Score still calibrating" speaks
    // about logged HISTORY, not about whose figures are being scored, so the
    // loudest number the product computes said nothing about being borrowed.
    // It compounds: the first ROLL_DAY persists that stage, and mapToStage's
    // +-3 hysteresis then defends it against the user's real numbers.
    render(<App />)
    const hero = () => screen.getByRole('main').querySelector('.hero-card') as HTMLElement
    expect(within(hero()).getByText(/Placeholder numbers until setup/)).toBeTruthy()
    // The demo half is INDEPENDENT of the calibration half — setup can land on
    // day 3, and 90 days can pass with no setup at all.
    fireEvent.change(screen.getByLabelText('Monthly income (DA)'), { target: { value: '75000' } })
    fireEvent.change(screen.getByLabelText('Monthly essentials (DA)'), { target: { value: '40000' } })
    fireEvent.click(screen.getByRole('button', { name: /Save my numbers/ }))
    expect(within(hero()).queryByText(/Placeholder numbers until setup/)).toBeNull()
    // …and the calibration line survives the flip on its own.
    expect(within(hero()).getByText(/Score still calibrating/)).toBeTruthy()
  })

  it('carries the same disclosure on the desktop hero plate that owns the stage', () => {
    // At >=1024px the hero is the full viewport and the stage badge, name and
    // rating move onto its plate (app.css), so the card's disclosure is a
    // scroll away — the one width where the loudest claim could be read
    // without the sentence that qualifies it. Same flag, same plate.
    render(<App />)
    const header = screen.getByRole('banner')
    expect(within(header).getByText(/Placeholder until setup/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Monthly income (DA)'), { target: { value: '75000' } })
    fireEvent.change(screen.getByLabelText('Monthly essentials (DA)'), { target: { value: '40000' } })
    fireEvent.click(screen.getByRole('button', { name: /Save my numbers/ }))
    expect(within(header).queryByText(/Placeholder until setup/)).toBeNull()
  })

  it('does not say "demo profile" a second time — SimCard owns that phrase', () => {
    // Two different surfaces saying "demo" about two different things reads as
    // two demos. The hero's disclosure uses its own words on purpose.
    render(<App />)
    expect(screen.getAllByText(/demo profile/i)).toHaveLength(1)
  })

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

  it('stands the whole archive half on §5B’s spec sheet, and nothing else', () => {
    render(<App />)
    // §5 layout B is "a 4-up grid of badges ON ESPRESSO, captioned with mono
    // index labels" — the codex and the badge shelf are literally that, and
    // both were rendering as ordinary Bone cards, so layout B existed nowhere
    // in the product. .spec-sheet re-scopes the surface tokens (see
    // tokens.css), so this class IS the layout.
    //
    // IT IS ALSO THE APP'S ONLY LEVER ON §2's RATIO LAW, which is why the list
    // grew past the two shelves. A census put the 375px light page at 20.4%
    // field against a 60% floor and 68.5% Bone against a 30% budget; the two
    // shelves took it to ~47%, and the month card and the ledger — the same
    // read-only surfaces, everything below .month-card's --s4 macro-break —
    // take it to ~62% / ~38%. That budget was a claim only a stylesheet
    // comment made. It is this assertion.
    const sheets = [...document.querySelectorAll('main .spec-sheet')].map(
      (el) =>
        el.id ||
        [...el.classList].find((c) => c.endsWith('-card') && c !== 'card') ||
        '?',
    )
    // In render order, not sorted: the sheet is the archive half of the stack
    // and it has to stay contiguous below the macro-break, or the page reads
    // as two grounds interleaved rather than as two halves.
    expect(sheets).toEqual(['month-card', 'ledger-card', 'codex', 'badges'])
    // Still cards: the sheet is a surface role, not a replacement container.
    for (const el of document.querySelectorAll('main .spec-sheet')) {
      expect(el.className).toContain('card')
    }
    // …and the act-now half stays on the reading ground: that is where the
    // forms and the primary actions are, and Bone is what they were measured
    // on. Naming them keeps "and nothing else" from being vacuous.
    for (const sel of ['.hero-card', '#log', '#quests', '.sim-card']) {
      const card = document.querySelector(`main ${sel}`)
      expect(card).not.toBeNull()
      expect(card!.classList.contains('spec-sheet')).toBe(false)
    }
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
    ).toBe('Codex: 5 / 30 lessons collected.')
  })

  it('shows locked lessons as silhouettes without leaking their titles', () => {
    render(<App />)
    // Queried by TEXT, not by aria-label: the locked tile now names its state
    // with an .sr-only prefix inside the <li> instead of an aria-label on it.
    // aria-label on a listitem is inconsistently honoured, and where it is
    // ignored the tile computed an empty name — this asserts the mechanism
    // that works everywhere. The "no title leaked" half is unchanged and now
    // strictly tighter: the silhouette is a drawn glyph (§8 retires character
    // glyphs as UI iconography, and '?' read as "unknown" rather than "not
    // reached"), so the tile's ENTIRE text is the state marker and nothing
    // else. Exact equality, so any leaked title still fails this.
    const locked = screen.getAllByText('Locked lesson')
    expect(locked).toHaveLength(30)
    for (const label of locked.slice(0, 3)) {
      expect(label.closest('li')?.textContent).toBe('Locked lesson')
      // …and the mark is drawn, not typed.
      expect(label.closest('li')?.querySelector('svg.glyph')).not.toBeNull()
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
    // Everything queued above, in the order it was queued: three per-quest
    // completions (a11y sweep finding 6), the three badges earned along the
    // way (first sim, first purchase, ten purchases), then the level-up, then
    // the all-complete. The level-up is the assertion this test exists for —
    // it must still be in the queue, not stomped by the quest effect that
    // ran in the same commit.
    const queued = [
      'Quest done. Run one decision simulation',
      /^First Run earned/,
      "Quest done. Read today's lesson",
      'Quest done. Log every purchase today',
      /^First Spark earned/,
      /^Ten in the Ledger earned/,
      /^Level 2/,
      'All quests complete.',
    ]
    for (const want of queued) {
      if (typeof want === 'string') expect(toast().textContent).toBe(want)
      else expect(toast().textContent).toMatch(want)
      act(() => {
        vi.advanceTimersByTime(2600)
      })
    }
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

  it('names every section once — no heading appears twice in the outline', () => {
    render(<App />)
    // The stage label used to be an <h2> on BOTH the hero plate and the health
    // card, so "Bonfire" appeared twice at ≥1024px (once at 13px). The card
    // titles itself with what it measures now and the stage name is a line
    // inside the readout, not a second heading.
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('gives every card in the stack an h2 — including the simulator', () => {
    render(<App />)
    for (const card of screen.getByRole('main').querySelectorAll('section.card')) {
      expect(card.querySelector('h2')).not.toBeNull()
    }
    // The window bar is chrome, not the card's name: it stays visible and
    // leaves the accessibility tree, so "DECISION_SIM.EXE" is never announced
    // alongside the heading it decorates.
    const sim = screen.getByRole('heading', { level: 2, name: 'Decision simulator' })
    expect(sim.closest('.sim-card')).not.toBeNull()
    expect(document.querySelector('.window-bar')?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('the health readout carries the display tier', () => {
  it('splits the readout typographically without splitting it for assistive tech', () => {
    render(<App />)
    // One string for AT — the visible halves take two type tiers and leave the
    // accessibility tree, so a screen reader still hears one sentence and not
    // a label followed by a loose number.
    const spoken = screen.getByText(/^Health \d+(\.\d)?$/)
    expect(spoken.className).toContain('sr-only')
    const value = document.querySelector('.score-value')
    expect(value?.getAttribute('aria-hidden')).toBe('true')
    // INDEX ROLL (§9 move 4) is on the numeral alone: a numeral indexes, a
    // word does not.
    expect(value?.className).toContain('index-roll')
    expect(document.querySelector('.score-label')?.classList.contains('index-roll')).toBe(false)
  })

  it('keeps the readout on the same card as the breakdown it is the subject of', () => {
    render(<App />)
    const why = screen.getByRole('button', { name: /Why this stage/ })
    const card = why.closest('section.card')
    expect(card?.querySelector('.score-value')).not.toBeNull()
    expect(card?.querySelector('h2')?.textContent).toBe('Health score')
  })

  it('exposes the score exactly once — the corner index is printed, not read', () => {
    render(<App />)
    // Both the hero plate and the card render the number; only one of them is
    // in the accessibility tree, whichever width is on screen.
    expect(screen.getAllByText(/^Health \d+(\.\d)?$/)).toHaveLength(1)
    expect(document.querySelector('.hero-spec-bl')?.getAttribute('aria-hidden')).toBe('true')
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
    // Case-exact: the shipped line is "No numbers on you yet." and this is a
    // Trust Rule 5 assertion — the /i flag would let a shouted or lowercased
    // rewrite pass an honest-cold-start check.
    expect(screen.getByText(/No numbers on you yet/)).toBeTruthy()
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
    expect(screen.getByText(/Stay under it through Sunday\. He goes down/)).toBeTruthy()
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
    // Still stated about the monster, never re-framed as praise of the user:
    // the two-track rule keeps engagement copy out of financial judgement.
    expect(toast().textContent).toBe('Impulse Monster beaten. Lighter week than last.')
    // The card carries the persistent claimed-win marker past the toast.
    expect(screen.getByText('Beaten last week +150 XP')).toBeTruthy()
    // A reload (remount over the persisted grant) never pays the week twice.
    cleanup()
    render(<App />)
    expect(saved().xp.totalXp).toBe(150)
    expect(saved().xpLog).toHaveLength(1)
  })
})

describe('the date-grouped ledger', () => {
  /* Every case below pins the clock to Tue 4 Aug 2026 and seeds the log
     directly, because the whole point of the feature is that "Today" and
     "Yesterday" are computed from the day the app is HOLDING, not from a fresh
     wall-clock read at render time. */
  const seed = (transactions: Partial<Transaction>[]) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0))
    localStorage.setItem('ember-state-v1', JSON.stringify({ transactions }))
  }
  const tx = (over: Partial<Transaction>): Partial<Transaction> => ({
    amountDA: 100,
    category: 'Food',
    ...over,
  })
  const ledger = () => screen.getByRole('main').querySelector('.ledger-card') as HTMLElement
  const dayLabels = () =>
    [...ledger().querySelectorAll('.day-label')].map((n) => n.textContent)

  // Four logged days: today, yesterday, and two older — one more than the
  // three-day window, so the expand control exists.
  const FOUR_DAYS = [
    tx({ id: 'd', amountDA: 400, date: '2026-08-04' }),
    tx({ id: 'c', amountDA: 250, date: '2026-08-04' }),
    tx({ id: 'b', amountDA: 900, category: 'Transport', date: '2026-08-03' }),
    tx({ id: 'a', amountDA: 120, category: 'Other', date: '2026-08-01' }),
    tx({ id: 'z', amountDA: 700, category: 'Other', date: '2026-07-28' }),
  ]

  it('groups rows under one heading per day, newest day first', () => {
    seed(FOUR_DAYS.slice(0, 4))
    render(<App />)
    // Exactly three headings for rows on three days — never an empty scaffold
    // for the days in between, and never one heading per row.
    expect(dayLabels()).toEqual(['Today', 'Yesterday', 'Sat 1 Aug'])
    // …and the rows land under the right ones.
    const groups = ledger().querySelectorAll('.ledger-day')
    expect(groups[0].querySelectorAll('.tx')).toHaveLength(2)
    expect(groups[1].querySelectorAll('.tx')).toHaveLength(1)
  })

  it('reads Today and Yesterday off the app day, not a fresh clock', () => {
    seed(FOUR_DAYS.slice(0, 4))
    render(<App />)
    expect(dayLabels()[0]).toBe('Today')
    // Midnight passes with the tab open. Until a day sync lands, the app is
    // still holding 4 Aug — and so is the ledger: the row logged today must
    // not silently re-title itself "Yesterday" while every other card, and the
    // date the next log will be stamped with, still say the 4th.
    vi.setSystemTime(new Date(2026, 7, 5, 0, 0, 30))
    expect(dayLabels()[0]).toBe('Today')
    // Once the sync lands (focus), the whole render agrees on the new day.
    act(() => {
      fireEvent.focus(window)
    })
    expect(dayLabels()).toEqual(['Yesterday', 'Mon 3 Aug', 'Sat 1 Aug'])
  })

  it('totals each day from purchases only — a resist lists but adds nothing', () => {
    seed([
      tx({ id: 'r', amountDA: 500, date: '2026-08-04', resistedImpulse: true }),
      tx({ id: 'p', amountDA: 250, date: '2026-08-04' }),
    ])
    render(<App />)
    // 250, not 750: the resist is money that did not leave.
    expect(
      within(ledger()).getByRole('heading', { level: 3, name: 'Today Spent 250 DA' }),
    ).toBeTruthy()
    // The resist is still visible in its day, with its avoided amount…
    expect(screen.getByText('500 DA avoided')).toBeTruthy()
    // …and it still feeds the month's resisted mirror, unchanged.
    expect(screen.getByText('500 DA resisted this month')).toBeTruthy()
  })

  it('states a day of resists as 0 DA rather than dropping the day', () => {
    seed([tx({ id: 'r', amountDA: 500, date: '2026-08-04', resistedImpulse: true })])
    render(<App />)
    expect(
      within(ledger()).getByRole('heading', { level: 3, name: 'Today Spent 0 DA' }),
    ).toBeTruthy()
  })

  it('renders two identical rows on one day as two rows that both count', () => {
    seed([
      tx({ id: 'x1', amountDA: 150, date: '2026-08-04' }),
      tx({ id: 'x2', amountDA: 150, date: '2026-08-04' }),
    ])
    render(<App />)
    expect(ledger().querySelectorAll('.tx')).toHaveLength(2)
    expect(
      within(ledger()).getByRole('heading', { level: 3, name: 'Today Spent 300 DA' }),
    ).toBeTruthy()
  })

  it('never lets a future-dated row wear Today or outrank a real day', () => {
    // Device clock skew or a hand-edited payload. The row is the user's data
    // and stays visible, but it sorts below every real day — the same
    // both-ends bound deriveHealthInputs puts on its windows.
    seed([
      tx({ id: 'skew', amountDA: 999, date: '2026-09-01' }),
      tx({ id: 'now', amountDA: 250, date: '2026-08-04' }),
    ])
    render(<App />)
    expect(dayLabels()).toEqual(['Today', 'Tue 1 Sep'])
    expect(
      within(ledger()).getByRole('heading', { level: 3, name: 'Today Spent 250 DA' }),
    ).toBeTruthy()
  })

  it('keeps the empty copy and shows no day scaffold with nothing logged', () => {
    render(<App />)
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy()
    expect(dayLabels()).toEqual([])
    expect(within(ledger()).queryAllByRole('heading', { level: 3 })).toEqual([])
    // Nothing to scope yet, so no scope line either — it rides with the list.
    expect(within(ledger()).queryByText(/No averages/)).toBeNull()
    expect(screen.queryByRole('button', { name: /earlier day/ })).toBeNull()
  })

  it('states its scope as a permanent property, never as a countdown', () => {
    seed(FOUR_DAYS)
    render(<App />)
    expect(within(ledger()).getByText(/Totals only\. No averages, no comparisons\./)).toBeTruthy()
    // No "yet", and no Day n / 90 index. Both were promises: the app has
    // committed never to average (the assertion below is what enforces it),
    // and a 90-day counter is Trust Rule 5's disclosure about the SCORE —
    // attached to day totals it made exact facts look provisional.
    expect(ledger().textContent).not.toMatch(/\byet\b/i)
    expect(ledger().textContent).not.toMatch(/\/ 90/)
    // §12.5: no average, no "vs your usual", no trend, no comparison to a
    // budget — every one of those needs history the user does not have, and
    // would be exactly the unearned confidence the scope line rules out.
    expect(ledger().textContent).not.toMatch(
      /on average|average day|your usual|typical|trend|compared|over budget/i,
    )
  })

  it('windows to three days and expands to the rest from a real button', () => {
    seed(FOUR_DAYS)
    render(<App />)
    expect(dayLabels()).toEqual(['Today', 'Yesterday', 'Sat 1 Aug'])
    const more = screen.getByRole('button', { name: 'Show 1 earlier day' })
    expect(more.tagName).toBe('BUTTON')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(more)
    expect(dayLabels()).toEqual(['Today', 'Yesterday', 'Sat 1 Aug', 'Tue 28 Jul'])
    expect(screen.getByRole('button', { name: 'Show fewer days' }).getAttribute('aria-expanded'))
      .toBe('true')
  })

  it('keeps focus on the expand control instead of stranding it on <body>', () => {
    seed(FOUR_DAYS)
    render(<App />)
    const more = screen.getByRole('button', { name: 'Show 1 earlier day' })
    more.focus()
    expect(document.activeElement).toBe(more)
    fireEvent.click(more)
    // Same element, relabelled — not a swapped control that takes focus with
    // it when it unmounts.
    const fewer = screen.getByRole('button', { name: 'Show fewer days' })
    expect(fewer).toBe(more)
    expect(document.activeElement).toBe(fewer)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('announces the expansion through a mounted live region, not just visually', () => {
    seed(FOUR_DAYS)
    render(<App />)
    // Mounted EMPTY: a region that arrives already holding its text is silent.
    const region = screen.getByRole('status', { name: 'Ledger range' })
    expect(region.textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 earlier day' }))
    expect(region.textContent).toBe('Showing all 4 days.')
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer days' }))
    expect(region.textContent).toBe('Showing 3 of 4 days.')
  })

  it('adds no second h1 and keeps day headings under the card heading', () => {
    seed(FOUR_DAYS)
    render(<App />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ember')
    // The card still names itself once at h2; the days hang off it at h3.
    expect(within(ledger()).getByRole('heading', { level: 2 }).textContent).toBe('Recent')
    expect(within(ledger()).getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })

  it('carries no engagement number into the money surface (Trust Rule 1)', () => {
    seed(FOUR_DAYS)
    render(<App />)
    const before = xpNow()
    const health = screen.getByText(/^Health \d+(\.\d)?$/).textContent
    for (const heading of within(ledger()).getAllByRole('heading', { level: 3 })) {
      // A day total is money. No XP, no streak, no level in the header.
      expect(heading.textContent).not.toMatch(/xp|level|streak/i)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 earlier day' }))
    // Looking at the ledger is not an action the app pays for, and it moves
    // nothing on the financial track either.
    expect(xpNow()).toBe(before)
    expect(screen.getByText(/^Health \d+(\.\d)?$/).textContent).toBe(health)
    const saved = JSON.parse(localStorage.getItem('ember-state-v1')!)
    expect(saved.xpLog).toEqual([])
    expect(saved.xp.totalXp).toBe(0)
  })

  it('files a freshly logged purchase under Today and moves that day total', () => {
    seed([tx({ id: 'a', amountDA: 120, date: '2026-08-01' })])
    render(<App />)
    expect(dayLabels()).toEqual(['Sat 1 Aug'])
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '640' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(dayLabels()).toEqual(['Today', 'Sat 1 Aug'])
    expect(
      within(ledger()).getByRole('heading', { level: 3, name: 'Today Spent 640 DA' }),
    ).toBeTruthy()
  })
})

describe('the cash-note keypad', () => {
  /* Every case renders a cleared localStorage — i.e. day zero. That is the
     honest cold start for this feature: the pad has no data dependency at all,
     so it is at full value on the very first log and degrades to exactly the
     previous typing behaviour if ignored. There is no state in which it shows
     an empty room, which is why none of these cases seed history. */
  const amount = () => screen.getByLabelText('Amount (DA)') as HTMLInputElement
  const note = (n: string) => screen.getByRole('button', { name: `Add ${n} DA` })
  const saved = () => JSON.parse(localStorage.getItem('ember-state-v1')!)

  it('composes an amount from two taps and logs it once, for exactly one grant', () => {
    render(<App />)
    fireEvent.click(note('1,000'))
    fireEvent.click(note('500'))
    // Plain digits in the field: it is read back with Number(), and
    // Number('1,500') is NaN.
    expect(amount().value).toBe('1500')
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(xpNow()).toBe(5)
    expect(saved().transactions).toHaveLength(1)
    expect(saved().transactions[0].amountDA).toBe(1500)
    // Faster entry must not change what a log PAYS (Trust Rule 1): still one
    // tx:{id} grant, still +5, no matter how the amount got there.
    expect(saved().xpLog).toHaveLength(1)
    expect(saved().xpLog[0].amount).toBe(5)
    expect(saved().xpLog[0].id).toBe(`tx:${saved().transactions[0].id}`)
    expect(screen.getByText('1,500 DA')).toBeTruthy()
  })

  it('logs a purchase in exactly two taps — the count the landing surface claims', () => {
    // Landing.tsx's above-the-fold hand-off line says "A purchase is two
    // taps." These are the two: one note key, then Log. Nothing else is
    // required — the category arrives defaulted, the amount is composed by the
    // tap, and no field needs focusing. If the form ever grows a required
    // control, this fails and the claim on the landing page has to change with
    // it, which is the only reason this case exists next to the composition
    // tests above.
    render(<App />)
    fireEvent.click(note('1,000'))
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(saved().transactions).toHaveLength(1)
    expect(saved().transactions[0].amountDA).toBe(1000)
    expect(saved().transactions[0].category).toBe('Food')
    expect(screen.getByText('1,000 DA')).toBeTruthy()
  })

  it('composes with typing in both directions and discards no keystroke', () => {
    render(<App />)
    // Typed first, then tapped.
    fireEvent.change(amount(), { target: { value: '150' } })
    fireEvent.click(note('1,000'))
    expect(amount().value).toBe('1150')
    // Tapped first, then typed over — the field stays authoritative.
    fireEvent.change(amount(), { target: { value: '1160' } })
    fireEvent.click(note('100'))
    expect(amount().value).toBe('1260')
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    expect(saved().transactions[0].amountDA).toBe(1260)
  })

  it('refuses to overwrite typed text it cannot add to, and logs nothing', () => {
    render(<App />)
    fireEvent.change(amount(), { target: { value: '1e999' } })
    fireEvent.click(note('2,000'))
    // The typed string survives — the pad never silently replaces input, and
    // the Infinity row LogCard's isFinite guard rejects is never composed.
    expect(amount().value).toBe('1e999')
    expect(screen.getByRole('alert').textContent).toBe('Clear the amount first.')
    expect(sfx.deny).toHaveBeenCalled()
    expect(xpNow()).toBe(0)
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy()
  })

  it('clears only the amount — never the category, the flag, or anything logged', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Transport' } })
    fireEvent.click(screen.getByLabelText('I bought it anyway'))
    fireEvent.click(note('500'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(amount().value).toBe('')
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('Transport')
    expect((screen.getByLabelText('I bought it anyway') as HTMLInputElement).checked).toBe(true)
    expect(xpNow()).toBe(0)
    expect(saved().transactions).toHaveLength(0)
    expect(saved().xpLog).toEqual([])
  })

  it('renders Clear inert rather than absent while there is nothing to clear', () => {
    // aria-disabled + an onClick guard, never the `disabled` attribute: the
    // control empties the field under the user's own finger, and disabling it
    // at that moment would drop focus to <body>. Absent-then-present would
    // move the whole key row instead.
    render(<App />)
    const clear = screen.getByRole('button', { name: 'Clear' })
    expect(clear.getAttribute('aria-disabled')).toBe('true')
    expect((clear as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(clear)
    expect(xpNow()).toBe(0)
    fireEvent.click(note('100'))
    expect(clear.getAttribute('aria-disabled')).toBe('false')
    expect(screen.getByRole('button', { name: 'Clear' })).toBe(clear)
  })

  it('pays nothing for tapping: the pad is an input method, not an action', () => {
    render(<App />)
    for (let i = 0; i < 6; i++) fireEvent.click(note('2,000'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    for (let i = 0; i < 3; i++) fireEvent.click(note('100'))
    expect(amount().value).toBe('300')
    // Two tracks, never crossed: no XP, no rows, no health movement from
    // eleven taps on the keypad.
    expect(xpNow()).toBe(0)
    expect(saved().transactions).toEqual([])
    expect(saved().xpLog).toEqual([])
    expect(saved().xp.totalXp).toBe(0)
  })

  it('resists a composed amount, records it as avoided, and still honours the cap', () => {
    render(<App />)
    const resist = () => screen.getByRole('button', { name: /I resisted an impulse/ })
    fireEvent.click(note('2,000'))
    fireEvent.click(note('500'))
    fireEvent.click(resist())
    expect(screen.getByText('2,500 DA avoided')).toBeTruthy()
    expect(xpNow()).toBe(50)
    expect(amount().value).toBe('')
    // Second resist of the day is the last paid one. Total, not the bar:
    // 2 × 50 XP is level 2 exactly, so the within-level progressbar reads 0.
    fireEvent.click(note('1,000'))
    fireEvent.click(resist())
    expect(saved().xp.totalXp).toBe(100)
    expect(resist().textContent).toContain('XP capped today')
    // …and the third still logs, at zero, with the composed amount intact.
    fireEvent.click(note('200'))
    fireEvent.click(resist())
    expect(screen.getByText('200 DA avoided')).toBeTruthy()
    expect(saved().xp.totalXp).toBe(100)
    expect(saved().transactions).toHaveLength(3)
  })

  it('still resists at zero from an untouched pad', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(xpNow()).toBe(50)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('names every key with its unit inside a named group', () => {
    render(<App />)
    const pad = screen.getByRole('group', { name: 'Cash (DA)' })
    const keys = within(pad).getAllByRole('button')
    // Five notes plus Clear. Every one a real button, never a click-handling
    // div, so all six are keyboard-reachable and take the focus ring.
    expect(keys).toHaveLength(6)
    for (const key of keys) expect(key.tagName).toBe('BUTTON')
    expect(keys.map((k) => k.getAttribute('aria-label') ?? k.textContent)).toEqual([
      'Add 2,000 DA',
      'Add 1,000 DA',
      'Add 500 DA',
      'Add 200 DA',
      'Add 100 DA',
      'Clear',
    ])
    // WCAG 2.5.3: the accessible name contains the visible string, so voice
    // control ("tap 2,000") still reaches the key.
    for (const key of keys.slice(0, 5)) {
      expect(key.getAttribute('aria-label')).toContain(key.textContent!)
    }
    // §7.4: numerals, no hype, no emoji, no exclamation marks on the keys.
    expect(pad.textContent).not.toMatch(/[!\u{1F300}-\u{1FAFF}]/u)
  })

  it('announces the composed amount through a mounted live region', () => {
    render(<App />)
    // Mounted EMPTY: setting an input's value from code announces nothing on
    // its own, and a region that arrives already holding its text is silent.
    const region = screen.getByRole('status', { name: 'Amount entered' })
    expect(region.textContent).toBe('')
    fireEvent.click(note('1,000'))
    expect(region.textContent).toBe('Amount 1,000 DA')
    fireEvent.click(note('500'))
    expect(region.textContent).toBe('Amount 1,500 DA')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(region.textContent).toBe('Amount cleared.')
  })

  it('resets the announcement on submit so the next identical amount is audible', () => {
    render(<App />)
    const region = screen.getByRole('status', { name: 'Amount entered' })
    fireEvent.click(note('1,000'))
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    // Emptied, not left parked: a live region announces CHANGES, so the same
    // 1,000 DA purchase logged twice in a day would otherwise be announced
    // once and then silently.
    expect(region.textContent).toBe('')
    fireEvent.click(note('1,000'))
    expect(region.textContent).toBe('Amount 1,000 DA')
  })

  it('resets the announcement on a manual edit too, not just Clear and submit', () => {
    // The hole the other two resets left: emptying the field BY HAND (rather
    // than with the Clear key) left the old string parked in the region, so
    // re-tapping the same note wrote an identical value, React reconciled to
    // the same text node, no mutation fired and the tap announced nothing.
    // The amount would then exist only in the visible field — the sighted-only
    // input this region was added to prevent, with no blip behind it (a pad
    // tap deliberately fires none) to carry it.
    render(<App />)
    const region = screen.getByRole('status', { name: 'Amount entered' })
    const amount = screen.getByLabelText('Amount (DA)')
    fireEvent.click(note('1,000'))
    expect(region.textContent).toBe('Amount 1,000 DA')
    fireEvent.change(amount, { target: { value: '' } })
    // Emptied by the edit — and emptying a region announces nothing, so the
    // reset itself costs no noise.
    expect(region.textContent).toBe('')
    fireEvent.click(note('1,000'))
    expect(region.textContent).toBe('Amount 1,000 DA')
    // The same holds for a partial edit, which is the likelier gesture: one
    // backspace off 1,000 and a re-tap composing back to the same total.
    fireEvent.change(amount, { target: { value: '100' } })
    expect(region.textContent).toBe('')
  })

  it('leaves the repeat chips deriving and rendering exactly as before', () => {
    render(<App />)
    for (let i = 0; i < 2; i++) {
      fireEvent.click(note('100'))
      fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Transport' } })
      fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    }
    // The chip derives off the composed rows like any other, and coexists with
    // the pad rather than replacing it.
    const chip = screen.getByRole('button', { name: '100 DA · Transport' })
    fireEvent.click(chip)
    expect(saved().transactions).toHaveLength(3)
    expect(xpNow()).toBe(15)
    expect(screen.getByRole('group', { name: 'Cash (DA)' })).toBeTruthy()
  })

  it('keeps the log card to one spec label and one h2 (§11, single-h1 outline)', () => {
    render(<App />)
    const card = screen.getByRole('main').querySelector('#log') as HTMLElement
    expect(card.querySelectorAll('.spec-label')).toHaveLength(1)
    expect(within(card).getAllByRole('heading', { level: 2 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // The legend is a caption, not a heading — the pad adds no outline level.
    expect(within(card).queryAllByRole('heading', { level: 3 })).toEqual([])
  })
})

describe('the row note — what it was', () => {
  /* The ledger could say 2,000 DA left on Tuesday under "Fun" and nothing in
     the app could say what it was. One optional line at log time fixes that.
     Its honest cold start is that there ISN'T one: the note is on the row the
     same second, and rows logged before it shipped simply carry none — never
     a placeholder, never a prompt to go back and fill them in. */
  const saved = () => JSON.parse(localStorage.getItem('ember-state-v1')!)
  const ledger = () => screen.getByRole('main').querySelector('.ledger-card') as HTMLElement
  const what = () => screen.getByLabelText('What was it?') as HTMLInputElement
  const logIt = (amount: string, note?: string) => {
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: amount } })
    if (note !== undefined) fireEvent.change(what(), { target: { value: note } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
  }

  it('writes what was typed onto the row, and renders it inside that row', () => {
    render(<App />)
    logIt('2000', 'cinema with M')
    expect(saved().transactions[0].note).toBe('cinema with M')
    // Inside the <li class="tx">, not beside it: the note is part of the row a
    // screen reader reads as one item, never a second landmark.
    const row = ledger().querySelector('.tx') as HTMLElement
    expect(within(row).getByText('cinema with M')).toBeTruthy()
    expect(row.textContent).toContain('Food')
    expect(row.textContent).toContain('cinema with M')
    expect(row.textContent).toContain('2,000 DA')
    // Second line, UNDER the category — the order the row is read in.
    const stack = [...row.querySelectorAll('.tx-what > *')].map((n) => n.className)
    expect(stack).toEqual(['tx-cat', 'tx-note'])
    expect(row.querySelector('.tx-cat')!.textContent).toBe('Food')
  })

  it('pays exactly the same XP with a note as without one, both directions', () => {
    // Trust Rule 1 at the surface the user actually touches. A note must not
    // buy XP (memory would become an engagement lever) and its absence must
    // not cost any (the core action would be taxed for skipping it).
    render(<App />)
    logIt('300')
    expect(xpNow()).toBe(5)
    expect(saved().xpLog).toHaveLength(1)
    expect(saved().xpLog[0].amount).toBe(5)
    expect(saved().xpLog[0].action).toBe('logExpense')
    logIt('300', 'bread')
    expect(xpNow()).toBe(10)
    expect(saved().xpLog).toHaveLength(2)
    expect(saved().xpLog[1].amount).toBe(5)
    expect(saved().xpLog[1].action).toBe('logExpense')
    // The note changed the record, not the economy.
    expect(saved().transactions[0].note).toBe('bread')
    expect(saved().transactions[1].note).toBeUndefined()
  })

  it('leaves a noteless row alone — no placeholder, no prompt, no deficiency mark', () => {
    // Every row logged before this field existed has no note, forever. The
    // one thing that must never appear on those rows is a gap advertising
    // itself (§12.3 / §12.6): the row is a complete money record without one.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0))
    localStorage.setItem(
      'ember-state-v1',
      JSON.stringify({
        transactions: [{ id: 'old', amountDA: 900, category: 'Fun', date: '2026-08-01' }],
      }),
    )
    render(<App />)
    const row = ledger().querySelector('.tx') as HTMLElement
    expect(row.querySelector('.tx-note')).toBeNull()
    expect(row.textContent).toBe('Fun900 DA')
    expect(ledger().textContent).not.toMatch(/no note|add a note|missing|untitled|—\s*what/i)
  })

  it('clears the field after a log so the next row is not labelled with the last one', () => {
    render(<App />)
    logIt('300', 'bread')
    expect(what().value).toBe('')
    logIt('450')
    expect(saved().transactions[0].note).toBeUndefined()
    expect(saved().transactions[0].amountDA).toBe(450)
  })

  it('treats a whitespace-only entry as no note at all', () => {
    render(<App />)
    logIt('300', '    ')
    expect(saved().transactions[0].note).toBeUndefined()
    expect((ledger().querySelector('.tx') as HTMLElement).querySelector('.tx-note')).toBeNull()
  })

  it('bounds the field at the same cap the sanitizer enforces', () => {
    // Both ends of the same rule: maxLength keeps the limit visible at the
    // keyboard, the sanitizer keeps it true for payloads that never touched a
    // keyboard. A field without it would silently shrink the user's text at
    // the next reload.
    render(<App />)
    expect(what().getAttribute('maxLength')).toBe(String(NOTE_MAX_LEN))
    // The reducer caps regardless of what reaches it (fireEvent bypasses the
    // browser's own maxLength enforcement, which is the point).
    logIt('300', 'z'.repeat(500))
    expect(saved().transactions[0].note).toBe('z'.repeat(NOTE_MAX_LEN))
  })

  it('keeps the note on a resist row too, without touching the resist accounting', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '4000' } })
    fireEvent.change(what(), { target: { value: 'headphones' } })
    fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    expect(saved().transactions[0].note).toBe('headphones')
    expect(saved().transactions[0].resistedImpulse).toBe(true)
    const row = ledger().querySelector('.tx') as HTMLElement
    expect(row.textContent).toContain('Resisted')
    expect(row.textContent).toContain('headphones')
    expect(row.textContent).toContain('4,000 DA avoided')
  })

  it('carries the note into the export — Trust Rule 7 covers the personal string too', async () => {
    // The note is the most personal string the app holds, so the file the
    // user walks away with has to contain it. Asserted on the actual Blob the
    // download builds, not on the state behind it.
    render(<App />)
    logIt('2000', 'cinema with M')
    // defineProperty, not spyOn: jsdom implements neither URL method, so
    // there is nothing to spy on — the export path is untestable without
    // supplying them.
    let blob: Blob | null = null
    Object.defineProperty(URL, 'createObjectURL', {
      value: (b: Blob) => {
        blob = b
        return 'blob:ember'
      },
      configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Export my data' }))
      expect(blob).not.toBeNull()
      const parsed = JSON.parse(await (blob as unknown as Blob).text()) as {
        transactions: Transaction[]
      }
      expect(parsed.transactions[0].note).toBe('cinema with M')
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('never carries a note onto a repeat chip when the pair disagrees about it', () => {
    // The chip is a claim about a habit. A pair logged once as "bread" and
    // once as "phone credit" has no single answer to "what was it", so the
    // chip must log the money and assert no memory rather than stamp one of
    // the two onto a purchase the user never described that way.
    render(<App />)
    logIt('100', 'bread')
    logIt('100', 'phone credit')
    const chip = screen.getByRole('button', { name: '100 DA · Food' })
    fireEvent.click(chip)
    expect(saved().transactions[0].amountDA).toBe(100)
    expect(saved().transactions[0].note).toBeUndefined()
  })

  it('carries the note when every row of the pair agrees, and says so on the chip', () => {
    render(<App />)
    logIt('100', 'bread')
    logIt('100', 'bread')
    // The label states everything the tap will write — a chip that carried a
    // note it did not name would be logging an unread claim.
    const chip = screen.getByRole('button', { name: '100 DA · Food · bread' })
    fireEvent.click(chip)
    expect(saved().transactions).toHaveLength(3)
    expect(saved().transactions[0].note).toBe('bread')
    // Still one grant of five: a faster path never changes what a log pays.
    expect(xpNow()).toBe(15)
    expect(saved().xpLog[2].amount).toBe(5)
  })

  it('drops the chip note when one row of the pair has none at all', () => {
    render(<App />)
    logIt('100', 'bread')
    logIt('100')
    fireEvent.click(screen.getByRole('button', { name: '100 DA · Food' }))
    expect(saved().transactions[0].note).toBeUndefined()
  })

  it('keeps the ledger card free of averages, budgets and second headings', () => {
    // The guards the ledger is already held to, re-asserted with a free-text
    // field now rendering inside it: the note is the user's words, and no
    // amount of it may turn the card into a comparison surface.
    render(<App />)
    logIt('2000', 'cinema with M')
    expect(ledger().textContent).not.toMatch(
      /on average|your usual|typical|trend|compared|over budget/i,
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(ledger().querySelectorAll('.spec-label')).toHaveLength(1)
    expect(within(ledger()).getAllByRole('heading', { level: 2 })).toHaveLength(1)
    // The note adds no landmark, no region and no list of its own.
    expect(within(ledger()).queryAllByRole('region')).toEqual([])
  })

  it('keeps the log card to one spec label, one h2 and a reachable, named field', () => {
    render(<App />)
    const card = screen.getByRole('main').querySelector('#log') as HTMLElement
    expect(card.querySelectorAll('.spec-label')).toHaveLength(1)
    expect(within(card).getAllByRole('heading', { level: 2 })).toHaveLength(1)
    // A real visible <label>, not a placeholder standing in for one (§12.8):
    // getByLabelText resolves it, and the caption survives the first
    // keystroke because it is an element, not an attribute.
    expect(what().tagName).toBe('INPUT')
    expect(what().closest('label')?.querySelector('.field-label')?.textContent).toBe(
      'What was it?',
    )
    // Reachable by keyboard, and it is not a required gate on logging: the
    // landing surface's "two taps" claim is still true (see the keypad suite).
    what().focus()
    expect(document.activeElement).toBe(what())
    expect(what().hasAttribute('required')).toBe(false)
  })
})

describe('storage that refuses the write', () => {
  // QuotaExceededError is the named case, but the far more common trigger is a
  // privacy mode granting zero quota, where every write fails from the first
  // tap. Either way the app used to confirm a save it never made.
  const breakStorage = () =>
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('exceeded the quota', 'QuotaExceededError')
    })

  const fault = () => screen.getByRole('status', { name: 'Storage' })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the fault region mounted and EMPTY while writes are landing', () => {
    render(<App />)
    // Mounted empty or the announcement never happens: screen readers only
    // announce text CHANGES inside a region that already exists.
    expect(fault().textContent).toBe('')
  })

  it('says the write did not land instead of confirming a save that never happened', () => {
    breakStorage()
    render(<App />)
    expect(localStorage.getItem('ember-state-v1')).toBeNull()
    expect(fault().textContent).toBe(
      "That didn't go through. Nothing is saving to this device. Export to keep it.",
    )
  })

  it('keeps the row, the XP and the export path in memory after a failed write', () => {
    breakStorage()
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '4200' } })
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    // Nothing persisted...
    expect(localStorage.getItem('ember-state-v1')).toBeNull()
    // ...but the row must NOT vanish from the screen it was just added to, and
    // "Export my data" reads this same in-memory state — the honest recovery.
    expect(screen.getByText('4,200 DA')).toBeTruthy()
    expect(xpNow()).toBe(5)
    expect(screen.getByRole('button', { name: 'Export my data' })).toBeTruthy()
    expect(fault().textContent).toContain("That didn't go through")
  })

  it('clears the fault as soon as a write lands again', () => {
    const spy = breakStorage()
    render(<App />)
    expect(fault().textContent).not.toBe('')
    spy.mockRestore()
    fireEvent.click(screen.getByText('Look back over your recent purchases'))
    expect(fault().textContent).toBe('')
    expect(JSON.parse(localStorage.getItem('ember-state-v1')!).xp.totalXp).toBe(10)
  })

  it('never lets the fault line steal the single-h1 outline or the toast region', () => {
    breakStorage()
    render(<App />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // The celebration region is a separate, still-empty channel: a storage
    // fault must not read as a toast, and a toast must not overwrite the fault.
    expect(screen.getByRole('status', { name: 'Announcements' }).textContent).toBe('')
  })
})

describe('the month so far', () => {
  /* Same pinned clock as the ledger suite — Tue 4 Aug 2026 — and for the same
     reason, doubled: this card states which day of the month it is, so every
     figure on it is a claim about the day the app is HOLDING. */
  const seed = (transactions: Partial<Transaction>[], extra: Record<string, unknown> = {}) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0))
    localStorage.setItem('ember-state-v1', JSON.stringify({ transactions, ...extra }))
  }
  const tx = (over: Partial<Transaction>): Partial<Transaction> => ({
    amountDA: 100,
    category: 'Food',
    ...over,
  })
  const card = () => screen.getByRole('main').querySelector('.month-card') as HTMLElement
  const cells = () => [...card().querySelectorAll('.month-cell')]
  const ledgerCard = () => screen.getByRole('main').querySelector('.ledger-card') as HTMLElement

  const AUGUST = [
    tx({ id: 'd', amountDA: 400, date: '2026-08-04' }),
    tx({ id: 'c', amountDA: 250, date: '2026-08-04' }),
    tx({ id: 'b', amountDA: 900, category: 'Transport', date: '2026-08-03' }),
    tx({ id: 'a', amountDA: 120, category: 'Other', date: '2026-08-01' }),
  ]

  it('states where you are in the month, what it cost, and how much is left', () => {
    seed(AUGUST)
    render(<App />)
    expect(within(card()).getByRole('heading', { level: 2 }).textContent).toBe('This month')
    expect(within(card()).getByText('Day 4 / 31')).toBeTruthy()
    expect(within(card()).getByText('1,670 DA logged')).toBeTruthy()
    expect(within(card()).getByText('27 days left.')).toBeTruthy()
  })

  it('reads the day off the app day, not a fresh clock', () => {
    seed(AUGUST)
    render(<App />)
    expect(within(card()).getByText('Day 4 / 31')).toBeTruthy()
    // Midnight passes with the tab open. Until a day sync lands the app is
    // still holding the 4th — and so must this card, or the page says "Day 5"
    // over a row it stamped the 4th.
    vi.setSystemTime(new Date(2026, 7, 5, 0, 0, 30))
    expect(within(card()).getByText('Day 4 / 31')).toBeTruthy()
    act(() => {
      fireEvent.focus(window)
    })
    expect(within(card()).getByText('Day 5 / 31')).toBeTruthy()
    expect(within(card()).getByText('26 days left.')).toBeTruthy()
  })

  it('excludes resists and future-dated rows from the so-far figure', () => {
    seed([
      tx({ id: 'p', amountDA: 250, date: '2026-08-04' }),
      tx({ id: 'r', amountDA: 900, date: '2026-08-04', resistedImpulse: true }),
      tx({ id: 'skew', amountDA: 99_000, date: '2026-08-20' }),
    ])
    render(<App />)
    // 250: a resist is money that did not leave, and a future row has not
    // happened. Both still render in the ledger below — nothing is hidden.
    expect(within(card()).getByText('250 DA logged')).toBeTruthy()
    expect(within(ledgerCard()).getByText('900 DA avoided')).toBeTruthy()
  })

  it('draws one cell per calendar day and hands the data to text, not the strip', () => {
    seed(AUGUST)
    render(<App />)
    expect(cells()).toHaveLength(31)
    // The strip is decoration: the figures above it are the data, so it must
    // not add 31 announcements or a second progressbar/meter to the page.
    expect(card().querySelector('.month-strip')?.getAttribute('aria-hidden')).toBe('true')
    expect(within(card()).queryAllByRole('progressbar')).toEqual([])
    expect(within(card()).queryAllByRole('meter')).toEqual([])
    expect(screen.getAllByRole('progressbar')).toHaveLength(1) // still just XP
    // Every cell is empty of text — nothing on the strip is content.
    expect(cells().every((c) => c.textContent === '')).toBe(true)
    // A bar only where money moved (the .xp-fill rule: no phantom sliver).
    expect(card().querySelectorAll('.month-bar')).toHaveLength(3)
  })

  it('gives February its real length, and a leap February one more', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 1, 10, 12, 0, 0))
    render(<App />)
    expect(cells()).toHaveLength(28)
    expect(within(card()).getByText('Day 10 / 28')).toBeTruthy()
    cleanup()
    vi.setSystemTime(new Date(2024, 1, 10, 12, 0, 0))
    render(<App />)
    expect(cells()).toHaveLength(29)
  })

  it('marks the days before the first record as blank IN WORDS, not only in pixels', () => {
    // The card's sharpest cold-start problem: installing on the 12th must not
    // report eleven days of spending nothing. The strip is aria-hidden, so the
    // distinction has to survive into the text or it does not exist for AT.
    seed([tx({ id: 'a', amountDA: 500, date: '2026-08-02' })])
    render(<App />)
    expect(
      within(card()).getByText('Record starts Sun 2 Aug. Days before it are blank, not zero.'),
    ).toBeTruthy()
    const state = cells().map((c) => c.className.split(' ')[1])
    expect(state[0]).toBe('is-no-record')
    // Day 2 opened the record; days 3 and 4 logged nothing and are REAL zeros.
    expect(state[1]).toBe('is-recorded')
    expect(state[2]).toBe('is-recorded')
    expect(state[3]).toBe('is-recorded')
    expect(state[4]).toBe('is-ahead')
    // The two kinds of blank are never the same mark.
    expect(state[2]).not.toBe(state[0])
  })

  it('names the boundary day the way the ledger names it — one date vocabulary', () => {
    // The ledger heading right below this card calls the same day "Yesterday".
    // Two names for one day on one screen is worse than a clumsy sentence.
    seed([tx({ id: 'a', amountDA: 500, date: '2026-08-03' })])
    render(<App />)
    expect(
      within(card()).getByText('Record starts Yesterday. Days before it are blank, not zero.'),
    ).toBeTruthy()
    expect([...ledgerCard().querySelectorAll('.day-label')][0].textContent).toBe('Yesterday')
  })

  it('drops the record-window line once nothing in the month is blank', () => {
    // A permanent sentence about a boundary that has passed is clutter.
    seed([tx({ id: 'a', amountDA: 500, date: '2026-08-01' })])
    render(<App />)
    expect(card().textContent).not.toMatch(/Record starts/)
    expect(cells().every((c) => !c.className.includes('is-no-record'))).toBe(true)
  })

  it('says nothing is on record yet instead of drawing a month of zeros', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0))
    render(<App />)
    expect(within(card()).getByText("No record yet. That's fine.")).toBeTruthy()
    expect(within(card()).getByText('0 DA logged')).toBeTruthy()
    // No nag, no deficiency mark, no prompt to go and log something (§12.3,
    // §12.6) — and no bar drawn for a day that has no record.
    expect(card().querySelectorAll('.month-bar')).toHaveLength(0)
    expect(card().textContent).not.toMatch(/missing|behind|should|start logging|nothing logged/i)
  })

  it('keeps a quiet month on record — an earlier month’s rows make it real zeros', () => {
    seed([tx({ id: 'jul', amountDA: 700, date: '2026-07-20' })])
    render(<App />)
    expect(card().textContent).not.toMatch(/No record yet/)
    expect(cells().slice(0, 4).every((c) => c.className.includes('is-recorded'))).toBe(true)
    expect(within(card()).getByText('0 DA logged')).toBeTruthy()
  })

  it('agrees with the ledger about what each day cost — one derivation, two surfaces', () => {
    seed(AUGUST)
    render(<App />)
    // The ledger prints the same rows as day headings. A page that answers
    // "what did Saturday cost" twice must never answer it differently.
    const dayTotals = [...ledgerCard().querySelectorAll('.day-total')].map((n) =>
      Number(n.textContent!.replace(/[^0-9]/g, '')),
    )
    expect(dayTotals).toEqual([650, 900, 120])
    const monthTotal = Number(
      within(card()).getByText(/DA logged$/).textContent!.replace(/[^0-9]/g, ''),
    )
    expect(monthTotal).toBe(dayTotals.reduce((a, b) => a + b, 0))
  })

  it('states no target, no projection and no comparison — even with a real profile', () => {
    // §12.3 / §12.6: UserProfile.budgeted is real (income minus the goal
    // contribution) and this card is exactly where it would first try to
    // appear. The component is never handed the profile, which is the
    // structural half; this is the assertion that keeps it that way.
    seed(AUGUST, {
      profile: {
        monthlyIncome: 88_000,
        monthlyEssentials: 41_000,
        efBalance: 20_000,
        debt: null,
        goal: null,
        savedDate: '2026-08-01',
      },
    })
    render(<App />)
    // The profile really did land — the demo disclosure is gone.
    expect(screen.queryByText(/demo profile/i)).toBeNull()
    expect(card().textContent).not.toContain('88,000')
    // Everything the card STATES, minus the scope line that rules those words
    // out — the disclaimer is allowed to name what it forbids, nothing else is.
    const stated = [...card().querySelectorAll('.month-head, .month-facts, .month-note')]
      .map((n) => n.textContent)
      .join(' ')
    expect(stated).not.toMatch(/budget|target|goal|limit|left to spend/i)
    expect(card().textContent!.match(/target/gi)).toHaveLength(1)
    // The same guard the ledger is held to: no average, no trend, no verdict.
    expect(card().textContent).not.toMatch(
      /on average|average day|your usual|typical|trend|compared|over budget/i,
    )
    // §12.5 in its own words: no run-rate, no forecast off four days.
    expect(card().textContent).not.toMatch(/at this pace|on track|projected|forecast|estimate/i)
    expect(within(card()).getByText('Totals only. No target, no projection.')).toBeTruthy()
  })

  it('carries no engagement number onto the money surface (Trust Rule 1)', () => {
    seed(AUGUST)
    render(<App />)
    const before = xpNow()
    const health = screen.getByText(/^Health \d+(\.\d)?$/).textContent
    expect(card().textContent).not.toMatch(/\bxp\b|level|streak|quest|badge|pet/i)
    // Reading the month is not an action the app pays for, and it moves
    // nothing on the financial track either.
    expect(xpNow()).toBe(before)
    expect(screen.getByText(/^Health \d+(\.\d)?$/).textContent).toBe(health)
  })

  it('adds no second h1, one h2, one spec label and no landmark of its own', () => {
    seed(AUGUST)
    render(<App />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(within(card()).getAllByRole('heading', { level: 2 })).toHaveLength(1)
    expect(within(card()).queryAllByRole('heading', { level: 3 })).toEqual([])
    expect(card().querySelectorAll('.spec-label')).toHaveLength(1)
    expect(within(card()).queryAllByRole('region')).toEqual([])
    // Card titles stay unique across the whole outline.
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('indexes the one numeral a log moves, and leaves the calendar alone', () => {
    // §9 move 4 is for a numeral the user's action moves. The day index ticks
    // over at midnight with nobody watching; animating it would be noise.
    seed(AUGUST)
    render(<App />)
    expect(card().querySelector('.month-spend')?.className).toContain('index-roll')
    expect(card().querySelector('.month-index')?.className).not.toContain('index-roll')
  })

  it('opens the archive half of the stack, directly above the ledger', () => {
    seed(AUGUST)
    render(<App />)
    const stack = [...screen.getByRole('main').querySelectorAll('section.card')]
    expect(stack.indexOf(ledgerCard()) - stack.indexOf(card())).toBe(1)
  })
})

/**
 * The a11y sweep, turned into permanent assertions.
 *
 * Each block names the finding it pins. These are behaviours a rendered audit
 * measured through CDP (real tab-walks, real live-region mutation records) and
 * that nothing in the DOM otherwise stops from regressing — the whole point of
 * the exercise is that "we fixed it once" is not a mechanism.
 */
describe('accessibility depth — the sweep as regression tests', () => {
  /** LogCard's UNDO_WINDOW_MS. Local, because exporting it to a test would
      make the window look like a tuning knob rather than a product decision. */
  const UNDO_WINDOW = 5_000
  const submitBtn = () => screen.getByRole('button', { name: /Log purchase/ })
  const undoBtn = () => screen.getByRole('button', { name: 'Undo' })
  const logStatus = () => screen.getByRole('status', { name: 'Log status' })
  const padStatus = () => screen.getByRole('status', { name: 'Amount entered' })
  const logAmount = (value: string) => {
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value } })
    fireEvent.click(submitBtn())
  }

  // ── Finding 1: undo was effectively sighted-only ────────────────────────
  it('announces the undo affordance itself, not only the XP that came with it', () => {
    render(<App />)
    // Mounted EMPTY, like every other status region here.
    expect(logStatus().textContent).toBe('')
    logAmount('2000')
    // An affordance, not a receipt: "+5 XP" and a bare <div> the user was
    // never told about is not a five-second grace window they can use.
    expect(logStatus().textContent).toBe('Logged 2,000 DA. Undo available.')
  })

  it('pauses the 5s grace window while the strip holds focus (WCAG 2.2.1)', () => {
    vi.useFakeTimers()
    render(<App />)
    logAmount('500')
    act(() => {
      undoBtn().focus()
    })
    expect(document.activeElement).toBe(undoBtn())
    // Four windows' worth of wall clock. A hard 5s limit with no pause is a
    // Level A timing failure, and expiring under the user's own focus is the
    // focus-drop the `disabled` ban elsewhere in this app exists to prevent.
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW * 4)
    })
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    expect(document.activeElement).toBe(undoBtn())
    // …and the window restarts in full the moment focus leaves.
    act(() => {
      submitBtn().focus()
    })
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW)
    })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    // Focus never fell to <body> on the way out.
    expect(document.activeElement).toBe(submitBtn())
  })

  it('empties the log region when the window expires — the affordance is gone', () => {
    vi.useFakeTimers()
    render(<App />)
    logAmount('500')
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW)
    })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    // Emptying announces nothing, and it re-arms the region for the next log
    // of the same amount.
    expect(logStatus().textContent).toBe('')
    logAmount('500')
    expect(logStatus().textContent).toBe('Logged 500 DA. Undo available.')
  })

  // ── Finding 2: activating Undo dropped focus and announced nothing ──────
  it('hands focus back and names the removal when Undo is pressed', () => {
    render(<App />)
    logAmount('2000')
    const btn = undoBtn()
    act(() => {
      btn.focus()
    })
    fireEvent.click(btn)
    // The button the user just pressed unmounts under them; without the
    // hand-off, focus lands on <body> and their place is gone.
    expect(document.activeElement).toBe(submitBtn())
    // XP going DOWN is announced by nothing in useRewards, and the ledger row
    // simply vanishes — so the removal has to say so itself.
    expect(logStatus().textContent).toBe('Removed. 2,000 DA log undone.')
    expect(xpNow()).toBe(0)
  })

  it('names a resist removal in the resist’s own words', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /I resisted an impulse/ }))
    expect(logStatus().textContent).toBe('Resist logged. Undo available.')
    fireEvent.click(undoBtn())
    expect(logStatus().textContent).toBe('Removed. Resist undone.')
  })

  it('announces a chip log and its undo too — the chip is a log like any other', () => {
    render(<App />)
    for (let i = 0; i < 2; i++) logAmount('80')
    fireEvent.click(screen.getByRole('button', { name: '80 DA · Food' }))
    expect(logStatus().textContent).toBe('Logged 80 DA. Undo available.')
    fireEvent.click(undoBtn())
    expect(logStatus().textContent).toBe('Removed. 80 DA log undone.')
  })

  // ── Finding 3: export confirmed nothing and had no failure path ─────────
  it('confirms the export by name, and says so when the device blocks it', () => {
    render(<App />)
    const status = () => screen.getByRole('status', { name: 'Export' })
    const exportBtn = () => screen.getByRole('button', { name: 'Export my data' })
    expect(status().textContent).toBe('')
    // jsdom implements neither URL method, so the untouched environment IS a
    // blocked-download configuration — the path that used to throw into the
    // void with Trust Rule 7's headline action attached to it.
    fireEvent.click(exportBtn())
    expect(status().textContent).toBe(
      "That didn't go through. Export blocked on this device.",
    )
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => 'blob:ember',
      configurable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
    try {
      fireEvent.click(exportBtn())
      // Claims the act, not the device's outcome: a.click() is a silent no-op
      // when downloads are blocked, so "Export written." asserted a file this
      // code cannot see. Trust Rule 7's headline action does not get to claim
      // what it has no evidence for.
      const built = `Export built. ember-export-${todayISO()}.json handed to the browser.`
      expect(status().textContent).toBe(built)
      expect(status().textContent).not.toMatch(/written|saved|downloaded/)
      // The sighted user gets it too, once — the visible twin is aria-hidden
      // so the outcome is read once, not twice (SimCard's pattern) — and it is
      // NOT in the 11px .foot-note register the boilerplate beside it uses.
      const visible = document.querySelector('.foot .export-note[aria-hidden="true"]')
      expect(visible?.textContent).toBe(built)
      expect(document.querySelector('.foot .foot-note[aria-hidden="true"]')).toBeNull()
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('re-announces an identical export outcome instead of going silent', () => {
    render(<App />)
    const status = () => screen.getByRole('status', { name: 'Export' })
    const exportBtn = () => screen.getByRole('button', { name: 'Export my data' })
    fireEvent.click(exportBtn())
    const first = status().textContent!
    fireEvent.click(exportBtn())
    // A live region announces text CHANGES: the same string reconciled into
    // the same node fires no mutation and is silent. The node must differ…
    expect(status().textContent).not.toBe(first)
    // …and the words must not.
    expect(status().textContent!.trim()).toBe(first.trim())
  })

  // ── Finding 4: a repeated identical validation error was announced once ──
  it('re-announces a repeated identical error on the log card', () => {
    render(<App />)
    fireEvent.click(submitBtn())
    const first = screen.getByRole('alert')
    expect(first.textContent).toBe('Enter an amount first.')
    fireEvent.click(submitBtn())
    const second = screen.getByRole('alert')
    expect(second.textContent).toBe('Enter an amount first.')
    // Same words, DIFFERENT node: role="alert" announces on insertion, and
    // reconciling into the existing node fired no mutation at all — leaving
    // sfx.deny() to carry the second press alone, which §10 forbids.
    expect(second).not.toBe(first)
    expect(screen.getByLabelText('Amount (DA)').getAttribute('aria-describedby')).toBe(
      'log-error',
    )
  })

  it('re-announces a repeated identical error on the simulator', () => {
    render(<App />)
    const run = () => screen.getByRole('button', { name: 'Run simulation' })
    fireEvent.click(run())
    const first = screen.getByRole('alert')
    fireEvent.click(run())
    const second = screen.getByRole('alert')
    expect(second.textContent).toBe('Enter an amount first.')
    expect(second).not.toBe(first)
  })

  it('re-announces a repeated identical error on the profile card', () => {
    render(<App />)
    const save = () => screen.getByRole('button', { name: 'Save my numbers' })
    fireEvent.click(save())
    const first = screen.getByRole('alert')
    expect(first.textContent).toBe('Monthly income needs a number (0 or more).')
    fireEvent.click(save())
    const second = screen.getByRole('alert')
    expect(second.textContent).toBe('Monthly income needs a number (0 or more).')
    expect(second).not.toBe(first)
  })

  // ── Finding 5: the in-page jump targets were not focusable ──────────────
  it('makes every hero jump target focusable and named', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#log', '#quests', '#simulator', '#codex', '#badges'])
    expect(screen.getByRole('link', { name: /Start logging/ }).getAttribute('href')).toBe(
      '#log',
    )
    for (const [id, title] of [
      ['log', 'Log it'],
      ['quests', "Today's quests"],
      ['simulator', 'Decision simulator'],
      ['codex', 'Lesson codex'],
      ['badges', 'Achievements'],
    ]) {
      const section = document.getElementById(id)!
      expect(section.tagName).toBe('SECTION')
      // The ATTRIBUTE, not el.tabIndex: a section with no tabindex at all
      // also reports -1, which is exactly why the sweep's measurement of
      // "targetTabIndex: -1" was a finding rather than a pass. Authored -1
      // makes the section script-focusable without entering the tab order.
      expect(section.getAttribute('tabindex')).toBe('-1')
      // Named, so arriving there announces the section instead of "region".
      expect(section.getAttribute('aria-labelledby')).toBe(`${id}-title`)
      expect(document.getElementById(`${id}-title`)!.textContent).toBe(title)
    }
    // Every jump target still resolves — no link points at a dead fragment.
    for (const href of hrefs) expect(document.getElementById(href!.slice(1))).not.toBeNull()
  })

  // ── Finding 6: one quest completing announced only as a bare XP number ───
  it('names the quest that just completed, not just the XP it paid', () => {
    render(<App />)
    fireEvent.click(
      screen.getByRole('button', { name: /Mark done: Log every purchase today/ }),
    )
    const toast = screen.getByRole('status', { name: 'Announcements' })
    // The whole signal used to be the focused button's accessible name
    // changing — announced by NVDA, frequently not by VoiceOver.
    expect(toast.textContent).toBe('Quest done. Log every purchase today')
    // §7.4: no exclamation marks in anything a live region carries.
    expect(toast.textContent).not.toMatch(/!/)
  })

  // ── Finding 7: the health drawer had no aria-controls ───────────────────
  it('wires the health drawer to the button that opens it', () => {
    render(<App />)
    const why = () => screen.getByRole('button', { name: /Why this stage\?|Hide the breakdown/ })
    expect(why().getAttribute('aria-controls')).toBe('health-breakdown')
    expect(why().getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('health-breakdown')).toBeNull()
    fireEvent.click(why())
    expect(why().getAttribute('aria-expanded')).toBe('true')
    expect(why().getAttribute('aria-controls')).toBe('health-breakdown')
    expect(document.getElementById('health-breakdown')).not.toBeNull()
  })

  // ── Finding 8: the inert Clear key was a dead press ─────────────────────
  it('explains the inert Clear key instead of dying silently under the thumb', () => {
    vi.mocked(sfx.deny).mockClear()
    render(<App />)
    const clear = screen.getByRole('button', { name: 'Clear' })
    // aria-disabled + guarded no-op, never the disabled attribute.
    expect(clear.getAttribute('aria-disabled')).toBe('true')
    expect((clear as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(clear)
    expect(padStatus().textContent).toBe('Nothing to clear.')
    const first = padStatus().textContent!
    fireEvent.click(clear)
    // Audible on the second press too, and identical in words.
    expect(padStatus().textContent).not.toBe(first)
    expect(padStatus().textContent!.trim()).toBe('Nothing to clear.')
    // Nothing failed: no alert, no denial cue, no XP, no row.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(sfx.deny).not.toHaveBeenCalled()
    expect(xpNow()).toBe(0)
  })
})

/**
 * §11 / §1 trait 10 — THE CORNER MARKS ARE POSITIONAL, so they are a claim
 * about App's render order and nothing else can keep them true.
 *
 * tokens.css states the contract in as many words: "the index is the card's
 * real position in the stack, so it stays accurate as long as App's order
 * does." It stopped being true the moment a card was inserted without
 * renumbering — MonthCard went in 9th while its stamp still read MTD—12, and
 * three cards behind it were off by one. On a product whose §1 trait 10 calls
 * these marks "decorative truth-telling", four wrong indices out of twelve is
 * the mark lying about the thing it exists to state.
 *
 * So the expectation is DERIVED from the rendered order rather than typed:
 * insert a card anywhere in App and this fails, instead of the next audit
 * catching it.
 */
describe('§11 — the printed corner index is the card’s real position', () => {
  const marks = () =>
    [...document.querySelectorAll('.spec-label')].map((el) => el.textContent ?? '')

  it('numbers every card 01..n in the order App stacks them', () => {
    render(<App />)
    const printed = marks()
    // Every card carries one (§11), so the run has to be as long as the stack.
    expect(printed.length).toBe(document.querySelectorAll('main .card').length)
    expect(printed.length).toBeGreaterThan(8)
    // The prefix is the card's own three-letter code; only the index is
    // derived, so this asserts position without freezing the vocabulary.
    expect(printed.map((m) => m.split('—')[1])).toEqual(
      printed.map((_, i) => String(i + 1).padStart(2, '0')),
    )
    // …and each mark is a real AB—01 stamp, not an empty split artefact.
    for (const m of printed) expect(m).toMatch(/^[A-Z]{2,3}—\d{2}$/)
  })

  it('keeps the marks out of the accessibility tree — they are printed spec', () => {
    render(<App />)
    for (const el of document.querySelectorAll('.spec-label')) {
      expect(el.getAttribute('aria-hidden')).toBe('true')
    }
  })
})
