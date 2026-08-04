/**
 * THE ROW MATRIX — what gets measured, and the id scheme that names it.
 *
 * Rows are keyed by a stable id rather than held in an array, so a git diff of
 * docs/brand/census.json shows one changed block per screen instead of a
 * whole-file reflow when a row is inserted. The id has to be parseable back
 * into the row it names (census.test.ts asserts parse(format(r)) === r), so
 * every identity field is IN the id and nothing else is.
 *
 *   screen . WIDTHxHEIGHT . theme . state
 *   app.375x812.dark.seeded
 *
 * `mobile` is deliberately NOT an identity field: it is a function of the
 * viewport width (isMobileViewport), so carrying it separately would let the
 * id and the emulation disagree. `actions` is not either — it is reserved
 * capacity (see below), and two rows differing only by their action script
 * would collide, which census.test.ts's uniqueness assertion catches.
 */

export type Screen = 'landing' | 'app'
export type Theme = 'light' | 'dark'
/**
 * Which storage fixture the row boots with. This also drives the cold-start
 * gate: Root.tsx renders <Landing> iff hasSavedState() is false, so 'fresh'
 * (write nothing) IS the landing and a fixture IS the app. There is no other
 * lever — the gate reads storage, not a query string.
 */
export type State = 'fresh' | 'seeded' | 'cold'

export interface RowId {
  screen: Screen
  width: number
  height: number
  theme: Theme
  state: State
}

/**
 * A CDP input event to dispatch before capture. Empty for every row today.
 *
 * It exists so a future round can census the keypad open, or a modal, without
 * bumping schemaVersion — the artifact would simply gain rows whose `actions`
 * is non-empty. Anything that uses it must re-verify the settle check: an
 * interaction is the most likely source of a row that will not hold still.
 */
export interface Action {
  type: string
  [key: string]: unknown
}

export interface MatrixRow extends RowId {
  actions: Action[]
}

/** Chrome's own mobile/desktop split. Below this, emulate a touch device. */
export const MOBILE_MAX_WIDTH = 768

export function isMobileViewport(width: number): boolean {
  return width < MOBILE_MAX_WIDTH
}

export function formatRowId(row: RowId): string {
  return `${row.screen}.${row.width}x${row.height}.${row.theme}.${row.state}`
}

const SCREENS: Screen[] = ['landing', 'app']
const THEMES: Theme[] = ['light', 'dark']
const STATES: State[] = ['fresh', 'seeded', 'cold']

export function parseRowId(id: string): RowId {
  const parts = id.split('.')
  if (parts.length !== 4) throw new Error(`census: malformed row id "${id}"`)
  const [screen, viewport, theme, state] = parts
  const wh = /^(\d+)x(\d+)$/.exec(viewport)
  if (wh === null) throw new Error(`census: malformed viewport in row id "${id}"`)
  if (!SCREENS.includes(screen as Screen)) throw new Error(`census: unknown screen in "${id}"`)
  if (!THEMES.includes(theme as Theme)) throw new Error(`census: unknown theme in "${id}"`)
  if (!STATES.includes(state as State)) throw new Error(`census: unknown state in "${id}"`)
  return {
    screen: screen as Screen,
    width: Number(wh[1]),
    height: Number(wh[2]),
    theme: theme as Theme,
    state: state as State,
  }
}

/** The identity subset of a matrix row — what the id encodes, and only that. */
export function identityOf(row: MatrixRow): RowId {
  return {
    screen: row.screen,
    width: row.width,
    height: row.height,
    theme: row.theme,
    state: row.state,
  }
}

const row = (screen: Screen, width: number, height: number, theme: Theme, state: State): MatrixRow => ({
  screen,
  width,
  height,
  theme,
  state,
  actions: [],
})

/**
 * TWELVE ROWS: screen x viewport x theme. About 3s each.
 *
 * Rounds 1-4 measured four and two of the gaps mattered — nobody had ever
 * censused the landing in dark, and the landing is the one surface the record
 * called "at law". A claim about a surface nobody measured in both themes is a
 * claim about one theme.
 *
 * The 'cold' fixture ships (scripts/census/fixtures/cold.json) but no row uses
 * it. A fixture costs nothing to keep; a row costs 3s on every run. The
 * staleness hash picks the fixture up either way — it is in PIXEL_INPUTS
 * regardless of whether a row reads it.
 *
 * BEFORE YOU UNCOMMENT THEM, KNOW THIS. Measured on the tree of commit a2d4e6d
 * (2026-08-04), both cold rows FAIL the settle check as the tool is written:
 * two captures 400ms apart differ, and so does the retry. Given a 5s pause
 * before capture they settle and read
 *   app.375x812.dark.cold   F 54.1 / B 33.9 / G 9.8 / A 2.2   dev 11.8
 *   app.375x812.light.cold  F 52.9 / B 39.4 / G 5.6 / A 2.1   dev 19.0
 * so the page is not perpetually animating — something transient is draining.
 * The day-1 state has no persisted health snapshot, so the app finalises one on
 * mount, and the reward toasts that follow live ~1.8-2.6s (src/hooks/
 * useRewards.ts). The settle check is right to refuse the row rather than
 * average across a toast; whoever wants these rows has to decide first whether
 * "at rest" means "after the toast queue drains", and say so in the tool.
 */
export const MATRIX: MatrixRow[] = [
  row('landing', 375, 812, 'light', 'fresh'),
  row('landing', 375, 812, 'dark', 'fresh'),
  row('landing', 1440, 900, 'light', 'fresh'),
  row('landing', 1440, 900, 'dark', 'fresh'),
  row('app', 375, 812, 'light', 'seeded'),
  row('app', 375, 812, 'dark', 'seeded'),
  // 1024 AND 1280 ARE BREAKPOINTS, NOT DEVICES, AND THAT IS WHY THEY ARE HERE.
  // Round 5 added a width-gated rule (tokens.css: the archive card takes the
  // Sand counter ground in light from 1400px up) and a rule gated at a width
  // nobody censuses is a claim about a screen nobody looked at — the shape of
  // every defect rounds 3-5 had to unpick. So both sides of the gate are
  // measured: 1024 is where the app stops being a phone column and where the
  // .main-stack measure first fills the viewport, and 1280 is the widest width
  // at which NO give-back applies, i.e. the worst light desktop the app ships.
  // 1024 dark is here for a second reason: it is the worst app row in the
  // matrix on the window reading (mean-dev 20.9 against 1440 dark's 3.3), and
  // nothing but a censused row would have said so.
  row('app', 1024, 900, 'light', 'seeded'),
  row('app', 1024, 900, 'dark', 'seeded'),
  row('app', 1280, 900, 'light', 'seeded'),
  row('app', 1280, 900, 'dark', 'seeded'),
  row('app', 1440, 900, 'light', 'seeded'),
  row('app', 1440, 900, 'dark', 'seeded'),
  // row('app', 375, 812, 'light', 'cold'),
  // row('app', 375, 812, 'dark', 'cold'),
]

/** Row ids, sorted — the artifact's key order and the run order both. */
export const MATRIX_IDS: string[] = MATRIX.map((r) => formatRowId(identityOf(r))).sort()
