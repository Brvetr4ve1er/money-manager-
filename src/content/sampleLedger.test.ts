import { describe, it, expect } from 'vitest'
import { sampleLedgerRows, SAMPLE_LEDGER_DAYS } from './sampleLedger.ts'
import { groupTransactionsByDay } from '../engine/ledger.ts'
import { historyDays } from '../engine/profile.ts'
import { CATEGORIES } from '../components/LogCard.tsx'
import { NOTE_MAX_LEN, sanitizeNote } from '../state/store.ts'

/**
 * The landing's product shot is the real <Ledger> fed these rows. Everything
 * asserted here is a property the SHOT depends on — if one breaks, the page
 * either stops showing what its caption says it shows, or stops being
 * accessible. Rendering is Root.test's job; this file is the data.
 */

const dates = (today: string) => sampleLedgerRows(today).map((t) => t.date)

describe('the sample ledger behind the product shot', () => {
  it('dates itself against the day the page is opened, never a frozen stamp', () => {
    // Two different "today"s must produce two different sets of dates, or the
    // shot is a screenshot with a hard-coded date on it.
    expect(dates('2026-08-04')).not.toEqual(dates('2026-08-05'))
    expect(dates('2026-08-04')[0]).toBe('2026-08-04')
  })

  it('never dates a row into the future', () => {
    // ledger.ts sorts future days BELOW every real one and refuses them a
    // relative name, so a row ahead of `today` would appear last in the shot
    // wearing a bare date stamp — visibly a bug, in the product shot.
    for (const d of dates('2026-08-04')) expect(d <= '2026-08-04').toBe(true)
  })

  it('walks the calendar back, not the millisecond clock', () => {
    // Month underflow, year underflow, and the leap day. A naive
    // `today - n * 86_400_000` gets the first two right and still drifts an
    // hour across a DST boundary; the local Date constructor normalises all
    // three by construction.
    expect(dates('2026-03-01')).toEqual(['2026-03-01', '2026-03-01', '2026-03-01', '2026-02-28', '2026-02-28', '2026-02-27', '2026-02-27'])
    // Index arithmetic, not Array#at: tsconfig's lib predates ES2022 and
    // widening it to reach one convenience method is a compiler change.
    const jan = dates('2026-01-01')
    expect(jan[jan.length - 1]).toBe('2025-12-30')
    expect(dates('2024-03-01')).toContain('2024-02-29')
  })

  it('covers exactly the days Ledger shows before it grows an expand control', () => {
    // The shot is aria-hidden, so a focusable node inside it would be a trap
    // with no accessible name. Ledger's window is 3 whole days; a fourth
    // sample day would mint the "Show 1 earlier day" button.
    const days = groupTransactionsByDay(sampleLedgerRows('2026-08-04'), '2026-08-04')
    expect(days).toHaveLength(SAMPLE_LEDGER_DAYS)
    expect(SAMPLE_LEDGER_DAYS).toBe(3)
  })

  it('keeps the resist on today, so the month chip survives the 1st of a month', () => {
    // Ledger's month chip filters the CURRENT calendar month. A resist dated
    // "yesterday" drops out of that filter on the 1st — and with it the one
    // row in the shot that shows money not leaving.
    for (const t of sampleLedgerRows('2026-03-01')) {
      if (t.resistedImpulse) expect(t.date).toBe('2026-03-01')
    }
    const [head] = groupTransactionsByDay(sampleLedgerRows('2026-03-01'), '2026-03-01')
    expect(head.rows.some((t) => t.resistedImpulse)).toBe(true)
  })

  it('logs only categories the app can actually produce', () => {
    // A shot showing a category LogCard's picker does not offer is a mockup
    // wearing the product's clothes.
    for (const t of sampleLedgerRows('2026-08-04')) {
      expect(CATEGORIES).toContain(t.category)
    }
  })

  it('carries a real amount on every row, including the resist', () => {
    // Ledger prints an em dash for a resist with no amount. The shot exists to
    // show "3,500 DA avoided" — the number is the point of the row.
    for (const t of sampleLedgerRows('2026-08-04')) expect(t.amountDA).toBeGreaterThan(0)
  })

  it('writes notes the store would keep verbatim, never ones it would trim', () => {
    // The shot exists to show the real field. A sample note the store would
    // truncate or trim is a picture of a row the app cannot actually hold —
    // the user would type the same thing and get something shorter back.
    for (const t of sampleLedgerRows('2026-08-04')) {
      if (t.note === undefined) continue
      expect(t.note.length).toBeLessThanOrEqual(NOTE_MAX_LEN)
      expect(sanitizeNote(t.note)).toBe(t.note)
    }
  })

  it('leaves some rows noteless, because the field is optional', () => {
    // Both halves are the claim. Notes on every row would render a shot of a
    // REQUIRED field; notes on none would leave the feature unshown. Ledger
    // draws nothing at all for a row without one, so the noteless rows are what
    // demonstrate that there is no placeholder and no prompt.
    const rows = sampleLedgerRows('2026-08-04')
    const noted = rows.filter((t) => t.note !== undefined)
    expect(noted.length).toBeGreaterThan(0)
    expect(noted.length).toBeLessThan(rows.length)
    // A noteless sample row carries no `note` KEY at all — the same object
    // shape LOG_TX writes when the field was left empty, not a row with an
    // explicit undefined in it.
    for (const t of rows) {
      if (t.note === undefined) expect(Object.keys(t)).not.toContain('note')
    }
  })

  it('notes the resist, the one row whose category the card replaces', () => {
    // Ledger prints "Resisted" in place of the category on that row, so without
    // a note it is the only row on the card that never says WHAT was not
    // bought — on the page whose strongest claim is that row.
    for (const t of sampleLedgerRows('2026-08-04')) {
      if (t.resistedImpulse) expect(t.note).toBeTruthy()
    }
  })

  it('gives every row a stable unique id', () => {
    const ids = sampleLedgerRows('2026-08-04').map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Stable across calls: these are React keys on a list that never changes.
    expect(ids).toEqual(sampleLedgerRows('2026-08-05').map((t) => t.id))
  })

  it('shows a day whose total is not the sum of its rows — because one is a resist', () => {
    // The single most valuable thing in the shot: money that did not move adds
    // nothing to the day (ledger.ts), and lands in the month's resisted chip
    // instead. If the sample ever stopped containing that pair, the shot would
    // stop demonstrating the two-track rule.
    const rows = sampleLedgerRows('2026-08-04')
    const [today] = groupTransactionsByDay(rows, '2026-08-04')
    const naive = today.rows.reduce((s, t) => s + t.amountDA, 0)
    expect(today.spentDA).toBeLessThan(naive)
    expect(today.label).toBe('Today')
  })

  it('spans exactly the days it advertises, counted by the engine not by hand', () => {
    // SAMPLE_LEDGER_DAYS is what the shot's layout and Root.test's day-label
    // assertions are built on (Ledger windows to three days and grows an
    // expand button on the fourth), so the constant must agree with the rows
    // as the app's own counter reads them, not as the author remembers them.
    expect(historyDays(sampleLedgerRows('2026-08-04'), '2026-08-04')).toBe(SAMPLE_LEDGER_DAYS)
  })
})
