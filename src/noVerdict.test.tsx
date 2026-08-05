import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import App from './App.tsx'
import { Landing } from './components/Landing.tsx'
import { todayISO, addDaysISO, type Transaction } from './state/store.ts'

/**
 * "NOTHING HERE GRADES YOU", AS A TEST.
 *
 * The landing page makes that claim above the fold, in the wall, ahead of the
 * mechanic (see .lp-grade in Landing.tsx). It is a claim about an ABSENCE, and
 * this repo already knows what those cost: localFirst.test.ts exists because
 * nothing fails when a module quietly starts calling out, and README.test.ts
 * exists because nothing fails when a document quietly starts describing a
 * build nobody can run. A verdict is the same shape of defect. No feature test
 * goes red when a card starts editorialising — the card still renders, the
 * numbers are still right, and the one person who would notice is the reader
 * the sentence was aimed at.
 *
 * So the claim is asserted over the RENDERED PRODUCT rather than over the
 * source. Source is the wrong subject here: `budgetAdherenceScore`,
 * `monthlyDiscretionary` and `longestLogStreak` are real identifiers in a real
 * engine, and a scan that banned their vocabulary would ban the engine. What
 * the page promises is about what a person READS, so the subject is the text
 * the app puts on screen.
 *
 * THE STATES ARE CHOSEN TO BE THE ONES THAT TEMPT A VERDICT. A fresh install
 * has nothing to judge. A month that has spent four times its own essentials
 * figure, with impulses the user ticked "I bought it anyway" on, is where every
 * budgeting app this page is shown beside starts talking — and it is the state
 * the reader who is ashamed of their money arrives already in.
 */

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

/**
 * THE TWO REGISTERS §7.1 BANS, AND IT BANS THEM AS ONE RULE.
 *
 * "You blew the budget again" and "It's okay! Everyone slips sometimes 😊" are
 * the two examples the design system prints side by side, and the second is not
 * the safe one: it presumes the slip and then comforts the user for it, which
 * is a verdict wearing a friendlier face. A later editor asked to make this
 * product kinder reaches for the second list, so the second list is banned in
 * the same breath as the first.
 */
const PUNITIVE =
  /you (blew|wasted|overspent|failed|splurged)|\btoo much\b|\bshould have\b|\byou should\b|\bbad (habit|week|month|day)\b|\bovers?pending problem\b|\bwatch out\b/i
const COMFORTING =
  /don'?t worry|no judg|\bno shame\b|\bguilt\b|\bashamed\b|you'?ve got this|\bit'?s ok/i

/**
 * THE RETENTION REGISTER, which is the third one and the one this product is
 * most often mistaken for. A streak is a debt the app issues to the user and
 * then collects; a nag is the collection notice. Neither exists here: no
 * surface renders a run, nothing counts down, and the app's one pre-setup ask
 * is said exactly once (HeroCard's .calibrating).
 *
 * `streak` and `in a row` are legal in the SOURCE — achievements.ts ships
 * `streak-7`, earned off the longest run ever and never taken back — and are
 * banned in the RENDER, which is the whole reason this scan reads text rather
 * than files. The badge announces as "Seven-Day Flame"; its hint is not a
 * rendered surface.
 */
const RETENTION =
  /\bstreak\b|\bin a row\b|\bconsecutive\b|keep it up|don'?t break|\bmissed\b|\boverdue\b|\breminder\b|\bcome back\b|\bdon'?t forget\b|\bstill haven'?t\b/i

/** The unearned-confidence register (§12.5). Present in the product only as
    the two scope lines that name what they refuse, so this list deliberately
    holds none of THEIR words (`targets`, `averages`, `projections`) and only
    the phrasings a real projection would use. */
const PROJECTION =
  /\bon average\b|\bat this pace\b|\bon track\b|\bprojected to\b|\bforecast\b|\byour usual\b|\btypical\b|\bover budget\b|\brun rate\b/i

const REGISTERS: ReadonlyArray<readonly [string, RegExp]> = [
  ['punitive', PUNITIVE],
  ['comforting', COMFORTING],
  ['retention', RETENTION],
  ['projection', PROJECTION],
]

/** Everything on screen, live regions and all — a toast is text the reader
    gets, so it is in scope exactly like a card is. */
const onScreen = () => document.body.textContent ?? ''

/** Assert every register against one named surface, reporting WHICH register
    and WHICH phrase rather than a bare boolean — a red line that does not name
    the word it found sends the next reader hunting through a whole page. */
function statesTheFactAndStops(surface: string, text: string) {
  expect(`${surface}: rendered`).toBe(`${surface}: rendered`)
  expect(text.length).toBeGreaterThan(0)
  for (const [register, pattern] of REGISTERS) {
    expect(`${surface} / ${register}: ${pattern.exec(text)?.[0] ?? 'clean'}`).toBe(
      `${surface} / ${register}: clean`,
    )
  }
}

const tx = (over: Partial<Transaction>): Partial<Transaction> => ({
  amountDA: 1_000,
  category: 'Food',
  ...over,
})

/** Pin the clock the same way the ledger cases do: the day headings and the
    seven-day window are computed against the day the app is HOLDING. */
const freeze = () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0))
}

/**
 * A MONTH THAT WENT BADLY, and every clause of that is deliberate: twenty rows
 * over eight days, four of them ticked "I bought it anyway", one resist, and a
 * total four times the essentials figure the profile below states. This is the
 * ledger the page's reader is afraid to show an app.
 */
const BAD_MONTH: Partial<Transaction>[] = [
  tx({ id: 'r1', amountDA: 6_000, category: 'Fun', date: '2026-08-04', resistedImpulse: true }),
  ...Array.from({ length: 8 }, (_, i) =>
    tx({
      id: `a${i}`,
      amountDA: 9_000 + i * 500,
      category: i % 2 === 0 ? 'Fun' : 'Food',
      date: addDaysISO('2026-08-04', -(i % 8)),
      impulseFlagged: i % 2 === 0,
    }),
  ),
  ...Array.from({ length: 8 }, (_, i) =>
    tx({
      id: `b${i}`,
      amountDA: 4_000 + i * 250,
      category: 'Transport',
      date: addDaysISO('2026-08-04', -(i % 8)),
    }),
  ),
]

/** Income and essentials small enough that BAD_MONTH is several times over
    them — the arithmetic the score reads, and the arithmetic a lecture would
    be written off. */
const PROFILE = {
  monthlyIncome: 60_000,
  monthlyEssentials: 30_000,
  efBalance: 0,
  debt: null,
  goal: null,
  savedDate: '2026-08-04',
}

const seed = (extra: Record<string, unknown>) => {
  freeze()
  localStorage.setItem('ember-state-v1', JSON.stringify(extra))
}

describe('the product states the fact and stops (§7.1, Trust Rules 3 and 6)', () => {
  it('says nothing about the reader on a fresh install', () => {
    freeze()
    render(<App />)
    statesTheFactAndStops('fresh install', onScreen())
  })

  it('says nothing about the reader before setup, with a bad week behind them', () => {
    // The pre-setup screen is the one round 7 changed: no score, the last seven
    // days printed in its place. Those seven days here are the worst ones.
    seed({ transactions: BAD_MONTH })
    render(<App />)
    statesTheFactAndStops('pre-setup, bad week', onScreen())
    // The week block is on screen and it is reporting the bad week rather than
    // omitting it — an absence test passes trivially against a blank page.
    expect(document.querySelector('.week-block')).not.toBeNull()
    expect(document.querySelector('.week-block')?.textContent).toContain('DA logged')
  })

  it('says nothing about the reader once the score can see the whole month', () => {
    seed({ transactions: BAD_MONTH, profile: PROFILE })
    render(<App />)
    statesTheFactAndStops('scored, bad month', onScreen())
    // The witness: a real score IS on screen, so the silence above is the
    // product declining to editorialise rather than the score being absent.
    expect(screen.getByText(/Health \d/)).toBeTruthy()
  })

  it('says nothing about the reader with the breakdown open on that month', () => {
    // One tap further in: the drawer is where the five components are named,
    // and naming a component the user scores badly on is the single most
    // tempting place in the product to add a sentence of advice.
    seed({ transactions: BAD_MONTH, profile: PROFILE })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Why this stage/ }))
    expect(document.querySelector('#health-breakdown')).not.toBeNull()
    statesTheFactAndStops('scored, breakdown open', onScreen())
  })

  it('says nothing about the reader when they tick "I bought it anyway"', () => {
    // TRUST RULE 3 THROUGH THE LIVE PATH, not through a seeded row: the moment
    // a user admits the impulse is the moment an app would comment on it, and
    // the toast and the log card's status region are both in scope here.
    seed({ transactions: BAD_MONTH, profile: PROFILE })
    render(<App />)
    fireEvent.change(screen.getByLabelText('Amount (DA)'), { target: { value: '7500' } })
    fireEvent.click(screen.getByLabelText('I bought it anyway'))
    fireEvent.click(screen.getByRole('button', { name: /Log purchase/ }))
    statesTheFactAndStops('logged an impulse', onScreen())
    // …and it landed, at full XP, which is the other half of Trust Rule 3 and
    // is asserted in the reducer and App suites. Here it is only the witness
    // that the silence is about a row that exists.
    expect(screen.getByRole('status', { name: 'Log status' }).textContent).toContain('7,500')
  })

  it('says nothing about the reader on the page that makes the claim', () => {
    // The landing is held to the same four registers as the app it describes.
    // A pitch that promised no verdict while lecturing in its own copy would be
    // the one place this defect could ship fully visible and still pass.
    const { container } = render(<Landing onEnter={() => {}} />)
    statesTheFactAndStops('landing', container.textContent ?? '')
    expect(container.querySelector('.lp-grade')).not.toBeNull()
  })
})

describe('the scan has teeth', () => {
  /**
   * THE POSITIVE CONTROL, in the same shape README.test.ts uses for its GONE
   * roster. Four absence assertions that never fail are indistinguishable from
   * four absence assertions that cannot fail, and this file's whole value is
   * that it would go red. So each register is fired at a string that should
   * trip it, and the surface reader is fired at a rendered app.
   */
  it('trips on each of the four registers', () => {
    expect(PUNITIVE.test('You blew the budget again.')).toBe(true)
    expect(COMFORTING.test("It's okay, everyone slips sometimes.")).toBe(true)
    expect(RETENTION.test('7-day streak. Keep it up.')).toBe(true)
    expect(PROJECTION.test('At this pace you are over budget by 4,200 DA.')).toBe(true)
    // …and the Fabricator line §7.1 prints as the GOOD one passes all four.
    for (const [, pattern] of REGISTERS) {
      expect(pattern.test('Over by 4,200 DA. Logged.')).toBe(false)
    }
  })

  it('reads text the app actually rendered, not an empty document', () => {
    // The failure this guards is the one that makes every case above green for
    // free: a render that threw, a selector that matched nothing, a body that
    // is empty. The app's own words, from a state the cases use.
    seed({ transactions: BAD_MONTH, profile: PROFILE })
    render(<App />)
    const text = onScreen()
    expect(text).toContain('Totals only. No targets. No averages. No projections.')
    expect(text.length).toBeGreaterThan(500)
  })
})

/** `todayISO` is imported for the same reason the ledger cases import it: it is
    the function the frozen clock is being frozen FOR, and asserting the freeze
    took is cheaper than debugging a row that landed on the wrong day. */
describe('the frozen day is the day the cases think it is', () => {
  it('holds 2026-08-04', () => {
    freeze()
    expect(todayISO()).toBe('2026-08-04')
  })
})
