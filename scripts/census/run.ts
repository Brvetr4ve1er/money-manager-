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
  LIVE_REGION_SCRIPT,
  disagreeingProbe,
  movedInputs,
  LAW_NOTE,
  SCHEMA_VERSION,
  SCROLLING_FORM_NOTE,
  TOOL,
  censusPixels,
  censusScrollingForm,
  checkTolerance,
  dirtyPaths,
  formatDiff,
  isDirty,
  paintedAnnouncements,
  serialiseCensus,
  type Census,
  type LiveRegion,
  type RowRecord,
} from './artifact.ts'
import { launchChrome, type Cdp } from './chrome.ts'
import {
  COMPOSITION_NOTE,
  COMPOSITION_SCRIPT,
  censusComposition,
  type Ground,
} from './composition.ts'
import {
  CENSUS_EPOCH_ISO,
  CENSUS_EPOCH_MS,
  CENSUS_LOCALE,
  CENSUS_TIMEZONE,
  determinismScript,
} from './determinism.ts'
import { REPO_ROOT, fileHash, inputsHash, pixelInputs } from './inputs.ts'
import {
  MATRIX,
  MATRIX_IDS,
  formatRowId,
  identityOf,
  isMobileViewport,
  type Action,
  type MatrixRow,
} from './matrix.ts'
import {
  BUCKETS,
  SCROLLING_FORM,
  STRAY_DELTA_E,
  TARGETS,
  makeClassifier,
  readDeclaredAccents,
  readPalette,
} from './palette.ts'
import { decodePng } from './png.ts'
import { parseArgs } from './options.ts'
import { serveProductionBuild } from './serve.ts'

/** Two captures this far apart must be byte-identical (see settle check). */
const SETTLE_GAP_MS = 400

/**
 * How many two-capture comparisons a row may need before it is called unsettled.
 *
 * IT WAS 2, AND THAT NUMBER REFUSED HONEST ROWS. Every quiet app row at 375px
 * fails a 2-attempt protocol on this container — day0, dense, the drawer, and
 * the two `cold` rows the matrix kept commented out from round 5 to round 7
 * behind a diagnosis ("the reward toasts that follow live ~1.8-2.6s") that was
 * measurably false. The real difference between a phone row's first two captures is the
 * antialiased keyline of the topbar's mute button, re-rastered over the first
 * ~1.1s: tens of pixels out of two million, which cannot move a published figure
 * at 2dp but is not byte-identical either.
 *
 * MORE ATTEMPTS, NOT A LOOSER COMPARISON. Tolerancing the byte check is the
 * obvious fix and it is the wrong one: byte-exactness is precisely what stops a
 * 2600ms toast from being averaged into a row, and a per-pixel epsilon would
 * make the instrument blind in the direction it can least afford. Four attempts
 * spans ~3.2s of wall clock, and every row that settles at all settles inside
 * it; a row that is genuinely animating still fails, and still writes nothing.
 * The attempt count is RECORDED per row (RowRecord.settleAttempts) so "needed
 * three tries" is a fact in the artifact rather than a thing the loop swallowed.
 */
const SETTLE_ATTEMPTS = 4

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Path -> content hash for every declared pixel input, so the guard around
    the run can NAME what moved rather than only that the totals differ.
    pixelInputs() already returns the list; only the per-file read is new. */
function inputSnapshot(): Map<string, string> {
  return new Map(pixelInputs().map((path) => [path, fileHash(path)]))
}

/**
 * `null` on failure, never ''.
 *
 * THE DIFFERENCE IS THE WHOLE POINT. Returning '' made every failure look like
 * a reassuring success: git absent, git broken, or the directory not a repo all
 * produced `rev-parse HEAD` -> '' and `status --porcelain` -> '', and
 * isDirty('') is false — so the run stamped tree {sha:'', dirty:false} and
 * sailed straight past the dirty guard. The one field that says "these numbers
 * describe a committed tree" failed toward the answer nobody would question.
 * Verified empirically in a non-repo directory before this was changed.
 */
function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
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

/** The bucket that holds every pixel, or null when more than one is painting.
    Exported shape kept trivial on purpose: the guard that uses it has to be
    impossible to misread. */
function BUCKETS_AT_100(buckets: Record<string, { pct: number }>): string | null {
  for (const [name, stat] of Object.entries(buckets)) {
    if (stat.pct >= 100) return name
  }
  return null
}

async function measureRow(
  cdp: Cdp,
  origin: string,
  row: MatrixRow,
  palette: ReturnType<typeof readPalette>,
  declaredAccents: string[],
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

    // THE VIEW, REACHED BEFORE ANYTHING IS MEASURED. Dispatched after the first
    // quiet (the control has to exist) and re-quieted after (the drawer it opens
    // has to have laid out). A row whose actions list is empty — every `rest`
    // row — pays nothing here.
    for (const action of row.actions) await dispatch(cdp, sessionId, row, action)
    if (row.actions.length > 0) await quiet(cdp, sessionId)

    const fonts = JSON.parse(await evaluate<string>(cdp, sessionId, FONT_PROBE)) as {
      families: Record<string, string>
      widths: Record<string, number>
    }

    // THE COMPOSITION BOUNDARIES ARE READ FROM THE LIVE DOM, BEFORE THE SHOT.
    // They cannot be derived from the PNG: two adjacent sections that happen to
    // share a ground colour are one band of pixels and two compositions, and a
    // raster cannot tell them apart. This is the only measurement in the census
    // that asks the page a question rather than counting what it painted, which
    // is why the rule it asks is written out in full in composition.ts.
    const grounds = JSON.parse(
      await evaluate<string>(cdp, sessionId, COMPOSITION_SCRIPT),
    ) as Ground[]

    // Read in the same breath, and for the opposite reason: the grounds say
    // WHERE the page is measured, this says WHETHER the page is at rest. See
    // LIVE_REGION_SCRIPT — the settle check samples 400ms apart and cannot see
    // a 2600ms banner, so the question has to be asked rather than watched for.
    const announcements = paintedAnnouncements(
      JSON.parse(await evaluate<string>(cdp, sessionId, LIVE_REGION_SCRIPT)) as LiveRegion[],
    )

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
    let settleAttempts = 0
    for (let attempt = 1; attempt <= SETTLE_ATTEMPTS; attempt++) {
      const first = await capture(cdp, sessionId, clip)
      await sleep(SETTLE_GAP_MS)
      const second = await capture(cdp, sessionId, clip)
      if (first === second) {
        png = first
        settleAttempts = attempt
        break
      }
      if (attempt === SETTLE_ATTEMPTS) {
        throw new Error(
          `census: ${formatRowId(identityOf(row))} would not settle — two captures ${SETTLE_GAP_MS}ms ` +
            `apart differ after ${SETTLE_ATTEMPTS} attempts. Something is still animating at rest, ` +
            'which §9 forbids. No number is written for this row.',
        )
      }
    }

    const bytes = Buffer.from(png, 'base64')
    const decoded = decodePng(bytes)
    const counted = censusPixels(decoded.rgb, palette)

    // A ROW THAT RENDERED NOTHING IS NOT A MEASUREMENT, and the settle check
    // cannot say so: two captures of a blank page settle perfectly. Observed
    // once on this container — the first target of a run came back 1024x900,
    // 100% graphite, with the font probe resolving unknown/unknown/unknown, and
    // what stopped the write was the FINGERPRINT guard, which reported it as a
    // type-stack disagreement. That is the right outcome reached by the wrong
    // sentence: the next round would have gone looking for a colour regression.
    // A single-bucket page is the cheap, unambiguous statement of the same
    // fact. It cannot fire on a real screen — no row in this matrix has ever
    // been within 6pp of a single bucket, and §2 forbids a surface that is.
    const single = BUCKETS_AT_100(counted.buckets)
    if (single !== null) {
      throw new Error(
        `census: ${formatRowId(identityOf(row))} captured ${decoded.width}x${decoded.height} at ` +
          `100% ${single} — every pixel one bucket. That is an unpainted page, not a colour. ` +
          'Nothing written for this row; re-run, and if it repeats look at the navigation rather ' +
          'than at the stylesheets.',
      )
    }

    const record: RowRecord = {
      screen: row.screen,
      viewport: { width: row.width, height: row.height, mobile: isMobileViewport(row.width) },
      theme: row.theme,
      state: row.state,
      view: row.view,
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
        counted.tokens,
        declaredAccents,
      ),
      composition: censusComposition(
        decoded.rgb,
        decoded.width,
        decoded.height,
        row.height,
        palette,
        grounds,
        makeClassifier(palette),
      ),
      externalRequests,
      settleAttempts,
      announcements,
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

/**
 * Drive one scripted interaction, and REFUSE THE ROW IF IT DID NOT LAND.
 *
 * Three ways this can go wrong and all three are fatal rather than logged:
 * the selector matches nothing (the class was renamed), it matches several
 * (the selector stopped identifying one control), or the click produced
 * nothing (`then` never appeared). Any of them silently turns an interaction
 * row into a second copy of its `rest` twin — two ids in the artifact naming
 * one screen, which is a lie no reader could detect from the file.
 */
async function dispatch(
  cdp: Cdp,
  sessionId: string,
  row: MatrixRow,
  action: Action,
): Promise<void> {
  const id = formatRowId(identityOf(row))
  const outcome = await evaluate<string>(
    cdp,
    sessionId,
    `(() => {
       const found = document.querySelectorAll(${JSON.stringify(action.click)});
       if (found.length !== 1) return 'matched ' + found.length;
       found[0].click();
       return 'clicked';
     })()`,
  )
  if (outcome !== 'clicked') {
    throw new Error(
      `census: ${id} — the selector ${action.click} ${outcome} elements, so the row could not be ` +
        'driven to its view. Nothing written; a row that quietly measures its rest twin instead ' +
        'is worse than a missing row.',
    )
  }
  // Re-quieted before the assertion: React commits the drawer on the next
  // frame, so asking immediately would fail on a click that worked.
  await quiet(cdp, sessionId)
  const landed = await evaluate<boolean>(
    cdp,
    sessionId,
    `document.querySelector(${JSON.stringify(action.then)}) !== null`,
  )
  if (!landed) {
    throw new Error(
      `census: ${id} — ${action.click} was pressed but ${action.then} never appeared, so the view ` +
        'this row is named for is not on screen. Nothing written for this row.',
    )
  }
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
  const declaredAccents = readDeclaredAccents()
  // Read as TEXT and injected verbatim: parsing and re-serialising would let
  // this tool normalise a fixture the app would have seen differently.
  const fixture = (name: string): string =>
    readFileSync(new URL(`scripts/census/fixtures/${name}.json`, REPO_ROOT), 'utf8').trim()
  const fixtures: Record<string, string | null> = {
    fresh: null,
    seeded: fixture('seeded'),
    cold: fixture('cold'),
    day0: fixture('day0'),
    dense: fixture('dense'),
  }

  // THE HASH IS TAKEN BEFORE THE BUILD, NOT AFTER THE LAST ROW.
  //
  // It used to be computed at the very end of the run — after the bundle was
  // built and after all twelve rows were shot. The pixels then described the
  // tree as it was at the build and the hash described the tree as it was
  // minutes later, so editing any pixel input DURING a census wrote the NEW
  // hash beside the OLD numbers, after which the staleness test cheerfully
  // reported "census.json is current" for figures describing a tree that no
  // longer existed. That is round 3's defect — measure early, publish late —
  // reproduced inside the instrument built to make it impossible.
  const before = inputSnapshot()
  const inputsBefore = inputsHash()

  console.log(`census: building and serving the production bundle…`)
  const served = await serveProductionBuild()
  const browser = await launchChrome()
  console.log(`census: ${browser.version} at ${browser.binary}`)

  const records: Record<string, RowRecord> = {}
  let fonts: Record<string, string> = {}
  let fontWidths: Record<string, number> = {}
  // THE PROBE RESULT IS COLLECTED PER ROW, NOT OVERWRITTEN BY THE LAST ONE.
  // env.fonts and env.fingerprint are presented as the environment for all
  // twelve rows, and formatDiff refuses cross-environment subtraction on the
  // strength of that single value — so a row that resolved a different stack
  // (exactly what FONT_PROBE's header says cannot be assumed away) would be
  // invisible, and the fingerprint would be a claim about one row dressed as a
  // claim about twelve. They are compared after the loop instead.
  const probes: Array<{ id: string; families: Record<string, string>; widths: Record<string, number> }> = []
  try {
    for (const id of MATRIX_IDS) {
      const row = rows.find((r) => formatRowId(identityOf(r)) === id)
      if (!row) continue
      const started = Date.now()
      const result = await measureRow(browser.cdp, served.origin, row, palette, declaredAccents, fixtures)
      records[id] = result.measured.record
      if (result.fonts) {
        fonts = result.fonts.families
        fontWidths = result.fonts.widths
        probes.push({ id, families: result.fonts.families, widths: result.fonts.widths })
      }
      if (options.keepShots !== null) {
        mkdirSync(new URL(`${options.keepShots}/`, REPO_ROOT), { recursive: true })
        writeFileSync(new URL(`${options.keepShots}/${id}.png`, REPO_ROOT), result.measured.png)
      }
      const r = result.measured.record
      const f = r.scrollingForm
      const c = r.composition
      console.log(
        `  ${id.padEnd(30)} ${r.dimensions.width}x${r.dimensions.height}  ` +
          `F ${r.buckets.field.pct.toFixed(1)} / B ${r.buckets.bone.pct.toFixed(1)} / ` +
          `G ${r.buckets.graphite.pct.toFixed(1)} / A ${r.buckets.accent.pct.toFixed(1)}  ` +
          `dev ${r.deviation.toFixed(1)}  strays ${r.strays.pctOverDeltaE12.toFixed(1)}%  ` +
          `${Date.now() - started}ms\n` +
          `  ${' '.repeat(30)} ${f.count} windows  mean F ${f.mean.field.toFixed(1)} / ` +
          `B ${f.mean.bone.toFixed(1)}  mean-dev ${f.meanDeviation.toFixed(1)}  ` +
          `worst @${f.worst.top} dev ${f.worst.deviation.toFixed(1)}  ` +
          `ink/paper ${f.inkOnPaper.toFixed(1)}%  breaches ${f.breaches.length}\n` +
          `  ${' '.repeat(30)} ${c.sections.length} sections ` +
          `(${c.sections.filter((s) => s.held).length} held) on ${c.pageGround ?? '<none>'}, ` +
          `${c.nested.length} nested  breaches ${c.breaches.length}` +
          (r.settleAttempts > 1 ? `  settled on attempt ${r.settleAttempts}` : ''),
      )
      // SAID OUT LOUD RATHER THAN ONLY FILED. This is the condition the settle
      // check structurally cannot detect, so the run has to volunteer it: a
      // painting live region means the row measured a page mid-announcement.
      for (const a of r.announcements) {
        console.log(`      ! live region painting at capture — ${a}`)
      }
      if (options.windows) {
        for (const w of f.windows) {
          console.log(
            `      @${String(w.top).padStart(5)}  F ${w.pct.field.toFixed(1).padStart(5)} / ` +
              `B ${w.pct.bone.toFixed(1).padStart(5)} / G ${w.pct.graphite.toFixed(1).padStart(4)} / ` +
              `A ${w.pct.accent.toFixed(1).padStart(4)}  dev ${w.deviation.toFixed(1)}`,
          )
        }
        for (const b of f.breaches) console.log(`      ! ${b}`)
        for (const s of [...c.sections, ...c.nested]) {
          console.log(
            `      ${s.held ? 'HELD ' : '     '}${s.label.padEnd(22)} @${String(s.top).padStart(5)} ` +
              `h${String(s.height).padStart(5)}  F ${s.pct.field.toFixed(1).padStart(5)} / ` +
              `B ${s.pct.bone.toFixed(1).padStart(5)} / G ${s.pct.graphite.toFixed(1).padStart(4)} / ` +
              `A ${s.pct.accent.toFixed(1).padStart(4)}  dev ${s.deviation.toFixed(1)}`,
          )
        }
        for (const b of c.breaches) console.log(`      ! ${b}`)
      }
    }
  } finally {
    await browser.close()
    await served.close()
  }

  const disagreeing = disagreeingProbe(probes)
  if (disagreeing !== null) {
    throw new Error(
      `census: ${disagreeing.id} resolved a different type stack from ${probes[0].id}, so one ` +
        'env.fingerprint cannot describe both rows and the artifact would claim it does.\n' +
        `  ${probes[0].id}: ${JSON.stringify({ families: probes[0].families, widths: probes[0].widths })}\n` +
        `  ${disagreeing.id}: ${JSON.stringify({ families: disagreeing.families, widths: disagreeing.widths })}\n` +
        'If a per-row difference is ever legitimate, record fonts per row in RowRecord.',
    )
  }

  // …and re-taken now, naming what moved. Exit before anything is written: an
  // artifact that mixes two trees is worse than no artifact, because it looks
  // like an answer.
  const inputsAfter = inputsHash()
  if (inputsAfter !== inputsBefore) {
    console.error(
      'census: a pixel input changed WHILE the census ran, so these numbers describe a tree ' +
        'that no longer exists. Nothing written. Differing files:',
    )
    for (const path of movedInputs(before, inputSnapshot())) console.error(`  ${path}`)
    process.exit(1)
  }

  const fingerprintSource = JSON.stringify({
    chrome: browser.version,
    platform: `${process.platform}-${process.arch}`,
    fonts,
    widths: fontWidths,
  })

  const sha = git(['rev-parse', 'HEAD'])
  if (sha === null) {
    console.error('census: cannot read the tree — refusing to stamp provenance it did not verify')
    process.exit(1)
  }
  const porcelain = git(['status', '--porcelain'])

  const census: Census = {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL,
    capturedAt: new Date().toISOString(),
    tree: {
      // PROVENANCE ONLY. The staleness authority is inputsHash — a SHA would
      // not have caught round 3, which stamped a real SHA on numbers measured
      // from a different tree.
      sha,
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '<unknown>',
      dirty: isDirty(porcelain),
      // A dirty stamp that only asserts "something was uncommitted" tells the
      // next round nothing it can act on. These are the paths, so a reader can
      // see whether the dirt was a stylesheet (the numbers are provisional) or
      // this artifact itself (they are not).
      dirtyPaths: dirtyPaths(porcelain),
    },
    // inputsBefore, not a fresh read: it is the hash of the tree the PIXELS
    // came from, and the guard above has already proved nothing moved since.
    inputsHash: inputsBefore,
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
      declaredAccents,
      scrollingForm: { ...SCROLLING_FORM, note: SCROLLING_FORM_NOTE },
      // No bounds of its own: the section check spends scrollingForm's band and
      // caps. §2.1b is one law read over three sets of boundaries.
      composition: { note: COMPOSITION_NOTE },
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

  // THE CLEAN RE-STAMP, PROMPTED RATHER THAN REMEMBERED.
  //
  // Every artifact this repo has shipped except one was written from a dirty
  // tree, so tree.sha named the PARENT commit and tree.dirtyPaths listed files
  // that were committed moments later. inputsHash keeps the numbers honest —
  // it is content-based, so nothing goes stale — but the one field a reader
  // would use to verify them points at the wrong commit. Commit 96b728b fixed
  // it once, by hand, and it drifted back three times in the round after.
  //
  // A rule that needs somebody to remember it is the failure mode this whole
  // tool exists to end, so the tool says it. The write is the right moment:
  // the run has just finished and the next action is the commit.
  if (census.tree.dirty) {
    const onlyArtifact =
      census.tree.dirtyPaths.length === 1 && census.tree.dirtyPaths[0] === options.out
    console.log(
      onlyArtifact
        ? `census: tree.sha is ${census.tree.sha.slice(0, 7)} with dirty:true, and ${options.out} ` +
            'is the only dirty path — so this stamp already describes the committed tree in ' +
            'everything but the flag. Commit it and you are done.'
        : `census: tree.sha is ${census.tree.sha.slice(0, 7)} with dirty:true, so this artifact ` +
            'names a tree that was never committed. AFTER the round\'s last commit, re-run ' +
            '`npm run census` on the clean tree and commit the re-stamped file — the numbers will ' +
            'not move, only the provenance. See docs/brand/DESIGN-SYSTEM.md §2.1b.',
    )
  }
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
