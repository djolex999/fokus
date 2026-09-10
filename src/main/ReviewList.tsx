import { useCallback, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { pendingCaptures, resolveCapture } from '../lib/db'
import type { PendingCapture, Resolution } from '../lib/db'
import { failure } from '../lib/ipc'
import { DATE_LOCALE, t } from '../lib/i18n'

const CAPTURES_CHANGED_EVENT = 'captures:changed'

const ACTIONS: Array<{ resolution: Resolution; label: string }> = [
  { resolution: 'done', label: t.resolveDone },
  { resolution: 'scheduled', label: t.resolveScheduled },
  { resolution: 'deleted', label: t.resolveDelete },
]

function formatTime(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  // Stored as UTC, shown local.
  return parsed.toLocaleString(DATE_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ReviewList(): JSX.Element {
  const [rows, setRows] = useState<PendingCapture[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setRows(await pendingCaptures())
      setError(null)
    } catch (e: unknown) {
      setError(failure(t.errCannotLoad, e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const pending = listen(CAPTURES_CHANGED_EVENT, () => void refresh())
    const onFocus = (): void => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      pending.then((unlisten) => unlisten()).catch(() => undefined)
    }
  }, [refresh])

  const resolve = useCallback(
    async (id: number, resolution: Resolution): Promise<void> => {
      // Optimistic: the row leaves the list immediately, and a failed write puts
      // it back rather than pretending it succeeded.
      setRows((current) => (current === null ? null : current.filter((row) => row.id !== id)))
      try {
        await resolveCapture(id, resolution)
      } catch (e: unknown) {
        setError(failure(t.errNotSaved, e))
        await refresh()
      }
    },
    [refresh],
  )

  if (rows === null) {
    return <div className="screen" />
  }

  return (
    <div className="screen">
      <header className="header">
        <h1>{t.tabCaptures}</h1>
        <span className="count">{rows.length}</span>
      </header>

      {error !== null && <p className="error">{error}</p>}

      {rows.length === 0 ? (
        <p className="empty">{t.nothingPending}</p>
      ) : (
        <ul className="rows">
          {rows.map((row) => (
            <li key={row.id} className="row">
              <div className="row-text">
                <span className="text">{row.text}</span>
                <span className="meta">
                  {formatTime(row.created_at)} · {row.task}
                </span>
              </div>
              <div className="row-actions">
                {ACTIONS.map((action) => (
                  <button
                    key={action.resolution}
                    type="button"
                    onClick={() => void resolve(row.id, action.resolution)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
