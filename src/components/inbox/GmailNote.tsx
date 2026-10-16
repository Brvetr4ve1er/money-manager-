import { useState } from 'react'
import { isGmailConfigured, requestGmailAccess } from '../../engine/inbox/gmail.ts'

/** Collapsed explainer; the Connect button exists only when a client id is
 *  configured at build time, and even then the reader is a stub. */
export function GmailNote() {
  const configured = isGmailConfigured()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <details className="inbox-gmail">
      <summary>Connect Gmail (coming)</summary>
      <p>
        When it arrives, Gmail will be <strong>read-only</strong>: Ember will look only at receipts from senders like
        RedotPay, BaridiMob, Jumia or Steam, never send or change mail, and keep the access on this device.
      </p>
      <p>Everything it finds still lands in this tray as a slip — you confirm or reject each one. Nothing is logged on its own.</p>
      {configured && (
        <>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              requestGmailAccess().catch((e: unknown) => setMsg(e instanceof Error ? e.message : String(e)))
            }}
          >
            Connect
          </button>
          <p role="status" aria-live="polite" className="inbox-note">
            {msg ?? ''}
          </p>
        </>
      )}
    </details>
  )
}
