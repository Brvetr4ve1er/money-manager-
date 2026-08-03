import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Root } from './Root.tsx'
import { Landing } from './components/Landing.tsx'
import { defaultState } from './state/store.ts'

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
  it('shows a stranger no score, no stage and no demo numbers', () => {
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
