import type { Quest } from '../state/store.ts'

export function QuestCard({ quests, onComplete }: { quests: Quest[]; onComplete: (id: string) => void }) {
  const allDone = quests.length > 0 && quests.every((q) => q.done)
  return (
    <section className="card">
      <div className="quest-head">
        <h2>Today's quests</h2>
        {/* Persistent visual counterpart to the completion arpeggio — sound
            never carries the moment alone. */}
        {allDone && <span className="quest-alldone">All complete ✓</span>}
      </div>
      <ul className="quest-list">
        {quests.map((q) => (
          <li key={q.id} className={q.done ? 'quest done' : 'quest'}>
            {q.verified ? (
              /* Verified quests complete only when the app observes the action
                 itself (SimCard dispatches on a real run). A button here would
                 let a tap self-report a quest the code promises is verified —
                 so this is a static status row, not a disabled button (which
                 would imply it might enable). */
              <div className="quest-row">
                <span className="quest-box" aria-hidden="true">{q.done ? '✓' : ''}</span>
                <span className="quest-text">{q.text}</span>
              </div>
            ) : (
              /* The whole row is the button: the quest text is the natural tap
                 target, and the 48px row pitch prevents cross-quest mis-taps.
                 Completion is irreversible, so a done quest is disabled — not a
                 still-pressable toggle: aria-pressed would tell screen-reader
                 users it can be un-pressed, and an active press animation on an
                 inert control breaks the "pressed = something happened"
                 contract. */
              <button
                className="quest-row"
                onClick={() => onComplete(q.id)}
                disabled={q.done}
                aria-label={q.done ? `${q.text} — done` : `Mark done: ${q.text}`}
              >
                <span className="quest-box" aria-hidden="true">{q.done ? '✓' : ''}</span>
                <span className="quest-text">{q.text}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
