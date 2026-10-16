/** Parse a typed DA amount ("12 000", "12,000", "12000.5"); null when not a finite number. */
export function parseDA(raw: string): number | null {
  const s = raw.replace(/[\s,]/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function nowISO(): string {
  return new Date().toISOString()
}

/** "in 3 days" / "today" / "3 days ago" — relative to today, never judgemental. */
export function relDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}
