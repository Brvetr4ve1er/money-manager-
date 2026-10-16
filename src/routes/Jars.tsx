import { useMemo, useRef, useState } from 'react'
import type { RouteProps } from './types.ts'
import type { Charm, Jar, JarMove } from '../state/slices/money.ts'
import { newId } from '../state/store.ts'
import { charmSuggestions, fmtDA, jarView, liveAccounts, liveJars } from '../engine/money.ts'
import * as sfx from '../audio/chiptune.ts'
import { JarCard, type JarPanel } from '../components/jars/JarCard.tsx'
import { JarForm } from '../components/jars/JarForm.tsx'
import { PaydayCard } from '../components/jars/PaydayCard.tsx'
import { CharmsCard, SuggestionsCard } from '../components/jars/CharmsCard.tsx'
import { coverMoves, paydayMoves, plural } from '../components/jars/helpers.ts'
import '../components/jars/jars.css'

const nowISO = () => new Date().toISOString()

/**
 * Jars room — envelopes. Every dinar gets a job: a shelf of squishy clay
 * jars, the payday ritual that fills them, and save charms that suggest
 * top-ups (the user confirms each one). Overspending a jar is never an
 * alarm — it asks to be covered from another jar.
 */
export function JarsRoute({ state, dispatch, today }: RouteProps) {
  const { money, transactions } = state
  const jars = liveJars(money)
  const views = jars.map((j) => jarView(j, money, today))
  const accounts = liveAccounts(money)
  const suggestions = useMemo(() => charmSuggestions(money, transactions), [money, transactions])
  const earmarked = views.reduce((s, v) => s + Math.max(0, v.balance), 0)

  const [open, setOpen] = useState<{ jarId: string; panel: JarPanel } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const formRef = useRef<HTMLElement>(null)
  const editing = jars.find((j) => j.id === editingId) ?? null

  function move(jarId: string, amount: number, kind: JarMove['kind']) {
    dispatch({ type: 'money/jar-move', move: { id: newId(), jarId, amount, date: today, kind } })
    sfx.blip()
  }

  function saveJar(fields: Pick<Jar, 'name' | 'emoji' | 'target' | 'targetDate' | 'locked'>) {
    const base = editing ?? { id: newId(), archived: false }
    dispatch({ type: 'money/jar-upsert', jar: { ...base, ...fields, archived: false, updatedAt: nowISO() } as Jar })
    sfx.blip()
  }

  function upsertCharm(c: Charm) {
    dispatch({ type: 'money/charm-upsert', charm: { ...c, updatedAt: nowISO() } })
  }

  return (
    <>
      <section className="card wide jars-shelf-card" id="jars" aria-labelledby="jars-h">
        <h2 id="jars-h">Jars</h2>
        {jars.length === 0 ? (
          <div className="jars-empty">
            <div className="jars-empty-art" aria-hidden="true">
              <span className="jar-clay -butter -ghost"><span className="jar-lid" /><span className="jar-glass" /></span>
              <span className="jar-clay -mint -ghost"><span className="jar-lid" /><span className="jar-glass" /></span>
              <span className="jar-clay -lilac -ghost"><span className="jar-lid" /><span className="jar-glass" /></span>
            </div>
            <p className="jars-empty-title">Every dinar gets a job.</p>
            <p className="support-lead">
              A jar is money with a name on it — Eid, the rentrée, a rainy day. Pick one below and it lands on your shelf.
            </p>
          </div>
        ) : (
          <>
            <p className="jars-total">
              Earmarked: <b className="mono">{fmtDA(earmarked)}</b> across {plural(jars.length, 'jar')}
            </p>
            <ul className="jars-shelf">
              {views.map((v, i) => (
                <li key={v.jar.id} className={open?.jarId === v.jar.id ? 'is-open' : undefined}>
                  <JarCard
                    view={v}
                    tone={i}
                    others={views.filter((o) => o.jar.id !== v.jar.id)}
                    panel={open?.jarId === v.jar.id ? open.panel : null}
                    onPanel={(p) => setOpen(p === null ? null : { jarId: v.jar.id, panel: p })}
                    onMove={(n) => move(v.jar.id, n, n > 0 ? 'topup' : 'withdraw')}
                    onCover={(from, n) => {
                      dispatch({ type: 'money/jar-moves', moves: coverMoves(newId(), from, v.jar.id, n, today) })
                      sfx.sparkle()
                    }}
                    onEdit={() => {
                      setEditingId(v.jar.id)
                      setOpen(null)
                      formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
                    }}
                  />
                </li>
              ))}
            </ul>
            <div className="jars-plank" aria-hidden="true" />
          </>
        )}
      </section>

      <JarForm
        ref={formRef}
        today={today}
        editing={editing}
        editingBalance={editing ? Math.max(0, views.find((v) => v.jar.id === editing.id)?.balance ?? 0) : 0}
        empty={jars.length === 0}
        onSave={saveJar}
        onArchive={() => {
          if (!editing) return
          dispatch({ type: 'money/jar-upsert', jar: { ...editing, archived: true, updatedAt: nowISO() } })
        }}
        onDoneEditing={() => setEditingId(null)}
      />

      <PaydayCard
        jars={jars}
        accounts={accounts}
        settings={money.settings}
        onSaveSplit={(split) =>
          dispatch({
            type: 'money/settings',
            settings: { fxDaPerUsd: money.settings.fxDaPerUsd, paydayDay: money.settings.paydayDay, split },
            nowISO: nowISO(),
          })
        }
        onRun={(accountId, amount, split) => {
          const incomeId = newId()
          const at = nowISO()
          dispatch({ type: 'money/income-add', income: { id: incomeId, accountId, amount, date: today, at, note: 'payday' } })
          dispatch({ type: 'money/jar-moves', moves: paydayMoves(incomeId, split, today) })
          sfx.sparkle()
        }}
      />

      {(suggestions.length > 0 || money.charms.some((c) => !c.archived)) && (
        <SuggestionsCard
          jars={jars}
          suggestions={suggestions}
          onConfirm={(list) => {
            // The suggestion id IS the move id: confirming twice (or in two
            // tabs) dedupes to one move, and the suggestion disappears.
            const moves = list.map((s) => ({ id: s.id, jarId: s.jarId, amount: s.amount, date: today, kind: 'charm' as const }))
            if (moves.length === 1) dispatch({ type: 'money/jar-move', move: moves[0] })
            else dispatch({ type: 'money/jar-moves', moves })
            sfx.blip()
          }}
          onDismiss={(s) => dispatch({ type: 'money/charm-dismiss', id: s.id })}
        />
      )}

      <CharmsCard
        jars={jars}
        charms={money.charms}
        onCreate={(c) =>
          upsertCharm({ id: newId(), ...c, since: today, active: true, archived: false, updatedAt: '' })
        }
        onToggle={(c) => upsertCharm({ ...c, active: !c.active })}
        onArchive={(c) => upsertCharm({ ...c, archived: true })}
      />
    </>
  )
}
