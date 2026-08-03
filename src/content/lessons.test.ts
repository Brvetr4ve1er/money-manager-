import { describe, it, expect } from 'vitest'
import { LESSONS, LESSON_IDS, lessonForDay } from './lessons.ts'

/** Local-calendar day keys for `n` consecutive days from a start date. */
function dayRange(start: string, n: number): string[] {
  const [y, m, d] = start.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const dt = new Date(y, m - 1, d + i)
    out.push(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
    )
  }
  return out
}

describe('lesson roster', () => {
  it('ships 30 lessons with unique, stable ids', () => {
    expect(LESSONS).toHaveLength(30)
    expect(LESSON_IDS.size).toBe(30)
  })

  it('every lesson has a title, one-liner, and a body', () => {
    for (const l of LESSONS) {
      expect(l.title.length).toBeGreaterThan(0)
      expect(l.oneLiner.length).toBeGreaterThan(0)
      expect(l.body.length).toBeGreaterThan(0)
    }
  })

  it('denominates money examples in DA, never in foreign currency symbols', () => {
    // The target market logs in dinars; a stray dollar example would break
    // the on-voice rule everywhere else in the app.
    for (const l of LESSONS) {
      expect(`${l.title} ${l.oneLiner} ${l.body}`).not.toMatch(/[$€£]/)
    }
    // DA-denominated examples appear across the roster, not just once.
    expect(LESSONS.filter((l) => /\d[\d,]*\s?DA\b/.test(l.body)).length).toBeGreaterThanOrEqual(12)
  })
})

describe('lessonForDay rotation', () => {
  it('is deterministic: the same day and seen list always pick the same lesson', () => {
    const seen = [{ id: LESSONS[0].id, date: '2026-07-01' }]
    const a = lessonForDay('2026-08-02', seen)
    const b = lessonForDay('2026-08-02', [...seen])
    expect(a.id).toBe(b.id)
  })

  it('stays stable within the day after "Got it" stamps today\'s date', () => {
    // Marking today's lesson seen (date === today) must NOT swap the card's
    // content mid-day — only strictly-earlier days shrink the pool.
    const today = '2026-08-02'
    const pick = lessonForDay(today, [])
    const afterRead = lessonForDay(today, [{ id: pick.id, date: today }])
    expect(afterRead.id).toBe(pick.id)
  })

  it('never repeats a lesson until all 30 have been seen', () => {
    const seen: Array<{ id: string; date: string }> = []
    for (const day of dayRange('2026-01-01', 30)) {
      const lesson = lessonForDay(day, seen)
      expect(seen.some((e) => e.id === lesson.id)).toBe(false)
      seen.push({ id: lesson.id, date: day })
    }
    expect(new Set(seen.map((e) => e.id)).size).toBe(30)
  })

  it('excludes a lesson from later days once seen', () => {
    const today = '2026-08-02'
    const pick = lessonForDay(today, [])
    const nextDay = lessonForDay('2026-08-03', [{ id: pick.id, date: today }])
    expect(nextDay.id).not.toBe(pick.id)
  })

  it('keeps rotating deterministically over the full roster once everything is seen', () => {
    const allSeen = LESSONS.map((l) => ({ id: l.id, date: '2026-01-01' }))
    const again = lessonForDay('2026-08-02', allSeen)
    expect(LESSON_IDS.has(again.id)).toBe(true)
    // Deterministic and stable within the wrap-around day too.
    expect(lessonForDay('2026-08-02', allSeen).id).toBe(again.id)
    // A different day may pick differently, but always from the roster.
    expect(LESSON_IDS.has(lessonForDay('2026-08-03', allSeen).id)).toBe(true)
  })
})
