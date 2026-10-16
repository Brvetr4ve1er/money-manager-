/**
 * Ember desktop — Electron main process.
 *
 * The renderer is the unchanged Vite build in `dist/`, served from a
 * privileged custom scheme (`app://ember/`) instead of file://, so that:
 *   - localStorage (`ember-state-v1`) lives under one stable origin that
 *     survives app updates and install-path changes;
 *   - a strict CSP can be attached to every response;
 *   - nothing outside the packaged `dist/` folder is ever readable.
 *
 * Security posture: contextIsolation + sandbox + no nodeIntegration, a
 * preload that exposes only `{ isDesktop, version }`, navigation locked to
 * app://, external http(s) links handed to the OS browser, all permission
 * requests denied except clipboard writes, DevTools off when packaged.
 * (The legacy `remote` module no longer exists in Electron >= 14, so there
 * is nothing to disable there.)
 */

import { app, BrowserWindow, Menu, protocol, screen, session, shell } from 'electron'
import type { MenuItemConstructorOptions, Rectangle } from 'electron'
import { promises as fs, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const SCHEME = 'app'
const HOST = 'ember'
const ORIGIN = `${SCHEME}://${HOST}`
const BG = '#1a1530'
const isDev = !app.isPackaged

// Test/portable hook: an isolated profile directory (used by the E2E smoke
// to relaunch against the same data). Must run before `ready`.
if (process.env.EMBER_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.EMBER_USER_DATA_DIR))
}

const CSP = [
  "default-src 'self' app:",
  "img-src 'self' app: data: blob:",
  "style-src 'self' 'unsafe-inline' app:",
  "font-src 'self' app: data:",
  "script-src 'self' app:",
  "connect-src 'self' app:",
  "media-src 'self' app: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
}

// Must happen before `ready`: a "standard" + "secure" scheme behaves like
// https for origin, storage and fetch purposes.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

/** The packaged web build. In an asar, Electron's fs reads through it. */
const distDir = path.join(app.getAppPath(), 'dist')

/** Resolve a request path inside `distDir`, or null if it escapes it. */
function resolveInDist(urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const rel = path.normalize(decoded).replace(/^([/\\])+/, '')
  const full = path.resolve(distDir, rel)
  if (full !== distDir && !full.startsWith(distDir + path.sep)) return null
  return full
}

async function readFileOrNull(file: string): Promise<Buffer | null> {
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) return null
    return await fs.readFile(file)
  } catch {
    return null
  }
}

function respond(body: Buffer | string, status: number, type: string): Response {
  return new Response(typeof body === 'string' ? body : new Uint8Array(body), {
    status,
    headers: {
      'Content-Type': type,
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    },
  })
}

async function handleAppRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (url.host !== HOST) return respond('Not found', 404, 'text/plain; charset=utf-8')
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return respond('Method not allowed', 405, 'text/plain; charset=utf-8')
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const file = resolveInDist(pathname)
  if (!file) return respond('Forbidden', 403, 'text/plain; charset=utf-8')

  const ext = path.extname(file).toLowerCase()
  const body = await readFileOrNull(file)
  if (body) return respond(body, 200, MIME[ext] ?? 'application/octet-stream')

  // SPA fallback: extension-less paths are app routes, served by index.html.
  // Missing assets (with an extension) stay honest 404s.
  if (!ext) {
    const index = await readFileOrNull(path.join(distDir, 'index.html'))
    if (index) return respond(index, 200, MIME['.html'])
  }
  return respond('Not found', 404, 'text/plain; charset=utf-8')
}

// ---------------------------------------------------------------------------
// Window bounds persistence

type WindowState = { x?: number; y?: number; width: number; height: number; maximized?: boolean }
const DEFAULT_STATE: WindowState = { width: 1200, height: 820 }
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function loadWindowState(): WindowState {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<WindowState>
    const width = Number(raw.width)
    const height = Number(raw.height)
    if (!Number.isFinite(width) || !Number.isFinite(height)) return DEFAULT_STATE
    const s: WindowState = {
      width: Math.max(380, Math.round(width)),
      height: Math.max(640, Math.round(height)),
      maximized: raw.maximized === true,
    }
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      const rect: Rectangle = { x: Number(raw.x), y: Number(raw.y), width: s.width, height: s.height }
      // Only restore a position that is still on some connected display.
      const visible = screen.getAllDisplays().some(({ workArea: a }) =>
        rect.x < a.x + a.width && rect.x + rect.width > a.x && rect.y < a.y + a.height && rect.y + 40 > a.y,
      )
      if (visible) {
        s.x = rect.x
        s.y = rect.y
      }
    }
    return s
  } catch {
    return DEFAULT_STATE
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const b = win.getNormalBounds()
    const s: WindowState = { ...b, maximized: win.isMaximized() }
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(stateFile(), JSON.stringify(s))
  } catch {
    // Non-fatal: next launch simply uses the defaults.
  }
}

// ---------------------------------------------------------------------------

function isExternalHttp(url: string): boolean {
  try {
    const { protocol: p } = new URL(url)
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === `${SCHEME}:` && u.host === HOST
  } catch {
    return false
  }
}

function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function buildMenu(): Menu {
  const view: MenuItemConstructorOptions[] = [
    { role: 'reload' },
    ...(isDev ? ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[]) : []),
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ]
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[]) : []),
    { role: 'editMenu' },
    { label: 'View', submenu: view },
    { role: 'windowMenu' },
  ]
  return Menu.buildFromTemplate(template)
}

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const iconPath = path.join(app.getAppPath(), 'desktop', 'build', 'icon.png')

  const win = new BrowserWindow({
    title: 'Ember',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 380,
    minHeight: 640,
    backgroundColor: BG,
    show: false,
    icon: iconPath,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      devTools: isDev,
      additionalArguments: [`--ember-version=${app.getVersion()}`],
    },
  })

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  // Keep the native title "Ember" even if the page title changes.
  win.on('page-title-updated', (e) => e.preventDefault())
  win.on('close', () => saveWindowState(win))

  const wc = win.webContents

  // Navigation never leaves app://ember. External http(s) goes to the OS.
  wc.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    if (isExternalHttp(url)) void shell.openExternal(url)
  })
  wc.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  wc.setWindowOpenHandler(({ url }) => {
    if (isExternalHttp(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-attach-webview', (event) => event.preventDefault())

  void win.loadURL(`${ORIGIN}/index.html`)
  return win
}

function configureSession(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    // Copying the trusted-person snapshot is the only capability the app uses.
    callback(permission === 'clipboard-sanitized-write')
  })
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')

  // Belt and braces: nothing may leave the app:// origin (blob:/data: are
  // in-memory). The web app makes no network requests by design.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const { protocol: p } = new URL(details.url)
    const allowed = p === `${SCHEME}:` || p === 'blob:' || p === 'data:' || p === 'devtools:' || p === 'chrome-extension:'
    callback({ cancel: !allowed })
  })

  // "Export my data" is an <a download> of a Blob: show a native Save dialog.
  ses.on('will-download', (_event, item) => {
    const suggested = item.getFilename()
    const name = /^ember-export-\d{4}-\d{2}-\d{2}\.json$/.test(suggested) ? suggested : `ember-export-${todayISO()}.json`
    item.setSaveDialogOptions({
      title: 'Export my data',
      defaultPath: path.join(app.getPath('documents'), name),
      buttonLabel: 'Save export',
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
  })
}

// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  // Any webContents (current or future) gets the same lock-down.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.whenReady().then(() => {
    protocol.handle(SCHEME, handleAppRequest)
    configureSession()
    Menu.setApplicationMenu(buildMenu())
    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
