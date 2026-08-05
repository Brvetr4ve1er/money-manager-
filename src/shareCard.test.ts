import { describe, it, expect } from 'vitest'
/* From disk, exactly as design.test.ts and localFirst.test.ts read theirs: the
   share card lives in index.html, which no module imports and no render can
   reach. The ambient declaration is in src/vite-env.d.ts — no dependency.

   A .ts file, NOT .tsx, and that is load-bearing: vite.config.ts routes
   *.test.tsx to jsdom, where import.meta.url is an http:// URL and
   readFileSync rejects it. Nothing here needs a DOM anyway. */
import { readFileSync } from 'node:fs'

/**
 * THE SHARE CARD — the surface a forwarded link actually shows.
 *
 * In the target market a link arrives in WhatsApp, so the unfurl IS the landing
 * page for most first contacts: one image, one headline, one line of text. It
 * is also the surface nobody looks at while shipping, which is exactly why it
 * drifts. These cases keep it (a) saying one thing rather than three copies of
 * three things, and (b) leading with the same mechanic the page leads with.
 */
describe('the share card says what the page says', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const meta = (attr: 'property' | 'name', key: string) =>
    new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(HTML)?.[1] ?? ''

  it('keeps the OpenGraph and Twitter descriptions one string, not two', () => {
    // Two hand-maintained copies of one sentence is a guaranteed divergence:
    // whichever one the next editor does not scroll to is the one that rots.
    const og = meta('property', 'og:description')
    expect(og).not.toBe('')
    expect(meta('name', 'twitter:description')).toBe(og)
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'))
  })

  it('leads the unfurl with the mechanic, and claims nothing the app lacks', () => {
    for (const text of [
      meta('property', 'og:description'),
      meta('name', 'twitter:description'),
      meta('name', 'description'),
    ]) {
      // The resist row, named — the same reason .lp-share now carries.
      expect(text.toLowerCase()).toContain('the thing you did not buy')
      // The three refusals stay, because they are the terms and they are true.
      expect(text.toLowerCase()).toContain('no account')
      expect(text.toLowerCase()).toContain('no bank link')
      // §7.4: no exclamation marks, and §7.5's word ban applies to the copy a
      // stranger reads first as much as to the copy on the page.
      expect(text).not.toContain('!')
      expect(text).not.toMatch(/\b(premium|curated|elevated|seamless|journey|unlock(ed|s)?|crafted)\b/i)
      // Nothing automatic is promised on a card whose whole point is that
      // nothing is automatic.
      expect(text).not.toMatch(/\bsync\b|\bautomatic\b|\bbank feed\b(?! can)/i)
    }
  })
})
