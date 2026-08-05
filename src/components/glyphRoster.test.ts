import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { GLYPH_NAMES } from './Glyph.tsx'
import { ACHIEVEMENTS } from '../engine/achievements.ts'

/**
 * NO ORPHAN GLYPHS — the standing form of a deletion rule, not a style check.
 *
 * The collection sheet (a 32-tile lesson codex and a 9-tile badge shelf) was
 * deleted this round, and it took the only call sites of two marks with it:
 * `medal` sat on an earned badge tile, `locked` on an unreached codex tile.
 * Both survived the deletion as drawn paths nothing rendered, each with a line
 * in Glyph.tsx's text-alternative table naming a tile no build produces.
 *
 * That is the specific failure this file exists to stop repeating: a glyph
 * nobody renders cannot HAVE a text alternative, so §8's drawn set and §12.8's
 * "every glyph is aria-hidden, the meaning is in real text beside it" quietly
 * stop describing the tree. An unrendered mark is also unmeasurable — the
 * colour census classifies pixels, and a path that paints none is outside every
 * contrast pair the design system claims to have checked.
 *
 * Source scan rather than a render assertion, for the same reason
 * localFirst.test.ts scans the tree: the claim is an ABSENCE (no glyph without
 * a call site), and an absence is the one thing no feature test defends.
 */

const SRC = new URL('../', import.meta.url)

/** Every non-test source file under src/, as text. */
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(dir, SRC), { withFileTypes: true })) {
      const path = `${dir}${entry.name}`
      if (entry.isDirectory()) {
        walk(`${path}/`)
        continue
      }
      if (/\.test\.tsx?$/.test(entry.name)) continue
      if (!/\.tsx?$/.test(entry.name)) continue
      out.push({ path, text: readFileSync(new URL(path, SRC), 'utf8') })
    }
  }
  walk('')
  return out
}

/**
 * Glyph names any surface can actually reach.
 *
 * Two forms, because the component is called both ways: a literal on the tag
 * (`<Glyph name="shield" />`, and the ternary `name={muted ? 'muted' :
 * 'sound'}`), and indirectly through a companion's `glyph:` field, which is
 * where the nine pets are named. `[^>]*` crosses newlines, so a call site that
 * wraps over several lines is still read.
 */
function referencedNames(): Set<string> {
  const found = new Set<string>()
  for (const { path, text } of sources()) {
    if (path === 'components/Glyph.tsx') continue // the definitions, not a call site
    for (const tag of text.matchAll(/<Glyph\b[^>]*>/g)) {
      // The `name` attribute only — a sibling `className="stage-flame"` is not
      // a glyph reference, and reading every literal on the tag would count it.
      for (const attr of tag[0].matchAll(/name=(?:"([a-z][\w-]*)"|\{([^}]*)\})/g)) {
        if (attr[1] !== undefined) found.add(attr[1])
        else for (const lit of attr[2].matchAll(/'([a-z][\w-]*)'/g)) found.add(lit[1])
      }
    }
    for (const pet of text.matchAll(/glyph:\s*'([a-z][a-zA-Z0-9-]*)'/g)) found.add(pet[1])
  }
  return found
}

describe('the glyph roster', () => {
  it('draws every mark some surface renders, and no mark none does', () => {
    const referenced = referencedNames()
    // Both directions in one assertion, sorted so a failure names the drift.
    // LEFT OVER (drawn, never rendered) is the deletion residue this file is
    // for; MISSING (rendered, never drawn) TypeScript already refuses, and the
    // assertion keeps it true for a name reached through a data field.
    expect([...GLYPH_NAMES].sort()).toEqual([...referenced].sort())
  })

  it('keeps the two marks the collection sheet took with it out', () => {
    // Named explicitly, because the case above only fails once someone ALSO
    // deletes the call site. These two never had one after the sheet went, and
    // re-adding either without a surface is the exact regression.
    for (const gone of ['medal', 'locked']) {
      expect(`${gone}: ${GLYPH_NAMES.includes(gone as never)}`).toBe(`${gone}: false`)
    }
  })

  it('draws all nine companions', () => {
    // The badge shelf was the other half of the deleted sheet, so the pet strip
    // beside the score is now the ONLY persistent surface a badge unlock
    // reaches (§10: the sparkle may never carry the moment alone). A pet naming
    // a glyph the set does not draw would render an empty mask there.
    for (const a of ACHIEVEMENTS) {
      expect(`${a.id}: ${GLYPH_NAMES.includes(a.pet.glyph)}`).toBe(`${a.id}: true`)
    }
  })
})
