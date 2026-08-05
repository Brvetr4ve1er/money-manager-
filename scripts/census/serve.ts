/**
 * SERVE THE THING THAT SHIPS.
 *
 * A production `vite build` into a temp outDir, then `vite preview` over it —
 * both through Vite's Node API, which is already a devDependency, so there is
 * no hand-written static server and no new package.
 *
 * DELIBERATELY NOT THE DEV SERVER. `vite dev` injects the HMR client and React
 * Refresh, and it mounts an error overlay that can land in a screenshot. The
 * census exists to say what colour the shipped app is; measuring a
 * development-only DOM would answer a different question and nobody would
 * notice it had.
 *
 * The build goes under node_modules/.tmp/ rather than dist/ so a census run
 * never clobbers a contributor's `npm run build` output — the two are not the
 * same artifact and .gitignore already covers node_modules wholesale.
 */

import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'
import { REPO_ROOT } from './inputs.ts'

const ROOT = fileURLToPath(REPO_ROOT)
const OUT_DIR = 'node_modules/.tmp/census'

export interface Served {
  origin: string
  close(): Promise<void>
}

export async function serveProductionBuild(): Promise<Served> {
  await build({
    root: ROOT,
    // 'warn' keeps the module-transform chatter out of the census's own output
    // while leaving real warnings (including vite.config's VITE_SITE_URL one)
    // visible — a build that warned and was not read is how config drifts.
    logLevel: 'warn',
    build: { outDir: OUT_DIR, emptyOutDir: true },
  })

  const server = await preview({
    root: ROOT,
    logLevel: 'warn',
    build: { outDir: OUT_DIR },
    // Port 0: the OS picks a free one. A fixed port would make two censuses
    // (or a census beside a running dev server) collide.
    preview: { port: 0, strictPort: false, host: '127.0.0.1', open: false },
  })

  const address = server.httpServer.address()
  if (address === null || typeof address === 'string') {
    throw new Error('census: vite preview did not bind a TCP port')
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve) => server.httpServer.close(() => resolve()))
    },
  }
}
