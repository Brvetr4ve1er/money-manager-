import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { HearthMonth, MONTH_GAME_KEY } from './HearthMonth.tsx'
import { NODE_IDS } from '../../content/curriculum.ts'

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

const card = () => screen.getByRole('region', { name: 'Hearth Month' })

/** Click the first choice of the current event, then the continue button. */
function playStep(): 'ended' | 'continued' {
  const group = screen.getByRole('group', { name: 'Your choice' })
  fireEvent.click(within(group).getAllByRole('button')[0])
  const next = screen.getByRole('button', { name: /^(Next|On to week \d|See how the month went)$/ })
  const ending = next.textContent === 'See how the month went'
  fireEvent.click(next)
  return ending ? 'ended' : 'continued'
}

function playToEnd() {
  for (let i = 0; i < 20; i++) {
    if (playStep() === 'ended') return
  }
  throw new Error('month never ended')
}

describe('<HearthMonth />', () => {
  it('pick a life → play 4 weeks → summary with 3 lessons → play again', () => {
    render(<HearthMonth seed={7} />)
    expect(within(card()).getByRole('heading', { name: 'Choose a life' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Samira/ }))
    expect(screen.getByRole('list', { name: 'Week 1 of 4' })).toBeTruthy()
    // The live region announces the start.
    expect(screen.getByRole('status').textContent).toMatch(/Samira/)

    // First choice shows a consequence, announced politely.
    const group = screen.getByRole('group', { name: 'Your choice' })
    fireEvent.click(within(group).getAllByRole('button')[0])
    const status = screen.getByRole('status').textContent ?? ''
    expect(status.length).toBeGreaterThan(0)
    expect(document.querySelector('.hm-outcome')?.textContent).toContain(status.split('. ')[0])
    fireEvent.click(screen.getByRole('button', { name: /^(Next|On to week \d)$/ }))

    playToEnd()
    expect(screen.getByText('What this month taught')).toBeTruthy()
    const links = within(card())
      .getAllByRole('link')
      .map((a) => a.getAttribute('href') ?? '')
    expect(links).toHaveLength(3)
    for (const href of links) {
      const m = /^#\/learn\?node=(.+)$/.exec(href)
      expect(m).not.toBeNull()
      expect(NODE_IDS.has(m![1])).toBe(true)
    }
    expect(screen.getByRole('heading', { level: 3 }).textContent).not.toMatch(/fail|lose|bad/i)

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(screen.getByRole('list', { name: 'Week 1 of 4' })).toBeTruthy()
    expect(screen.getByText('Samira')).toBeTruthy()

    // Back to the picker.
    playToEnd()
    fireEvent.click(screen.getByRole('button', { name: 'Try another life' }))
    expect(screen.getByRole('heading', { name: 'Choose a life' })).toBeTruthy()
  })

  it('resumes a persisted game after remount', () => {
    const { unmount } = render(<HearthMonth seed={11} />)
    fireEvent.click(screen.getByRole('button', { name: /Lina/ }))
    playStep()
    playStep()
    const title = document.querySelector('.hm-event-title')?.textContent
    const weeks = document.querySelector('.hm-weeks')?.getAttribute('aria-label')
    const cash = document.querySelector('.hm-cash .hm-meter-v')?.textContent
    expect(localStorage.getItem(MONTH_GAME_KEY)).not.toBeNull()
    unmount()

    render(<HearthMonth seed={11} />)
    expect(screen.queryByRole('heading', { name: 'Choose a life' })).toBeNull()
    expect(document.querySelector('.hm-event-title')?.textContent).toBe(title)
    expect(document.querySelector('.hm-weeks')?.getAttribute('aria-label')).toBe(weeks)
    expect(document.querySelector('.hm-cash .hm-meter-v')?.textContent).toBe(cash)
  })

  it('resumes mid-consequence too', () => {
    const { unmount } = render(<HearthMonth seed={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Karim/ }))
    const group = screen.getByRole('group', { name: 'Your choice' })
    fireEvent.click(within(group).getAllByRole('button')[0])
    const text = document.querySelector('.hm-outcome-text')?.textContent
    unmount()
    render(<HearthMonth seed={3} />)
    expect(document.querySelector('.hm-outcome-text')?.textContent).toBe(text)
  })

  it('corrupt localStorage starts fresh', () => {
    localStorage.setItem(MONTH_GAME_KEY, '{not json')
    render(<HearthMonth seed={1} />)
    expect(screen.getByRole('heading', { name: 'Choose a life' })).toBeTruthy()
    cleanup()

    localStorage.setItem(MONTH_GAME_KEY, JSON.stringify({ v: 1, game: { v: 1, characterId: 'ghost' }, showingOutcome: false }))
    render(<HearthMonth seed={1} />)
    expect(screen.getByRole('heading', { name: 'Choose a life' })).toBeTruthy()
    expect(localStorage.getItem(MONTH_GAME_KEY)).toBeNull()
    // And a fresh game still starts and saves.
    fireEvent.click(screen.getByRole('button', { name: /Yacine/ }))
    expect(JSON.parse(localStorage.getItem(MONTH_GAME_KEY) ?? '{}').game.characterId).toBe('yacine')
  })

  it('is deterministic for a fixed seed', () => {
    render(<HearthMonth seed={21} />)
    fireEvent.click(screen.getByRole('button', { name: /Samira/ }))
    const a = document.querySelector('.hm-event-title')?.textContent
    cleanup()
    localStorage.clear()
    render(<HearthMonth seed={21} />)
    fireEvent.click(screen.getByRole('button', { name: /Samira/ }))
    expect(document.querySelector('.hm-event-title')?.textContent).toBe(a)
  })
})
