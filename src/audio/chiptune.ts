/**
 * Chiptune audio cues — synthesized square/triangle waves, no audio files.
 * Sound is always reinforcement of a visual change, never the only signal.
 */

let ctx: AudioContext | null = null
let muted = false

export function setMuted(v: boolean): void {
  muted = v
}
export function isMuted(): boolean {
  return muted
}

function ensureCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
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

/** Quest complete — three ascending notes. */
export const arpeggio = (): void =>
  [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.07, 0.14, 'square', 0.08))

/** Level up / boss defeated — the big win. */
export const fanfare = (): void =>
  [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(f, i * 0.075, 0.28, 'square', 0.1),
  )

/** Boss hit — descending zap. */
export function zap(): void {
  if (muted) return
  const c = ensureCtx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(500, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.18)
  gain.gain.setValueAtTime(0.14, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2)
  osc.connect(gain).connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.22)
}

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
