import type { AppState } from '../state/store.ts'
import { obligationViews } from '../engine/money.ts'
import { roomPieces, waitingFor } from '../engine/room.ts'
import { objectKindFor, objectStateFor } from './runway/runwayModel.ts'
import { RoomObject } from './RoomObject.tsx'

/**
 * Your room: the lanterns of your next bills, what is waiting for you, and
 * the pieces the room has grown from real outcomes. Calm by construction —
 * no badges count up, nothing blinks for attention.
 */
export function RoomCard({ state, today, nowMs }: { state: AppState; today: string; nowMs: number }) {
  const waiting = waitingFor(state, today, nowMs)
  const pieces = roomPieces(state, today)
  const lanterns = obligationViews(state.money, today)
    .filter((v) => v.nextDue !== null)
    .slice(0, 5)
  return (
    <section className="card room wide" aria-labelledby="room-title">
      <h2 id="room-title">Your room</h2>
      {lanterns.length > 0 && (
        <ul className="room-lanterns" aria-label="Next bills">
          {lanterns.map((v) => (
            <li key={v.obligation.id}>
              <a href="#/runway" className="room-lantern">
                <RoomObject
                  kind={objectKindFor(v.obligation)}
                  state={objectStateFor(v, today)}
                  size={44}
                  progress={v.obligation.installment ? { paid: v.installmentPaid ?? 0, total: v.obligation.installment.total } : undefined}
                />
                <span>{v.obligation.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <h3 className="room-sub">Waiting for you</h3>
      {waiting.length === 0 ? (
        <p className="room-calm">Nothing needs you right now.</p>
      ) : (
        <ul className="room-waiting">
          {waiting.map((w) => (
            <li key={w.id} className={`room-wait is-${w.tone}`}>
              <a href={w.href}>{w.text}</a>
            </li>
          ))}
        </ul>
      )}
      <h3 className="room-sub">What your room has grown</h3>
      <ul className="room-pieces">
        {pieces.map((p) => (
          <li key={p.id} className={`room-piece${p.earned ? ' is-earned' : ''}`}>
            <span className="room-piece-emoji" aria-hidden="true">{p.emoji}</span>
            <span>
              <span className="room-piece-name">
                <span className="sr-only">{p.earned ? 'Grown: ' : 'Not yet: '}</span>
                {p.name}
              </span>
              {!p.earned && <span className="room-piece-how">{p.how}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
