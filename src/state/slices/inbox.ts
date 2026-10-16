/**
 * Inbox slice — STUB wired into AppState by Phase 0. The owning agent
 * replaces the state shape, sanitizer, merge and reducer; the wiring in
 * store.ts / reducer.ts stays as-is (defaultInbox, sanitizeInbox,
 * mergeInbox, inboxReducer, and actions prefixed 'inbox/').
 */

export interface InboxState {
  /** Placeholder so the slice serializes; replaced by the real shape. */
  v: 1
}

export function defaultInbox(): InboxState {
  return { v: 1 }
}

export function sanitizeInbox(_v: unknown): InboxState {
  return defaultInbox()
}

export function mergeInbox(a: InboxState, _b: InboxState): InboxState {
  return a
}

export type InboxAction = { type: 'inbox/noop' }

export function inboxReducer(s: InboxState, _a: InboxAction): InboxState {
  return s
}
