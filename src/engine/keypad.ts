/**
 * The cash-note pad's one piece of arithmetic.
 *
 * Logging costs four or five typed digits on a phone, and the only existing
 * shortcut (repeat chips) needs two exact repeats inside the last thirty rows —
 * so the app is at its most expensive to use during the two weeks that decide
 * whether it gets used at all. The pad is denominations, not a number pad: you
 * pay with the notes in your hand, so 1,500 DA is a 1000 tap and a 500 tap.
 *
 * Pure, and separate from the component, because the composition rule is the
 * part that can silently go wrong (float drift, a discarded keystroke, a
 * grouped string the parser reads as 1). No state, no persistence, no schema.
 */

/**
 * The Algerian cash denominations in circulation, largest first — what a
 * person is actually holding, not a power-of-ten keypad. Five keys: enough to
 * compose any realistic daily amount in one or two taps, few enough that the
 * row wraps to two lines at 320px rather than to a scrolling grid.
 *
 * "Cash", not "banknotes", and the distinction is load-bearing rather than
 * pedantic: the Bank of Algeria's circulating NOTE series is 2000/1000/500/200
 * DA — 100 DA has been a coin for decades. The 100 key stays, because it is
 * the denomination people hand over; the claim around it is what had to be
 * accurate. On a product whose stated differentiator is "Built for Algeria",
 * the country's own denomination set is the first detail a user checks.
 */
export const NOTE_DENOMINATIONS_DA = [2000, 1000, 500, 200, 100] as const

/**
 * Adds one note to whatever is currently typed in the amount field.
 *
 * Returns the new field text, or `null` when the field holds something that
 * cannot be added to — in which case the caller must leave the typed text
 * alone. LogCard's standing rule is that typed input is never silently
 * discarded, and "replace the user's characters with the note value" is
 * exactly that discard wearing a helpful face.
 *
 * @param current the raw field text (may be empty, may be garbage)
 * @param noteDA  the tapped denomination
 */
export function addNote(current: string, noteDA: number): string | null {
  const trimmed = current.trim()
  // Number(), not parseFloat(): parseFloat('150abc') is 150 and
  // parseFloat('1 500') is 1, so a typo would be reinterpreted as a number the
  // user never wrote and then added to. Number() rejects trailing garbage
  // outright, which is the honest reading.
  const base = trimmed === '' ? 0 : Number(trimmed)
  // isFinite, not !isNaN, and the same guard submit() applies: '1e999' is
  // Infinity, which would compose into a row that JSON round-trips as null and
  // vanishes on reload. Negatives are refused rather than added through, since
  // an amount below zero can never be submitted anyway — the pad must not be
  // the one path that quietly repairs it.
  if (!Number.isFinite(base) || base < 0) return null
  // Binary floats: 12.5 + 100 is 112.50000000000001 without this, and the field
  // would fill with drift after a few taps. Two places is the smallest unit any
  // amount here can have.
  const next = Math.round((base + noteDA) * 100) / 100
  // String(), never toLocaleString(): the field is read back with Number(), and
  // Number('1,500') is NaN. Group separators belong in the readout, never in
  // the input.
  return String(next)
}
