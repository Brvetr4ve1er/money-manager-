import type { Lesson } from '../content/lessons.ts'
import { useAnnouncer } from '../hooks/useAnnouncer.ts'

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
  /**
   * THE READ, ANNOUNCED — the one daily action in this app that was silent.
   *
   * Pressing "Got it" changes four things and narrates none of them: the
   * button's label becomes "Collected", the chip appears in the head, the
   * `n / total` index ticks, and a blip plays. Every one of those is visual or
   * audible only. The XP region in App announces "+5 XP", which says a grant
   * landed and not what it was for — measured on this tree by walking every
   * control in the app and diffing the live regions after each press, this was
   * the only primary action whose region set came back unchanged. Logging says
   * "Logged 1,500 DA. Undo available."; the record says "Waited. 9,000 DA.
   * Recorded."; the archive says "Showing 3 of 20 days."; export names the
   * file. This card said nothing.
   *
   * useAnnouncer, not a bare string, for the reason the hook documents: the
   * same message written twice reconciles to the same text node and is silent.
   * The inert re-press below writes an identical line every time.
   *
   * CONSTRAINT: Trust Rule 8 and §10 — the region is permanently mounted and
   * mounted empty (a region that arrives holding its message is silent), and
   * the blip may never carry the moment alone.
   */
  const [readNote, announce] = useAnnouncer()
  return (
    <section className="card">
      {/* §11 corner mark. aria-hidden: printed spec, not content. */}
      <span className="spec-label" aria-hidden="true">LSN—04</span>
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
      {/* CONSTRAINT §2.1b — see .counter-plate in tokens.css. The BODY takes
          the plate and the head and title do not: the head carries
          .lesson-collected, a Marigold fill with §2.1 rule 2's mandatory
          Graphite ink, and "Got it" below is a .btn-gold. Plating the title as
          well was measured and overshot — the dark phone's mean-of-windows Bone
          came back at 36.71% against the 30±6 tolerance, because a plate is a
          ground and too much of one is the same defect as too little. */}
      <h3 className="lesson-title">{lesson.title}</h3>
      <p className="lesson-body counter-plate">{lesson.body}</p>
      {/* One read per day: after "Got it" the button goes inert via
          aria-disabled plus an onClick guard — NOT the disabled attribute,
          which would drop keyboard focus to <body> on the button the user
          just activated (same rationale as QuestCard's done rows). */}
      {/* Mounted empty and mounted OUTSIDE the button, like every other status
          region in this app: a region that unmounts announces nothing on the
          way out, and one that arrives already holding its text is silent. */}
      <p className="sr-only" role="status" aria-label="Lesson status">{readNote}</p>
      <button
        className="btn btn-gold"
        onClick={() => {
          if (readToday) {
            // …and an inert control that does nothing and says nothing is a
            // dead key to anyone who could not see it go inert — the exact
            // finding LogCard's "Nothing to clear." already answers on its own
            // aria-disabled control. Nothing failed, so there is no denial cue
            // and no error state: one line into the region already mounted.
            announce(`Already collected today. ${lesson.title}.`)
            return
          }
          onRead()
          // Names the act and the object, and stops (§7 rule 1). The count is
          // deliberately not in here: `collected` is still the pre-dispatch
          // value at this point, and lessonForDay keeps today's own entry in
          // the pool, so a re-read of an already-collected lesson pays the day's
          // XP without growing the set — a number computed here would be wrong
          // in exactly that case. The index is on screen and the codex
          // milestone has its own toast.
          announce(`Collected. ${lesson.title}.`)
        }}
        aria-disabled={readToday}
        aria-label={readToday ? `${lesson.title} — collected` : `Got it: ${lesson.title}`}
      >
        {readToday ? 'Collected' : 'Got it'}
      </button>
    </section>
  )
}
