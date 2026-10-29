import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { pendingCaptures, resolveCapture, scheduledCaptures, updateCaptureText } from '../lib/db'
import type { PendingCapture, Resolution } from '../lib/db'
import { failure } from '../lib/ipc'
import { DATE_LOCALE, fill, t } from '../lib/i18n'

const CAPTURES_CHANGED_EVENT = 'captures:changed'

// Each action's key is the first letter of its label in the current language,
// so the hint and the buttons say the same thing.
const ACTIONS: Array<{ resolution: Resolution; label: string; key: string }> = [
  { resolution: 'done', label: t.resolveDone, key: t.keyDone },
  { resolution: 'scheduled', label: t.resolveScheduled, key: t.keySchedule },
  { resolution: 'deleted', label: t.resolveDelete, key: t.keyDelete },
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

/**
 * The webview's clipboard, with the old selection trick behind it. No plugin:
 * one button does not justify a dependency. Called from a click, which is the
 * user gesture both paths need.
 */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the selection copy.
    }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(area)
  if (!copied) throw new Error('the clipboard refused the copy')
}

export function ReviewList(): JSX.Element {
  const [rows, setRows] = useState<PendingCapture[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Keyboard triage: the row the letter keys act on.
  const [selected, setSelected] = useState(0)
  // The row being edited, and its text so far.
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  // Read by saveEdit instead of the state, and cleared the moment an edit ends.
  // The field saves on blur too, and a blur arriving as it unmounts after
  // Escape would otherwise save the edit Escape had just thrown away.
  const editingRef = useRef<{ id: number; text: string } | null>(null)
  const startEdit = useCallback((value: { id: number; text: string } | null): void => {
    editingRef.current = value
    setEditing(value)
  }, [])
  const listRef = useRef<HTMLUListElement | null>(null)
  const focusedOnce = useRef(false)

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

  // Keep the selection on a row that exists as rows leave the list, and give
  // the list the keyboard the first time it has rows, so triage starts at once.
  useEffect(() => {
    if (rows === null) return
    setSelected((current) => Math.max(0, Math.min(current, rows.length - 1)))
    if (!focusedOnce.current && rows.length > 0) {
      focusedOnce.current = true
      listRef.current?.focus()
    }
  }, [rows])

  const resolve = useCallback(
    async (id: number, resolution: Resolution): Promise<void> => {
      // Optimistic: the row leaves the list immediately, and a failed write puts
      // it back rather than pretending it succeeded.
      setRows((current) => (current === null ? null : current.filter((row) => row.id !== id)))
      try {
        await resolveCapture(id, resolution)
      } catch (e: unknown) {
        // Refresh first, then the error: a successful refresh clears the error
        // line, and in the other order it cleared this one in the same batch,
        // so the row came back with no word about why.
        await refresh()
        setError(failure(t.errNotSaved, e))
      }
    },
    [refresh],
  )

  const saveEdit = useCallback(async (): Promise<void> => {
    const current = editingRef.current
    if (current === null) return
    startEdit(null)
    const text = current.text.trim()
    const original = rows?.find((row) => row.id === current.id)?.text
    listRef.current?.focus()
    // Empty or unchanged is a cancel, the same as in the widget.
    if (text === '' || text === original) return
    setRows((list) =>
      list === null ? null : list.map((row) => (row.id === current.id ? { ...row, text } : row)),
    )
    try {
      await updateCaptureText(current.id, text)
    } catch (e: unknown) {
      await refresh()
      setError(failure(t.errNotSaved, e))
    }
  }, [rows, refresh, startEdit])

  const copyScheduled = useCallback(async (): Promise<void> => {
    setNote(null)
    try {
      const scheduled = await scheduledCaptures()
      if (scheduled.length === 0) {
        setNote(t.nothingScheduled)
        return
      }
      // Plain lines, dated, ready to paste into a calendar or notes.
      await copyText(scheduled.map((row) => `${formatTime(row.created_at)}  ${row.text}`).join('\n'))
      setNote(fill(t.copiedScheduled, { n: scheduled.length }))
    } catch (e: unknown) {
      setError(failure(t.errNotCopied, e))
    }
  }, [])

  // Triage from the keyboard. On the list rather than the window, so typing in
  // the edit field, or on another tab, is never read as a command.
  const onListKey = useCallback(
    (event: ReactKeyboardEvent<HTMLUListElement>): void => {
      if (rows === null || rows.length === 0 || editing !== null) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const row = rows[selected]
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelected((i) => Math.min(i + 1, rows.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelected((i) => Math.max(i - 1, 0))
        return
      }
      if (row === undefined) return
      const key = event.key.toLowerCase()
      if (key === t.keyEdit) {
        event.preventDefault()
        startEdit({ id: row.id, text: row.text })
        return
      }
      const action = ACTIONS.find((a) => a.key === key)
      if (action !== undefined) {
        event.preventDefault()
        void resolve(row.id, action.resolution)
      }
    },
    [rows, selected, editing, resolve, startEdit],
  )

  if (rows === null) {
    return <div className="screen" />
  }

  return (
    <div className="screen">
      <header className="header">
        <h1>{t.tabCaptures}</h1>
        <span className="count">{rows.length}</span>
        <button type="button" className="header-action" onClick={() => void copyScheduled()}>
          {t.copyScheduled}
        </button>
      </header>

      {error !== null && <p className="error">{error}</p>}
      {note !== null && <p className="note">{note}</p>}

      {rows.length === 0 ? (
        <p className="empty">{t.nothingPending}</p>
      ) : (
        <>
          <ul className="rows" ref={listRef} tabIndex={0} onKeyDown={onListKey}>
            {rows.map((row, index) => (
              <li
                key={row.id}
                className={index === selected ? 'row selected' : 'row'}
                onMouseDown={() => setSelected(index)}
              >
                <div className="row-text">
                  {editing?.id === row.id ? (
                    <input
                      className="edit"
                      autoFocus
                      value={editing.text}
                      onChange={(e) => startEdit({ id: row.id, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void saveEdit()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          startEdit(null)
                          listRef.current?.focus()
                        }
                      }}
                      onBlur={() => void saveEdit()}
                    />
                  ) : (
                    <span className="text" onClick={() => startEdit({ id: row.id, text: row.text })}>
                      {row.text}
                    </span>
                  )}
                  <span className="meta">
                    {row.task === null
                      ? formatTime(row.created_at)
                      : `${formatTime(row.created_at)} · ${row.task}`}
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
          <p className="hint">{t.reviewKeysHint}</p>
        </>
      )}
    </div>
  )
}
