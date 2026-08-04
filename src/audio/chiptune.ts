/**
 * Chiptune audio cues — synthesized square/triangle waves, no audio files.
 * Sound is always reinforcement of a visual change, never the only signal.
 */

let ctx: AudioContext | null = null
let muted = false

export function setMuted(v: boolean): void {
  muted = v
}

function ensureCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  // resume() rejects when the tab has no user activation (e.g. an effect
  // fired by a peer tab's write) — swallow it explicitly so a suspended
  // context can never surface as an unhandled promise rejection. Sound is
  // reinforcement only, so a silently-failed resume loses nothing.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(
  freq: number,
  startOffset: number,
  dur: number,
  type: OscillatorType = 'square',
  peak = 0.1,
): void {
  if (muted) return
  const c = ensureCtx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + startOffset)
  gain.gain.setValueAtTime(0.0001, c.currentTime + startOffset)
  gain.gain.linearRampToValueAtTime(peak, c.currentTime + startOffset + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + startOffset + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(c.currentTime + startOffset)
  osc.stop(c.currentTime + startOffset + dur + 0.05)
}

/** Logging an action — quick coin-pickup blip. */
export const blip = (): void => tone(880, 0, 0.09, 'square', 0.09)

/* THE ARPEGGIO IS DELETED WITH THE THING IT ANNOUNCED. It was the daily
   quest set's all-complete cue, and the quest set is gone (see XpStrip). §10
   is the reason it did not simply get re-pointed at some other moment: a cue
   only ever fires alongside a VISIBLE change, so a sound looking for an
   occasion is a sound with nothing to be about. */

/** Level up / boss defeated — the big win. */
export const fanfare = (): void =>
  [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(f, i * 0.075, 0.28, 'square', 0.1),
  )

/** Achievement unlock — rare-pull shimmer. */
export const sparkle = (): void =>
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, i * 0.045, 0.16, 'triangle', 0.07))

/** Invalid action — low double-thud, always paired with inline error text. */
export function deny(): void {
  tone(196, 0, 0.1, 'square', 0.07)
  tone(146.83, 0.09, 0.14, 'square', 0.07)
}

/** Simulator result — calm, informative, not celebratory. */
export function reveal(): void {
  tone(659.25, 0, 0.22, 'sine', 0.08)
  tone(523.25, 0.14, 0.28, 'sine', 0.06)
}
