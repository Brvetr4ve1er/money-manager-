// Desktop smoke test (Playwright's Electron driver; no browser download).
//
//   npm run desktop:e2e            # after `npm run desktop:build` (or desktop:prepare)
//
// Launches release/linux-unpacked/ember when it exists, else `electron .`
// against the compiled desktop/dist + dist. On Linux without a display it
// re-runs itself under `xvfb-run` when available.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY && !process.env.EMBER_E2E_XVFB) {
  const which = spawnSync('which', ['xvfb-run'])
  if (which.status === 0) {
    const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1280x900x24', process.execPath, fileURLToPath(import.meta.url)], {
      stdio: 'inherit',
      env: { ...process.env, EMBER_E2E_XVFB: '1' },
    })
    process.exit(r.status ?? 1)
  }
  console.error('[e2e] No display and no xvfb-run: cannot run the Electron smoke test here.')
  process.exit(2)
}

const unpacked = path.join(root, 'release', 'linux-unpacked', 'ember')
const usePackaged = process.platform === 'linux' && existsSync(unpacked) && !process.env.EMBER_E2E_DEV
const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'ember-e2e-'))

// Chromium refuses to start its sandbox as root (CI containers); only then
// fall back to --no-sandbox. Desktop users never hit this path.
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
const extraArgs = isRoot ? ['--no-sandbox'] : []

const offOrigin = []
let failed = false

function check(cond, msg) {
  if (!cond) {
    failed = true
    console.error(`  FAIL ${msg}`)
  } else {
    console.log(`  ok   ${msg}`)
  }
}

async function launch() {
  const app = await electron.launch({
    ...(usePackaged ? { executablePath: unpacked, args: extraArgs } : { args: [...extraArgs, root] }),
    cwd: root,
    env: { ...process.env, EMBER_USER_DATA_DIR: userDataDir, ...(isRoot ? { ELECTRON_DISABLE_SANDBOX: '1' } : {}) },
    timeout: 60_000,
  })
  const page = await app.firstWindow()
  page.on('request', (req) => {
    const url = req.url()
    if (!/^(app:\/\/ember\/|blob:app:\/\/ember\/|data:)/.test(url)) offOrigin.push(url)
  })
  page.on('pageerror', (err) => console.error('  [pageerror]', err.message))
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

const breathing = (page) => page.getByRole('heading', { name: /Breathing room/ }).first()

try {
  console.log(`[e2e] launching ${usePackaged ? unpacked : 'electron .'} (userData ${userDataDir})`)

  // ---- First launch: create the first account.
  {
    const { app, page } = await launch()
    check((await page.title()) === 'Ember', 'document title is "Ember"')
    const win = await app.browserWindow(page)
    check((await win.evaluate((w) => w.getTitle())) === 'Ember', 'native window title is "Ember"')
    check(page.url().startsWith('app://ember/'), `served from app://ember (${page.url()})`)
    const desktop = await page.evaluate(() => window.emberDesktop)
    check(desktop?.isDesktop === true && typeof desktop.version === 'string', `window.emberDesktop exposed (${JSON.stringify(desktop)})`)
    check(await page.evaluate(() => typeof window.require === 'undefined' && typeof window.process === 'undefined'), 'no Node APIs in renderer')

    await page.getByRole('heading', { level: 1, name: 'Ember' }).waitFor({ state: 'visible', timeout: 20_000 })
    check(true, 'h1 "Ember" visible')

    const fontOk = await page.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('16px Outfit')
    })
    check(fontOk, 'Outfit font loaded locally')

    await page.getByLabel('Balance now', { exact: true }).first().fill('25000')
    await page.getByRole('button', { name: 'Light the hearth' }).click()
    await breathing(page).waitFor({ state: 'visible', timeout: 10_000 })
    check(true, 'Breathing room heading appears after lighting the hearth')
    const saved = await page.evaluate(() => localStorage.getItem('ember-state-v1') ?? '')
    check(saved.length > 0, 'state written to localStorage (ember-state-v1)')
    await app.close()
  }

  // ---- Relaunch with the same userData: the account must persist.
  {
    const { app, page } = await launch()
    await page.getByRole('heading', { level: 1, name: 'Ember' }).waitFor({ state: 'visible', timeout: 20_000 })
    const lightButtons = await page.getByRole('button', { name: 'Light the hearth' }).count()
    check(lightButtons === 0, 'no "Light the hearth" form after relaunch (account persisted)')
    check(await breathing(page).isVisible(), 'Breathing room heading shown immediately after relaunch')
    const saved = await page.evaluate(() => localStorage.getItem('ember-state-v1') ?? '')
    check(saved.includes('25000') || saved.includes('2500000'), 'persisted state contains the balance')
    await app.close()
  }

  check(offOrigin.length === 0, `no request left app:// (${offOrigin.length} off-origin: ${offOrigin.slice(0, 5).join(', ')})`)
} catch (err) {
  failed = true
  console.error('[e2e] error:', err)
} finally {
  rmSync(userDataDir, { recursive: true, force: true })
}

console.log(failed ? '[e2e] FAILED' : '[e2e] PASSED')
process.exit(failed ? 1 : 0)
