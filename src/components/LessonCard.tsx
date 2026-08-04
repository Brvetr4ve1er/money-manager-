import type { Lesson } from '../content/lessons.ts'

export function LessonCard({
  lesson,
  readToday,
  onRead,
}: {
  lesson: Lesson
  /** True once today's "Got it" landed (the verified lesson quest is done). */
  readToday: boolean
  onRead: () => void
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
