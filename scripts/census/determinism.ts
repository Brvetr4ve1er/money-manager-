/**
 * DETERMINISM, INJECTED FROM OUTSIDE THE APP.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: no census-only branch in product code. A
 * tree that renders differently when it is being measured is not the tree that
 * ships, and a census of it measures nothing. So every knob here is turned
 * from the debugger side — Page.addScriptToEvaluateOnNewDocument,
 * Emulation.setTimezoneOverride, Emulation.setLocaleOverride,
 * Emulation.setEmulatedMedia — and src/ contains not one line that knows the
 * census exists.
 *
 * The real nondeterminism in this app, found by reading it:
 *
 *   todayISO() -> new Date()   the weekly boss picks a
 *                              day-of-week (engine/boss.ts), the lesson of the
 *                              day is an FNV hash of the day key
 *                              (content/lessons.ts), sampleLedger's rows are
 *                              offsets from today, and the cold-start
 *                              calibration window is measured from it.
 *   toLocaleString()           ~20 bare call sites. A host locale change turns
 *                              "12,000" into "12 000", which changes text
 *                              width, which changes pixel counts. This is the
 *                              non-obvious one and it is why the locale is
 *                              pinned rather than left alone.
 *
 * THE EPOCH: 2025-03-12T09:00:00+01:00. A Wednesday, mid-month, mid-morning,
 * in the target market's zone. One constant pins the boss's day-of-week
 * branch, the lesson hash, the per-day grant ids, sampleLedger's day
 * offsets and every relative day label at once. Changing it moves all of them
 * under every future number, which is why census.test.ts pins the local day it
 * resolves to.
 */

export const CENSUS_EPOCH_ISO = '2025-03-12T09:00:00+01:00'
export const CENSUS_EPOCH_MS = Date.parse(CENSUS_EPOCH_ISO)
/** UTC+1 year-round: the target market, and the zone todayISO's comment is
    written for ("the target market is UTC+1, so UTC keys would roll the health
    snapshot at 01:00 local time"). */
export const CENSUS_TIMEZONE = 'Africa/Algiers'
export const CENSUS_LOCALE = 'en-GB'
/** The store's key (src/state/store.ts). Duplicated deliberately: the census
    seeds storage from OUTSIDE the bundle, so it cannot import the constant —
    census.test.ts asserts the two agree. */
export const STORAGE_KEY = 'ember-state-v1'

/** The local calendar day the frozen epoch resolves to, under CENSUS_TIMEZONE. */
export function censusLocalDay(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CENSUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(CENSUS_EPOCH_MS))
}

export interface DeterminismOptions {
  epochMs: number
  /** Serialised AppState to seed, or null to guarantee an empty slot (which is
      what puts Root.tsx's cold-start gate on the landing surface). */
  storageJson: string | null
}

/**
 * The pre-load script, as source text.
 *
 * Returned as a string rather than a function reference because CDP takes
 * source: it is evaluated in the page's realm before any app JS, on every
 * document the target creates.
 */
export function determinismScript(options: DeterminismOptions): string {
  const seed =
    options.storageJson === null
      ? `    localStorage.removeItem(${JSON.stringify(STORAGE_KEY)});`
      : `    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(options.storageJson)});`

  return `(function () {
  var EPOCH = ${options.epochMs};

  /* CLOCK FREEZE. The zero-arg constructor and Date.now only: Date WITH
     arguments is left alone because the store's calendar arithmetic
     (addDaysISO, weekStartISO, ledger day indices) is built on it, and
     rewriting that would change behaviour rather than pin it. */
  var RealDate = Date;
  function FrozenDate(a, b, c, d, e, f, g) {
    if (!(this instanceof FrozenDate)) return new RealDate(EPOCH).toString();
    switch (arguments.length) {
      case 0: return new RealDate(EPOCH);
      case 1: return new RealDate(a);
      case 2: return new RealDate(a, b);
      case 3: return new RealDate(a, b, c);
      case 4: return new RealDate(a, b, c, d);
      case 5: return new RealDate(a, b, c, d, e);
      case 6: return new RealDate(a, b, c, d, e, f);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  }
  FrozenDate.prototype = RealDate.prototype;
  FrozenDate.now = function () { return EPOCH; };
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;
  Date = FrozenDate;

  /* performance.now is frozen too, so nothing derives a wall clock from it.
     Safe here because no product code reads it — only React's scheduler does,
     and a non-advancing clock makes it stop yielding, not stop working. */
  if (typeof performance !== 'undefined') {
    performance.now = function () { return 0; };
  }

  /* No product code calls Math.random today (the lesson rotation is an FNV
     hash and ids come from crypto). Pinned anyway: an unseeded RNG that
     appears later would silently start moving the numbers, and this costs one
     line. */
  var rngState = 0x9e3779b9;
  Math.random = function () {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  /* STORAGE SEED — also the landing/app gate. Root.tsx shows <Landing> iff
     hasSavedState() is false, so writing a fixture here IS "boot into the
     app" and removing the key IS "boot into the landing". Wrapped because on
     the target's initial about:blank the origin is opaque and localStorage
     throws; the script runs again on the real document, where it lands. */
  try {
${seed}
  } catch (err) {
    /* opaque origin — see above */
  }
})();`
}
