/**
 * BROWSER DISCOVERY, LAUNCH, AND A CDP CLIENT — with no dependency.
 *
 * Node 22 (this repo's floor is 22.12) ships a global WebSocket, so the
 * DevTools protocol can be driven directly. That is the whole reason the
 * census needs no puppeteer and no playwright: the repo takes no runtime
 * dependency and no build-time one either, and a browser driver would have
 * been the largest one in the tree by an order of magnitude.
 *
 * DISCOVERY IS PART OF THE DESIGN, not an afterthought. A Chromium exists in
 * this container at /opt/pw-browsers/, and nothing on PATH points at it. So
 * the resolver walks a documented list and, when it finds nothing, EXITS 2
 * naming every path it tried. It never skips a row. Silent skip is the exact
 * failure mode scripts/assert-dom-tests-ran.mjs was written to kill after this
 * pipeline twice shipped a green run that had executed half the suite; a
 * census that quietly measured six of eight rows would be the same defect with
 * a different denominator.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/** Where a chrome binary might be, in resolution order. First hit wins. */
function candidatePaths(): string[] {
  const out: string[] = []
  const fromEnv = process.env.EMBER_CHROME
  if (fromEnv) out.push(fromEnv)

  // PATH, resolved by hand: `which` is not portable and spawning a shell to
  // find a browser is a worse dependency than reading an env var.
  const names = ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'chrome']
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (!dir) continue
    for (const name of names) out.push(join(dir, name))
  }

  // Playwright's browser cache — how this container has one at all.
  for (const base of ['/opt/pw-browsers', join(homedir(), '.cache', 'ms-playwright')]) {
    for (const dir of safeReaddir(base)) {
      if (!dir.startsWith('chromium')) continue
      out.push(join(base, dir, 'chrome-linux', 'chrome'))
      out.push(join(base, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
    }
  }

  // Puppeteer's cache, for a contributor who has run its installer.
  const puppeteer = join(homedir(), '.cache', 'puppeteer')
  for (const dir of safeReaddir(puppeteer)) {
    if (!dir.startsWith('chrome')) continue
    out.push(join(puppeteer, dir, 'chrome-linux64', 'chrome'))
    out.push(join(puppeteer, dir, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'))
    out.push(join(puppeteer, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'))
  }

  out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  out.push('/Applications/Chromium.app/Contents/MacOS/Chromium')
  return out
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir).sort()
  } catch {
    return []
  }
}

export function findChrome(): string {
  const tried = candidatePaths()
  for (const path of tried) {
    if (existsSync(path)) return path
  }
  console.error('census: no Chromium found. Tried, in order:')
  for (const path of tried.slice(0, 12)) console.error(`  ${path}`)
  if (tried.length > 12) console.error(`  … and ${tried.length - 12} more`)
  console.error('\nSet EMBER_CHROME to a Chrome or Chromium binary and re-run.')
  process.exit(2)
}

export interface Browser {
  /** e.g. "HeadlessChrome/147.0.7727.24" — recorded in the artifact's env. */
  version: string
  binary: string
  cdp: Cdp
  close(): Promise<void>
}

/**
 * Launch flags, and why the non-obvious ones are here.
 *
 *   --disable-lcd-text        THE IMPORTANT ONE. Subpixel antialiasing paints
 *                             coloured fringes on every glyph edge. Those
 *                             fringes are off-palette pixels the classifier
 *                             then has to assign, they vary with the host's
 *                             fontconfig, and there are millions of them on a
 *                             text-heavy page. Greyscale AA removes a whole
 *                             class of host variance from the numbers.
 *   --font-render-hinting     Hinting shifts glyph outlines by fractions of a
 *                             pixel per host. Off = same coverage everywhere.
 *   --force-device-scale…=1   The census counts CSS pixels. A 2x host would
 *                             quadruple the denominator.
 *   --hide-scrollbars         A scrollbar is chrome, not the app, and its
 *                             width differs per platform.
 *   --disable-gpu             Deterministic software raster; GPU compositing
 *                             introduces per-driver rounding.
 */
function launchFlags(userDataDir: string): string[] {
  const flags = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--disable-lcd-text',
    '--font-render-hinting=none',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // Containers commonly give /dev/shm 64MB; Chrome's default shared-memory
    // use overruns it and the renderer dies mid-screenshot.
    '--disable-dev-shm-usage',
    'about:blank',
  ]
  // Opt-in only. Running a browser without the sandbox is a real reduction in
  // isolation, so it is never the default — CI and containers set it.
  if (process.env.EMBER_CENSUS_NO_SANDBOX === '1') flags.unshift('--no-sandbox')
  return flags
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function launchChrome(): Promise<Browser> {
  const binary = findChrome()
  const userDataDir = mkdtempSync(join(tmpdir(), 'ember-census-'))
  const child: ChildProcess = spawn(binary, launchFlags(userDataDir), { stdio: 'ignore' })

  // Read the port from DevToolsActivePort rather than parsing stderr: the file
  // is written after the socket is listening, so there is no race to lose.
  const portFile = join(userDataDir, 'DevToolsActivePort')
  let port = ''
  for (let i = 0; i < 200 && port === ''; i++) {
    if (existsSync(portFile)) {
      const line = readFileSync(portFile, 'utf8').split('\n')[0].trim()
      if (line !== '') port = line
    }
    if (port === '') await sleep(50)
  }
  if (port === '') {
    child.kill('SIGKILL')
    throw new Error(
      `census: ${binary} did not start (no DevToolsActivePort after 10s). ` +
        'In a container, set EMBER_CENSUS_NO_SANDBOX=1.',
    )
  }

  const info = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as {
    Browser: string
    webSocketDebuggerUrl: string
  }
  const cdp = await Cdp.connect(info.webSocketDebuggerUrl)

  return {
    version: info.Browser,
    binary,
    cdp,
    async close() {
      cdp.close()
      child.kill('SIGTERM')
      // Give it a beat to flush the profile before the directory goes.
      await sleep(200)
      if (child.exitCode === null) child.kill('SIGKILL')
      rmSync(userDataDir, { recursive: true, force: true })
    },
  }
}

type Handler = (params: Record<string, unknown>) => void

/**
 * A minimal CDP client: an id-keyed promise map over one WebSocket.
 *
 * Flattened sessions (Target.attachToTarget({flatten:true})) mean every target
 * multiplexes over this single socket with a sessionId, so there is exactly one
 * connection to manage no matter how many rows run.
 */
export class Cdp {
  socket: WebSocket
  nextId = 1
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  handlers = new Map<string, Set<Handler>>()

  constructor(socket: WebSocket) {
    this.socket = socket
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(String((event as MessageEvent).data))
      if (typeof msg.id === 'number') {
        const slot = this.pending.get(msg.id)
        if (!slot) return
        this.pending.delete(msg.id)
        if (msg.error) slot.reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else slot.resolve(msg.result)
        return
      }
      // Key on session too: two rows' targets emit the same event names, and a
      // handler waiting on row A's Page.loadEventFired must not be woken by B.
      for (const key of [`${msg.sessionId ?? ''}:${msg.method}`, `*:${msg.method}`]) {
        const set = this.handlers.get(key)
        if (!set) continue
        for (const handler of [...set]) handler(msg.params ?? {})
      }
    })
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      socket.addEventListener('open', () => resolve(new Cdp(socket)))
      socket.addEventListener('error', () => reject(new Error(`census: CDP connect failed (${url})`)))
    })
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++
    const payload: Record<string, unknown> = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify(payload))
    })
  }

  on(method: string, sessionId: string | null, handler: Handler): () => void {
    const key = `${sessionId ?? ''}:${method}`
    const set = this.handlers.get(key) ?? new Set<Handler>()
    set.add(handler)
    this.handlers.set(key, set)
    return () => set.delete(handler)
  }

  once(method: string, sessionId: string | null, timeoutMs = 30_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error(`census: timed out after ${timeoutMs}ms waiting for ${method}`))
      }, timeoutMs)
      const off = this.on(method, sessionId, (params) => {
        clearTimeout(timer)
        off()
        resolve(params)
      })
    })
  }

  close(): void {
    this.socket.close()
  }
}
