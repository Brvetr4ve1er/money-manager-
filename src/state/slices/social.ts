/**
 * Social slice — STUB wired into AppState by Phase 0. The owning agent
 * replaces the state shape, sanitizer, merge and reducer; the wiring in
 * store.ts / reducer.ts stays as-is (defaultSocial, sanitizeSocial,
 * mergeSocial, socialReducer, and actions prefixed 'social/').
 */

export interface SocialState {
  /** Placeholder so the slice serializes; replaced by the real shape. */
  v: 1
}

export function defaultSocial(): SocialState {
  return { v: 1 }
}

export function sanitizeSocial(_v: unknown): SocialState {
  return defaultSocial()
}

export function mergeSocial(a: SocialState, _b: SocialState): SocialState {
  return a
}

export type SocialAction = { type: 'social/noop' }

export function socialReducer(s: SocialState, _a: SocialAction): SocialState {
  return s
}
