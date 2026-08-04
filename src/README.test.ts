import { describe, it, expect } from 'vitest'
/* From disk, like shareCard.test.ts and design.test.ts: the subject is a file
   nothing imports and no render can reach. A .ts file, not .tsx — jsdom gives
   import.meta.url an http:// URL that readFileSync rejects. */
import { readFileSync } from 'node:fs'
import { MECHANICS } from './components/Landing.tsx'
import { NOTE_MAX_LEN, DECISION_ANSWERS, DECISION_MAX } from './state/store.ts'
import { NOTE_DENOMINATIONS_DA } from './engine/keypad.ts'
import { LESSONS } from './content/lessons.ts'
import { ACHIEVEMENTS } from './engine/achievements.ts'
import { DEFAULT_QUESTS } from './state/store.ts'

/**
 * THE README AS A CLAIM SURFACE.
 *
 * It is the second landing page — for a developer, a packager, or anyone the
 * repo link reaches instead of the app link — and it is the copy nobody re-reads
 * while shipping. Drift is the DEFAULT outcome when a product moves faster than
 * its documentation, and the last three rounds proved it: the mechanic block
 * counted six after a seventh shipped, and two paragraphs described a month card
 * stacked on a ledger for a build where they were one card.
 *
 * So the claims that CAN be bound to code are bound here, and the ones that
 * cannot (prose, argument, tone) are left alone. The line between them is
 * whether the source of truth is a value: a count, a label, a cap, a component
 * that exists or does not.
 */

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

/** Markdown hard-wraps at 79 columns, so a claim in prose is routinely split
    across a newline. Every assertion about PROSE runs against this flattened
    copy; the fenced mechanic block is asserted line by line, unflattened. */
const FLAT = README.replace(/\s+/g, ' ')

/** The fenced mechanic block, as its `NN/NN  TITLE  body` rows. */
const MECHANIC_ROWS = (() => {
  const block = /## The [a-z]+ mechanics\n\n```\n([\s\S]*?)```/.exec(README)
  if (block === null) throw new Error('README: no mechanic block')
  return block[1].trim().split('\n')
})()

describe('the mechanic block is the landing grid, not a copy of it', () => {
  it('lists exactly the mechanics the landing page ships', () => {
    // The landing reads MECHANICS.length for its own count and its index
    // labels, so the page can never disagree with itself. This file is typed,
    // which is exactly why it needs the assertion.
    expect(MECHANIC_ROWS).toHaveLength(MECHANICS.length)
    MECHANIC_ROWS.forEach((row, i) => {
      const n = String(i + 1).padStart(2, '0')
      expect(`row ${i}: ${row.startsWith(`${n}/${String(MECHANICS.length).padStart(2, '0')}`)}`).toBe(
        `row ${i}: true`,
      )
      // Same title, same ORDER — a grid whose rows are shuffled against the
      // page is still two different documents.
      expect(row).toContain(MECHANICS[i].title.toUpperCase())
    })
  })

  it('states each mechanic in the words the page states it in', () => {
    // Only the string-bodied ones: two mechanics render a ReactNode because
    // they interpolate a value (the note cap, the three decision answers), and
    // those are asserted below through the value itself.
    for (const m of MECHANICS) {
      if (typeof m.body !== 'string') continue
      expect(`${m.title}: ${FLAT.includes(m.body)}`).toBe(`${m.title}: true`)
    }
  })
})

describe('every number in the README is the number in the code', () => {
  it('states the note cap the store enforces', () => {
    // Two places print it (the mechanic row and the note paragraph) and both
    // have to move when sanitizeNote's cap does.
    expect(FLAT).toContain(`${NOTE_MAX_LEN} characters`)
    expect(FLAT).toContain(`${NOTE_MAX_LEN}-character note cap`)
  })

  it('lists the cash keys the pad actually ships', () => {
    // "the denominations actually in circulation" is a factual claim about a
    // market; this asserts it is also a factual claim about the product.
    expect(FLAT).toContain(NOTE_DENOMINATIONS_DA.join(' / '))
    expect(FLAT).toContain(NOTE_DENOMINATIONS_DA.join(', '))
  })

  it('counts the lessons, badges and quests that exist', () => {
    expect(FLAT).toContain(`${LESSONS.length}-lesson codex`)
    expect(FLAT).toContain(`${LESSONS.length} collectible one-screen lessons`)
    expect(FLAT).toContain(`${ACHIEVEMENTS.length} earn-only badges`)
    expect(FLAT).toContain(
      `${DEFAULT_QUESTS.length} daily quests (${DEFAULT_QUESTS.filter((q) => q.verified).length} of them verified`,
    )
  })

  it('states the record depth the store actually keeps', () => {
    // "Every run kept, with the line it printed" was false in both documents:
    // DECISION_MAX bounds the record and canonicalDecisions trims from the
    // oldest end on every write. A cap is a number, and this file's rule is
    // that numbers are read from the code — the landing now interpolates
    // DECISION_MAX directly, and these two are its README copies.
    expect(FLAT).toContain(`The last ${DECISION_MAX} runs kept`)
    expect(FLAT).toContain(`The last ${DECISION_MAX} runs are kept`)
    // …and the superseded claim cannot creep back in either document.
    expect(FLAT).not.toMatch(/every run (is )?kept/i)
  })

  it('names the three decision answers the simulator renders', () => {
    // The record's buttons and this sentence come from one array now
    // (DECISION_ANSWERS). Renaming a button renames the claim, or fails here.
    for (const a of DECISION_ANSWERS) expect(FLAT).toContain(a.label)
  })
})

/** Every file that NAMES a card in prose a human will trust. The README is the
    obvious one; index.html's comments and store.ts's quest rationale are the
    two that were also drifting — index.html's are stripped at build
    (scripts/htmlComments.ts) and store.ts's reach nobody at all, which is
    precisely why nothing was pulling them back into line. */
const CARD_NAMING_FILES: ReadonlyArray<readonly [string, string]> = [
  ['README.md', README],
  ['index.html', readFileSync(new URL('../index.html', import.meta.url), 'utf8')],
  ['src/state/store.ts', readFileSync(new URL('./state/store.ts', import.meta.url), 'utf8')],
]

describe('the README names no component that no longer exists', () => {
  it('does not describe the surfaces that were merged away', () => {
    // The consolidation collapsed twelve cards to nine. A README that still
    // walks a reader through "the month card, above the ledger" is describing a
    // build nobody can run — the most expensive kind of documentation, because
    // it reads as authoritative.
    for (const gone of ['MonthCard', 'XpCard', 'CodexCard', 'AchievementsCard', 'Ledger.tsx']) {
      expect(`${gone}: ${FLAT.includes(gone)}`).toBe(`${gone}: false`)
    }
    // "the month card" / "the ledger" as things the user is told to look at.
    // The word "ledger" survives in the day-grouping sense and in
    // engine/ledger.ts, which is why this is anchored to the article.
    expect(FLAT).not.toMatch(/\bthe month card\b/i)
  })

  it('holds every file that names a card to the same roster', () => {
    // Same guard, wider net. A comment naming a deleted component reads as
    // authoritative to the next person in the file, and these two had drifted:
    // store.ts's `review` quest pointed at "the Ledger's 'Recent' list" (that
    // heading was dropped when the ledger merged into ArchiveCard) and
    // index.html attributed the month resist total to "Ledger".
    for (const [name, text] of CARD_NAMING_FILES) {
      for (const gone of ['MonthCard', 'XpCard', 'CodexCard', 'AchievementsCard', 'Ledger.tsx']) {
        expect(`${name} names ${gone}: ${text.includes(gone)}`).toBe(`${name} names ${gone}: false`)
      }
      // "the Ledger" as a surface, capitalised — engine/ledger.ts, ledger.ts's
      // functions and the day-grouping sense of the word all stay legal.
      expect(`${name}: ${/\bthe Ledger\b/.test(text)}`).toBe(`${name}: false`)
    }
  })

  it('points the header image at the asset that is actually committed', () => {
    // og.svg moved out of public/ (nothing on the web fetches it). A broken
    // header image is the first thing a stranger sees of this project.
    const src = /<img src="([^"]+)"/.exec(README)?.[1] ?? ''
    expect(src).toBe('docs/brand/og.svg')
    expect(readFileSync(new URL(`../${src}`, import.meta.url), 'utf8')).toContain('<svg')
  })
})
