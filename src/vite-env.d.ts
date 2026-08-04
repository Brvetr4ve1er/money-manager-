/**
 * Local ambient declarations, so the typed build stays green without adding a
 * dependency (`@types/node` / `vite/client` would both be package.json
 * changes, and this project ships none it does not need).
 *
 * Three test files use these, and all three have to read source as TEXT rather
 * than import it: src/styles/design.test.ts asserts design-system invariants
 * over the stylesheets (vitest stubs every CSS import to an empty string —
 * `css: false` is the default and it does not exempt `?raw`),
 * src/localFirst.test.ts walks the tree asserting no module reaches the
 * network — a property of the SOURCE, not of anything a module exports — and
 * src/shareCard.test.ts reads index.html, which no module imports and no render
 * can reach, to keep the unfurl copy from drifting away from the page.
 *
 * Surface deliberately minimal — two functions, one property, each narrowed to
 * exactly the call this repo makes. A wider stub would start standing in for
 * types nobody has checked.
 */

interface ImportMeta {
  /** The module's own URL — the anchor both test files resolve from. */
  readonly url: string
}

declare module 'node:fs' {
  /** Node accepts a URL here, which is why design.test.ts needs no node:url. */
  export function readFileSync(path: URL, encoding: 'utf8'): string
  /** No encoding: bytes. src/brandAssets.test.ts parses the shipped PNGs, which
      are the one thing in this repo that is not text. Typed as Uint8Array, not
      Buffer — that is the part of Buffer this repo actually uses, and a wider
      stub would start standing in for types nobody has checked. */
  export function readFileSync(path: URL): Uint8Array
  /** Dirents, narrowed to the two members the tree walk actually reads. */
  export function readdirSync(
    path: URL,
    options: { withFileTypes: true },
  ): Array<{ name: string; isDirectory(): boolean }>
  /** Names only — the public/ audit in brandAssets.test.ts needs nothing else. */
  export function readdirSync(path: URL): string[]
}

declare module 'node:zlib' {
  /** IDAT is deflate, so reading a PNG back means inflating it. Sync only:
      these are assertions over a committed file, not a pipeline. */
  export function inflateSync(data: Uint8Array): Uint8Array
}
