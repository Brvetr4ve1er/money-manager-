import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Root } from './Root.tsx'
import { Landing, MECHANICS } from './components/Landing.tsx'
import { RESIST_LABEL } from './components/LogCard.tsx'
import {
  defaultState,
  todayISO,
  NOTE_MAX_LEN,
  DECISION_ANSWERS,
  DECISION_MAX,
} from './state/store.ts'
import { sampleLedgerRows } from './content/sampleLedger.ts'
import { resistedChipLabel } from './components/ArchiveCard.tsx'
import { groupTransactionsByDay, monthToDate, resistedThisMonthDA } from './engine/ledger.ts'
import { NOTE_DENOMINATIONS_DA } from './engine/keypad.ts'
import { CALIBRATION_DAYS } from './engine/profile.ts'
import { WEEK_DAYS } from './engine/ledger.ts'
import { NO_SCORE_LINE } from './components/HeroCard.tsx'

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

  it('names eight mechanics and indexes them against their real count', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const indices = [...container.querySelectorAll('.lp-index')].map((n) => n.textContent)
    // §1 trait 10 is "decorative TRUTH-telling": the denominator has to be the
    // length of the list it captions, or the label is set dressing.
    // Eight, and each one is a shipped surface: health score, resist,
    // simulator, the decision record, the check-back, monster, the month head,
    // the row note. Written out rather than derived from MECHANICS on purpose —
    // a test that reads the same array the component renders would pass on an
    // empty grid. The seventh arrived with the record and the eighth with the
    // check-back; a feature that ships without a claim is the same drift as a
    // claim that ships without a feature, and this round shipped both a feature
    // (the check-back) and a DELETION (the collection sheet) in one change.
    expect(indices).toEqual([
      '01/08', '02/08', '03/08', '04/08', '05/08', '06/08', '07/08', '08/08',
    ])
    expect(container.querySelectorAll('.lp-badge')).toHaveLength(indices.length)
  })

  it('states the same count in the section lede that the grid actually holds', () => {
    // The lede used to spell the number ("Four mechanics"), which is a second
    // place to write one fact — and the grid grew while the word sat still.
    // The page now reads MECHANICS.length in both places; this is the assertion
    // that keeps them the same fact rather than two copies of it.
    const { container } = render(<Landing onEnter={() => {}} />)
    const badges = container.querySelectorAll('.lp-badge').length
    const lede = container.querySelector('.lp-spec-lede')?.textContent ?? ''
    expect(lede).toContain(`${badges} mechanics`)
    // …and every badge names a mechanic and says something about it.
    for (const badge of container.querySelectorAll('.lp-badge')) {
      expect(badge.querySelector('.lp-badge-h')?.textContent?.trim()).toBeTruthy()
      expect(badge.querySelector('.lp-badge-body')?.textContent?.trim()).toBeTruthy()
    }
  })

  it('claims the note cap the store actually enforces, never a typed number', () => {
    // NOTE_MAX_LEN is the one number on this page a user could measure against
    // the product in ten seconds. It is read, not typed.
    const { container } = render(<Landing onEnter={() => {}} />)
    const badge = [...container.querySelectorAll('.lp-badge')].find((b) =>
      /the note/i.test(b.querySelector('.lp-badge-h')?.textContent ?? ''),
    )
    expect(badge).toBeTruthy()
    const body = badge?.textContent ?? ''
    expect(body).toContain(`${NOTE_MAX_LEN} characters`)
    // The two trust claims beside it, both enforced elsewhere in the suite:
    // logExpense pays +5 with or without a note (App.test, reducer.test), and
    // ArchiveCard renders nothing at all for an empty one (App.test's cold start).
    expect(body.toLowerCase()).toContain('optional')
    expect(body.toLowerCase()).toContain('unpaid')
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

  it('gives §5D’s band a lane of its own, between the sign and the plates', () => {
    // §5D is "one 38° diagonal band splits the canvas; TYPE SITS PARALLEL TO
    // IT". The band's type used to be occluded by the rule plates it passed
    // behind — fixed on desktop by making the type an index rather than a
    // sentence, and "fixed" on the phone by switching the marks off, where the
    // one-column grid leaves the diagonal no run at all.
    //
    // The lane is the phone's real fix, and it is a DOM fact, not only a CSS
    // one: the band has to sit BETWEEN the two text blocks, because below
    // 720px the lane is a real box in the flow and the band is what splits the
    // section into what it says and what it lists. At ≥720 the lane is
    // display: contents and the order stops mattering. Assert the order, or a
    // later edit collapses the two blocks back into one wrapper and the band
    // silently returns to the top of the section.
    const { container } = render(<Landing onEnter={() => {}} />)
    const shear = container.querySelector('.lp-shear')
    expect(shear).toBeTruthy()
    const kids = [...(shear?.children ?? [])].map((n) => n.className)
    expect(kids).toEqual([
      'lp-measure lp-rules-body',
      'lp-band-lane',
      'lp-measure lp-rules-body',
    ])
    // The band is inside the lane — that parent is the containing block the
    // whole construction rests on.
    expect(shear?.querySelector('.lp-band-lane > .lp-band')).toBeTruthy()
    // Both text blocks carry .lp-rules-body, which is what lifts them over the
    // band at ≥720 where it is absolute across the section. One without it
    // would be painted under the diagonal.
    expect(shear?.querySelectorAll('.lp-rules-body')).toHaveLength(2)
    // Still exactly one band, and still decoration: the section's sentence is
    // real text in the lede, so a screen reader loses nothing.
    expect(shear?.querySelectorAll('.lp-band')).toHaveLength(1)
    expect(shear?.querySelector('.lp-band')?.getAttribute('aria-hidden')).toBe('true')
    // 18 marks are rendered at every width; CSS caps how many are DRAWN below
    // 720 so the surplus is never clipped mid-glyph. If this count ever drops
    // to the mobile cap, the desktop band runs out of marks halfway across.
    const marks = [...(shear?.querySelectorAll('.lp-band-mark') ?? [])]
    expect(marks).toHaveLength(18)
    expect(new Set(marks.map((m) => m.textContent))).toEqual(new Set(['38°']))
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
 * THE TERMS THE READER IS ON — the stranger test, as assertions.
 *
 * The person this product is built for is bad with money and slightly ashamed
 * of it. Every other block on the wall answers "what can it do"; this one
 * answers "what will it do to me", and until this round the page answered that
 * nowhere a reader would reach before deciding to leave.
 *
 * Two failure modes, and both are asserted against here. The block can OVERSTATE
 * — an absence is the easiest thing on a marketing page to claim one notch wider
 * than the code supports, and "no streak anywhere" would be exactly that (there
 * is a Seven-Day Flame badge, it just cannot be lost). Or it can SOFTEN — §7.1
 * bans the coddling register as hard as the punitive one, and a page that tells
 * an ashamed reader "it's okay, everyone slips" has presumed the slip and
 * comforted them for it in the same breath. The register is dry respect.
 */
describe('the landing states what the app will not do to the reader', () => {
  const grade = (c: HTMLElement) => c.querySelector('.lp-grade') as HTMLElement

  it('carries the terms in the wall, ahead of the mechanic', () => {
    // "Above the fold" is structural on this page, exactly as the hand-off
    // case defines it: .lp-wall is the first full-bleed section. This block is
    // in it, and it is in it BEFORE the mechanic — the position is the claim
    // (see .lp-grade in Landing.tsx), so a later edit that demotes it below
    // the market argument fails here rather than quietly costing the fold.
    const { container } = render(<Landing onEnter={() => {}} />)
    const block = grade(container)
    expect(block).not.toBeNull()
    expect(container.querySelector('.lp-wall .lp-grade')).toBe(block)
    expect([...block.children].map((n) => n.className)).toEqual([
      'lp-grade-tag',
      'lp-grade-lead',
      'lp-grade-body',
    ])
    // The claim itself, in one short sentence, leading with the object (§7
    // rules 1 and 2). Not a question, not a promise, not a mood.
    const lead = block.querySelector('.lp-grade-lead')?.textContent ?? ''
    expect(lead).toBe('Nothing here grades you.')
    expect(lead.trim().split(/\s+/).length).toBeLessThan(9)
  })

  it('quotes the app’s own pre-setup disclosure instead of paraphrasing it', () => {
    // THE BINDING, and it is the one this block most needs. The page tells a
    // stranger that the app prints no rating off numbers that are not theirs,
    // and it proves it by printing the sentence the app actually shows —
    // HeroCard's NO_SCORE_LINE, the same treatment RESIST_LABEL gets in the
    // hand-off. Reword the disclosure and the pitch rewords itself.
    //
    // ON BADGE 01/08 AND NOT IN THE FOLD, and the reason is measured: the fold
    // block is 253px at 40 words and 357px at 62, .lp-share sits directly under
    // it, and at 62 the mechanic's lead crossed the 812px fold. Evidence goes
    // to the spec sheet on this page; the fold carries the claim.
    const { container } = render(<Landing onEnter={() => {}} />)
    const badge = [...container.querySelectorAll('.lp-badge')].find((b) =>
      /health score/i.test(b.querySelector('.lp-badge-h')?.textContent ?? ''),
    )
    expect(badge?.textContent).toContain(NO_SCORE_LINE)
    // …and the fold states the same absence without needing the quotation.
    expect(grade(container).textContent).toContain('No score until you enter your own numbers')
    // …and the app end of the same string: card 01 prints it on a fresh
    // install, which is the state a stranger who presses the CTA lands in.
    cleanup()
    render(<Root />)
    fireEvent.click(enterButtons()[0])
    expect(screen.getByText(new RegExp(NO_SCORE_LINE.replace(/\./g, '\\.')))).toBeTruthy()
  })

  it('reads the week window from the engine, never a typed seven', () => {
    // Same rule as the note cap and the calibration horizon: a number is a
    // value, so it is read. Both places on the page that name the window — the
    // terms block and the first spec-sheet badge — read WEEK_DAYS.
    const { container } = render(<Landing onEnter={() => {}} />)
    expect(grade(container).textContent).toContain(`last ${WEEK_DAYS} days`)
    const badge = [...container.querySelectorAll('.lp-badge')].find((b) =>
      /health score/i.test(b.querySelector('.lp-badge-h')?.textContent ?? ''),
    )
    expect(badge?.textContent).toContain(`Your last ${WEEK_DAYS} days`)
  })

  it('scopes the streak claim to the absence that is actually there', () => {
    // THE OVERSTATEMENT THIS BLOCK IS ONE WORD AWAY FROM. Nothing in the
    // product renders a run — but achievements.ts ships `streak-7`, and it is
    // earned off longestLogStreak, the LONGEST run ever over the whole ledger,
    // earn-only. So "nothing counts days in a row" is true of every surface and
    // "no streak exists" would be false. The page claims the first and must not
    // drift into the second.
    // It is a RULE, not a term of the fold: it sits in the rules band with the
    // other invariants (see RULES in Landing.tsx), which is also where it
    // stopped costing the fold 54px of an 812px window.
    const { container } = render(<Landing onEnter={() => {}} />)
    const rules = container.querySelector('.lp-rules')?.textContent ?? ''
    expect(rules).toContain('Days are counted, never chained')
    expect(rules).toContain('No run to break, no day to lose')
    expect(rules).not.toMatch(/no streak|streak-free|never a streak/i)
    // AND IT MUST NOT PRINT THE REGISTER IN ORDER TO DENY IT — anywhere on the
    // page, not only in the rule. The first draft of the fold read "Nothing
    // counts days in a row", which is true and which puts the retention
    // vocabulary on the one page that promises none; noVerdict.test.tsx holds
    // the landing to the same four registers as the app and caught it. Stated
    // as an absence rather than as a negation.
    expect(container.textContent ?? '').not.toMatch(/\bstreak\b|\bin a row\b|\bconsecutive\b/i)
  })

  it('states terms, and never softens into reassurance (§7.1)', () => {
    // §7.1 names both failure modes and bans both: "You blew the budget again"
    // and "It's okay! Everyone slips sometimes" are one rule apart. The block
    // is checked, and so is the whole page — the coddling register is exactly
    // what a later editor reaches for when asked to make a page kinder.
    const { container } = render(<Landing onEnter={() => {}} />)
    const page = container.textContent ?? ''
    const SOFT =
      /don'?t worry|no judg|no shame|guilt|you'?ve got this|it'?s ok|we get it|everyone (slips|does)|be kind to yourself|small steps/i
    const PUNITIVE =
      /you (blew|wasted|overspent|failed)|\btoo much\b|\bshould have\b|\bbad habit\b|\bdiscipline\b/i
    expect(grade(container).textContent).not.toMatch(SOFT)
    expect(grade(container).textContent).not.toMatch(PUNITIVE)
    expect(page).not.toMatch(SOFT)
    expect(page).not.toMatch(PUNITIVE)
    // The one line that carries the reader's bad week is an instruction and a
    // fact, in that order, with no adjective between them.
    expect(grade(container).textContent).toContain(
      'Log the week you would rather not. It reads like any other.',
    )
  })
})

describe('the landing keyboard path', () => {
  it('makes the page’s one jump target focusable — #spec, like the app’s two', () => {
    // The hero's "Spec sheet" button is a fragment link, and a fragment link
    // whose target is not focusable leaves focus on <body>: activating it
    // strands the keyboard user at the top of the document. The app fixed this
    // on every one of its jump targets — LogCard and SimCard, the two that are
    // left: it was five, and the codex sheet, the badge sheet and the quest
    // card took their nav links out with them as they were deleted (see
    // HeroShell). The landing's only one was left behind. Chrome
    // papers over it with the sequential-focus navigation starting point;
    // Safari/VoiceOver do not.
    const { container } = render(<Landing onEnter={() => {}} />)
    const cta = container.querySelector('a.lp-cta[href="#spec"]')
    expect(cta).not.toBeNull()
    const target = container.querySelector('#spec')
    expect(target).not.toBeNull()
    // -1, never 0: script-focusable, but not a new stop in the tab order.
    expect(target!.getAttribute('tabindex')).toBe('-1')
    // …and it arrives with a name, so the landing announces "The spec sheet,
    // region" rather than an anonymous one.
    const labelledBy = target!.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe('The spec sheet')
  })
})

/**
 * THE PRODUCT SHOT.
 *
 * The page renders the app's own <ArchiveCard> instead of an image of it, so
 * these cases are the guarantee that "the real card, not a mockup" stays
 * literally true — and that a live component dropped onto a marketing page does
 * not cost the page its accessibility.
 *
 * It said <Ledger> until this round. That component merged into ArchiveCard two
 * rounds earlier and the name survived here, in the file whose whole subject is
 * a page that must not describe surfaces the build does not render.
 */
describe('the landing product shot', () => {
  const shot = (c: HTMLElement) => c.querySelector('.lp-shot-frame') as HTMLElement

  it('renders the app\'s own cards, corner marks and all', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const frame = shot(container)
    expect(frame).not.toBeNull()
    // ARC—07 is printed by ArchiveCard itself (§11's corner mark), and the
    // index is its real position in App's stack — see the render-order case in
    // App.test, which derives the whole run. Its presence is proof the
    // component rendered, not a facsimile of it.
    expect(frame.querySelector('.archive-card')).not.toBeNull()
    expect(frame.textContent).toContain('ARC—07')
    expect(frame.textContent).toContain('The record')
  })

  it('shows ONE archive card, the way the app stacks it', () => {
    // The month figures and the day list merged into one card (ArchiveCard), so
    // the shot is one card and not two — a shot showing two would be a picture
    // of a screen nobody has, which is the same failure the old ordering
    // assertion here was written to catch.
    const { container } = render(<Landing onEnter={() => {}} />)
    const cards = [...shot(container).querySelectorAll('.card')]
    expect(cards).toHaveLength(1)
    expect(cards[0].classList.contains('archive-card')).toBe(true)
    // The month figures sit above the day list inside it — the order is a fact
    // about one card now, not about two.
    const text = cards[0].textContent ?? ''
    expect(text.indexOf('Day ')).toBeLessThan(text.indexOf('Spent'))
  })

  it('states the month figures the real month engine derives from the sample', () => {
    // The same anti-drift assertion the day totals get, for the second card:
    // recomputed here from the same rows through the same engine. A hand-typed
    // month total would fail this.
    const { container } = render(<Landing onEnter={() => {}} />)
    const today = todayISO()
    const m = monthToDate(sampleLedgerRows(today), today)
    const text = shot(container).textContent ?? ''
    expect(text).toContain(`Day ${m.dayOfMonth} / ${m.daysInMonth}`)
    expect(text).toContain(`${m.spentDA.toLocaleString()} DA logged`)
    // The strip is one cell per calendar day of the real month, not a fixed 30.
    expect(shot(container).querySelectorAll('.month-cell')).toHaveLength(m.daysInMonth)
  })

  it('carries the month card\'s own scope line, which is where a budget bar would appear', () => {
    // "No target, no projection" is the load-bearing half of the month card and
    // the single clearest difference from every budgeting app this page is
    // shown beside. Cropping it out of the shot would be the one crop that
    // changes what the picture claims.
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = shot(container).textContent ?? ''
    expect(text).toContain('Totals only. No targets. No averages. No projections.')
    // …and no budget language reached the page through the card. ArchiveCard
    // is never handed the profile, so `budgeted` has no path here; this asserts
    // the outcome rather than trusting the wiring.
    expect(container.textContent ?? '').not.toMatch(/\bbudget(ed|s)?\b|\ballowance\b|\bat this pace\b/i)
  })

  it('shows real notes on real rows, and rows without one', () => {
    // The note is SHOWN rather than described: these nodes are ArchiveCard's own
    // .tx-note, rendered from the sample rows' `note` field through the shipped
    // component. Both halves matter — a shot where every row had a note would
    // advertise a required field, and ArchiveCard draws nothing at all for a row
    // without one (no placeholder, no prompt).
    const { container } = render(<Landing onEnter={() => {}} />)
    const frame = shot(container)
    const rows = [...frame.querySelectorAll('.tx')]
    const withNote = rows.filter((r) => r.querySelector('.tx-note'))
    expect(rows.length).toBeGreaterThan(0)
    expect(withNote.length).toBeGreaterThan(0)
    expect(withNote.length).toBeLessThan(rows.length)
    // The notes on the page are the sample's notes, not invented copy.
    const notes = sampleLedgerRows(todayISO())
      .map((t) => t.note)
      .filter((n): n is string => typeof n === 'string')
    for (const n of notes) expect(frame.textContent).toContain(n)
    // No filler on the rows that have none.
    expect(frame.textContent).not.toMatch(/no note|add a note|untitled|what was it/i)
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
    // an unverifiable outcome (see the chip in ArchiveCard.tsx — Ledger.tsx
    // merged into it, and a comment pointing at a deleted file is the drift
    // this round went looking for).
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
    expect(text).toContain('Totals only. No targets. No averages. No projections.')
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
    // name. ArchiveCard grows an expand BUTTON on the fourth day, so this is the
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
    // ArchiveCard mounts a role="status" of its own, and hiding the subtree is
    // what keeps it from becoming a third region on a surface that has none.
    expect(screen.queryAllByRole('status')).toHaveLength(0)
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0)
  })
})

describe('the landing tells the truth about the newest features', () => {
  it('lists the note keys from the engine constant, never a typed list', () => {
    const { container } = render(<Landing onEnter={() => {}} />)
    const strip = container.querySelector('.lp-note-strip')?.textContent ?? ''
    expect(strip).toContain(NOTE_DENOMINATIONS_DA.map((n) => n.toLocaleString()).join(' · '))
    // The claims beside the list, each one a behaviour keypad.ts implements:
    // a tap ADDS to the field, and it never replaces what is typed there.
    expect(strip.toLowerCase()).toContain('added to whatever is already in the box')
    expect(strip.toLowerCase()).toContain('never overwrites it')
  })

  it('claims the decision record in the words SimCard actually prints', () => {
    // THE FEATURE THAT SHIPPED WITHOUT A CLAIM. The record cannot be shown the
    // way the archive card is — it lives inside SimCard, which always mounts an
    // amount field and a Run button, and the shot is aria-hidden where a
    // focusable node is a trap with no name (see the shot tests above).
    // So it is bound the other way: the badge prints DECISION_ANSWERS, which is
    // the array SimCard renders its three buttons from. Rename a button and
    // this claim renames itself or this fails.
    const { container } = render(<Landing onEnter={() => {}} />)
    const badge = [...container.querySelectorAll('.lp-badge')].find((b) =>
      /^the record$/i.test(b.querySelector('.lp-badge-h')?.textContent?.trim() ?? ''),
    )
    expect(badge).toBeTruthy()
    const body = badge?.querySelector('.lp-badge-body')?.textContent ?? ''
    for (const answer of DECISION_ANSWERS) expect(body).toContain(answer.label)
    // The frozen line (§12.5 — store.ts never recomputes `line`) and the
    // absence that is the actual trust boundary: there is no bought-vs-waited
    // tally anywhere in SimCard, so the page must not imply one.
    expect(body.toLowerCase()).toContain('with the line each printed')
    expect(body.toLowerCase()).toContain('never a tally')
    // THE DEPTH, read from the store rather than typed here or on the page.
    // "Every run kept" was the one claim in this badge that was typed, and it
    // was false: DECISION_MAX bounds the record and canonicalDecisions trims
    // from the oldest end on every write.
    expect(body).toContain(`The last ${DECISION_MAX} runs kept`)
    expect(body.toLowerCase()).not.toMatch(/every run kept/)
    // …and no score-shaped reading of the user anywhere near it (Trust Rule 5,
    // the same rule the whole-page assertion above enforces).
    expect(body).not.toMatch(/\bscore\b|\bstreak\b|\b\d+\s*\/\s*\d+\b/i)
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

  it('argues manual entry as the position, not as a missing feature', () => {
    // Manual-first is the product, so the page has to say WHY rather than
    // apologise for it. The argument is a fact about a cash economy — a feed is
    // a partial record by construction — and two properties of the code: there
    // is no import path anywhere in src, and therefore no auto-categorisation
    // to be wrong about a row.
    const { container } = render(<Landing onEnter={() => {}} />)
    const text = wall(container)
    expect(text).toContain('nothing here is imported')
    expect(text).toContain('nothing is guessed')
    expect(text).toContain('every row is one you put there')
    // Not framed as a shortfall. These are the words a limitation-shaped
    // version of this paragraph would reach for.
    expect(text).not.toMatch(/for now|coming soon|until we|we plan|coming later|coming in/)
  })

  it('leads the hand-off with a mechanic, not a list of refusals', () => {
    // The reason someone forwards this is the resist row: a bank feed can only
    // ever see money that moved. Every clause below is shipped code —
    // reducer.ts writes the row, ledger.ts adds 0 for it, ArchiveCard sums the
    // month — and the shot further down renders exactly that pair.
    const { container } = render(<Landing onEnter={() => {}} />)
    const share = container.querySelector('.lp-share')?.textContent?.toLowerCase() ?? ''
    expect(share).toContain('the thing you did not buy')
    expect(share).toContain('nothing added to the day')
    expect(share).toContain('summed for the month')
    // Trust Rule 3, and scoped exactly as narrowly as the code allows: full XP
    // is claimed, a clean SCORE is not (profile.ts feeds yielded impulses to
    // impulseControlScore, so "never counted against you" would be false).
    expect(share).toContain('full xp')
    expect(share).not.toMatch(/score|never counted|no penalt|does not count/)
    // The refusals are still on the page — one paragraph down, as terms.
    const terms = container.querySelector('.lp-terms')?.textContent?.toLowerCase() ?? ''
    for (const refusal of ['no account', 'no bank login', 'no card']) {
      expect(terms).toContain(refusal)
    }
    // …and they are out of the paragraph that now carries the reason.
    expect(share).not.toContain('no account')
  })

  it('puts the mechanic ahead of the market argument, not behind it', () => {
    /**
     * ORDER IS THE CLAIM, at the level of the whole plate this time.
     *
     * The wall's plate ran thesis → lede → the market argument → the hand-off,
     * which put sixty words about a cash economy in front of the one paragraph
     * anyone would forward. A reader who leaves after two paragraphs has to
     * leave holding the MECHANIC; the argument for manual entry is what answers
     * the question the mechanic raises, so it reads after it.
     *
     * Asserted as the element run rather than as string positions: a later edit
     * that reinstates the argument as the opener fails here, and the failure
     * names the order rather than a byte offset into the page's text.
     */
    const { container } = render(<Landing onEnter={() => {}} />)
    const plate = container.querySelector('.lp-wall .lp-plate')
    expect(plate).not.toBeNull()
    expect([...plate!.children].map((n) => n.className)).toEqual([
      'lp-thesis',
      'lp-lede',
      // The terms block (below) took the third slot. The claim this case was
      // written for is untouched and is re-asserted underneath: the market
      // argument still reads AFTER the mechanic, which is the pair the round-5
      // reorder was about. What moved is a four-line block of terms, not sixty
      // words of argument — see .lp-grade in Landing.tsx for why that trade
      // pays and what to measure if it stops paying.
      'lp-grade',
      'lp-share',
      'lp-sub',
      'lp-terms',
      'lp-actions',
    ])
    // The pair the assertion above exists for, stated as itself so a future
    // insertion cannot quietly satisfy the list while inverting the two blocks
    // it was written about.
    const order = [...plate!.children].map((n) => n.className)
    expect(order.indexOf('lp-share')).toBeLessThan(order.indexOf('lp-sub'))
  })

  it('names hand entry as what makes the resist row possible', () => {
    // MANUAL-FIRST AS A STRENGTH, argued from the mechanic above it rather than
    // from the market alone. A feed imports events; not buying is not an event,
    // so no amount of automation reaches that row — which is why the ONE thing
    // on this page a bank-linked tracker cannot do is a property of the manual
    // product rather than a consolation for it. The claim is an absence in src
    // (no import path anywhere — localFirst.test asserts it over the tree), and
    // it could only be made once the hand-off moved above this paragraph.
    const { container } = render(<Landing onEnter={() => {}} />)
    const sub = container.querySelector('.lp-sub')?.textContent?.toLowerCase() ?? ''
    expect(sub).toContain('hand entry is what makes the row above possible')
    expect(sub).toContain('a feed imports events')
    expect(sub).toContain('not buying is not an event')
  })

  it('states the resist total in the record’s own words, over the shot’s own rows', () => {
    /**
     * THE FOLD'S ONE FIGURE.
     *
     * The hand-off said a resist is "summed for the month" and stopped one
     * clause short of where the sum lands. It lands in the record's resisted
     * chip, and the pitch now quotes that line — which makes it the one number
     * above the fold and therefore the one most able to rot.
     *
     * So both ends are asserted here. The string is resistedChipLabel's, over
     * resistedThisMonthDA of the SAME sample rows the shot renders below, which
     * is the binding: reword the chip or change the sample and the pitch moves
     * with it. And the shot's own card prints the identical string, which is
     * the property that matters to a reader — the claim in the fold and the
     * screenshot under it can never state two different figures.
     */
    const { container } = render(<Landing onEnter={() => {}} />)
    const today = todayISO()
    const line = resistedChipLabel(resistedThisMonthDA(sampleLedgerRows(today), today))
    const body = container.querySelector('.lp-share-body')?.textContent ?? ''
    expect(body).toContain(line)
    // Quoted in the app's own register (§11: numerals in the mono stack), and
    // scoped to the quotation — the sentence around it is body copy.
    expect(container.querySelector('.lp-share-body .lp-quote')?.textContent).toBe(line)
    // The shot prints the same line, from the same rows, through the real card.
    expect(container.querySelector('.lp-shot-frame')?.textContent).toContain(line)
    // TRUST RULE 5: a figure above the fold has to say whose it is. Nobody is
    // being read here, and the sentence carrying the number says so before the
    // number arrives — the shot's "sample rows · nobody's data" caption is two
    // screens further down.
    expect(body.toLowerCase()).toContain('on the sample rows below')
  })

  it('indexes the hand-off into the grid below, so the fold cannot outlive it', () => {
    // THE ROUND-5 BIND, and the reason this round exists: a pitch does not fail
    // by being dull, it fails by outliving the feature. The fold's claim is a
    // LOOKUP into MECHANICS — the same roster the spec sheet renders — so the
    // hero cannot sell a mechanic the grid does not ship, and deleting that row
    // fails here instead of shipping a fold that advertises a deleted feature.
    const { container } = render(<Landing onEnter={() => {}} />)
    const tag = container.querySelector('.lp-share-tag')
    expect(tag).not.toBeNull()
    // The label is `NN/MM · Title`. Split it and check every part against the
    // roster rather than against a typed string.
    const [fraction, title] = (tag!.textContent ?? '').split('·').map((s) => s.trim())
    const row = MECHANICS.findIndex((m) => m.title === title)
    expect(`${title} is a shipped mechanic: ${row >= 0}`).toBe(`${title} is a shipped mechanic: true`)
    expect(fraction).toBe(
      `${String(row + 1).padStart(2, '0')}/${String(MECHANICS.length).padStart(2, '0')}`,
    )
    // The grid prints the same index for the same row — one fact, two places,
    // and this is what keeps them one fact.
    expect(container.querySelectorAll('.lp-index')[row].textContent).toBe(fraction)
    // The FRACTION is hidden from AT and the TITLE is not: "zero two slash zero
    // eight" ahead of the sentence it labels is noise, but the block still has
    // to announce the name of the thing it is about.
    expect(tag!.querySelector('[aria-hidden="true"]')?.textContent).toContain(fraction)
    expect(tag!.querySelector(`[aria-hidden="true"]`)?.textContent).not.toContain(title)
    // …and it is not counted as one of the grid's own index labels, which
    // Root.test reads as a set of exactly MECHANICS.length entries above.
    expect(tag!.classList.contains('lp-index')).toBe(false)
  })

  it('leads with the object and closes with the instruction (§7 rule 1)', () => {
    // The block ran the other way for four rounds: "Send it to a friend who
    // overspends" first, the mechanic second. That frames the strongest thing
    // on the page as an errand, and it forced the mechanic into the third
    // person on a page whose READER is the one who has to be convinced. Order
    // is the claim here, so order is what is asserted — a later edit that
    // reinstates the directive as the opener fails.
    const { container } = render(<Landing onEnter={() => {}} />)
    const block = container.querySelector('.lp-share')
    expect([...(block?.children ?? [])].map((n) => n.className)).toEqual([
      'lp-share-tag',
      'lp-share-lead',
      'lp-share-body',
      'lp-share-call',
    ])
    const lead = block?.querySelector('.lp-share-lead')?.textContent ?? ''
    // Names the product and the mechanic, in one sentence, under nine words
    // (§7 rule 2 — a fold's lead is the one string that has no excuse).
    expect(lead).toContain('Ember')
    expect(lead.toLowerCase()).toContain('did not buy')
    expect(lead.trim().split(/\s+/).length).toBeLessThan(9)
    // The directive is the LAST line and it is not in the lead.
    expect(block?.querySelector('.lp-share-call')?.textContent?.toLowerCase()).toContain(
      'send it to a friend',
    )
    expect(lead.toLowerCase()).not.toContain('send it')
  })

  it('tells a stranger to press the button the app actually renders', () => {
    // The hand-off names a control by label, which is the one kind of claim a
    // rename breaks silently. The page prints LogCard's RESIST_LABEL; this
    // asserts the other end — that the string is the accessible name of a real
    // button in the shipped app, not just a constant both files import.
    const { container } = render(<Landing onEnter={() => {}} />)
    expect(container.querySelector('.lp-share-body')?.textContent).toContain(RESIST_LABEL)
    cleanup()
    seedSavedState()
    render(<Root />)
    expect(screen.getByRole('button', { name: new RegExp(RESIST_LABEL) })).toBeTruthy()
  })
})
