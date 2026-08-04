/**
 * THE COLOUR CENSUS — measure what colour Ember actually is, and commit the
 * answer.
 *
 *   npm run census                 measure every row, write docs/brand/census.json
 *   npm run census -- --diff       measure, print what moved, write nothing
 *   npm run census -- --only app.375
 *   npm run census -- --windows      print the per-screen table, not just the mean
 *   npm run census -- --keep-shots
 *   npm run census -- --check --tolerance 1.0
 *
 * WHY THIS EXISTS. Four rounds of brand work were steered by pixel percentages
 * that lived in an agent's recollection and in prose comments. Round 3 shot its
 * screenshots at 07:52, committed at 10:08, and published the 07:52 numbers as
 * a description of the committed tree; round 4 inherited them and had to
 * discard the premise before it could start. The phone had moved from a
 * published 20.4% field to a measured 52.9%, and the dark phone's graphite from
 * 52.6% to 3.3% — the dark failure mode had inverted and nobody knew. The fix
 * is not a better memory. It is a committed artifact plus a hash that a test
 * can check (scripts/census/inputs.ts).
 *
 * WHAT IS DELIBERATELY NOT HERE: a pass/fail gate on the ratio law. The law is
 * a TARGET, not a direction, and this round exists because two screens
 * overshot it. Any naive gate would have blocked the correct work. See
 * artifact.ts's checkTolerance for the one gate that is offered, and the
 * README for why it is opt-in and advisory.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
  ARTIFACT_PATH,
  BUCKET_NOTE,
  LAW_NOTE,
  SCHEMA_VERSION,
  SCROLLING_FORM_NOTE,
  TOOL,
  censusPixels,
  censusScrollingForm,
  checkTolerance,
  formatDiff,
  isDirty,
  serialiseCensus,
  type Census,
  type RowRecord,
} from './artifact.ts'
import { launchChrome, type Cdp } from './chrome.ts'
import {
  CENSUS_EPOCH_ISO,
  CENSUS_EPOCH_MS,
  CENSUS_LOCALE,
  CENSUS_TIMEZONE,
  determinismScript,
} from './determinism.ts'
import { REPO_ROOT, fileHash, inputsHash } from './inputs.ts'
import {
  MATRIX,
  MATRIX_IDS,
  formatRowId,
  identityOf,
  isMobileViewport,
  type MatrixRow,
} from './matrix.ts'
import { BUCKETS, SCROLLING_FORM, STRAY_DELTA_E, TARGETS, readPalette } from './palette.ts'
import { decodePng } from './png.ts'
import { serveProductionBuild } from './serve.ts'

const SHOTS_DIR = 'docs/brand/census-shots'
/** Two captures this far apart must be byte-identical (see settle check). */
const SETTLE_GAP_MS = 400

interface Options {
  diff: boolean
  check: boolean
  tolerance: number
  only: string | null
  out: string
  keepShots: string | null
  allowDirty: boolean
  windows: boolean
}

function parseArgs(argv: string[]): Options {
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
    else if (arg === '--tolerance') options.tolerance = Number(next())
    else if (arg === '--keep-shots') {
      const peek = argv[i + 1]
      options.keepShots = peek !== undefined && !peek.startsWith('--') ? next() : SHOTS_DIR
    } else throw new Error(`census: unknown flag ${arg}`)
  }
  return options
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/**
 * Detect which family a font stack actually resolves to.
 *
 * document.fonts.check is not usable for this: it answers "can this be
 * rendered", which is true for every system fallback, so it would always
 * report the first name in the stack. Width comparison against two different
 * generics is the honest test — a family that is absent renders identically to
 * the generic behind it, and a generic keyword differs from at least one of the
 * two bases.
 *
 * FULL CROSS-MACHINE DETERMINISM IS NOT ACHIEVABLE HERE and this tool does not
 * pretend otherwise: --display/--ui/--mono are stacks ending in system
 * fallbacks, and Space Grotesk, JetBrains Mono and Archivo Black are absent
 * from this container, so glyphs come from whatever the host has. Same
 * fingerprint means the numbers are comparable; a different one means they are
 * not, and formatDiff refuses to subtract across that boundary.
 */
const FONT_PROBE = `(() => {
  const el = document.createElement('span');
  el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:72px;white-space:pre;';
  el.textContent = 'MWmwil019 spec';
  document.body.appendChild(el);
  const width = (family) => { el.style.fontFamily = family; return el.getBoundingClientRect().width; };
  const present = (family) => ['monospace', 'serif'].some((base) => width(base) !== width('"' + family + '",' + base));
  const root = getComputedStyle(document.documentElement);
  const out = { families: {}, widths: {} };
  for (const tier of ['display', 'ui', 'mono']) {
    const stack = root.getPropertyValue('--' + tier).trim();
    const names = stack.split(',').map((n) => n.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    let resolved = names[names.length - 1] || 'unknown';
    for (const name of names) { if (present(name)) { resolved = name; break; } }
    out.families[tier] = resolved;
    out.widths[tier] = Math.round(width(stack) * 100) / 100;
  }
  el.remove();
  return JSON.stringify(out);
})()`

interface Measured {
  record: RowRecord
  png: Uint8Array
}

async function measureRow(
  cdp: Cdp,
  origin: string,
  row: MatrixRow,
  palette: ReturnType<typeof readPalette>,
  fixtures: Record<string, string | null>,
): Promise<{ measured: Measured; fonts?: { families: Record<string, string>; widths: Record<string, number> } }> {
  // ONE FRESH TARGET PER ROW. Storage, the frozen clock and the emulation
  // overrides all live on the target, so reusing one would leak state between
  // rows — and the first row would be the only honest one.
  // No width/height here: headless Chrome rejects a size on a tab target
  // ("Target position can only be set for new windows"), and the size that
  // matters is the emulated one set below anyway.
  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', {
    url: 'about:blank',
  })
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
    targetId,
    flatten: true,
  })

  try {
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)

    // §3 / Trust Rule: "the app renders fully offline — no CDN, no remote font
    // or image." Free to record while the protocol is already open, and a
    // non-zero count in the artifact is a regression nobody has to go looking
    // for.
    let externalRequests = 0
    cdp.on('Network.requestWillBeSent', sessionId, (params) => {
      const url = String((params as { request?: { url?: string } }).request?.url ?? '')
      if (/^(data|blob|about|chrome-extension):/.test(url)) return
      if (url.startsWith(origin)) return
      externalRequests++
    })

    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: row.width,
        height: row.height,
        deviceScaleFactor: 1,
        mobile: isMobileViewport(row.width),
      },
      sessionId,
    )
    await cdp.send(
      'Emulation.setEmulatedMedia',
      {
        features: [
          // The app has no in-app theme toggle — dark is pure
          // prefers-color-scheme — so this is the only lever that exists.
          { name: 'prefers-color-scheme', value: row.theme },
          // §9 requires the reduced state to be complete and legible at rest,
          // so this is principled and not merely convenient: any pixel
          // difference at rest between reduce and no-preference is itself a
          // bug, and the settle check below would catch a row that still moves.
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      },
      sessionId,
    )
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: CENSUS_TIMEZONE }, sessionId)
    await cdp.send('Emulation.setLocaleOverride', { locale: CENSUS_LOCALE }, sessionId)
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: determinismScript({
          epochMs: CENSUS_EPOCH_MS,
          storageJson: fixtures[row.state] ?? null,
        }),
      },
      sessionId,
    )

    const loaded = cdp.once('Page.loadEventFired', sessionId)
    await cdp.send('Page.navigate', { url: `${origin}/` }, sessionId)
    await loaded
    await quiet(cdp, sessionId)

    const fonts = JSON.parse(await evaluate<string>(cdp, sessionId, FONT_PROBE)) as {
      families: Record<string, string>
      widths: Record<string, number>
    }

    // FULL PAGE, not viewport. That is what rounds 1-4 measured, and
    // comparability with those figures is the whole point of reproducing the
    // metric rather than inventing a better one.
    const metrics = await cdp.send<{
      cssContentSize?: { width: number; height: number }
      contentSize?: { width: number; height: number }
    }>('Page.getLayoutMetrics', {}, sessionId)
    const content = metrics.cssContentSize ?? metrics.contentSize
    if (!content) throw new Error('census: Page.getLayoutMetrics returned no content size')
    const clip = {
      x: 0,
      y: 0,
      width: Math.max(row.width, Math.ceil(content.width)),
      height: Math.ceil(content.height),
      scale: 1,
    }

    // THE SETTLE CHECK. Two captures, 400ms apart, must be byte-identical. A
    // row that will not hold still is a DEFECT (§9: reduced motion must be
    // complete at rest), not a number to average — so it fails loudly and
    // writes nothing rather than contributing a figure a future round would
    // trust.
    let png = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const first = await capture(cdp, sessionId, clip)
      await sleep(SETTLE_GAP_MS)
      const second = await capture(cdp, sessionId, clip)
      if (first === second) {
        png = first
        break
      }
      if (attempt === 1) {
        throw new Error(
          `census: ${formatRowId(identityOf(row))} would not settle — two captures ${SETTLE_GAP_MS}ms ` +
            'apart differ after a retry. Something is still animating at rest, which §9 forbids. ' +
            'No number is written for this row.',
        )
      }
    }

    const bytes = Buffer.from(png, 'base64')
    const decoded = decodePng(bytes)
    const counted = censusPixels(decoded.rgb, palette)

    const record: RowRecord = {
      screen: row.screen,
      viewport: { width: row.width, height: row.height, mobile: isMobileViewport(row.width) },
      theme: row.theme,
      state: row.state,
      dimensions: { width: decoded.width, height: decoded.height },
      pixels: { total: counted.total },
      buckets: counted.buckets,
      deviation: counted.deviation,
      tokens: counted.tokens,
      strays: counted.strays,
      // The window height is the row's EMULATED viewport, not the shot: the
      // shot is the whole document (captureBeyondViewport), and the question
      // this reading asks is what fits on the reader's screen.
      scrollingForm: censusScrollingForm(
        decoded.rgb,
        decoded.width,
        decoded.height,
        row.height,
        palette,
        counted.buckets,
      ),
      externalRequests,
    }
    return { measured: { record, png: bytes }, fonts }
  } finally {
    await cdp.send('Target.closeTarget', { targetId })
  }
}

async function evaluate<T>(cdp: Cdp, sessionId: string, expression: string): Promise<T> {
  const res = await cdp.send<{
    result: { value: T }
    exceptionDetails?: { text: string }
  }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (res.exceptionDetails) throw new Error(`census: page evaluation failed — ${res.exceptionDetails.text}`)
  return res.result.value
}

/** Fonts loaded, then two consecutive frames with nothing scheduled. */
async function quiet(cdp: Cdp, sessionId: string): Promise<void> {
  await evaluate(
    cdp,
    sessionId,
    `new Promise((resolve) => {
       document.fonts.ready.then(() => {
         requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
       });
     })`,
  )
}

async function capture(
  cdp: Cdp,
  sessionId: string,
  clip: { x: number; y: number; width: number; height: number; scale: number },
): Promise<string> {
  const shot = await cdp.send<{ data: string }>(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: true, clip, fromSurface: true },
    sessionId,
  )
  return shot.data
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const rows = MATRIX.filter(
    (r) => options.only === null || formatRowId(identityOf(r)).includes(options.only),
  )
  if (rows.length === 0) throw new Error(`census: --only ${options.only} matched no row`)
  const partial = rows.length !== MATRIX.length

  const palette = readPalette()
  const fixtures: Record<string, string | null> = {
    fresh: null,
    // Read as TEXT and injected verbatim: parsing and re-serialising would let
    // this tool normalise a fixture the app would have seen differently.
    seeded: readFileSync(new URL('scripts/census/fixtures/seeded.json', REPO_ROOT), 'utf8').trim(),
    cold: readFileSync(new URL('scripts/census/fixtures/cold.json', REPO_ROOT), 'utf8').trim(),
  }

  console.log(`census: building and serving the production bundle…`)
  const served = await serveProductionBuild()
  const browser = await launchChrome()
  console.log(`census: ${browser.version} at ${browser.binary}`)

  const records: Record<string, RowRecord> = {}
  let fonts: Record<string, string> = {}
  let fontWidths: Record<string, number> = {}
  try {
    for (const id of MATRIX_IDS) {
      const row = rows.find((r) => formatRowId(identityOf(r)) === id)
      if (!row) continue
      const started = Date.now()
      const result = await measureRow(browser.cdp, served.origin, row, palette, fixtures)
      records[id] = result.measured.record
      if (result.fonts) {
        fonts = result.fonts.families
        fontWidths = result.fonts.widths
      }
      if (options.keepShots !== null) {
        mkdirSync(new URL(`${options.keepShots}/`, REPO_ROOT), { recursive: true })
        writeFileSync(new URL(`${options.keepShots}/${id}.png`, REPO_ROOT), result.measured.png)
      }
      const r = result.measured.record
      const f = r.scrollingForm
      console.log(
        `  ${id.padEnd(30)} ${r.dimensions.width}x${r.dimensions.height}  ` +
          `F ${r.buckets.field.pct.toFixed(1)} / B ${r.buckets.bone.pct.toFixed(1)} / ` +
          `G ${r.buckets.graphite.pct.toFixed(1)} / A ${r.buckets.accent.pct.toFixed(1)}  ` +
          `dev ${r.deviation.toFixed(1)}  strays ${r.strays.pctOverDeltaE12.toFixed(1)}%  ` +
          `${Date.now() - started}ms\n` +
          `  ${' '.repeat(30)} ${f.count} windows  mean F ${f.mean.field.toFixed(1)} / ` +
          `B ${f.mean.bone.toFixed(1)}  mean-dev ${f.meanDeviation.toFixed(1)}  ` +
          `worst @${f.worst.top} dev ${f.worst.deviation.toFixed(1)}  ` +
          `ink/paper ${f.inkOnPaper.toFixed(1)}%  breaches ${f.breaches.length}`,
      )
      if (options.windows) {
        for (const w of f.windows) {
          console.log(
            `      @${String(w.top).padStart(5)}  F ${w.pct.field.toFixed(1).padStart(5)} / ` +
              `B ${w.pct.bone.toFixed(1).padStart(5)} / G ${w.pct.graphite.toFixed(1).padStart(4)} / ` +
              `A ${w.pct.accent.toFixed(1).padStart(4)}  dev ${w.deviation.toFixed(1)}`,
          )
        }
        for (const b of f.breaches) console.log(`      ! ${b}`)
      }
    }
  } finally {
    await browser.close()
    await served.close()
  }

  const fingerprintSource = JSON.stringify({
    chrome: browser.version,
    platform: `${process.platform}-${process.arch}`,
    fonts,
    widths: fontWidths,
  })

  const census: Census = {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL,
    capturedAt: new Date().toISOString(),
    tree: {
      // PROVENANCE ONLY. The staleness authority is inputsHash — a SHA would
      // not have caught round 3, which stamped a real SHA on numbers measured
      // from a different tree.
      sha: git(['rev-parse', 'HEAD']),
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
      dirty: isDirty(git(['status', '--porcelain'])),
    },
    inputsHash: inputsHash(),
    env: {
      node: process.version,
      chrome: browser.version,
      platform: `${process.platform}-${process.arch}`,
      fingerprint: `sha256:${createHash('sha256').update(fingerprintSource).digest('hex')}`,
      fonts,
    },
    determinism: {
      epoch: CENSUS_EPOCH_ISO,
      timezone: CENSUS_TIMEZONE,
      locale: CENSUS_LOCALE,
      reducedMotion: true,
      deviceScaleFactor: 1,
      settleChecked: true,
    },
    palette: {
      source: 'src/styles/tokens.css',
      sha256: fileHash('src/styles/tokens.css'),
      tokens: Object.fromEntries(palette.map((t) => [t.name, t.hex])),
    },
    classifier: {
      space: 'CIELAB',
      metric: 'deltaE76',
      tieBreak: 'tokens.css declaration order',
      strayThresholdDeltaE: STRAY_DELTA_E,
    },
    law: {
      targets: TARGETS,
      deviation: 'sum of absolute differences from targets, in percentage points',
      note: LAW_NOTE,
      bucketNote: BUCKET_NOTE,
      buckets: BUCKETS,
      scrollingForm: { ...SCROLLING_FORM, note: SCROLLING_FORM_NOTE },
    },
    // Sorted: `rows` is the block a diff scans, and an insertion-ordered map
    // would reflow the whole file when a row is added.
    rows: Object.fromEntries(Object.keys(records).sort().map((k) => [k, records[k]])),
  }

  const committed = readCommitted(options.out)

  if (options.check) {
    if (committed === null) {
      console.error(`census: --check needs a committed ${options.out} to compare against`)
      process.exit(1)
    }
    const breaches = checkTolerance(committed, census, options.tolerance)
    for (const line of formatDiff(committed, census)) console.log(line)
    if (breaches.length > 0) {
      console.error('\ncensus: --check failed')
      for (const line of breaches) console.error(`  ${line}`)
      process.exit(1)
    }
    return
  }

  if (options.diff) {
    for (const line of formatDiff(committed, census)) console.log(line)
    console.log(`\ncensus: --diff, nothing written`)
    return
  }

  if (partial) {
    console.error(
      `census: --only measured ${rows.length} of ${MATRIX.length} rows, so the artifact would lose ` +
        'rows it should carry. Re-run without --only to write, or add --diff to just look.',
    )
    process.exit(1)
  }
  if (census.tree.dirty && !options.allowDirty) {
    console.error(
      'census: the working tree is dirty, so tree.sha would name a tree that never existed — which ' +
        "is the exact shape of round 3's claim. Commit first, or pass --allow-dirty to record it " +
        'honestly as dirty. (inputsHash stays valid either way; it is content-based.)',
    )
    process.exit(1)
  }

  for (const line of formatDiff(committed, census)) console.log(line)
  writeFileSync(new URL(options.out, REPO_ROOT), serialiseCensus(census))
  console.log(`\ncensus: wrote ${options.out}`)
}

function readCommitted(path: string): Census | null {
  try {
    return JSON.parse(readFileSync(new URL(path, REPO_ROOT), 'utf8')) as Census
  } catch {
    return null
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
