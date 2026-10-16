/**
 * Learn slice — STUB wired into AppState by Phase 0. The owning agent
 * replaces the state shape, sanitizer, merge and reducer; the wiring in
 * store.ts / reducer.ts stays as-is (defaultLearn, sanitizeLearn,
 * mergeLearn, learnReducer, and actions prefixed 'learn/').
 */

export interface LearnState {
  /** Placeholder so the slice serializes; replaced by the real shape. */
  v: 1
}

export function defaultLearn(): LearnState {
  return { v: 1 }
}

export function sanitizeLearn(_v: unknown): LearnState {
  return defaultLearn()
}

export function mergeLearn(a: LearnState, _b: LearnState): LearnState {
  return a
}

export type LearnAction = { type: 'learn/noop' }

export function learnReducer(s: LearnState, _a: LearnAction): LearnState {
  return s
}
