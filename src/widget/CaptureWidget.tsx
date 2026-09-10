import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import {
  formatCountdown,
  remainingSeconds,
  sessionOf,
  widgetReducer,
} from '../types/session'
import type { RunningSession, WidgetState } from '../types/session'
import {
  countCaptures,
  endSession,
  insertCapture,
  openDatabase,
  reconcileOpenSessions,
  startSession,
  touchSession,
} from '../lib/db'
import { describeError, failure, mark, quitApp, restoreFocus } from '../lib/ipc'

const SHORTCUT_EVENT = 'capture:open'
const ABANDON_EVENT = 'session:abandon'
const QUIT_EVENT = 'app:quit'
const CAPTURES_CHANGED_EVENT = 'captures:changed'
const CONFIRMATION_MS = 1000
/** Re-render only. The remaining time is computed from the wall clock, so a
 *  missed or delayed tick costs nothing but a stale frame. */
const TICK_MS = 1000

const initialState: WidgetState = { kind: 'idle' }

export function CaptureWidget(): JSX.Element {
  const [state, dispatch] = useReducer(widgetReducer, initialState)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Mirrors state for callbacks that must not be rebuilt on every keystroke.
  const stateRef = useRef<WidgetState>(state)
  stateRef.current = state

  useEffect(() => {
    const prepare = async (): Promise<void> => {
      await openDatabase()
      const closed = await reconcileOpenSessions()
      if (closed > 0) {
        console.info(`closed ${closed} session(s) left open by a previous run`)
      }
    }
    prepare().catch((e: unknown) => setError(failure('baza nije otvorena', e)))
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const returnFocus = useCallback(async (): Promise<void> => {
    try {
      await restoreFocus()
    } catch (e: unknown) {
      setError(failure('fokus nije vraćen', e))
    }
  }, [])

  const finishSession = useCallback(
    async (session: RunningSession, outcome: 'completed' | 'abandoned'): Promise<void> => {
      dispatch(outcome === 'completed' ? { type: 'sessionCompleted' } : { type: 'sessionAbandoned' })
      try {
        await endSession(session.id, outcome)
      } catch (e: unknown) {
        setError(failure('sesija nije zatvorena', e))
      }
    },
    [],
  )

  // The countdown running out ends the session. Derived from the wall clock, so
  // this fires correctly on the first tick after the machine wakes from sleep.
  useEffect(() => {
    if (state.kind !== 'running' && state.kind !== 'capturing' && state.kind !== 'confirmed') {
      return
    }
    if (remainingSeconds(state.session, now) > 0) return
    void finishSession(state.session, 'completed')
  }, [state, now, finishSession])

  useEffect(() => {
    const subscriptions: Array<Promise<UnlistenFn>> = [
      listen(SHORTCUT_EVENT, () => {
        setError(null)
        dispatch({ type: 'shortcut' })
        const session = sessionOf(stateRef.current)
        if (session !== null) {
          void touchSession(session.id)
        }
      }),
      listen(ABANDON_EVENT, () => {
        const session = sessionOf(stateRef.current)
        if (session !== null) {
          void finishSession(session, 'abandoned')
        }
      }),
      listen(QUIT_EVENT, () => {
        const session = sessionOf(stateRef.current)
        const done = session === null ? Promise.resolve() : endSession(session.id, 'abandoned')
        // Quit regardless: a failed write must not strand the user in an app
        // that will not close.
        done.catch(() => undefined).finally(() => void quitApp())
      }),
    ]
    return () => {
      for (const pending of subscriptions) {
        pending.then((unlisten) => unlisten()).catch(() => undefined)
      }
    }
  }, [finishSession])

  // Focus follows the state machine rather than the event handler, so every
  // path into a text state lands the caret in the same place.
  useEffect(() => {
    if (state.kind !== 'capturing' && state.kind !== 'starting') return
    const input = inputRef.current
    if (input === null) return
    input.focus()
    input.select()
    void mark('input focused')
  }, [state.kind])

  useEffect(() => {
    if (state.kind !== 'confirmed') return
    const timer = window.setTimeout(() => dispatch({ type: 'captureDismissed' }), CONFIRMATION_MS)
    return () => window.clearTimeout(timer)
  }, [state.kind])

  const beginSession = useCallback(
    async (draft: string, plannedMin: 25 | 50): Promise<void> => {
      const task = draft.trim()
      if (task === '') {
        dispatch({ type: 'dismiss' })
        await returnFocus()
        return
      }
      try {
        dispatch({ type: 'sessionStarted', session: await startSession(task, plannedMin) })
      } catch (e: unknown) {
        setError(failure('sesija nije počela', e))
        return
      }
      void mark('session started')
      await returnFocus()
    },
    [returnFocus],
  )

  const commitCapture = useCallback(
    async (session: RunningSession, draft: string): Promise<void> => {
      const text = draft.trim()
      if (text === '') {
        dispatch({ type: 'captureDismissed' })
        await returnFocus()
        return
      }
      try {
        await insertCapture(session.id, text)
      } catch (e: unknown) {
        // Deliberately does not return focus. The text is still in the input,
        // and losing it silently is worse than the interruption of noticing.
        setError(failure('nije sačuvano', e))
        return
      }
      void mark('row inserted')

      // Counted before focus leaves, so the widget never shows the committed
      // text for a frame before the confirmation replaces it.
      try {
        dispatch({ type: 'captureConfirmed', returnNumber: await countCaptures(session.id) })
      } catch (e: unknown) {
        console.error('capture saved, but counting it failed:', describeError(e))
        dispatch({ type: 'captureDismissed' })
      }
      void mark('confirmation shown')

      await returnFocus()
      void touchSession(session.id)
      void emit(CAPTURES_CHANGED_EVENT)
    },
    [returnFocus],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      const current = stateRef.current
      if (event.key === 'Tab' && current.kind === 'starting') {
        event.preventDefault()
        dispatch({ type: 'toggleDuration' })
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (current.kind === 'starting') {
          void beginSession(current.draft, current.plannedMin)
          return
        }
        if (current.kind === 'capturing') {
          void mark('enter pressed')
          void commitCapture(current.session, current.draft)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (current.kind === 'starting') {
          dispatch({ type: 'dismiss' })
        } else if (current.kind === 'capturing') {
          dispatch({ type: 'captureDismissed' })
        }
        void returnFocus()
      }
    },
    [beginSession, commitCapture, returnFocus],
  )

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    setError(null)
    dispatch({ type: 'edit', draft: event.target.value })
  }, [])

  return (
    <div className="widget" data-tauri-drag-region>
      {renderBody(state, now, inputRef, onChange, onKeyDown)}
      {error !== null && <div className="error">{error}</div>}
    </div>
  )
}

function renderBody(
  state: WidgetState,
  now: number,
  inputRef: React.MutableRefObject<HTMLInputElement | null>,
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void,
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void,
): JSX.Element {
  switch (state.kind) {
    case 'idle':
      return (
        <div className="hint" data-tauri-drag-region>
          ⌘⇧Space
        </div>
      )

    case 'starting':
      return (
        <>
          <input
            ref={inputRef}
            className="capture-input"
            type="text"
            value={state.draft}
            placeholder="na čemu radiš"
            spellCheck={false}
            autoComplete="off"
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          <div className="durations" data-tauri-drag-region>
            <span className={state.plannedMin === 25 ? 'duration active' : 'duration'}>25</span>
            <span className={state.plannedMin === 50 ? 'duration active' : 'duration'}>50</span>
            <span className="duration-hint">tab</span>
          </div>
        </>
      )

    case 'running':
      return <Countdown session={state.session} now={now} />

    case 'capturing':
      return (
        <>
          <input
            ref={inputRef}
            className="capture-input"
            type="text"
            value={state.draft}
            placeholder="zapiši misao"
            spellCheck={false}
            autoComplete="off"
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          <div className="secondary" data-tauri-drag-region>
            {state.session.task}
          </div>
        </>
      )

    case 'confirmed':
      return (
        <>
          <div className="confirmed" data-tauri-drag-region>
            {state.returnNumber}. povratak
          </div>
          <Countdown session={state.session} now={now} compact />
        </>
      )

    case 'finished':
      return (
        <>
          <div className="timer" data-tauri-drag-region>
            0:00
          </div>
          <div className="secondary" data-tauri-drag-region>
            {state.task}
          </div>
        </>
      )
  }
}

function Countdown({
  session,
  now,
  compact = false,
}: {
  session: RunningSession
  now: number
  compact?: boolean
}): JSX.Element {
  const left = remainingSeconds(session, now)
  if (compact) {
    return (
      <div className="secondary" data-tauri-drag-region>
        {formatCountdown(left)} · {session.task}
      </div>
    )
  }
  return (
    <>
      <div className="timer" data-tauri-drag-region>
        {formatCountdown(left)}
      </div>
      <div className="secondary" data-tauri-drag-region>
        {session.task}
      </div>
    </>
  )
}
