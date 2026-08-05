/**
 * THE ROW MATRIX — what gets measured, and the id scheme that names it.
 *
 * Rows are keyed by a stable id rather than held in an array, so a git diff of
 * docs/brand/census.json shows one changed block per screen instead of a
 * whole-file reflow when a row is inserted. The id has to be parseable back
 * into the row it names (census.test.ts asserts parse(format(r)) === r), so
 * every identity field is IN the id and nothing else is.
 *
 *   screen . WIDTHxHEIGHT . theme . state [ . view ]
 *   app.375x812.dark.seeded
 *   app.375x812.dark.seeded.breakdown
 *
 * `mobile` is deliberately NOT an identity field: it is a function of the
 * viewport width (isMobileViewport), so carrying it separately would let the
 * id and the emulation disagree.
 *
 * `view` IS an identity field, and it had to become one. `actions` used to be
 * declared as reserved capacity with the warning that two rows differing only
 * by their action script would collide — which is exactly what census.test.ts's
 * uniqueness assertion catches, and exactly what the first interaction row
 * would have hit. So the thing an action produces gets a name, and the name is
 * in the id; `actions` stays out of it, as the SCRIPT that reaches the view
 * rather than the view itself.
 *
 * THE DEFAULT VIEW IS SPELLED BY OMISSION. `rest` formats to nothing, so every
 * id this repo has ever committed still names the same row and every figure
 * quoted against one still resolves. parseRowId accepts the four-part form and
 * REJECTS the redundant `.rest` suffix, so the spelling stays one-to-one:
 * format is injective and parse(format(r)) === r for every row.
 */

export type Screen = 'landing' | 'app'
export type Theme = 'light' | 'dark'
/**
 * Which storage fixture the row boots with. This also drives the cold-start
 * gate: Root.tsx renders <Landing> iff hasSavedState() is false, so 'fresh'
 * (write nothing) IS the landing and a fixture IS the app. There is no other
 * lever — the gate reads storage, not a query string.
 */
export type State = 'fresh' | 'seeded' | 'cold' | 'day0' | 'dense'
/**
 * What the row has been driven to before capture. `rest` is the page as it
 * loads; anything else names a disclosure the reader opened.
 *
 * A view is NOT a state: the fixture decides what the app knows, the view
 * decides what it is showing. Folding the drawer into `State` would have
 * claimed a storage fixture that does not exist.
 */
export type View = 'rest' | 'breakdown'

export interface RowId {
  screen: Screen
  width: number
  height: number
  theme: Theme
  state: State
  view: View
}

/**
 * One scripted interaction, dispatched after the page is quiet and before the
 * capture. Empty for every row whose view is `rest`.
 *
 * A DOM CLICK, NOT A CDP MOUSE EVENT, and that is a measurement decision rather
 * than a convenience. A synthesised mouse press leaves the pointer sitting on
 * the control, so `.btn:hover:not(:focus-visible)` (tokens.css) paints into
 * every subsequent shot and the row would be measuring a hover state nobody
 * asked for. It would also need coordinates, which are a second copy of the
 * layout. `element.click()` moves no pointer and takes no focus, so what gets
 * measured is the drawer, not the cursor.
 *
 * `then` is the row's own proof the click landed: a selector that must exist
 * afterwards. Without it a renamed class turns an interaction row into a
 * silent duplicate of its `rest` twin — a row that measures the wrong thing
 * and says nothing, which is the failure mode this whole tool exists to end.
 */
export interface Action {
  click: string
  then: string
}

export interface MatrixRow extends RowId {
  actions: Action[]
}

/** Chrome's own mobile/desktop split. Below this, emulate a touch device. */
export const MOBILE_MAX_WIDTH = 768

export function isMobileViewport(width: number): boolean {
  return width < MOBILE_MAX_WIDTH
}

/** The view every row is in unless a script drove it somewhere else. */
export const DEFAULT_VIEW: View = 'rest'

export function formatRowId(row: RowId): string {
  const base = `${row.screen}.${row.width}x${row.height}.${row.theme}.${row.state}`
  return row.view === DEFAULT_VIEW ? base : `${base}.${row.view}`
}

const SCREENS: Screen[] = ['landing', 'app']
const THEMES: Theme[] = ['light', 'dark']
const STATES: State[] = ['fresh', 'seeded', 'cold', 'day0', 'dense']
const VIEWS: View[] = ['rest', 'breakdown']

export function parseRowId(id: string): RowId {
  const parts = id.split('.')
  if (parts.length !== 4 && parts.length !== 5) throw new Error(`census: malformed row id "${id}"`)
  const [screen, viewport, theme, state, view] = parts
  const wh = /^(\d+)x(\d+)$/.exec(viewport)
  if (wh === null) throw new Error(`census: malformed viewport in row id "${id}"`)
  if (!SCREENS.includes(screen as Screen)) throw new Error(`census: unknown screen in "${id}"`)
  if (!THEMES.includes(theme as Theme)) throw new Error(`census: unknown theme in "${id}"`)
  if (!STATES.includes(state as State)) throw new Error(`census: unknown state in "${id}"`)
  if (view !== undefined && !VIEWS.includes(view as View)) {
    throw new Error(`census: unknown view in "${id}"`)
  }
  // ONE SPELLING PER ROW. `app.375x812.light.seeded.rest` names the same row as
  // `app.375x812.light.seeded`, and two strings for one row is how an artifact
  // ends up holding it twice — the collision the uniqueness assertion exists to
  // catch, arriving through the parser instead of the matrix.
  if (view === DEFAULT_VIEW) {
    throw new Error(
      `census: row id "${id}" spells the default view; ${DEFAULT_VIEW} is written by omission`,
    )
  }
  return {
    screen: screen as Screen,
    width: Number(wh[1]),
    height: Number(wh[2]),
    theme: theme as Theme,
    state: state as State,
    view: (view as View) ?? DEFAULT_VIEW,
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
    view: row.view,
  }
}

const row = (screen: Screen, width: number, height: number, theme: Theme, state: State): MatrixRow => ({
  screen,
  width,
  height,
  theme,
  state,
  view: DEFAULT_VIEW,
  actions: [],
})

/**
 * THE HEALTH DRAWER, OPEN.
 *
 * `button.hero-why` is HeroCard's disclosure ("Why this stage?"); the drawer it
 * controls is `#health-breakdown`, which is unmounted until the press — so the
 * `then` selector is the one thing that could not be true if the click missed.
 */
const drawerOpen = (width: number, height: number, theme: Theme): MatrixRow => ({
  screen: 'app',
  width,
  height,
  theme,
  state: 'seeded',
  view: 'breakdown',
  actions: [{ click: 'button.hero-why', then: '#health-breakdown' }],
})

/**
 * TWENTY ROWS: screen x viewport x theme, plus four phone pairs. ~2s each.
 *
 * Rounds 1-4 measured four and two of the gaps mattered — nobody had ever
 * censused the landing in dark, and the landing is the one surface the record
 * called "at law". A claim about a surface nobody measured in both themes is a
 * claim about one theme.
 *
 * THE THREE PAIRS ADDED IN ROUND 7 ARE ALL AT 375, AND THAT IS THE FINDING, NOT
 * A SAVING. Every defect the recon located lives in the phone column, because at
 * 375 the column IS the composition; the desktop twins of all three were
 * measured and cost between nothing and 0.8 mean-dev. Adding them would have
 * bought six rows of confirmation that a defect is width-independent.
 *
 *   .day0      The screen every real user meets first, and nothing measured it.
 *              `fresh` is the LANDING (the gate reads storage) and `cold` is
 *              day-1-with-a-log; neither is the app with profile === null, an
 *              empty ledger and ProfileCard's nine-field setup form open. The
 *              fixture is literally defaultState() serialised, which is what
 *              App's save effect writes on its first mount past the gate.
 *   .dense     One day holding 24 rows. NOT "a big ledger": ArchiveCard windows
 *              to WINDOW_DAYS = 3, so 900 transactions spread over 300 days
 *              render eight rows and a SHORTER document than `seeded`. The card
 *              bounds days and never rows, and the §2.1b stripe alternates per
 *              `ledger-day` — so one dense day is one unbroken ground run, which
 *              is the thing the run-length rule is about.
 *   .breakdown The health drawer open. The only row here that needed tool work
 *              (the `view` field above, and actions actually dispatched in
 *              run.ts), and the only one that measures a surface a user reaches
 *              by pressing something rather than by arriving.
 *
 *   .cold      THE PRE-SETUP APP WITH A WEEK OF ROWS ON IT, and this pair went
 *              live in round 7 step 3 because the change that step shipped
 *              created a screen nothing measured. Card 01 no longer prints a
 *              demo-derived score while `profile` is null: it prints the week
 *              block instead (see HeroCard), and the block's tallest part —
 *              the repeated-category list — needs rows to exist at all. day0
 *              has none, so it renders the block's one-line empty state;
 *              seeded has a profile, so it renders no block. Only this pair
 *              measures the surface with something in it.
 *
 *              THE FIXTURE WAS REDEFINED WITH THE ROW, and the old definition
 *              is why the pair used to be commented out: `cold` meant "day one,
 *              with a log", which sat between day0 and seeded and carried no
 *              state either of them lacked. That was true and it is no longer
 *              the interesting axis. It now holds six rows over five days
 *              before setup — three Food, two Transport, one resist — so the
 *              block renders its facts line, its two-entry repeats list and
 *              its definition note, which is the whole of what the change
 *              draws. Everything else about it is unchanged: profile null,
 *              stage null, healthDate on the frozen day, and nothing that
 *              unlocks on mount (census.test asserts the last one).
 *
 * THE OLD WARNING ABOVE THIS PAIR IS KEPT BECAUSE IT WAS HALF WRONG AND THE
 * WRONG HALF IS INSTRUCTIVE. Measured on the tree of commit a2d4e6d
 * (2026-08-04), both cold rows FAILED the settle check as the tool was then
 * written: two captures 400ms apart differed, and so did the retry. The text
 * blamed "the reward toasts that follow live ~1.8-2.6s". It cannot have been
 * that: newlyEarnedIds(cold) is empty, its xpLog gains nothing on mount, and
 * healthDate already equals the frozen day, so the cold state raises no toast
 * at all. What actually differed between its first captures is the antialiased
 * keyline of the mobile topbar's mute button, re-rastered over the first ~1.1s
 * — tens of pixels, invisible at 2dp. Round 7's settle fix (run.ts: four
 * attempts, `settleAttempts` recorded) is what these rows were waiting for, not
 * a longer sleep, and it is what lets them ship now.
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
  // 1024 dark is here for its own reason: it is the width at which the app
  // stops being a phone column, and a theme swap at a layout boundary is
  // exactly where a ground can invert without anybody looking.
  //
  // THIS COMMENT USED TO CALL 1024 DARK "the worst app row in the matrix on the
  // window reading (mean-dev 20.9 against 1440 dark's 3.3)". Both rows were
  // swapped and neither figure exists in any committed artifact. The census
  // committed at 96b728b (tree 71b5608 — the artifact in force when the line
  // was written) reads app.1024x900.dark.seeded meanDeviation 4.35 against
  // app.1440x900.dark.seeded's 20.32, i.e. 1024 dark is the BEST app row on the
  // window reading and 1440 dark the worst. It still is: 7.01 against 18.08 in
  // the artifact committed at dc529fb. Read docs/brand/census.json, not this
  // paragraph — §2.1b's rule is "quote the row id, or stamp the tree", and
  // quoting the row id while contradicting the file is the worse of the two
  // failures because it looks checked.
  row('app', 1024, 900, 'light', 'seeded'),
  row('app', 1024, 900, 'dark', 'seeded'),
  row('app', 1280, 900, 'light', 'seeded'),
  row('app', 1280, 900, 'dark', 'seeded'),
  row('app', 1440, 900, 'light', 'seeded'),
  row('app', 1440, 900, 'dark', 'seeded'),
  row('app', 375, 812, 'light', 'day0'),
  row('app', 375, 812, 'dark', 'day0'),
  row('app', 375, 812, 'light', 'dense'),
  row('app', 375, 812, 'dark', 'dense'),
  row('app', 375, 812, 'light', 'cold'),
  row('app', 375, 812, 'dark', 'cold'),
  drawerOpen(375, 812, 'light'),
  drawerOpen(375, 812, 'dark'),
]

/** Row ids, sorted — the artifact's key order and the run order both. */
export const MATRIX_IDS: string[] = MATRIX.map((r) => formatRowId(identityOf(r))).sort()
