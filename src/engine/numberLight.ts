/**
 * Number-light helpers: fewer digits, rounded honestly, and amounts compared
 * to something the user already knows (their own usual day). Pure.
 */

/** Round to a friendly step (50 / 100 / 500 / 1,000) by magnitude. */
export function friendlyRound(n: number): number {
  const a = Math.abs(n)
  const step = a < 1_000 ? 50 : a < 10_000 ? 100 : a < 100_000 ? 500 : 1_000
  return Math.round(n / step) * step
}

export function friendlyDA(n: number): string {
  return `about ${friendlyRound(n).toLocaleString('en-US')} DA`
}

/** 0–1 share of what you hold that is still free (the tank level). */
export function tankLevel(room: number, holdings: number): number {
  if (holdings <= 0) return 0
  return Math.max(0, Math.min(1, room / holdings))
}

/**
 * The per-day amount compared to the user's own usual daily spend. Null
 * when there is no baseline yet — never compare against a made-up average.
 */
export function vsUsualDay(perDay: number, usualPerDay: number): string | null {
  if (usualPerDay <= 0) return null
  const r = perDay / usualPerDay
  if (r >= 1.6) return 'more than a usual day for you'
  if (r >= 0.85) return 'about a usual day for you'
  if (r >= 0.5) return 'a lighter day than usual'
  return 'a much lighter day than usual'
}
