import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { listen } from '@tauri-apps/api/event'
import { captureReducer } from '../types/capture'
import { PLACEHOLDER_SESSION_ID, countCaptures, insertCapture, openDatabase } from '../lib/db'
import { describeError, mark, restoreFocus } from '../lib/ipc'

const CAPTURE_OPEN_EVENT = 'capture:open'
const CONFIRMATION_MS = 1000

export function CaptureWidget(): JSX.Element {
  const [state, dispatch] = useReducer(captureReducer, { kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    openDatabase().catch((e: unknown) => setError(describeError(e)))
  }, [])

  useEffect(() => {
    const pending = listen(CAPTURE_OPEN_EVENT, () => {
      setError(null)
      dispatch({ type: 'open' })
    })
    return () => {
      pending
        .then((unlisten) => unlisten())
        .catch(() => {
          // The window is going away; there is nothing left to unsubscribe from.
        })
    }
  }, [])

  // Focus follows the state machine rather than the event handler, so every
  // path into 'capturing' lands the caret in the same place.
  useEffect(() => {
    if (state.kind !== 'capturing') return
    const input = inputRef.current
    if (input === null) return
    input.focus()
    input.select()
    void mark('input focused')
  }, [state.kind])

  // The confirmation clears itself. The cleanup cancels the timer if the state
  // moves on first, so pressing the shortcut again inside the second does not
  // leave a stray close queued against the new capture.
  useEffect(() => {
    if (state.kind !== 'confirmed') return
    const timer = window.setTimeout(() => dispatch({ type: 'close' }), CONFIRMATION_MS)
    return () => window.clearTimeout(timer)
  }, [state.kind])

  const returnFocus = useCallback(async (): Promise<void> => {
    try {
      await restoreFocus()
    } catch (e: unknown) {
      setError(describeError(e))
    }
  }, [])

  const close = useCallback(async (): Promise<void> => {
    dispatch({ type: 'close' })
    await returnFocus()
  }, [returnFocus])

  const commit = useCallback(
    async (draft: string): Promise<void> => {
      const text = draft.trim()
      if (text === '') {
        await close()
        return
      }
      try {
        await insertCapture(PLACEHOLDER_SESSION_ID, text)
      } catch (e: unknown) {
        // Deliberately does not return focus. The text is still in the input,
        // and losing it silently is worse than the interruption of noticing.
        setError(describeError(e))
        return
      }
      void mark('row inserted')

      // Counted before focus leaves, so the widget never shows the committed
      // text for a frame before the confirmation replaces it. Costs one indexed
      // COUNT, low single digit milliseconds.
      try {
        dispatch({ type: 'confirm', returnNumber: await countCaptures(PLACEHOLDER_SESSION_ID) })
      } catch (e: unknown) {
        // The capture is already saved. Failing to count it is not worth
        // holding the user here for.
        console.error('capture saved, but counting it failed:', describeError(e))
        dispatch({ type: 'close' })
      }
      void mark('confirmation shown')

      await returnFocus()
    },
    [close, returnFocus],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (state.kind !== 'capturing') return
      if (event.key === 'Enter') {
        event.preventDefault()
        void mark('enter pressed')
        void commit(state.draft)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        void close()
      }
    },
    [state, commit, close],
  )

  return (
    <div className="widget" data-tauri-drag-region>
      {state.kind === 'capturing' ? (
        <input
          ref={inputRef}
          className="capture-input"
          type="text"
          value={state.draft}
          placeholder="zapiši misao"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setError(null)
            dispatch({ type: 'edit', draft: event.target.value })
          }}
          onKeyDown={onKeyDown}
        />
      ) : state.kind === 'confirmed' ? (
        <div className="confirmed" data-tauri-drag-region>
          {state.returnNumber}. povratak
        </div>
      ) : (
        <div className="hint" data-tauri-drag-region>
          ⌘⇧Space
        </div>
      )}
      {error !== null && <div className="error">nije sačuvano: {error}</div>}
    </div>
  )
}
