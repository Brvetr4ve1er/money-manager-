// @vitest-environment jsdom
// (vite.config only maps *.test.tsx to jsdom; this file has no JSX but
//  renderHook still needs a document. The docblock beats the glob.)
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnnouncer } from './useAnnouncer.ts'

/**
 * The contract this hook exists for, pinned directly: a permanently-mounted
 * live region announces text CHANGES, so writing the same string twice used to
 * be silent the second time. The a11y sweep measured it (two presses of "Log
 * purchase" on an empty field → one announcement, then none).
 */
describe('useAnnouncer', () => {
  const setup = () => renderHook(() => useAnnouncer())

  it('mounts empty — a region holding its message on arrival is silent', () => {
    expect(setup().result.current[0]).toBe('')
  })

  it('renders a new message verbatim, with nothing appended', () => {
    const { result } = setup()
    act(() => result.current[1]('Export written.'))
    // Exact equality: the pad is a repeat mechanism, not a decoration on
    // every write, and a stray character here would reach a speech engine.
    expect(result.current[0]).toBe('Export written.')
  })

  it('changes the text node on an identical repeat, without changing the words', () => {
    const { result } = setup()
    act(() => result.current[1]('Nothing to clear.'))
    const first = result.current[0]
    act(() => result.current[1]('Nothing to clear.'))
    const second = result.current[0]
    // Different node content → the mutation fires → the region speaks again.
    expect(second).not.toBe(first)
    // …and the same words, because the difference is invisible whitespace.
    expect(second.trim()).toBe('Nothing to clear.')
    expect(second.replace(/\s+/g, ' ')).toBe('Nothing to clear. ')
    // A third press alternates back rather than accumulating padding.
    act(() => result.current[1]('Nothing to clear.'))
    expect(result.current[0]).toBe('Nothing to clear.')
  })

  it('drops the pad the moment the message actually changes', () => {
    const { result } = setup()
    act(() => result.current[1]('A'))
    act(() => result.current[1]('A'))
    act(() => result.current[1]('B'))
    expect(result.current[0]).toBe('B')
  })

  it('clears to exactly empty — an emptied region announces nothing', () => {
    const { result } = setup()
    act(() => result.current[1]('A'))
    act(() => result.current[1]('A'))
    act(() => result.current[1](''))
    expect(result.current[0]).toBe('')
    // …and clearing re-arms the region: the same message is audible again.
    act(() => result.current[1]('A'))
    expect(result.current[0]).toBe('A')
  })

  it('keeps announce stable across renders — it is safe in an effect dep list', () => {
    const { result, rerender } = setup()
    const announce = result.current[1]
    rerender()
    expect(result.current[1]).toBe(announce)
  })
})
