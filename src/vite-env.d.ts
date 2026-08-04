/**
 * Local ambient declarations, so the typed build stays green without adding a
 * dependency (`@types/node` / `vite/client` would both be package.json
 * changes, and this project ships none it does not need).
 *
 * Two test files use these, and both have to read source as TEXT rather than
 * import it: src/styles/design.test.ts asserts design-system invariants over
 * the stylesheets (vitest stubs every CSS import to an empty string — `css:
 * false` is the default and it does not exempt `?raw`), and
 * src/localFirst.test.ts walks the tree asserting no module reaches the
 * network — a property of the SOURCE, not of anything a module exports.
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
  /** Dirents, narrowed to the two members the tree walk actually reads. */
  export function readdirSync(
    path: URL,
    options: { withFileTypes: true },
  ): Array<{ name: string; isDirectory(): boolean }>
}
