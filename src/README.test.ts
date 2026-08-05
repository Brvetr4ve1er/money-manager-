import { describe, it, expect } from 'vitest'
/* From disk, like shareCard.test.ts and design.test.ts: the subject is a file
   nothing imports and no render can reach. A .ts file, not .tsx — jsdom gives
   import.meta.url an http:// URL that readFileSync rejects. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { MECHANICS, HAND_OFF_LEAD } from './components/Landing.tsx'
import { RESIST_LABEL } from './components/LogCard.tsx'
import { WINDOW_DAYS, EXPAND_STEP_DAYS, resistedChipLabel } from './components/ArchiveCard.tsx'
import { resistedThisMonthDA, WEEK_DAYS } from './engine/ledger.ts'
import { NO_SCORE_LINE } from './components/HeroCard.tsx'
import { sampleLedgerRows } from './content/sampleLedger.ts'
import {
  todayISO,
  NOTE_MAX_LEN,
  DECISION_ANSWERS,
  DECISION_MAX,
  CHECK_BACK_ANSWERS,
  CHECK_BACK_DAYS,
} from './state/store.ts'
import { NOTE_DENOMINATIONS_DA } from './engine/keypad.ts'
import { CALIBRATION_DAYS } from './engine/profile.ts'
import { LESSONS } from './content/lessons.ts'
import { ACHIEVEMENTS } from './engine/achievements.ts'

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

  it('counts the tiles on the card it says it deleted', () => {
    // A DELETED surface is the one thing nobody can check by looking, so its
    // description rots without symptom: the README, useRewards.ts and App.test
    // all called the codex grid "32-tile" and it was never 32 at any commit —
    // the grid rendered LESSONS.map and LESSONS has been 30 since it shipped.
    // The paragraph is worth keeping (it is the record of WHY the card went),
    // so the numbers in it get held to the rosters that produced them.
    expect(FLAT).toContain(`${LESSONS.length}-tile codex grid`)
    expect(FLAT).toContain(`${ACHIEVEMENTS.length}-tile badge shelf`)
  })

  it('states the disclosure step the record card actually opens on', () => {
    // Added in round 5 with the windowed expand. Two numbers a reader can
    // measure against the product in one press, so both are read from
    // ArchiveCard rather than typed here.
    expect(FLAT).toContain(`opens on the last ${WINDOW_DAYS} days`)
    expect(FLAT).toContain(`grows ${EXPAND_STEP_DAYS} more per press`)
    // The load-bearing half: a stepped window must never read as a shorter
    // record, and the README has to say so or it is describing a truncation.
    expect(FLAT).toContain('Nothing is hidden by it')
  })

  it('counts the lessons and badges that exist, and sells no quest at all', () => {
    expect(FLAT).toContain(`${LESSONS.length}-lesson codex`)
    expect(FLAT).toContain(`${ACHIEVEMENTS.length} earn-only badges`)
    // A COUNT IS EXACTLY THE CLAIM THAT ROTS WHEN A FEATURE IS REMOVED rather
    // than added — this file described four quests and a collectible grid for
    // a build with three and neither. The quest roster is now zero, so the
    // check is that no count of them survives anywhere in the file: a deleted
    // surface that the README still sells is a half-done deletion.
    expect(FLAT).not.toMatch(/\d+ daily quests/)
    expect(FLAT).not.toContain('daily quests (')
    expect(FLAT).not.toContain(`${LESSONS.length} collectible one-screen lessons`)
    // …and the deletion is DESCRIBED, not silently dropped: the file has to say
    // that nothing the user earned got smaller with it.
    expect(FLAT).toContain('The daily quests are deleted')
  })

  it('states the check-back horizon and answers the app actually ships', () => {
    // Same rule as the note cap and the decision answers: a number and a set of
    // labels are values, so they are read from the code rather than typed
    // beside it. The horizon appears twice (the mechanic row and the paragraph)
    // and both have to move when CHECK_BACK_DAYS does.
    expect(FLAT).toContain(`${CHECK_BACK_DAYS} days after "Bought it"`)
    expect(FLAT).toContain(`Check back in ${CHECK_BACK_DAYS} days.`)
    for (const a of CHECK_BACK_ANSWERS) expect(FLAT).toContain(a.label)
    // AND THE REFUSALS, because they are the load-bearing half of the claim.
    // The regret prompt and the tally are the two things this mechanic is
    // defined by not doing (§12.6), and a README that quietly drops them is
    // describing a different feature.
    expect(FLAT).toContain('It never asks whether it was worth it')
    expect(FLAT).toContain('It never counts the answers')
  })

  it('states the week window card 01 prints while it withholds the score', () => {
    // MECHANICS[0] became a ReactNode this round — it interpolates WEEK_DAYS —
    // so the string loop above skips it, exactly as it skips the note cap and
    // the decision answers. That is the trade this file makes for binding a
    // number, and the price is an explicit case here. Without one the landing's
    // first badge and this file's first mechanic row could drift apart in the
    // one direction nothing else watches.
    expect(FLAT).toContain(`Your last ${WEEK_DAYS} days stand there`)
    // The README's own paragraph on the same behaviour, which is the fuller
    // copy of it and the one a reader lands on from the repo link.
    expect(FLAT).toContain(`prints your last ${WEEK_DAYS} days`)
    // The disclosure is the app's own string in both documents (the landing
    // quotes HeroCard's constant; this is the README's copy of it).
    expect(FLAT).toContain(NO_SCORE_LINE)
  })

  it('claims the same absence of a verdict the landing claims', () => {
    // THE STRANGER TEST'S CLAIM, and it exists in two documents, which is this
    // file's whole subject. Each of these is a behaviour noVerdict.test.tsx
    // asserts against the rendered product, so a README that kept the promise
    // after the product dropped it would be caught there — and a README that
    // dropped the promise while the product kept it is caught here.
    expect(FLAT).toContain('Nothing here grades you')
    // The rules band's own line, in the README's copy of it.
    expect(FLAT).toContain('Days are counted, never chained')
    expect(FLAT).toContain('no target line, no average and no projection')
    // …and the register itself, stated rather than implied: §7.1 bans the
    // coddling half as hard as the punitive half, and a later editor asked to
    // soften this file has to delete this sentence to do it.
    expect(FLAT).toContain('The dryness is the respect')
    // The document that makes the claim is held to it too.
    expect(FLAT).not.toMatch(/don'?t worry|no judg|you'?ve got this|guilt-free/i)
  })

  it('states the calibration horizon the engine actually uses', () => {
    // Trust Rule 5's number. It was typed as a literal 90 in README.md and in
    // the landing's rules band while CALIBRATION_DAYS lived in engine/profile
    // and HeroCard rendered it — three copies, one of them bound. Same rule as
    // the note cap and the check-back horizon: a number is a value, so it is
    // read from the code. The landing interpolates the constant now; this is
    // the README's copy of it.
    expect(FLAT).toContain(`Under ${CALIBRATION_DAYS} days it says it is still calibrating`)
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

  it('leads the hand-off with the sentence the landing page leads with', () => {
    /**
     * THE PITCH EXISTS IN TWO DOCUMENTS. This file's whole thesis is that the
     * second copy of a claim is the one that rots, and the pitch is the claim
     * with the most to lose by rotting: the landing page sells it to a
     * stranger, this file sells it to whoever the repo link reaches, and for
     * four rounds they were two independently typed paragraphs that happened
     * to agree.
     *
     * They are one string now — Landing.tsx's HAND_OFF_LEAD — so a rewrite of
     * the fold either rewrites this file or fails here.
     */
    expect(FLAT).toContain(HAND_OFF_LEAD)
    // And the button both documents tell a reader to press is LogCard's own
    // label, not a remembered one.
    expect(FLAT).toContain(RESIST_LABEL)
    // The refusals that keep the claim honest, in both documents: full XP is
    // claimed, a clean SCORE is not (profile.ts feeds yielded impulses to
    // impulseControlScore, so "never counted against you" would be false).
    expect(FLAT).toContain('full XP')
    expect(FLAT).not.toMatch(/never counted against you|no penalty for buying/i)
  })

  it('prints the resisted line the record prints, over the rows the page shows', () => {
    /**
     * THE ONE FIGURE IN THE PITCH.
     *
     * "It sums into one line at the head of the record card: 3,500 DA resisted
     * this month" is the sentence that makes the mechanic land, and until this
     * round the number in it was typed — in the file whose entire thesis is
     * that a typed copy of a value is the copy that rots. It happened to be
     * right; nothing was holding it there. Change a sample row's amount and the
     * landing page's card would print one figure while this paragraph printed
     * another, with no test between them.
     *
     * It is now the card's own label over the page's own rows, which is the
     * same binding the landing uses for the same sentence (Root.test asserts
     * the other end, including that the shot beside it prints the identical
     * string).
     */
    const line = resistedChipLabel(resistedThisMonthDA(sampleLedgerRows(todayISO()), todayISO()))
    expect(FLAT).toContain(line)
    // The trust boundary beside it, in both documents: this total is the user's
    // own resist story and NOT a health input (Trust Rule 1 — the score reads
    // money that moved).
    expect(FLAT).toContain('The total is not a score input')
  })

  it('argues manual entry from the mechanic, not from the missing integration', () => {
    // MANUAL-FIRST AS THE POSITION. The landing page makes this argument above
    // the fold (Root.test) and this file is its second copy, so it gets the same
    // treatment as the pitch sentence above: the claim is that a feed imports
    // EVENTS and not buying is not one, which is why the resist row is a
    // property of the manual product rather than a consolation for it.
    expect(FLAT).toContain('A feed imports events')
    expect(FLAT).toContain('Not buying is not an event')
    // …and it is never framed as a shortfall waiting on a roadmap. Same ban the
    // landing carries, on the file that describes the same position.
    expect(FLAT).not.toMatch(/for now|coming soon|until we|we plan|coming later/i)
  })

  it('names the three decision answers the simulator renders', () => {
    // The record's buttons and this sentence come from one array now
    // (DECISION_ANSWERS). Renaming a button renames the claim, or fails here.
    for (const a of DECISION_ANSWERS) expect(FLAT).toContain(a.label)
  })
})

describe('every command the README documents is a command that exists', () => {
  /**
   * The "Run it" block is an instruction, not a description: a reader types
   * what it says. A documented script that package.json does not define fails
   * on the first try and costs the reader their trust in the rest of the file;
   * an UNdocumented script is worse in the other direction — `npm run census`
   * is now load-bearing (a stale docs/brand/census.json fails the suite), and a
   * contributor who has never heard of it gets a red suite with no way in.
   */
  const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>
  }

  it('documents no script package.json does not define', () => {
    const documented = [...README.matchAll(/^npm run ([a-z:]+)/gm)].map((m) => m[1])
    expect(documented.length).toBeGreaterThan(0)
    for (const name of new Set(documented)) {
      expect(`npm run ${name}: ${name in PKG.scripts}`).toBe(`npm run ${name}: true`)
    }
  })

  it('documents the census, because a stale artifact now fails the suite', () => {
    expect(PKG.scripts.census).toContain('scripts/census/run.ts')
    expect(FLAT).toContain('npm run census')
    // The subsection, not just the command line: the census has three
    // properties a reader has to know before trusting a number out of it —
    // it is not a gate, it is not portable across machines, and its
    // denominator is the whole document rather than the viewport.
    expect(FLAT).toContain('### The colour census')
    expect(FLAT).toContain('docs/brand/census.json')
    expect(FLAT).toContain('inputsHash')
    // The fourth property, added in round 5 and the one most likely to be lost:
    // the tool reads each page TWICE, and the document average — the figure
    // every round before this one steered by — is not something anybody looks
    // at. A README that documents only the headline number recreates the
    // misreading. `scrollingForm` is the key in the artifact, so naming it here
    // is what lets a reader find the second reading at all.
    expect(FLAT).toContain('scrollingForm')
  })
})

/** Every file that NAMES a card in prose a human will trust. The README is the
    obvious one; index.html's comments and store.ts's quest rationale are the
    two that were also drifting — index.html's are stripped at build
    (scripts/htmlComments.ts) and store.ts's reach nobody at all, which is
    precisely why nothing was pulling them back into line.

    achievements.ts joined in round 5 and it is the worst offender of the four,
    because its strings are not comments: a badge called "Ten in the Ledger"
    was read out in a toast and sent the user looking for a card deleted two
    rounds earlier. Copy a user can SEE naming a surface that no longer exists
    is the failure this roster was built for; it just had not been pointed at
    the file where the copy is data. */
const CARD_NAMING_FILES: ReadonlyArray<readonly [string, string]> = [
  ['README.md', README],
  ['index.html', readFileSync(new URL('../index.html', import.meta.url), 'utf8')],
  ['src/state/store.ts', readFileSync(new URL('./state/store.ts', import.meta.url), 'utf8')],
  [
    'src/engine/achievements.ts',
    readFileSync(new URL('./engine/achievements.ts', import.meta.url), 'utf8'),
  ],
]

/** Components no build renders. QuestCard is the newest entry and the second
    DELETION rather than a merge: its one control paid XP for a claim the app
    cannot observe, and with that row gone the card had none at all (see
    XpStrip, which is what is left of it). CollectionCard was the first: the codex grid and the badge shelf were
    62.5% of the card stack's rendered elements on install day (a jsdom render
    probe at a2d4e6d, the last tree that rendered them — the same figure and the
    same stamp README.md carries) with no control on either, and a README that
    still walks a reader to them is describing a build nobody can run. */
const GONE = [
  'MonthCard',
  'XpCard',
  'CodexCard',
  'AchievementsCard',
  'CollectionCard',
  'QuestCard',
  'Ledger.tsx',
] as const

/**
 * THE CLAIM SURFACES — the three documents that describe this product to
 * somebody who is not holding the code: the repo's front page, the head a
 * crawler and a SERP read, and the page a stranger lands on. GONE above is a
 * TYPED roster and it only bans what a human remembered to add to it; this set
 * gets the derived check below, which needs nobody to remember anything.
 *
 * Root.test.tsx and the components' own headers are deliberately NOT in here.
 * They are allowed to say "it said <Ledger> until this round" — a rationale
 * that records a deletion is the thing this codebase writes comments FOR, and a
 * ban that cannot tell a record from a pointer would delete the record.
 */
const CLAIM_SURFACES: ReadonlyArray<readonly [string, string]> = [
  ['README.md', README],
  ['index.html', readFileSync(new URL('../index.html', import.meta.url), 'utf8')],
  [
    'src/components/Landing.tsx',
    readFileSync(new URL('./components/Landing.tsx', import.meta.url), 'utf8'),
  ],
]

/** Every .ts/.tsx module under src/, by basename — the roster the check below
    resolves component names against. WALKED OFF THE DISK, which is the whole
    point: a deleted component updates this by being deleted, where the GONE
    list above updates only when somebody remembers to type into it. */
const MODULES = (() => {
  const names = new Set<string>()
  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir))
      else if (/\.tsx?$/.test(entry.name)) names.add(entry.name.replace(/\.tsx?$/, ''))
    }
  }
  walk(new URL('.', import.meta.url))
  return names
})()

describe('every file and component the claim surfaces point at exists', () => {
  /**
   * THE DRIFT THIS ROUND ACTUALLY FOUND, made unrepeatable.
   *
   * Landing.tsx's jump-target rationale read "Same construction as
   * LogCard/QuestCard/SimCard" for a tree in which QuestCard had been deleted —
   * a sentence sending the next contributor to a file that is not there. The
   * GONE roster above would have caught it, but only because a human had
   * already written `QuestCard` into GONE; the round before, `Ledger.tsx` sat
   * in Root.test's own header for two rounds with nothing looking at it.
   *
   * These two cases need no roster. They ask the filesystem.
   */
  it('names no component whose module was deleted', () => {
    // Two forms, and they are the two a reader FOLLOWS: the JSX reference
    // (`<ArchiveCard>`) and the bare card name (`LogCard`). Prose about "the
    // quest card" in lower case is not a pointer and is not matched — a
    // document may describe a surface it deleted, it may not send anyone to it.
    for (const [name, text] of CLAIM_SURFACES) {
      const named = new Set([
        ...[...text.matchAll(/<([A-Z][A-Za-z0-9]*)>/g)].map((m) => m[1]),
        ...[...text.matchAll(/\b([A-Z][A-Za-z0-9]*(?:Card|Strip|Shell))\b/g)].map((m) => m[1]),
      ])
      // Non-empty, or the regexes rotted rather than the docs improving.
      expect(`${name} names components: ${named.size > 0}`).toBe(`${name} names components: true`)
      for (const component of named) {
        expect(`${name} -> ${component}: ${MODULES.has(component)}`).toBe(
          `${name} -> ${component}: true`,
        )
      }
    }
  })

  it('points at no repo path that is not on disk', () => {
    // The README's "Project layout" is thirty-odd paths and it is the section a
    // new contributor navigates by; index.html and Landing.tsx cite modules for
    // every claim they make. A path that stops resolving is the same defect as
    // a deleted component with its name still in the copy, one level up.
    for (const [name, text] of CLAIM_SURFACES) {
      const paths = new Set(
        [...text.matchAll(/\b(?:src|scripts|docs|public)\/[A-Za-z0-9_./-]+/g)]
          // Trailing sentence punctuation is not part of the path.
          .map((m) => m[0].replace(/[.,;:)]+$/, '')),
      )
      expect(`${name} cites paths: ${paths.size > 0}`).toBe(`${name} cites paths: true`)
      for (const p of paths) {
        const exists = existsSync(new URL(`../${p}`, import.meta.url))
        expect(`${name} -> ${p}: ${exists}`).toBe(`${name} -> ${p}: true`)
      }
    }
  })
})

/**
 * THE ENGINE AND STATE HEADERS ARE A CLAIM SURFACE TOO, and the round-6 quest
 * deletion proved it: `DEFAULT_QUESTS` survived its own deletion in four
 * comment sites across engine/xp.ts and engine/achievements.ts — the two files
 * whose headers ARE the spec for the grant rules — because the claim-surface
 * check above walks only README.md, index.html and Landing.tsx. A pointer at a
 * constant that no longer exists is the same defect as a pointer at a deleted
 * component, one level down, and "a human has to remember" is the failure mode
 * this whole file was written to end.
 *
 * The subject is the SCREAMING_SNAKE register only. That is the codebase's own
 * spelling for a module constant or a reducer action type, so it is a pointer
 * by construction, where a lower-case word in prose may just be English.
 */
describe('every constant the engine and state headers point at exists', () => {
  const walk = (dir: URL, out: URL[] = []): URL[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir), out)
      else if (/\.tsx?$/.test(entry.name)) out.push(new URL(entry.name, dir))
    }
    return out
  }
  const SRC = walk(new URL('.', import.meta.url))

  /** Everything a SCREAMING_SNAKE name in a comment could legitimately mean:
      a declaration anywhere under src/ (exported or not — a header may explain
      its own file's private constant) and every single-quoted string literal,
      which is how reducer action types like LOG_TX are spelled.

      TESTS ARE NOT A SOURCE OF TRUTH HERE, and leaving them in made the roster
      self-satisfying: this file names DEFAULT_QUESTS in its own control below,
      which would have re-declared the very symbol the control asserts is gone. */
  const DECLARED = (() => {
    const names = new Set<string>()
    for (const file of SRC.filter((u) => !/\.test\.tsx?$/.test(u.pathname))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(
        /(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
      )) {
        names.add(m[1])
      }
      for (const m of text.matchAll(/'([^'\\\n]*)'/g)) names.add(m[1])
    }
    return names
  })()

  /** Comment blocks and runs of line comments, in the spec files themselves. */
  const HEADERED = SRC.filter((u) => /\/(engine|state)\/[^/]+\.ts$/.test(u.pathname) && !u.pathname.includes('.test.'))

  it('resolves every SCREAMING_SNAKE pointer, or says the thing is gone', () => {
    // A comment MAY name a deleted symbol — "the grant used to travel through
    // COMPLETE_QUEST" is exactly the kind of record this codebase writes
    // comments for, and a check that could not tell a record from a pointer
    // would delete the record (see the claim-surface header above). So the
    // exemption is earned in the same block: say it is gone, and the name is
    // history rather than a direction.
    const GONE_MARKER = /\b(deleted|gone|retired|no longer|used to|was removed|dropped)\b/i
    const dangling: string[] = []
    let scanned = 0
    for (const file of HEADERED) {
      const text = readFileSync(file, 'utf8')
      const name = file.pathname.split('/').slice(-2).join('/')
      for (const block of text.matchAll(/\/\*[\s\S]*?\*\/|(?:^[ \t]*\/\/[^\n]*\n?)+/gm)) {
        for (const m of block[0].matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)) {
          scanned++
          if (DECLARED.has(m[1])) continue
          if (GONE_MARKER.test(block[0])) continue
          dangling.push(`${name} points at ${m[1]}, which nothing declares`)
        }
      }
    }
    // Non-empty, or the regex rotted rather than the headers improving.
    expect(`pointers scanned: ${scanned > 20}`).toBe('pointers scanned: true')
    expect([...new Set(dangling)]).toEqual([])
  })

  it('would still catch a deleted constant (the check has teeth)', () => {
    // The positive control the round-6 miss deserves: DEFAULT_QUESTS is gone
    // from the tree, so it must not resolve — if it ever did, the roster above
    // has stopped meaning "declared here".
    expect(DECLARED.has('DEFAULT_QUESTS')).toBe(false)
    expect(DECLARED.has('XP_REWARDS')).toBe(true)
    expect(DECLARED.has('RESIST_XP_DAILY_CAP')).toBe(true)
    // …and the action types, which are string literals rather than symbols.
    expect(DECLARED.has('READ_LESSON')).toBe(true)
    expect(DECLARED.has('COMPLETE_QUEST')).toBe(false)
  })
})

describe('the README names no component that no longer exists', () => {
  it('does not describe the surfaces that were merged away', () => {
    // The consolidation collapsed twelve cards to nine. A README that still
    // walks a reader through "the month card, above the ledger" is describing a
    // build nobody can run — the most expensive kind of documentation, because
    // it reads as authoritative.
    for (const gone of GONE) {
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
      for (const gone of GONE) {
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
