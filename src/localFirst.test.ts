import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'

/**
 * THE CENTRAL PRODUCT CLAIM, AS A TEST.
 *
 * "No account, no bank link, no server" is the first line of the landing
 * surface, the <title>, the manifest, the README and the og card. Every one of
 * those is a claim about an ABSENCE, and an absence is the one kind of claim no
 * feature test can defend: nothing fails when a module quietly starts calling
 * out. So the claim is asserted over the source tree itself.
 *
 * This is the same instrument design.test.ts uses and for the same reason — the
 * property lives in the source, not in anything a module exports. Read from
 * disk rather than through a `?raw` import because vitest's transform pipeline
 * is not the thing under test here.
 *
 * If a future feature genuinely needs the network, this test is where the
 * argument has to be had — and the marketing copy, the manifest description and
 * the README all have to change in the same commit. That is the point.
 */

const SRC = new URL('./', import.meta.url)

/** Every .ts/.tsx module under src/, tests included: a test that phoned home
    would still be a network call shipped in this repo. */
function sourceFiles(dir: URL, out: URL[] = []): URL[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) sourceFiles(new URL(`${entry.name}/`, dir), out)
    else if (/\.tsx?$/.test(entry.name)) out.push(new URL(entry.name, dir))
  }
  return out
}

/** Comments explain the ban ("no fetch, no socket") constantly, so they go
    before the scan — exactly as design.test.ts strips them before scanning
    px values. Strings stay: a URL passed to something is still a call. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every way a browser module can start a request. `fetch(` is matched with a
    leading word boundary so `prefetch(` or `.fetchRow(` do not trip it —
    `window.fetch(` and a bare `fetch(` both do. */
const NETWORK_APIS: Array<[string, RegExp]> = [
  ['fetch', /(?<![.\w])fetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['importScripts', /\bimportScripts\b/],
  ['navigator.geolocation', /\bgeolocation\b/],
]

/**
 * Every module except this one. This file has to NAME every banned API to ban
 * it, so scanning itself would fail on its own pattern list — the classic
 * scanner-scans-itself problem. The cost is that this single file is
 * unguarded; it holds no product code, and a network call added here would
 * have to be added directly beneath the list forbidding it.
 */
const FILES = sourceFiles(SRC).filter((f) => !f.pathname.endsWith('/localFirst.test.ts'))

describe('local-first, as an enforced absence', () => {
  it('finds the source tree it is supposed to be checking', () => {
    // A walk that silently returned [] would make every case below vacuous.
    expect(FILES.length).toBeGreaterThan(20)
    expect(FILES.some((f) => f.pathname.endsWith('/state/store.ts'))).toBe(true)
  })

  it('reaches the network from nowhere in src', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const [name, re] of NETWORK_APIS) {
        if (re.test(src)) offenders.push(`${file.pathname.split('/src/')[1]}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('has no sign-in, sign-up or token path to have a server for', () => {
    // Trust Rule 7 and the landing's "no account" refusal. Narrow on purpose:
    // these are identifier shapes, not the English words, so copy that SAYS
    // "no account" does not trip the rule it is describing.
    const offenders: string[] = []
    for (const file of FILES) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const re of [/\bsignIn\b/, /\bsignUp\b/, /\baccessToken\b/, /\bauthToken\b/, /\bOAuth\b/]) {
        if (re.test(src)) offenders.push(`${file.pathname.split('/src/')[1]}: ${re.source}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('sells nothing — there is no purchase path to be found', () => {
    // Trust Rule 2 restated as an absence. Same narrowing: "Nothing is for
    // sale" is a string on the landing surface and must not trip its own rule,
    // so the patterns are payment identifiers, not prose.
    const offenders: string[] = []
    for (const file of FILES) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const re of [/\bcheckout\b/i, /\bstripe\b/i, /\bpaypal\b/i, /\bsubscription\b/i, /\biap\b/i]) {
        if (re.test(src)) offenders.push(`${file.pathname.split('/src/')[1]}: ${re.source}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
