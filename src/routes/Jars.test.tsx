import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import App from '../App.tsx'
import { todayISO } from '../state/store.ts'
import { addDaysISO, shortDay } from '../engine/dates.ts'
import { fmtDA, jarView } from '../engine/money.ts'
import { defaultMoney, type Jar, type JarMove, type MoneyState } from '../state/slices/money.ts'

// Sounds are reinforcement only; jsdom has no AudioContext, so stub the module.
vi.mock('../audio/chiptune.ts', () => ({
  setMuted: vi.fn(),
  blip: vi.fn(),
  arpeggio: vi.fn(),
  fanfare: vi.fn(),
  sparkle: vi.fn(),
  deny: vi.fn(),
  reveal: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
  if (typeof globalThis.crypto.randomUUID !== 'function') {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: () => `${Math.random()}`.slice(2),
      configurable: true,
    })
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Switch rooms the way a dock tap does: set the hash, fire hashchange. */
const goto = (route: 'home' | 'runway' | 'jars' | 'learn' | 'me') =>
  act(() => {
    window.location.hash = `#/${route}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

const KEY = 'ember-state-v1'
const ISO = '2026-01-01T00:00:00.000Z'
const today = todayISO()

const persisted = (): MoneyState => JSON.parse(localStorage.getItem(KEY) ?? '{}').money

function jar(id: string, name: string, extra: Partial<Jar> = {}): Jar {
  return { id, name, emoji: '🫙', target: null, targetDate: null, locked: false, archived: false, updatedAt: ISO, ...extra }
}
function mv(id: string, jarId: string, amount: number): JarMove {
  return { id, jarId, amount, date: today, kind: amount > 0 ? 'topup' : 'withdraw' }
}
const account = {
  id: 'acc1',
  name: 'CCP',
  currency: 'DA',
  anchorBalance: 20_000,
  anchorAt: ISO,
  archived: false,
  updatedAt: ISO,
}

function seed(money: Partial<MoneyState>, transactions: unknown[] = []) {
  localStorage.setItem(KEY, JSON.stringify({ money: { ...defaultMoney(), ...money }, transactions }))
}

function openJars() {
  render(<App />)
  goto('jars')
}

const jarCard = (name: string) => screen.getByRole('article', { name: new RegExp(`^${name}`) })

function moveInto(name: string, mode: 'Add to' | 'Take out of', amount: string) {
  const card = jarCard(name)
  fireEvent.click(within(card).getByRole('button', { name: `${mode} ${name}` }))
  const label = mode === 'Add to' ? `Amount to add to ${name}` : `Amount to take out of ${name}`
  fireEvent.change(within(card).getByLabelText(label), { target: { value: amount } })
  fireEvent.click(within(card).getByRole('button', { name: mode === 'Add to' ? 'Put it in' : 'Take it out' }))
}

describe('Jars room — shelf and creation', () => {
  it('shows an inviting empty state with presets, and creates a jar from a preset', () => {
    openJars()
    expect(screen.getByText('Every dinar gets a job.')).toBeTruthy()
    const presets = screen.getByRole('group', { name: 'Jar presets' })
    for (const p of ['Emergency', 'Eid', 'Ramadan', 'Rentrée', 'Bills', 'Phone/laptop', 'Custom']) {
      expect(within(presets).getByRole('button', { name: new RegExp(p) })).toBeTruthy()
    }
    fireEvent.click(within(presets).getByRole('button', { name: /Eid/ }))
    expect((screen.getByLabelText('Jar name') as HTMLInputElement).value).toBe('Eid')
    expect((screen.getByLabelText('Target DA (optional)') as HTMLInputElement).value).toBe('30000')
    // Editable: tweak the suggested target before saving.
    fireEvent.change(screen.getByLabelText('Target DA (optional)'), { target: { value: '25 000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Put it on the shelf' }))

    const jars = persisted().jars
    expect(jars).toHaveLength(1)
    expect(jars[0]).toMatchObject({ name: 'Eid', emoji: '🌙', target: 25_000, locked: false, archived: false })
    expect(jarCard('Eid')).toBeTruthy()
    expect(screen.getByText(/across 1 jar$/)).toBeTruthy()
  })

  it('edits and archives a jar (archive asks first)', () => {
    seed({ jars: [jar('j1', 'Bills')] })
    openJars()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Bills' }))
    fireEvent.change(screen.getByLabelText('Jar name'), { target: { value: 'Bills & rent' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(persisted().jars[0].name).toBe('Bills & rent')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Bills & rent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive jar' }))
    expect(persisted().jars[0].archived).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, archive it' }))
    expect(persisted().jars[0].archived).toBe(true)
    expect(screen.getByText('Every dinar gets a job.')).toBeTruthy()
  })

  it('shows the monthly pace and flips to on track once the payday split covers it', () => {
    const date = addDaysISO(today, 200)
    seed({ jars: [jar('j1', 'Rentrée', { target: 12_000, targetDate: date })] })
    openJars()
    const v = jarView(jar('j1', 'Rentrée', { target: 12_000, targetDate: date }), defaultMoney(), today)
    const card = jarCard('Rentrée')
    expect(within(card).getByText(`/month to reach by ${shortDay(date)}`, { exact: false }).textContent).toBe(
      `${fmtDA(v.perMonth!)}/month to reach by ${shortDay(date)}`,
    )
    expect(within(card).getByText('not on track yet')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Rentrée split amount/), { target: { value: String(v.perMonth) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save split' }))
    expect(persisted().settings.split).toEqual([{ jarId: 'j1', amount: v.perMonth }])
    expect(within(jarCard('Rentrée')).getByText('on track')).toBeTruthy()
  })

  it('totals earmarked money across jars', () => {
    seed({ jars: [jar('a', 'Eid'), jar('b', 'Bills')], jarMoves: [mv('m1', 'a', 3000), mv('m2', 'b', 1500)] })
    openJars()
    expect(screen.getByText(/^Earmarked:/).textContent).toBe('Earmarked: 4,500 DA across 2 jars')
  })
})

describe('Jars room — moving money', () => {
  it('adds and takes out, writing topup/withdraw moves', () => {
    seed({ jars: [jar('j1', 'Eid')] })
    openJars()
    moveInto('Eid', 'Add to', '5000')
    expect(within(jarCard('Eid')).getByText('5,000 DA')).toBeTruthy()
    moveInto('Eid', 'Take out of', '2000')
    expect(within(jarCard('Eid')).getByText('3,000 DA')).toBeTruthy()
    const moves = persisted().jarMoves
    expect(moves.map((m) => [m.jarId, m.amount, m.kind, m.date]).sort()).toEqual(
      [
        ['j1', 5000, 'topup', today],
        ['j1', -2000, 'withdraw', today],
      ].sort(),
    )
  })

  it('rejects a non-number without moving anything', () => {
    seed({ jars: [jar('j1', 'Eid')] })
    openJars()
    moveInto('Eid', 'Add to', 'lots')
    expect(screen.getByText(/Type an amount in DA/)).toBeTruthy()
    expect(persisted().jarMoves).toHaveLength(0)
  })

  it('a locked jar asks for an explicit confirm before a take-out', () => {
    seed({ jars: [jar('j1', 'Emergency', { locked: true })], jarMoves: [mv('m1', 'j1', 5000)] })
    openJars()
    moveInto('Emergency', 'Take out of', '1000')
    expect(screen.getByText('You locked this jar on purpose. Take out anyway?')).toBeTruthy()
    expect(persisted().jarMoves).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Keep it locked' }))
    expect(persisted().jarMoves).toHaveLength(1)

    moveInto('Emergency', 'Take out of', '1000')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, take out 1,000 DA' }))
    const out = persisted().jarMoves.find((m) => m.kind === 'withdraw')
    expect(out).toMatchObject({ jarId: 'j1', amount: -1000 })
  })

  it('covers an overspent jar from another jar with a cover pair', () => {
    seed({
      jars: [jar('a', 'Food'), jar('b', 'Emergency')],
      jarMoves: [mv('m1', 'a', -2000), mv('m2', 'b', 10_000)],
    })
    openJars()
    const card = jarCard('Food')
    expect(within(card).getByText(/Spent 2,000 DA past this jar/)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Cover it' }))
    expect((within(card).getByLabelText('Amount to move') as HTMLInputElement).value).toBe('2000')
    expect((within(card).getByLabelText('Cover from') as HTMLSelectElement).value).toBe('b')
    fireEvent.click(within(card).getByRole('button', { name: 'Move it over' }))

    const covers = persisted().jarMoves.filter((m) => m.kind === 'cover')
    expect(covers).toHaveLength(2)
    const outMove = covers.find((m) => m.id.endsWith(':out'))!
    const inMove = covers.find((m) => m.id.endsWith(':in'))!
    expect(outMove).toMatchObject({ jarId: 'b', amount: -2000 })
    expect(inMove).toMatchObject({ jarId: 'a', amount: 2000 })
    expect(outMove.id.replace(/:out$/, '')).toBe(inMove.id.replace(/:in$/, ''))
    expect(outMove.id).toMatch(/^cover:.+:out$/)
    expect(within(jarCard('Food')).getByText('0 DA')).toBeTruthy()
    expect(within(jarCard('Food')).queryByRole('button', { name: 'Cover it' })).toBeNull()
  })

  it('will not cover with more than the source jar holds', () => {
    seed({ jars: [jar('a', 'Food'), jar('b', 'Fun')], jarMoves: [mv('m1', 'a', -2000), mv('m2', 'b', 500)] })
    openJars()
    const card = jarCard('Food')
    fireEvent.click(within(card).getByRole('button', { name: 'Cover it' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Move it over' }))
    expect(within(card).getByText(/Fun holds 500 DA/)).toBeTruthy()
    expect(persisted().jarMoves.filter((m) => m.kind === 'cover')).toHaveLength(0)
  })
})

describe('Jars room — payday ritual', () => {
  const withSplit = () =>
    seed({
      accounts: [account] as MoneyState['accounts'],
      jars: [jar('a', 'Eid'), jar('b', 'Bills')],
      settings: { fxDaPerUsd: 140, paydayDay: 25, split: [{ jarId: 'a', amount: 10_000 }, { jarId: 'b', amount: 5000 }], savedAt: ISO },
    })

  it('records the income and one payday move per split row, then sums it up', () => {
    withSplit()
    openJars()
    fireEvent.change(screen.getByLabelText('Income amount'), { target: { value: '50000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Income landed — run my split' }))

    const m = persisted()
    expect(m.incomes).toHaveLength(1)
    const inc = m.incomes[0]
    expect(inc).toMatchObject({ accountId: 'acc1', amount: 50_000, date: today, note: 'payday' })
    expect(m.jarMoves.map((x) => x.id).sort()).toEqual([`payday:${inc.id}:a`, `payday:${inc.id}:b`])
    expect(m.jarMoves.every((x) => x.kind === 'payday')).toBe(true)
    expect(m.settings).toMatchObject({ fxDaPerUsd: 140, paydayDay: 25 })
    expect(screen.getByText(/landed ·/).textContent).toBe('50,000 DA landed · 15,000 DA into jars · 35,000 DA left to breathe')
    expect(within(jarCard('Eid')).getByText('10,000 DA')).toBeTruthy()
  })

  it('rejects a split larger than the income, without dispatching', () => {
    withSplit()
    openJars()
    fireEvent.change(screen.getByLabelText('Income amount'), { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Income landed — run my split' }))
    expect(screen.getByRole('alert').textContent).toMatch(/split \(15,000 DA\) is more than this income \(12,000 DA\)/)
    const m = persisted()
    expect(m.incomes).toHaveLength(0)
    expect(m.jarMoves).toHaveLength(0)
  })

  it('saves an edited split keeping fx and payday day', () => {
    withSplit()
    openJars()
    fireEvent.change(screen.getByLabelText(/Bills split amount/), { target: { value: '7000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save split' }))
    expect(persisted().settings).toMatchObject({
      fxDaPerUsd: 140,
      paydayDay: 25,
      split: [{ jarId: 'a', amount: 10_000 }, { jarId: 'b', amount: 7000 }],
    })
  })

  it('without an account, says income needs one and links Home', () => {
    seed({ jars: [jar('a', 'Eid')] })
    openJars()
    expect(screen.getByText(/Income needs an account first/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add an account on Home' }).getAttribute('href')).toBe('#/home')
    expect(screen.queryByRole('button', { name: 'Income landed — run my split' })).toBeNull()
  })
})

describe('Jars room — save charms', () => {
  const txs = [
    { id: 't1', amountDA: 1230, category: 'Food', date: today, at: '2026-10-16T09:00:00.000Z' },
    { id: 't2', amountDA: 860, category: 'Food', date: today, at: '2026-10-16T10:00:00.000Z' },
  ]

  it('creates a round-up charm and turns a logged purchase into a suggestion to confirm', () => {
    seed({ jars: [jar('j1', 'Eid')] }, [txs[0]])
    openJars()
    fireEvent.change(screen.getByLabelText('Round up to nearest'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add charm' }))
    const charm = persisted().charms[0]
    expect(charm).toMatchObject({ kind: 'roundup', jarId: 'j1', value: 100, since: today, active: true, category: null })

    expect(screen.getByText(/Nothing moves until you confirm/)).toBeTruthy()
    const confirm = screen.getByRole('button', { name: /^Confirm 70 DA/ })
    expect(persisted().jarMoves).toHaveLength(0)
    fireEvent.click(confirm)
    expect(persisted().jarMoves).toEqual([
      { id: `charm:${charm.id}:t1`, jarId: 'j1', amount: 70, date: today, kind: 'charm' },
    ])
    expect(screen.queryByRole('button', { name: /^Confirm 70 DA/ })).toBeNull()
  })

  it('dismiss removes a suggestion; confirm-all moves the rest of a jar at once', () => {
    seed({ jars: [jar('j1', 'Eid')] }, [...txs, { id: 't3', amountDA: 500, category: 'Food', date: today }])
    openJars()
    fireEvent.click(screen.getByRole('radio', { name: 'Every time I log…' }))
    fireEvent.change(screen.getByLabelText('When I log'), { target: { value: 'Food' } })
    fireEvent.change(screen.getByLabelText('Put in (DA)'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add charm' }))
    const charm = persisted().charms[0]
    expect(charm).toMatchObject({ kind: 'category', category: 'Food', value: 200 })

    expect(screen.getAllByRole('button', { name: /^Dismiss 200 DA/ })).toHaveLength(3)
    fireEvent.click(screen.getAllByRole('button', { name: /^Dismiss 200 DA/ })[0])
    expect(persisted().dismissed).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Dismiss 200 DA/ })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm all · 400 DA' }))
    const moves = persisted().jarMoves
    expect(moves).toHaveLength(2)
    expect(moves.every((m) => m.kind === 'charm' && m.amount === 200 && m.id.startsWith(`charm:${charm.id}:`))).toBe(true)
    expect(moves.map((m) => m.id)).not.toContain(persisted().dismissed[0])
    expect(screen.getByText(/All caught up/)).toBeTruthy()
    expect(within(jarCard('Eid')).getByText('400 DA')).toBeTruthy()
  })

  it('pauses and archives a charm', () => {
    seed({ jars: [jar('j1', 'Eid')] }, [txs[0]])
    openJars()
    fireEvent.click(screen.getByRole('button', { name: 'Add charm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Active' }))
    expect(persisted().charms[0].active).toBe(false)
    expect(screen.queryByRole('button', { name: /^Confirm \d/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Archive charm/ }))
    expect(persisted().charms[0].archived).toBe(true)
  })
})
