/**
 * THE CENSUS'S COMMAND LINE, parsed where a test can reach it.
 *
 * It lived inside run.ts, which calls main() at module load — so importing it
 * to test it would have run a twelve-row census. That is why `--tolerance abc`
 * shipped: it parsed to NaN, every `Math.abs(delta) > NaN` inside
 * checkTolerance was false, and `--check` reported success having compared
 * nothing. A gate that passes silently on a typo is worse than no gate, which
 * is the same argument .github/workflows/ci.yml makes for why a flaky
 * ratio-law threshold must not exist. Splitting the file is the whole fix:
 * argument parsing is pure, and pure things in this tool are tested.
 */

import { ARTIFACT_PATH } from './artifact.ts'

/** Where `--keep-shots` writes when it is given no path. */
export const SHOTS_DIR = 'docs/brand/census-shots'

export interface Options {
  diff: boolean
  check: boolean
  tolerance: number
  only: string | null
  out: string
  keepShots: string | null
  allowDirty: boolean
  windows: boolean
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    diff: false,
    check: false,
    tolerance: 1.0,
    only: null,
    out: ARTIFACT_PATH,
    keepShots: null,
    allowDirty: false,
    windows: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) throw new Error(`census: ${arg} needs a value`)
      i++
      return v
    }
    if (arg === '--diff') options.diff = true
    else if (arg === '--check') options.check = true
    else if (arg === '--allow-dirty') options.allowDirty = true
    else if (arg === '--windows') options.windows = true
    else if (arg === '--only') options.only = next()
    else if (arg === '--out') options.out = next()
    else if (arg === '--tolerance') {
      // Validated into a local before it is assigned, so a bad value can never
      // reach checkTolerance at all. Infinity is rejected with the rest: a
      // tolerance nothing can exceed is a gate that has been turned off while
      // still printing that it ran.
      const value = Number(next())
      if (!Number.isFinite(value) || value < 0) {
        throw new Error('census: --tolerance needs a non-negative number')
      }
      options.tolerance = value
    } else if (arg === '--keep-shots') {
      const peek = argv[i + 1]
      options.keepShots = peek !== undefined && !peek.startsWith('--') ? next() : SHOTS_DIR
    } else throw new Error(`census: unknown flag ${arg}`)
  }
  return options
}
