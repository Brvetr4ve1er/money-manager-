import { useId, useState, type FormEvent } from 'react'
import type { Charm, CharmKind, Jar } from '../../state/slices/money.ts'
import type { CharmSuggestion } from '../../engine/money.ts'
import { fmtDA } from '../../engine/money.ts'
import { CHARM_CATEGORIES, ROUNDUP_STEPS, charmRule, groupSuggestions, parseAmount } from './helpers.ts'

interface CharmsProps {
  jars: Jar[]
  charms: Charm[]
  onCreate: (c: Pick<Charm, 'kind' | 'jarId' | 'category' | 'value'>) => void
  onToggle: (c: Charm) => void
  onArchive: (c: Charm) => void
}

const KINDS: Array<{ kind: CharmKind; label: string }> = [
  { kind: 'roundup', label: 'Round-up' },
  { kind: 'category', label: 'Every time I log…' },
  { kind: 'treat-tax', label: 'Treat tax' },
]

/** Save charms: small rules of your own that suggest jar top-ups. */
export function CharmsCard({ jars, charms, onCreate, onToggle, onArchive }: CharmsProps) {
  const id = useId()
  const [kind, setKind] = useState<CharmKind>('roundup')
  const [jarId, setJarId] = useState('')
  const [step, setStep] = useState<number>(100)
  const [category, setCategory] = useState<string>('Food')
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const byId = new Map(jars.map((j) => [j.id, j]))
  const target = byId.has(jarId) ? jarId : (jars[0]?.id ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    setNote(null)
    if (!target) return setError('Pick a jar for this charm.')
    let value: number
    if (kind === 'roundup') value = step
    else {
      const n = parseAmount(raw)
      if (n === null) return setError(kind === 'category' ? 'How many DA each time? Like 200.' : 'What percent? Like 10.')
      if (kind === 'treat-tax' && n > 100) return setError('A treat tax tops out at 100%.')
      value = n
    }
    onCreate({ kind, jarId: target, category: kind === 'roundup' ? null : category, value })
    setError(null)
    setRaw('')
    setNote('Charm added. It starts watching from today — no backdated flood.')
  }

  const live = charms.filter((c) => !c.archived)

  return (
    <section className="card jars-charms" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Save charms</h2>
      <p className="support-lead">Little rules of your own. They only ever suggest — you confirm every move.</p>

      {live.length > 0 && (
        <ul className="charm-list">
          {live.map((c) => (
            <li key={c.id} className={`charm-row${c.active ? '' : ' -paused'}`}>
              <span className="charm-rule">{charmRule(c, byId.get(c.jarId))}</span>
              <span className="charm-btns">
                <button type="button" className="btn undo-btn" aria-pressed={c.active} onClick={() => onToggle(c)}>
                  {c.active ? 'Active' : 'Paused'}
                </button>
                <button type="button" className="btn undo-btn" onClick={() => onArchive(c)} aria-label={`Archive charm: ${charmRule(c, byId.get(c.jarId))}`}>
                  Archive
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {jars.length === 0 ? (
        <p className="support-lead">Make a jar first — charms need somewhere to send money.</p>
      ) : (
        <form onSubmit={submit} noValidate className="charm-form" aria-label="New charm">
          <div className="chip-row" role="radiogroup" aria-label="Charm type">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                className={`btn chip${kind === k.kind ? ' is-picked' : ''}`}
                onClick={() => { setKind(k.kind); setError(null) }}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="log-row">
            {kind === 'roundup' ? (
              <div className="field-wrap">
                <label className="field-label" htmlFor={`${id}-step`}>Round up to nearest</label>
                <select id={`${id}-step`} className="field" value={step} onChange={(e) => setStep(Number(e.target.value))}>
                  {ROUNDUP_STEPS.map((s) => (
                    <option key={s} value={s}>{fmtDA(s)}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="field-wrap">
                  <label className="field-label" htmlFor={`${id}-cat`}>{kind === 'category' ? 'When I log' : 'Tax on'}</label>
                  <select id={`${id}-cat`} className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CHARM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field-wrap">
                  <label className="field-label" htmlFor={`${id}-val`}>{kind === 'category' ? 'Put in (DA)' : 'Percent'}</label>
                  <input id={`${id}-val`} className="field mono" inputMode="numeric" autoComplete="off" value={raw} onChange={(e) => { setRaw(e.target.value); setError(null) }} />
                </div>
              </>
            )}
            <div className="field-wrap">
              <label className="field-label" htmlFor={`${id}-jar`}>Into jar</label>
              <select id={`${id}-jar`} className="field" value={target} onChange={(e) => setJarId(e.target.value)}>
                {jars.map((j) => (
                  <option key={j.id} value={j.id}>{j.emoji} {j.name}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="log-actions">
            <button type="submit" className="btn btn-gold">Add charm</button>
          </div>
          <p className="support-saved" role="status">{note ?? ''}</p>
        </form>
      )}
    </section>
  )
}

interface SuggestionsProps {
  jars: Jar[]
  suggestions: CharmSuggestion[]
  onConfirm: (list: CharmSuggestion[]) => void
  onDismiss: (s: CharmSuggestion) => void
}

/** What your charms would move — nothing moves until you say so. */
export function SuggestionsCard({ jars, suggestions, onConfirm, onDismiss }: SuggestionsProps) {
  const id = useId()
  const byId = new Map(jars.map((j) => [j.id, j]))
  const groups = groupSuggestions(suggestions)
  return (
    <section className="card jars-suggest" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Suggestions</h2>
      <p className="support-lead">These come from your own charms. Nothing moves until you confirm.</p>
      {groups.length === 0 ? (
        <p className="support-lead">All caught up. New ones appear when you log something a charm is watching.</p>
      ) : (
        <ul className="suggest-groups">
          {groups.map((g) => {
            const jar = byId.get(g.jarId)
            const name = jar ? `${jar.emoji} ${jar.name}` : 'Jar'
            return (
              <li key={g.jarId} className="suggest-group" aria-label={`Suggestions for ${jar?.name ?? 'jar'}`}>
                <div className="suggest-head">
                  <h3>{name}</h3>
                  {g.items.length > 1 && (
                    <button type="button" className="btn btn-gold undo-btn" onClick={() => onConfirm(g.items)}>
                      Confirm all · {fmtDA(g.total)}
                    </button>
                  )}
                </div>
                <ul className="suggest-list">
                  {g.items.map((s) => (
                    <li key={s.id} className="suggest-row">
                      <span className="suggest-text">
                        <b className="mono">+{fmtDA(s.amount)}</b> <span>{s.label}</span>
                      </span>
                      <span className="charm-btns">
                        <button type="button" className="btn btn-teal undo-btn" onClick={() => onConfirm([s])} aria-label={`Confirm ${fmtDA(s.amount)}: ${s.label}`}>
                          Confirm
                        </button>
                        <button type="button" className="btn undo-btn" onClick={() => onDismiss(s)} aria-label={`Dismiss ${fmtDA(s.amount)}: ${s.label}`}>
                          Dismiss
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
