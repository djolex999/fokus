import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, MutableRefObject } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { emit, listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import {
  elapsedFraction,
  formatCountdown,
  partitionOpenSessions,
  remainingSeconds,
  sessionOf,
  toRunningSession,
  widgetReducer,
} from '../types/session'
import type { PlannedMinutes, RunningSession, WidgetState } from '../types/session'
import {
  countCaptures,
  endSession,
  heartbeatSession,
  insertCapture,
  lastAbandonedSession,
  openDatabase,
  recentCaptureTexts,
  closeAbandoned,
  openSessions,
  startSession,
  touchSession,
} from '../lib/db'
import { fill, t } from '../lib/i18n'
import {
  audioTrack,
  describeError,
  failure,
  mark,
  quitApp,
  report,
  resetMusic,
  restoreFocus,
  shortcutLabel,
  setMenuLabels,
  setWidgetHeight,
} from '../lib/ipc'

const SHORTCUT_EVENT = 'capture:open'
const ABANDON_EVENT = 'session:abandon'
const QUIT_EVENT = 'app:quit'
const MUSIC_EVENT = 'audio:enabled'
const CAPTURES_CHANGED_EVENT = 'captures:changed'
const SESSIONS_CLEARED_EVENT = 'sessions:cleared'
const CONFIRMATION_MS = 1000
/** How long the widget holds at 0:00 after a session ends. Long enough to be
 *  seen if you look up; short enough that it never becomes a stale 0:00 with no
 *  timestamp, which says nothing about whether it happened now or an hour ago. */
const FINISHED_MS = 60_000
/** Re-render only. The remaining time is computed from the wall clock, so a
 *  missed or delayed tick costs nothing but a stale frame. */
const TICK_MS = 1000
/** Away this long and the next interaction gets the resume panel instead of a
 *  bare input. */
const RESUME_AFTER_MS = 5 * 60 * 1000
const RESUME_RECENT = 3
/** How often a running session records that it is still alive. The worst case
 *  error this leaves in a reconciled session length is one interval. */
const HEARTBEAT_MS = 60_000
const WIDGET_HEIGHT = 80
const WIDGET_HEIGHT_RESUMED = 150
const LAST_MINUTE_S = 60
/** Longer coming in than going out. Sound arriving is the thing most likely to
 *  be noticed, so it gets the gentler ramp; a tail that lingers just delays the
 *  silence that marks the end of a session. */
const FADE_IN_MS = 3000
const FADE_OUT_MS = 2000
const FADE_STEP_MS = 50

const initialState: WidgetState = { kind: 'idle' }

/** Seconds as m:ss, for the audio log only. */
function clock(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`
}

export function CaptureWidget(): JSX.Element {
  const [state, dispatch] = useReducer(widgetReducer, initialState)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())
  /** Bumped on every shortcut press so the focus effect re-runs even when the
   *  state it lands in is the one it was already in. */
  const [focusTick, setFocusTick] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [shortcut, setShortcut] = useState('')

  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastHeartbeat = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeRef = useRef<number | null>(null)

  // Mirrors state for callbacks that must not be rebuilt on every keystroke.
  const stateRef = useRef<WidgetState>(state)
  stateRef.current = state

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  // --- audio -------------------------------------------------------------
  // Absence is silence, never an error: no folder, an empty folder, or nothing
  // playable in it all leave the session running exactly as it otherwise would.

  // Loaded once at startup, not at session start. WKWebView only permits audio
  // to begin from a user gesture, and the gesture's validity does not survive
  // the awaits between pressing Enter and the track being fetched and decoded.
  // With the source already in place, play() can be called while the keypress
  // is still the thing that caused it.
  useEffect(() => {
    const element = audioRef.current
    if (element === null) return
    audioTrack()
      .then((path) => {
        if (path === null) {
          report('audio: no playable file in ~/fokus/audio')
          return
        }
        // Without these two the only signal is silence. A refused asset fetch
        // and an undecodable file look identical from the outside, and both
        // look identical to having no music configured at all.
        element.addEventListener('error', () => {
          const codes = ['', 'aborted', 'network', 'decode', 'source not supported']
          const code = element.error?.code ?? 0
          report(`audio: FAILED (${codes[code] ?? code}) ${element.error?.message ?? ''}`)
        })
        element.addEventListener('canplaythrough', () => report('audio: ready to play'), {
          once: true,
        })
        element.src = convertFileSrc(path)
        element.loop = true
        element.preload = 'auto'
        element.load()
        report(`audio: loading ${element.src}`)
      })
      .catch((e: unknown) => report(`audio: could not resolve a track: ${describeError(e)}`))
  }, [])

  /**
   * Ramps the volume and calls back when it arrives.
   *
   * Both ends of a session get this. Sound appearing at full volume is itself a
   * small interruption, which is the one thing this app is not allowed to be,
   * and cutting out abruptly at the end reads as something breaking rather than
   * something finishing.
   */
  const fadeTo = useCallback((target: number, whenDone?: () => void): void => {
    const element = audioRef.current
    if (element === null) return
    if (fadeRef.current !== null) window.clearInterval(fadeRef.current)

    const rising = target > element.volume
    const step = (FADE_STEP_MS / (rising ? FADE_IN_MS : FADE_OUT_MS)) * (rising ? 1 : -1)

    fadeRef.current = window.setInterval(() => {
      const next = element.volume + step
      const arrived = rising ? next >= target : next <= target
      // Clamped: the browser throws on anything outside 0 to 1, and floating
      // point will overshoot the last step.
      element.volume = arrived ? target : Math.min(1, Math.max(0, next))
      if (!arrived) return
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current)
      fadeRef.current = null
      whenDone?.()
    }, FADE_STEP_MS)
  }, [])

  const startAudio = useCallback((): void => {
    const element = audioRef.current
    if (element === null || element.src === '') return
    if (fadeRef.current !== null) {
      window.clearInterval(fadeRef.current)
      fadeRef.current = null
    }

    // Somewhere new each session. A ninety minute track and a twenty five
    // minute session means the first quarter is the only part ever heard, and
    // by the fourth session you know it well enough to listen to it, which is
    // the opposite of what background sound is for.
    //
    // Duration is NaN until the metadata has loaded. Starting at zero then is
    // correct rather than an error: the track plays, it just does not move.
    const { duration } = element
    if (Number.isFinite(duration) && duration > 0) {
      element.currentTime = Math.random() * duration
      report(`audio: starting at ${clock(element.currentTime)} of ${clock(duration)}`)
    }

    element.volume = 0
    element
      .play()
      .then(() => {
        setPlaying(true)
        fadeTo(1)
      })
      .catch((e: unknown) => report(`audio: play refused: ${describeError(e)}`))
  }, [fadeTo])

  const stopAudio = useCallback((): void => {
    const element = audioRef.current
    if (element === null || element.paused) return
    fadeTo(0, () => {
      element.pause()
      element.volume = 1
      setPlaying(false)
    })
  }, [fadeTo])

  useEffect(
    () => () => {
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current)
    },
    [],
  )

  // --- startup -----------------------------------------------------------

  useEffect(() => {
    const prepare = async (): Promise<void> => {
      shortcutLabel()
        .then(setShortcut)
        .catch((e: unknown) => report(`could not read the shortcut: ${describeError(e)}`))

      setMenuLabels({
        open: t.trayOpen,
        abandon: t.trayAbandon,
        musicSilence: t.trayMusicSilence,
        musicPlay: t.trayMusicPlay,
        quit: t.trayQuit,
      }).catch((e: unknown) => report(`could not set menu labels: ${describeError(e)}`))

      await openDatabase()

      // A session outlives the process that was timing it. Quitting at minute
      // six of twenty five and reopening should hand the session back, not
      // throw it away; only time ends a session.
      const { resume, close } = partitionOpenSessions(await openSessions(), Date.now())
      for (const stale of close) {
        await closeAbandoned(stale.id)
      }

      if (close.length > 0) {
        report(`startup: closed ${close.length} expired session(s)`)
      }

      if (resume !== null) {
        const left = Math.round(
          (Date.parse(resume.started_at) + resume.planned_min * 60_000 - Date.now()) / 60_000,
        )
        report(`startup: resumed "${resume.task}", about ${left} min left`)
        dispatch({ type: 'sessionStarted', session: toRunningSession(resume) })
        // Music will usually be refused here: the webview wants a user gesture
        // and launching the app is not one it can see. Reported rather than
        // swallowed, so a silent resumed session has a reason on the record.
        startAudio()
        return
      }

      // Warm start. Prefilled but not focused: grabbing the keyboard at launch
      // would interrupt whatever the machine was already doing, which is the
      // one thing this app must never do.
      const previous = await lastAbandonedSession()
      if (previous !== null) {
        dispatch({ type: 'warmStart', task: previous.task, plannedMin: previous.plannedMin })
      }
    }
    prepare().catch((e: unknown) => setError(failure(t.errDatabase, e)))
  }, [startAudio])

  // --- session lifecycle -------------------------------------------------

  const returnFocus = useCallback(async (): Promise<void> => {
    try {
      await restoreFocus()
    } catch (e: unknown) {
      setError(failure(t.errFocusNotReturned, e))
    }
  }, [])

  const touch = useCallback(async (sessionId: number): Promise<void> => {
    try {
      dispatch({ type: 'touched', at: await touchSession(sessionId) })
    } catch (e: unknown) {
      console.error('could not record activity:', describeError(e))
    }
  }, [])

  const finishSession = useCallback(
    async (session: RunningSession, outcome: 'completed' | 'abandoned'): Promise<void> => {
      dispatch(
        outcome === 'completed' ? { type: 'sessionCompleted' } : { type: 'sessionAbandoned' },
      )
      stopAudio()
      try {
        await endSession(session, outcome)
      } catch (e: unknown) {
        setError(failure(t.errSessionNotClosed, e))
      }
    },
    [stopAudio],
  )

  // Records that the session is still alive, riding the tick that is already
  // running. Without this a session with no captures that does not end cleanly
  // reconciles to zero minutes, because the only thing that ever advanced
  // last_active_at was the user interacting.
  useEffect(() => {
    const session = sessionOf(state)
    if (session === null || state.kind === 'finished') return
    if (now - lastHeartbeat.current < HEARTBEAT_MS) return
    lastHeartbeat.current = now
    heartbeatSession(session.id).catch((e: unknown) =>
      console.error('could not record liveness:', describeError(e)),
    )
  }, [state, now])

  // The countdown running out ends the session. Derived from the wall clock, so
  // this fires correctly on the first tick after the machine wakes from sleep.
  useEffect(() => {
    const session = sessionOf(state)
    if (session === null || state.kind === 'finished') return
    if (remainingSeconds(session, now) > 0) return
    void finishSession(session, 'completed')
  }, [state, now, finishSession])

  // --- events ------------------------------------------------------------

  useEffect(() => {
    const onShortcut = (): void => {
      setError(null)
      setFocusTick((tick) => tick + 1)

      const current = stateRef.current
      const session = sessionOf(current)
      if (session === null) {
        dispatch({ type: 'shortcut' })
        return
      }

      const away = Date.now() - Date.parse(session.lastInteractionAt)
      if (current.kind === 'running' && away > RESUME_AFTER_MS) {
        recentCaptureTexts(session.id, RESUME_RECENT)
          .then((recent) => dispatch({ type: 'resume', recent }))
          // Losing the panel is survivable; losing the capture is not.
          .catch(() => dispatch({ type: 'shortcut' }))
          .finally(() => void touch(session.id))
        return
      }

      dispatch({ type: 'shortcut' })
      void touch(session.id)
    }

    const subscriptions: Array<Promise<UnlistenFn>> = [
      listen(SHORTCUT_EVENT, onShortcut),
      listen<boolean>(MUSIC_EVENT, (event) => {
        if (event.payload) {
          if (sessionOf(stateRef.current) !== null) startAudio()
        } else {
          stopAudio()
        }
      }),
      listen(SESSIONS_CLEARED_EVENT, () => {
        // The row this session lives in has been deleted. Stop, rather than
        // count down something that is not there any more.
        if (sessionOf(stateRef.current) === null) return
        report('session cleared from under the widget, stopping')
        dispatch({ type: 'sessionAbandoned' })
        stopAudio()
      }),
      listen(ABANDON_EVENT, () => {
        const session = sessionOf(stateRef.current)
        if (session !== null) {
          void finishSession(session, 'abandoned')
          return
        }
        // No session to end, but the widget may still be showing 0:00 from one
        // that finished, or a half typed task. "End session" should clear
        // whatever is on screen rather than appear broken.
        dispatch({ type: 'dismiss' })
      }),
      listen(QUIT_EVENT, () => {
        const session = sessionOf(stateRef.current)
        const done = session === null ? Promise.resolve() : endSession(session, 'abandoned')
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
  }, [finishSession, touch, startAudio, stopAudio])

  // --- window and focus --------------------------------------------------

  // Grows downward for the resume panel. The Rust side puts the top left corner
  // back afterwards so the widget does not slide out from under the cursor.
  useEffect(() => {
    const height = state.kind === 'resumed' ? WIDGET_HEIGHT_RESUMED : WIDGET_HEIGHT
    setWidgetHeight(height).catch((e: unknown) =>
      console.error('could not resize widget:', describeError(e)),
    )
  }, [state.kind])

  // Focus follows the state machine rather than the event handler, so every
  // path into a text state lands the caret in the same place.
  useEffect(() => {
    if (state.kind !== 'capturing' && state.kind !== 'starting' && state.kind !== 'resumed') {
      return
    }
    const input = inputRef.current
    if (input === null) return
    input.focus()
    input.select()
    void mark('input focused')
  }, [state.kind, focusTick])

  useEffect(() => {
    if (state.kind !== 'confirmed') return
    const timer = window.setTimeout(() => dispatch({ type: 'captureDismissed' }), CONFIRMATION_MS)
    return () => window.clearTimeout(timer)
  }, [state.kind])

  // A finished session used to sit at 0:00 until the shortcut was pressed, on
  // the reasoning that completion should be observable. Nothing else cleared it,
  // so it read as stuck, and an old 0:00 carries no information anyway.
  useEffect(() => {
    if (state.kind !== 'finished') return
    const timer = window.setTimeout(() => dispatch({ type: 'dismiss' }), FINISHED_MS)
    return () => window.clearTimeout(timer)
  }, [state.kind])

  // --- actions -----------------------------------------------------------

  const beginSession = useCallback(
    async (draft: string, plannedMin: PlannedMinutes): Promise<void> => {
      const task = draft.trim()
      if (task === '') {
        dispatch({ type: 'dismiss' })
        await returnFocus()
        return
      }
      try {
        dispatch({ type: 'sessionStarted', session: await startSession(task, plannedMin) })
      } catch (e: unknown) {
        setError(failure(t.errSessionNotStarted, e))
        return
      }
      void mark('session started')
      await returnFocus()
      // Sound comes back for every session: it is the cue that work has begun,
      // and a silence carried over from yesterday would quietly remove it. The
      // playing itself already started in the key handler.
      resetMusic().catch((e: unknown) => report(`could not reset music: ${describeError(e)}`))
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
        setError(failure(t.errNotSaved, e))
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
      void touch(session.id)
      void emit(CAPTURES_CHANGED_EVENT)
    },
    [returnFocus, touch],
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
          // Synchronous, before any await, so the webview still counts this
          // keypress as the gesture that started the sound.
          if (current.draft.trim() !== '') startAudio()
          void beginSession(current.draft, current.plannedMin)
          return
        }
        if (current.kind === 'capturing') {
          void mark('enter pressed')
          void commitCapture(current.session, current.draft)
          return
        }
        if (current.kind === 'resumed') {
          dispatch({ type: 'captureDismissed' })
          void returnFocus()
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (current.kind === 'starting') {
          dispatch({ type: 'dismiss' })
        } else if (current.kind === 'capturing' || current.kind === 'resumed') {
          dispatch({ type: 'captureDismissed' })
        }
        void returnFocus()
      }
    },
    [beginSession, commitCapture, returnFocus, startAudio],
  )

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    setError(null)
    dispatch({ type: 'edit', draft: event.target.value })
  }, [])

  const session = sessionOf(state)
  const left = session === null ? null : remainingSeconds(session, now)
  const lastMinute = left !== null && left <= LAST_MINUTE_S

  return (
    <div className="widget" data-tauri-drag-region>
      {renderBody(state, now, lastMinute, shortcut, inputRef, onChange, onKeyDown)}
      {error !== null && <div className="error">{error}</div>}
      {playing && <div className="playing">♪</div>}
      {session !== null && state.kind !== 'finished' && (
        <div className={lastMinute ? 'progress last-minute' : 'progress'}>
          <div className="progress-fill" style={{ width: `${elapsedFraction(session, now) * 100}%` }} />
        </div>
      )}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="none" />
    </div>
  )
}

function renderBody(
  state: WidgetState,
  now: number,
  lastMinute: boolean,
  shortcut: string,
  inputRef: MutableRefObject<HTMLInputElement | null>,
  onChange: (event: ChangeEvent<HTMLInputElement>) => void,
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void,
): JSX.Element {
  switch (state.kind) {
    case 'idle':
      return (
        <div className="hint" data-tauri-drag-region>
          {shortcut}
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
            placeholder={t.taskPlaceholder}
            spellCheck={false}
            autoComplete="off"
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          {/*
            States the mode rather than implying it. The same keystroke starts a
            session here and captures a thought while one runs, and until now the
            only thing distinguishing them was a placeholder. Remembering which
            mode you are in is exactly the kind of invisible bookkeeping this app
            exists to remove.
          */}
          <div className="durations" data-tauri-drag-region>
            <span className="mode">{t.newSession}</span>
            <span className={state.plannedMin === 25 ? 'duration active' : 'duration'}>25</span>
            <span className={state.plannedMin === 50 ? 'duration active' : 'duration'}>50</span>
            <span className="duration-hint">{t.durationHint}</span>
          </div>
        </>
      )

    case 'running':
      return (
        <>
          <div className={lastMinute ? 'timer last-minute' : 'timer'} data-tauri-drag-region>
            {formatCountdown(remainingSeconds(state.session, now))}
          </div>
          <div className="secondary" data-tauri-drag-region>
            {state.session.task}
          </div>
        </>
      )

    case 'capturing':
      return (
        <>
          <input
            ref={inputRef}
            className="capture-input"
            type="text"
            value={state.draft}
            placeholder={t.capturePlaceholder}
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

    case 'resumed':
      return (
        <>
          <input
            ref={inputRef}
            className="capture-input"
            type="text"
            value=""
            placeholder={t.capturePlaceholder}
            spellCheck={false}
            autoComplete="off"
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          <div className="secondary" data-tauri-drag-region>
            {state.session.task}
          </div>
          {state.recent.length > 0 && (
            <ul className="recent" data-tauri-drag-region>
              {state.recent.map((text, index) => (
                <li key={`${index}-${text}`}>{text}</li>
              ))}
            </ul>
          )}
        </>
      )

    case 'confirmed':
      return (
        <>
          <div className="confirmed" data-tauri-drag-region>
            {fill(t.returnCount, { n: state.returnNumber })}
          </div>
          <div className="secondary" data-tauri-drag-region>
            {formatCountdown(remainingSeconds(state.session, now))} · {state.session.task}
          </div>
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
