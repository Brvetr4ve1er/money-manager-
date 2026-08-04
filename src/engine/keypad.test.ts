import { describe, it, expect } from 'vitest'
import { addNote, NOTE_DENOMINATIONS_DA } from './keypad.ts'

describe('the note pad denominations', () => {
  it('lists the real circulating denominations, largest first, with no duplicates', () => {
    expect([...NOTE_DENOMINATIONS_DA]).toEqual([2000, 1000, 500, 200, 100])
    const sorted = [...NOTE_DENOMINATIONS_DA].sort((a, b) => b - a)
    expect([...NOTE_DENOMINATIONS_DA]).toEqual(sorted)
    expect(new Set(NOTE_DENOMINATIONS_DA).size).toBe(NOTE_DENOMINATIONS_DA.length)
  })

  it('is every note positive and finite — the pad can never compose a bad row', () => {
    for (const n of NOTE_DENOMINATIONS_DA) {
      expect(Number.isFinite(n)).toBe(true)
      expect(n).toBeGreaterThan(0)
    }
  })
})

describe('addNote', () => {
  it('starts from an empty field at the note value', () => {
    expect(addNote('', 1000)).toBe('1000')
  })

  it('adds, never replaces — two taps make 1500', () => {
    expect(addNote(addNote('', 1000)!, 500)).toBe('1500')
  })

  it('composes on top of typed digits instead of throwing them away', () => {
    // The whole point of "the text input stays authoritative": a user who
    // typed 150 and then taps 1000 owes 1150, not 1000.
    expect(addNote('150', 1000)).toBe('1150')
    expect(addNote('  150  ', 1000)).toBe('1150')
  })

  it('never emits a grouped string — the field is read back with Number()', () => {
    // Number('1,500') is NaN: a separator in the input would break submit()
    // and every later tap on the same field.
    const composed = addNote('9000', 2000)!
    expect(composed).toBe('11000')
    expect(composed).not.toContain(',')
    expect(Number.isFinite(Number(composed))).toBe(true)
  })

  it('keeps decimals exact instead of accumulating float drift', () => {
    // 12.5 + 100 is 112.50000000000001 in binary floating point.
    expect(addNote('12.5', 100)).toBe('112.5')
    expect(addNote('0.1', 200)).toBe('200.1')
  })

  it('refuses a field it cannot read rather than overwriting the typed text', () => {
    // parseFloat would have said 150 here and silently reinterpreted the entry.
    expect(addNote('abc', 100)).toBeNull()
    expect(addNote('150abc', 100)).toBeNull()
    expect(addNote('1 500', 100)).toBeNull()
  })

  it('refuses a value that parses to Infinity', () => {
    // The same guard submit() applies: an Infinity row JSON round-trips as
    // null and vanishes on the next reload.
    expect(addNote('1e999', 100)).toBeNull()
  })

  it('refuses a negative field instead of quietly repairing it', () => {
    // -5 + 1000 would submit cleanly as 995, an amount the user never typed.
    expect(addNote('-5', 1000)).toBeNull()
  })

  it('treats a whitespace-only field as empty, not as garbage', () => {
    expect(addNote('   ', 500)).toBe('500')
  })

  it('always composes to a finite amount above zero, for every note', () => {
    // The pad path can never produce the Infinity/NaN row LogCard's
    // Number.isFinite guard exists to reject.
    for (const n of NOTE_DENOMINATIONS_DA) {
      for (const start of ['', '0', '1', '99999', '12.5']) {
        const out = addNote(start, n)!
        expect(out).not.toBeNull()
        const value = Number(out)
        expect(Number.isFinite(value)).toBe(true)
        expect(value).toBeGreaterThan(0)
      }
    }
  })

  it('is a pure function of its arguments — no hidden accumulator', () => {
    expect(addNote('100', 500)).toBe('600')
    expect(addNote('100', 500)).toBe('600')
  })
})
