/**
 * THE STALENESS AUTHORITY.
 *
 * ROUND 3'S FAILURE, STATED MECHANICALLY: screenshots were taken at 07:52, the
 * tree was committed at 10:08, and the 07:52 numbers were published as a
 * description of the 10:08 tree. Round 4 inherited them and had to throw the
 * premise away — the phone had moved from a published 20.4% field to a
 * measured 52.9%, and the dark phone's graphite from 52.6% to 3.3%, an
 * inverted failure mode nobody knew about.
 *
 * A commit SHA in the artifact would NOT have caught that. Round 3 would have
 * stamped the 07:52 SHA and the 10:08 commit would still have shipped quoting
 * the old numbers. What catches it is a hash over CONTENT: measuring at 07:52
 * and committing at 10:08 is perfectly fine IF nothing visual changed in
 * between, and if something did, the hash differs and a test in the ordinary
 * suite says so by name.
 *
 * So docs/brand/census.json carries the SHA as provenance only, and
 * `inputsHash` is the thing enforced. census.test.ts asserts
 *   inputsHash() === census.json.inputsHash
 * and fails with the command to run. Edit app.css, commit without re-running
 * the census, and the 626-test floor goes red.
 *
 * THE COST, STATED PLAINLY: a contributor who edits a stylesheet now needs a
 * working Chromium locally to make the suite green again. There is deliberately
 * no environment-variable escape hatch — a gate with a documented bypass is a
 * gate that gets bypassed, and the convention this replaces (an agent's memory
 * plus a prose comment) had an implicit bypass at all times. The advisory CI
 * job in the README's census section is the intended relief valve: it produces
 * a correct artifact for a browserless contributor to commit.
 *
 * WHAT COUNTS AS A PIXEL INPUT. The design brief enumerated index.html, the
 * stylesheets, src/**''/*.tsx, src/components/*.ts and src/content/*.ts. This
 * implements the SENTENCE that enumeration was serving — "every file that can
 * change a pixel" — which is strictly wider: engine/healthScore.ts decides the
 * number the hero prints, state/store.ts decides what survives a load, and
 * hooks/ decide what is on screen at rest. All of src/ (minus tests and
 * ambient declarations) is in. A hole in the staleness authority is round 3's
 * defect wearing a different hat, and the enumeration had three.
 *
 * The census's own pixel-determining modules are in too: changing the bucket
 * map, the classifier or a fixture moves the numbers exactly as surely as
 * changing a stylesheet does. chrome.ts, serve.ts, png.ts and run.ts are NOT —
 * they carry the measurement out but do not decide what is measured, and
 * including them would make every refactor of the driver look like a visual
 * change.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'

export const REPO_ROOT = new URL('../../', import.meta.url)

/** Test files and ambient .d.ts declarations render nothing. */
const IGNORED = /\.test\.tsx?$|\.d\.ts$/

interface Rule {
  dir: string
  extensions: string[]
  recursive: boolean
}

const RULES: Rule[] = [
  { dir: 'src', extensions: ['.ts', '.tsx', '.css'], recursive: true },
  { dir: 'scripts/census/fixtures', extensions: ['.json'], recursive: false },
]

/** Named one by one because only these four of the census's own files can
    move a measured number. See the header.

    composition.ts is here because it decides WHERE the third reading's
    boundaries fall — its COMPOSITION_SCRIPT is a rule about which DOM nodes are
    grounds, and changing that rule re-cuts every section in the artifact
    exactly as surely as changing the bucket map re-buckets every pixel. It is
    not a driver file: chrome.ts and png.ts carry a measurement out, this one
    defines it. */
const CENSUS_INPUTS = [
  /* artifact.ts is here for the reason composition.ts is, and its absence was a
     hole rather than a decision. It holds censusPixels, windowTops,
     scrollingFormBreaches and now censusSliding — i.e. it decides what every
     number in the file MEANS, which is the header's own criterion. The reason
     it was out is stated in artifact.ts's BUCKET_NOTE as a defect: a hard-coded
     paragraph there disagreed with the rows block of the same file for three
     rounds and "because artifact.ts is deliberately outside CENSUS_INPUTS the
     staleness hash can never turn red over it". It can now. The cost is that a
     comment edit in that file forces a re-census, which is the cost palette.ts
     has always carried for the same reason. */
  'scripts/census/artifact.ts',
  'scripts/census/composition.ts',
  'scripts/census/determinism.ts',
  'scripts/census/matrix.ts',
  'scripts/census/palette.ts',
]

/**
 * Files at the repo root that decide pixels without being src/ or census code.
 *
 * index.html is the obvious one. THE BUILD CONFIG IS THE ONE THAT WAS MISSING:
 * serve.ts builds through Vite's Node API, so every census run loads
 * vite.config.ts — whose `distribution` plugin calls stripHtmlComments() and
 * TRANSFORMS the served index.html on every build. A change to `base`, to the
 * plugin list, to build.cssTarget or to that transform moves what the browser
 * renders while leaving inputsHash untouched, which is a hole in the staleness
 * authority, which is round 3's defect wearing a different hat. This file's own
 * stated scope is "every file that can change a pixel"; these two are in it.
 */
const ROOT_INPUTS = ['index.html', 'vite.config.ts', 'scripts/htmlComments.ts']

function walk(dir: string, rule: Rule, out: string[]): void {
  const entries = readdirSync(new URL(`${dir}/`, REPO_ROOT), { withFileTypes: true })
  // Sorted at every level, so the list is identical on every filesystem —
  // readdir order is not specified and differs between ext4 and APFS.
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (rule.recursive) walk(path, rule, out)
      continue
    }
    if (IGNORED.test(entry.name)) continue
    if (rule.extensions.some((ext) => entry.name.endsWith(ext))) out.push(path)
  }
}

/** Repo-relative paths, sorted. The declared list, resolved against the tree. */
export function pixelInputs(): string[] {
  const out = [...ROOT_INPUTS, ...CENSUS_INPUTS]
  for (const rule of RULES) walk(rule.dir, rule, out)
  return out.sort()
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * sha256 over `path\0sha256(content)\n` lines, sorted by path.
 *
 * Per-file digests rather than one stream over concatenated bytes: the form
 * survives a file being renamed (the hash changes, correctly) and makes the
 * intermediate list printable when someone has to debug WHICH file moved.
 */
export function inputsHash(paths: string[] = pixelInputs()): string {
  const lines = paths
    .slice()
    .sort()
    .map((p) => `${p}\0${sha256(readFileSync(new URL(p, REPO_ROOT)))}\n`)
    .join('')
  return `sha256:${sha256(lines)}`
}

/** sha256 of one repo-relative file, in the artifact's `sha256:` form. */
export function fileHash(path: string): string {
  return `sha256:${sha256(readFileSync(new URL(path, REPO_ROOT)))}`
}
