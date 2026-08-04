/**
 * CI guard: prove the jsdom environment actually initialised.
 *
 * This pipeline has twice shipped a run that looked healthy while silently
 * executing only part of the suite. Both times the mechanism was the same: a
 * Node/jsdom incompatibility (markAsUncloneable on Node 20, ERR_REQUIRE_ESM on
 * Node 22.6) made the jsdom environment fail to construct, so every DOM test
 * FILE was skipped wholesale. Vitest reports the files that did run as passing
 * — 366 of 544, or 249 of 307 — and the only distress signal is an unhandled
 * error that is easy to read past.
 *
 * A total-count floor would catch it, but a count rots: every round adds tests
 * and someone eventually edits the number instead of investigating. The
 * invariant that does not rot is that the DOM files must appear in the report
 * having actually executed assertions.
 */

import { readFileSync } from 'node:fs'

/** Files that can only run inside jsdom. If either is absent, the env failed. */
const REQUIRED = ['src/App.test.tsx', 'src/Root.test.tsx']

const reportPath = process.argv[2]
if (!reportPath) {
  console.error('usage: node scripts/assert-dom-tests-ran.mjs <vitest-json-report>')
  process.exit(2)
}

let report
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'))
} catch (err) {
  // A missing or unparseable report means the run died before writing one,
  // which is itself a failure — never treat it as "nothing to check".
  console.error(`Could not read the vitest report at ${reportPath}: ${err.message}`)
  process.exit(1)
}

const suites = report.testResults ?? []
const failures = []

for (const required of REQUIRED) {
  // Match on suffix: the report carries absolute paths that differ between a
  // runner and a laptop.
  const suite = suites.find((s) => (s.name ?? '').replace(/\\/g, '/').endsWith(required))
  if (!suite) {
    failures.push(`${required} did not run at all — no entry in the report.`)
    continue
  }
  const count = (suite.assertionResults ?? []).length
  if (count === 0) {
    failures.push(`${required} produced zero assertions — the file was collected but nothing executed.`)
  }
}

if (failures.length > 0) {
  console.error('The jsdom environment did not initialise. The DOM suite did not run:')
  for (const f of failures) console.error(`  - ${f}`)
  console.error(
    '\nThis usually means the Node version and jsdom disagree. Check the Node' +
      '\nfloor in .github/workflows/ci.yml, .nvmrc and the engines field, and' +
      "\nread the run's unhandled errors — a green test count above means nothing" +
      '\nwhen whole files were skipped.',
  )
  process.exit(1)
}

const total = report.numTotalTests ?? 0
console.log(`jsdom environment OK — DOM suites ran, ${total} tests total.`)
