import { BRANCHES, nodesInBranch } from '../../content/curriculum.ts'
import {
  branchProgress,
  isApplied,
  missingPrereqs,
  nodeState,
  suggested,
  type NodeState,
} from '../../engine/learn.ts'
import type { AppState } from '../../state/store.ts'

const STATE_LABEL: Record<NodeState, string> = {
  new: 'Not started',
  read: 'Read',
  quizzed: 'Quiz passed',
  mastered: 'Mastered',
}

/**
 * The skill path: eight glowing trails, one per branch, each node a lantern
 * whose light is its state (unlit → warm → bright → full glow with a flame).
 * Every lantern opens — "suggested" only adds a soft pulse, and a node whose
 * prereqs are not done yet says "best after …" instead of showing a padlock.
 */
export function PathMap({
  state,
  today,
  openId,
  onOpen,
}: {
  state: AppState
  today: string
  openId: string | null
  onOpen: (id: string) => void
}) {
  const { learn } = state
  return (
    <section className="card wide learn-path" aria-labelledby="learn-path-h">
      <div className="learn-path-head">
        <h2 id="learn-path-h">Skill path</h2>
        <p className="learn-path-note">Open any lantern. The softly pulsing ones are good next steps.</p>
      </div>
      <div className="learn-branches">
        {[...BRANCHES]
          .sort((a, b) => a.order - b.order)
          .map((b) => {
            const bp = branchProgress(b.id, learn)
            const full = bp.mastered === bp.total
            return (
              <section
                key={b.id}
                className={`learn-branch${full ? ' is-full' : ''}`}
                aria-labelledby={`branch-${b.id}`}
                data-branch={b.id}
              >
                <header className="learn-branch-head">
                  <span className="learn-branch-emoji" aria-hidden="true">{b.emoji}</span>
                  <h3 id={`branch-${b.id}`}>{b.title}</h3>
                  <span className="learn-branch-count mono">{bp.mastered}/{bp.total} mastered</span>
                </header>
                <p className="learn-branch-blurb">{b.blurb}</p>
                <ol className="learn-trail">
                  {nodesInBranch(b.id).map((n) => {
                    const ns = nodeState(n, learn)
                    const isNext = ns !== 'mastered' && ns !== 'quizzed' && suggested(n, learn)
                    const ready = ns === 'quizzed' && n.apply !== null && isApplied(n.apply, state, today)
                    const missing = ns === 'new' && !isNext ? missingPrereqs(n, learn) : []
                    const sub =
                      ready
                        ? 'Ready to master'
                        : missing.length > 0
                          ? `Best after ${missing.map((m) => m.title).join(', ')}`
                          : isNext && ns === 'new'
                            ? 'Suggested next'
                            : ns === 'quizzed'
                              ? 'Try it next'
                              : STATE_LABEL[ns]
                    return (
                      <li key={n.id} className={`lantern-slot is-${ns}`}>
                        <button
                          type="button"
                          className={`lantern is-${ns}${isNext ? ' is-next' : ''}${ready ? ' is-ready' : ''}${openId === n.id ? ' is-open' : ''}`}
                          data-node={n.id}
                          aria-expanded={openId === n.id}
                          onClick={() => onOpen(n.id)}
                        >
                          <span className="lantern-orb" aria-hidden="true">
                            {ns === 'mastered' && <span className="lantern-flame" />}
                          </span>
                          <span className="lantern-title">{n.title}</span>
                          <span className="lantern-sub">
                            <span className="sr-only">{STATE_LABEL[ns]}. </span>
                            {sub === STATE_LABEL[ns] ? <span aria-hidden="true">{sub}</span> : sub}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>
            )
          })}
      </div>
    </section>
  )
}
