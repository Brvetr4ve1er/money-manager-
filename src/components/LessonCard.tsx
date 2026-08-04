import type { Lesson } from '../content/lessons.ts'

export function LessonCard({
  lesson,
  readToday,
  onRead,
  collected,
  total,
}: {
  lesson: Lesson
  /** True once today's "Got it" landed (the verified lesson quest is done). */
  readToday: boolean
  onRead: () => void
  /**
   * WHAT IS LEFT OF THE CODEX, and it is one line.
   *
   * The codex was a 32-tile grid and the badge shelf a 9-tile one, together
   * ~1,644px of phone column with no control on either — 60% of this app's DOM
   * for a surface nobody operates. Both are deleted. The count stays because
   * useRewards celebrates every fifth collected lesson with a sparkle, and §10
   * is absolute: a sound may never carry a moment alone, so the milestone needs
   * a persistent visible counterpart. This is it, and one `33 / 36` index label
   * is exactly the §1 trait 10 register the grid was decorating around.
   */
  collected: number
  total: number
}) {
  return (
    <section className="card">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">LSN—05</span>
      <div className="lesson-head">
        <h2>Today's lesson</h2>
        {/* Persistent collected marker — the visual state the quest blip and
            +XP chip reinforce, still readable after both fade. */}
        {/* Same rule as QuestCard's all-done chip: no glyph inside announced
            text (§7.4). The chip plate carries the visual state. */}
        {readToday && <span className="lesson-collected">Collected</span>}
        {/* INDEX ROLL (§9 move 4) — the literal `33/36` case from §1 trait 10.
            The key is the rendered count, so a changed count remounts the span
            and re-runs the stepped index. */}
        <span className="lesson-count mono index-roll" key={collected}>
          {collected} / {total} collected
        </span>
      </div>
      <h3 className="lesson-title">{lesson.title}</h3>
      <p className="lesson-body">{lesson.body}</p>
      {/* One read per day: after "Got it" the button goes inert via
          aria-disabled plus an onClick guard — NOT the disabled attribute,
          which would drop keyboard focus to <body> on the button the user
          just activated (same rationale as QuestCard's done rows). */}
      <button
        className="btn btn-gold"
        onClick={() => {
          if (readToday) return
          onRead()
        }}
        aria-disabled={readToday}
        aria-label={readToday ? `${lesson.title} — collected` : `Got it: ${lesson.title}`}
      >
        {readToday ? 'Collected' : 'Got it'}
      </button>
    </section>
  )
}
