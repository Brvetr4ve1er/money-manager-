/**
 * Gmail connection — a clearly-labelled STUB. Nothing here talks to Google.
 *
 * Intended flow, when it is built:
 *   1. The user taps "Connect" (only shown when VITE_GOOGLE_CLIENT_ID is set
 *      at build time). Ember starts Google's OAuth 2.0 browser flow with PKCE
 *      asking for one scope only: `gmail.readonly`. Ember can never send,
 *      delete, label or modify mail.
 *   2. The short-lived access token stays in memory for the session — never
 *      in localStorage, never in exports, never sent to any Ember server
 *      (there is none: Ember is local-first).
 *   3. Ember lists recent messages from a small allow-list of receipt senders
 *      (RedotPay, BaridiMob, Jumia, Yassir, Steam, Netflix, Spotify, Google
 *      Play …), reads their plain-text bodies, and runs the same
 *      `parseMessage` the paste card uses.
 *   4. Every result goes through the review tray exactly like a paste: a
 *      pending slip with its source text, confirmed or rejected by the user.
 *      Nothing read from Gmail is ever logged automatically.
 *   5. Disconnecting forgets the token; revoking access in the Google
 *      account removes it on Google's side too.
 *
 * Until then: `gmailClientId()` reads the build-time env var, the URL
 * builder is pure, and `requestGmailAccess` / `fetchReceiptMessages` reject
 * without making any network call.
 */

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export interface GmailConnection {
  accessToken: string
  expiresAt: string
}

export interface GmailMessage {
  id: string
  from: string
  receivedAt: string
  text: string
}

/** The OAuth client id baked in at build time, or null (the default). */
export function gmailClientId(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const id = env?.VITE_GOOGLE_CLIENT_ID
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null
}

export function isGmailConfigured(): boolean {
  return gmailClientId() !== null
}

/** Pure: the consent URL the flow would open (read-only scope only). */
export function buildAuthUrl(clientId: string, redirectUri: string, state: string, codeChallenge: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_READONLY_SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    include_granted_scopes: 'false',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`
}

export const GMAIL_NOT_AVAILABLE = 'Gmail reading is not switched on in this version yet — paste a receipt instead.'

/** Stub: would run the consent flow. Rejects without any network call. */
export async function requestGmailAccess(): Promise<GmailConnection> {
  throw new Error(GMAIL_NOT_AVAILABLE)
}

/** Stub: would list receipt messages since `sinceISO`. Rejects without any network call. */
export async function fetchReceiptMessages(_conn: GmailConnection, _sinceISO: string): Promise<GmailMessage[]> {
  throw new Error(GMAIL_NOT_AVAILABLE)
}
