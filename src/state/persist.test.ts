// @vitest-environment jsdom
//
// Its own file, and its own environment: store.test.ts runs on `node` (see
// vite.config.ts — the engine/state suites stay off jsdom for speed) and
// saveState is the one thing in the store that touches a real Web Storage
// object. Everything here is about the WRITE landing or not landing, which is
// the half of the store that had no coverage at all.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { defaultState, loadState, saveState } from './store.ts'

/** The real shape of the failure — a DOMException named for the quota, not a
    bare Error. The catch must not care which, and asserting with the real one
    is what stops a future `catch (e) { if (e.name === …) }` narrowing from
    slipping through. */
function quotaThrow() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
}

describe('saveState reports whether the write landed', () => {
  // The boolean IS a product commitment, not politeness: setItem throws on an
  // exhausted quota and — far more commonly — in privacy modes that grant zero
  // quota, where every write fails from the first tap. Swallowing that made the
  // app confirm a save it never made: row rendered, undo strip reading
  // "Logged 4,200 DA", live region announcing the XP, storage byte-for-byte
  // unchanged. See App.test for the banner this boolean drives.
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('returns true and actually writes on the healthy path', () => {
    const state = defaultState()
    expect(saveState(state)).toBe(true)
    // Round-trips through the real loader, so "returned true" cannot mean
    // "wrote something unreadable".
    expect(loadState().xp).toEqual(state.xp)
  })

  it('returns false instead of throwing when the write is refused', () => {
    quotaThrow()
    expect(() => saveState(defaultState())).not.toThrow()
    expect(saveState(defaultState())).toBe(false)
  })

  it('goes back to true the moment a write can land again', () => {
    // The self-clearing half: a private window closed, quota freed. Nothing
    // latches — App re-derives the banner from this boolean on every state
    // change, so a store that stayed false would pin the fault on forever.
    const spy = quotaThrow()
    expect(saveState(defaultState())).toBe(false)
    spy.mockRestore()
    expect(saveState(defaultState())).toBe(true)
  })
})
