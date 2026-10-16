import { useRef, useState } from 'react'
import { sanitizeState, type AppState } from '../state/store.ts'

/**
 * Import a JSON export. The file is untrusted: it goes through the same
 * sanitizer as a load, then MERGES into this device's data via the cross-tab
 * merge (HYDRATE) — never a replace — so importing an old backup can add what
 * this device is missing but can never erase newer work.
 */
export function ImportBackup({ onMerge }: { onMerge: (incoming: AppState) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  async function read(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
      const incoming = sanitizeState(parsed)
      onMerge(incoming)
      setStatus(
        `Merged ${incoming.transactions.length} log${incoming.transactions.length === 1 ? '' : 's'} from the backup. Nothing on this device was removed.`,
      )
    } catch {
      setStatus('That file is not an Ember backup — nothing was changed.')
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className="import-row">
      <label className="btn" htmlFor="import-backup">
        Import a backup
      </label>
      <input
        id="import-backup"
        ref={input}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void read(f)
        }}
      />
      {status && (
        <p className="support-saved" role="status">
          {status}
        </p>
      )}
    </div>
  )
}
