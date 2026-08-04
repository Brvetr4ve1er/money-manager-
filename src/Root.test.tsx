import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Root } from './Root.tsx'
import { Landing } from './components/Landing.tsx'
import { defaultState, todayISO } from './state/store.ts'
import { sampleLedgerRows } from './content/sampleLedger.ts'
import { groupTransactionsByDay } from './engine/ledger.ts'
import { NOTE_DENOMINATIONS_DA } from './engine/keypad.ts'
import { CALIBRATION_DAYS } from './engine/profile.ts'

// Same stub as App.test: sounds are reinforcement only and jsdom has no
// AudioContext. Root mounts App, so the module is in the graph either way.
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

afterEach(cleanup)

/** What a returning visitor's browser looks like: the state key exists. */
function seedSavedState() {
  localStorage.setItem('ember-state-v1', JSON.stringify(defaultState()))
}

const enterButtons = () => screen.getAllByRole('button', { name: /start logging/i })
const logForm = () => screen.queryByRole('button', { name: /Log purchase/ })

describe('cold-start gate', () => {
  it('shows the landing surface to a browser that has never run Ember', () => {
    render(<Root />)
    expect(enterButtons().length).toBeGreaterThan(0)
    // The app is genuinely not mounted — not hidden, not stacked underneath.
    expect(logForm()).toBeNull()
  })

  it('sends a returning visitor straight into the app, never through the pitch', () => {
    seedSavedState()
    render(<Root />)
    expect(logForm()).not.toBeNull()
    expect(screen.queryByRole('button', { name: /start logging/i })).toBeNull()
  })

  it('keeps a returning visitor in the app even when the saved payload is corrupt', () => {
    // loadState() falls back to defaultState() for both a MISSING key and a
    // CORRUPT one, which is why the gate tests key presence instead: a
    // returning user whose payload got mangled must land in their app, not be
    // thrown back onto a marketing page.
    localStorage.setItem('ember-state-v1', '{not json')
    render(<Root />)
    expect(logForm()).not.toBeNull()
  })

  it('dismisses into the app when the CTA is pressed', () => {
    render(<Root />)
    fireEvent.click(enterButtons()[0])
    expect(logForm()).not.toBeNull()
    expect(screen.queryByRole('button', { name: /start logging/i })).toBeNull()
  })

  it('mounts both live regions with the app, empty, on the way in', () => {
    // Trust Rule 8 / the announce-on-change contract: most screen readers only
    // announce text CHANGES inside an EXISTING live region, so these must be
    // present the moment the app appears and must not arrive with text.
    render(<Root />)
    fireEvent.click(enterButtons()[0])
    expect(screen.getByRole('status', { name: 'Announcements' }).textContent).toBe('')
    expect(screen.getByRole('status', { name: 'XP gains' }).textContent).toBe('')
  })

  it('moves focus into the app when the button that had it is unmounted', () => {
    render(<Root />)
    fireEvent.click(enterButtons()[0])
    // Without this the keyboard user is stranded on <body>, tabbing from the
    // top of a document that silently replaced itself.
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })

  it('keeps exactly one page h1 reading "Ember" on both sides of the gate', () => {
    render(<Root />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ember')
    fireEvent.click(enterButtons()[0])
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ember')
  })
})

describe('landing honesty (Trust Rule 5)', () => {
  it('shows a stranger no score, no stage and no reading of anybody', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = container.textContent ?? ''
    // The old cold start greeted first-time visitors with a live health readout
    // of the DEMO profile — a fabricated number presented as fact. Nothing on
    // this surface may reintroduce one.
    expect(text).not.toMatch(/\bHealth \d/)
    expect(text).not.toMatch(/\d+\s*\/\s*100/)
    expect(text).not.toMatch(/\bDA\b\s*\d/)
    // No progress bars, no gauges: this page reports on nobody.
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('carries the three trust facts above the fold', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = (container.textContent ?? '').toLowerCase()
    for (const fact of ['no account', 'no bank link', 'export always']) {
      expect(text).toContain(fact)
    }
  })

  it('names four mechanics and indexes them against their real count', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const indices = [...container.querySelectorAll('.lp-index')].map((n) => n.textContent)
    // §1 trait 10 is "decorative TRUTH-telling": the denominator has to be the
    // length of the list it captions, or the label is set dressing.
    expect(indices).toEqual(['01/04', '02/04', '03/04', '04/04'])
    expect(container.querySelectorAll('.lp-badge')).toHaveLength(indices.length)
  })

  it('holds the §7 voice bans across every string on the page', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = container.textContent ?? ''
    // Same absolute reading as lessons.test.ts: §7.5's list is a word ban and
    // §7.4 bans exclamation marks outright. A marketing surface is the single
    // most likely place for either to creep back in.
    expect(text).not.toMatch(/\b(premium|curated|elevated|seamless|journey|unlock(ed|s)?|crafted)\b/i)
    expect(text).not.toContain('!')
  })

  it('gives every call to action a real handler, not a dead link', () => {
    const onEnter = vi.fn()
    render(<Landing onEnter={onEnter} />)
    for (const btn of screen.getAllByRole('button', { name: /start logging/i })) {
      fireEvent.click(btn)
    }
    expect(onEnter).toHaveBeenCalledTimes(
      screen.getAllByRole('button', { name: /start logging/i }).length,
    )
  })
})

/**
 * THE PRODUCT SHOT.
 *
 * The page renders the app's own <Ledger> instead of an image of it, so these
 * cases are the guarantee that "the real card, not a mockup" stays literally
 * true — and that a live component dropped onto a marketing page does not cost
 * the page its accessibility.
 */
describe('the landing product shot', () => {
  const shot = (c: HTMLElement) => c.querySelector('.lp-shot-frame') as HTMLElement

  it('renders the app\'s own ledger card, corner mark and all', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const frame = shot(container)
    expect(frame).not.toBeNull()
    // LDG—09 is printed by Ledger itself (§11's corner mark). Its presence is
    // proof the component rendered, not a facsimile of it.
    expect(frame.querySelector('.ledger-card')).not.toBeNull()
    expect(frame.textContent).toContain('LDG—09')
    expect(frame.textContent).toContain('Recent')
  })

  it('states the day totals the real grouping engine derives from the sample', () => {
    // The anti-drift assertion: the numbers on the page are recomputed here
    // from the same rows through the same engine. A hand-typed total in a
    // mocked-up card would fail this; a screenshot would pass it forever while
    // silently going stale.
    const { container } = render(<Landing onEnter={() => {}} />)
    const today = todayISO()
    const days = groupTransactionsByDay(sampleLedgerRows(today), today)
    const text = shot(container).textContent ?? ''
    for (const d of days) {
      expect(text).toContain(`${d.label} Spent ${d.spentDA.toLocaleString()} DA`)
    }
  })

  it('shows a resist that adds nothing to its day and lands in the month resisted line', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const today = todayISO()
    const rows = sampleLedgerRows(today)
    const [head] = groupTransactionsByDay(rows, today)
    const kept = rows
      .filter((t) => t.resistedImpulse)
      .reduce((s, t) => s + t.amountDA, 0)
    const text = shot(container).textContent ?? ''
    expect(text).toContain('Resisted')
    expect(text).toContain(`${kept.toLocaleString()} DA avoided`)
    // "resisted", not "kept": the chip names the user's observed ACTION, not
    // an unverifiable outcome (see the chip in Ledger.tsx).
    expect(text).toContain(`${kept.toLocaleString()} DA resisted this month`)
    // …and the day heading is the spend alone. This is the two-track rule,
    // rendered, and it is the reason the shot is worth its space on the page.
    expect(head.spentDA).toBeLessThan(head.spentDA + kept)
    expect(text).toContain(`Spent ${head.spentDA.toLocaleString()} DA`)
  })

  it('carries the card’s own scope statement instead of cropping it out', () => {
    // The ledger's disclosure is a permanent SCOPE statement, not Trust Rule
    // 5's 90-day calibration countdown: a day total is an exact fact from day
    // one, and "Nothing averaged YET" beside a Day n / 90 index promised
    // averages on day 90 that App.test actively forbids this card from ever
    // shipping. The shot carries the honest version, not a cropped one.
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = shot(container).textContent ?? ''
    expect(text).toContain('Totals only. No averages, no comparisons.')
    // …and no countdown that would read as a promise.
    expect(text).not.toMatch(new RegExp(`/ ?${CALIBRATION_DAYS}`))
  })

  it('labels the sample as a sample, in words, next to the card', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const cap = container.querySelector('.lp-shot-cap')?.textContent?.toLowerCase() ?? ''
    expect(cap).toContain('sample rows')
    expect(cap).toContain("nobody's data")
    // The caption is the shot's alt text (the shot is aria-hidden), so it must
    // describe what is in the picture, not just disclaim it.
    expect(cap).toContain('day')
  })

  it('keeps the shot out of the accessibility tree and out of the tab order', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const frame = shot(container)
    expect(frame.getAttribute('aria-hidden')).toBe('true')
    // aria-hidden over a focusable node is a keyboard trap with no accessible
    // name. Ledger grows an expand BUTTON on the fourth day, so this is the
    // assertion standing between the sample and a real defect.
    expect(
      frame.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0)
  })

  it('adds no heading and no live region to the page it is pasted into', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    // The card's own h2/h3s are a picture's internals, not page sections: a
    // heading list must still read as the outline of this page.
    expect(screen.queryByRole('heading', { name: 'Recent' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Today/ })).toBeNull()
    // Invariant 2 in Landing.tsx: the app owns the live-region contract.
    // Ledger mounts a role="status" of its own, and hiding the subtree is what
    // keeps it from becoming a third region on a surface that has none.
    expect(screen.queryAllByRole('status')).toHaveLength(0)
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0)
  })
})

describe('the landing tells the truth about the two newest features', () => {
  it('lists the note keys from the engine constant, never a typed list', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const strip = container.querySelector('.lp-note-strip')?.textContent ?? ''
    expect(strip).toContain(NOTE_DENOMINATIONS_DA.map((n) => n.toLocaleString()).join(' · '))
    // The claims beside the list, each one a behaviour keypad.ts implements:
    // a tap ADDS to the field, and it never replaces what is typed there.
    expect(strip.toLowerCase()).toContain('added to whatever is already in the box')
    expect(strip.toLowerCase()).toContain('never overwrites it')
  })

  it('describes the ledger as day-grouped, which is what the card beside it does', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const spec = container.querySelector('.lp-spec')?.textContent?.toLowerCase() ?? ''
    expect(spec).toContain('grouped by day')
    expect(spec).toContain("each day's spend sits in its heading")
  })
})

describe('the landing states why anyone would pass it on', () => {
  const wall = (c: HTMLElement) => c.querySelector('.lp-wall')?.textContent?.toLowerCase() ?? ''

  it('puts the hand-off reason above the fold, with its three refusals', () => {
    // "Above the fold" is structural here, not visual: .lp-wall is the first
    // full-bleed section and nothing below it is in this string.
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = wall(container)
    expect(text).toContain('send it to a friend')
    for (const refusal of ['no account', 'no bank login', 'no card']) {
      expect(text).toContain(refusal)
    }
    // Each refusal is an absence in the code; the one positive claim beside
    // them is a count, and App.test performs exactly that many taps.
    expect(text).toContain('a purchase is two taps')
  })

  it('names the market and the currency plainly, above the fold', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = wall(container)
    expect(text).toContain('built for algeria')
    expect(text).toContain('every amount in da')
    expect(text).toContain('entered by hand')
  })
})
