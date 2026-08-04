import { useCallback, useState } from 'react'

/**
 * A live region announces text CHANGES, not text.
 *
 * Every status region in this app is permanently mounted and mounted empty for
 * that reason — but the rule has a second edge the codebase had not covered:
 * writing the SAME string into a region twice reconciles to the same DOM text
 * node, fires no mutation, and is silent. The a11y sweep measured it directly.
 * Pressing "Log purchase" twice on an empty field produced one announcement
 * and then none; the only feedback for the second press was the denial blip,
 * i.e. sound carrying information alone, which §10 forbids outright and which
 * is silent for anyone holding the app's own persisted mute.
 *
 * announce() alternates an invisible trailing NBSP so an identical repeat is
 * still a different text node. Trailing whitespace is not spoken and not
 * rendered, so the message a user reads or hears is unchanged — only the
 * mutation observer's view of it differs. U+00A0 rather than a plain space:
 * a trailing ASCII space is the one whitespace a layout engine will collapse
 * away, which would silently restore the bug this exists to kill.
 *
 * announce('') clears the region. That is deliberately silent (an emptied
 * region announces nothing) and is how a region is re-armed after the thing it
 * described stops being true.
 *
 * CONSTRAINT: Trust Rule 8 — live regions stay mounted. This returns TEXT for
 * an already-mounted region; it never mounts or unmounts one.
 */
export function useAnnouncer(): readonly [string, (message: string) => void] {
  // `message` is always the raw string; `pad` is the invisible difference.
  // The pad flips ONLY when the incoming message equals the one already
  // standing, so a region that is announcing something new renders exactly
  // what was passed and nothing else \u2014 the pad is a repeat mechanism, not a
  // decoration on every write.
  const [{ message, pad }, set] = useState({ message: '', pad: false })
  const announce = useCallback(
    (next: string) =>
      set((cur) => ({
        message: next,
        pad: next !== '' && next === cur.message ? !cur.pad : false,
      })),
    [],
  )
  return [pad ? `${message}\u00A0` : message, announce] as const
}
