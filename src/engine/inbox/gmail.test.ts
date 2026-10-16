import { describe, it, expect, vi } from 'vitest'
import { GMAIL_READONLY_SCOPE, buildAuthUrl, fetchReceiptMessages, isGmailConfigured, requestGmailAccess } from './gmail.ts'

describe('gmail stub', () => {
  it('is not configured without VITE_GOOGLE_CLIENT_ID', () => {
    expect(isGmailConfigured()).toBe(false)
  })

  it('asks only for the read-only scope', () => {
    const url = new URL(buildAuthUrl('cid', 'https://ember.example/cb', 'st', 'chal'))
    expect(url.searchParams.get('scope')).toBe(GMAIL_READONLY_SCOPE)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('rejects without making any network call', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    await expect(requestGmailAccess()).rejects.toThrow(/not switched on/)
    await expect(fetchReceiptMessages({ accessToken: 'x', expiresAt: '' }, '2026-10-01T00:00:00Z')).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
