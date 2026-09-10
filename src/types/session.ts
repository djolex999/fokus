/**
 * One union for the whole widget rather than two that can disagree.
 *
 * `CLAUDE.md` specifies a `CaptureState` of idle / capturing / confirmed /
 * resumed. Session 2 needs states that union cannot express, because the widget
 * now has to show a session that is running but not being captured into, and a
 * session being started. Keeping capture state and session state as two separate
 * unions would reintroduce exactly the problem the original one was written to
 * avoid: 'capturing' with no session is representable and meaningless.
 *
 * So the union absorbed the session instead of sitting beside it. idle,
 * capturing and confirmed are all still here, each now carrying the session they
 * belong to. 'resumed' arrives in Session 3.
 */

export type PlannedMinutes = 25 | 50

export type RunningSession = {
  id: number
  task: string
  plannedMin: PlannedMinutes
  /** ISO 8601 UTC. The countdown is derived from this against the wall clock. */
  startedAt: string
  /** ISO 8601 UTC. Drives the resume panel, so it is mirrored in state rather
   *  than read back from the database on every shortcut press. */
  lastActiveAt: string
}

export type WidgetState =
  | { kind: 'idle' }
  | { kind: 'starting'; draft: string; plannedMin: PlannedMinutes }
  | { kind: 'running'; session: RunningSession }
  | { kind: 'capturing'; session: RunningSession; draft: string }
  | { kind: 'confirmed'; session: RunningSession; returnNumber: number }
  /** Back after five minutes or more away: the task, and the last three things
   *  captured, so the thread can be picked up without opening anything. */
  | { kind: 'resumed'; session: RunningSession; recent: string[] }
  /** The countdown reached zero. Holds at 0:00 until the next shortcut press. */
  | { kind: 'finished'; task: string }

export type WidgetAction =
  | { type: 'shortcut' }
  | { type: 'resume'; recent: string[] }
  | { type: 'warmStart'; task: string; plannedMin: PlannedMinutes }
  | { type: 'touched'; at: string }
  | { type: 'edit'; draft: string }
  | { type: 'toggleDuration' }
  | { type: 'sessionStarted'; session: RunningSession }
  | { type: 'captureConfirmed'; returnNumber: number }
  | { type: 'captureDismissed' }
  | { type: 'sessionCompleted' }
  | { type: 'sessionAbandoned' }
  | { type: 'dismiss' }

/** The session the widget is currently attached to, if any. */
export function sessionOf(state: WidgetState): RunningSession | null {
  switch (state.kind) {
    case 'running':
    case 'capturing':
    case 'confirmed':
    case 'resumed':
      return state.session
    case 'idle':
    case 'starting':
    case 'finished':
      return null
  }
}

export function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case 'shortcut':
      switch (state.kind) {
        case 'idle':
        case 'finished':
          return { kind: 'starting', draft: '', plannedMin: 25 }
        case 'running':
          return { kind: 'capturing', session: state.session, draft: '' }
        case 'confirmed':
          return { kind: 'capturing', session: state.session, draft: '' }
        case 'resumed':
          return state
        // Firing again mid typing keeps the draft: the shortcut can be pressed
        // twice before the window is up.
        case 'starting':
        case 'capturing':
          return state
      }
      break
    case 'edit':
      if (state.kind === 'starting') return { ...state, draft: action.draft }
      if (state.kind === 'capturing') return { ...state, draft: action.draft }
      // The resume panel clears on the first keystroke, and that keystroke is
      // kept rather than swallowed.
      if (state.kind === 'resumed') {
        return { kind: 'capturing', session: state.session, draft: action.draft }
      }
      return state
    case 'toggleDuration':
      return state.kind === 'starting'
        ? { ...state, plannedMin: state.plannedMin === 25 ? 50 : 25 }
        : state
    case 'resume':
      return state.kind === 'running'
        ? { kind: 'resumed', session: state.session, recent: action.recent }
        : state
    case 'warmStart':
      // Only ever seen on a cold start, and never allowed to interrupt anything.
      return state.kind === 'idle'
        ? { kind: 'starting', draft: action.task, plannedMin: action.plannedMin }
        : state
    case 'touched': {
      const session = sessionOf(state)
      if (session === null) return state
      const touched = { ...session, lastActiveAt: action.at }
      switch (state.kind) {
        case 'running':
          return { kind: 'running', session: touched }
        case 'capturing':
          return { kind: 'capturing', session: touched, draft: state.draft }
        case 'confirmed':
          return { kind: 'confirmed', session: touched, returnNumber: state.returnNumber }
        case 'resumed':
          return { kind: 'resumed', session: touched, recent: state.recent }
        default:
          return state
      }
    }
    case 'sessionStarted':
      return { kind: 'running', session: action.session }
    case 'captureConfirmed':
      return state.kind === 'capturing'
        ? { kind: 'confirmed', session: state.session, returnNumber: action.returnNumber }
        : state
    case 'captureDismissed': {
      const session = sessionOf(state)
      return session === null ? { kind: 'idle' } : { kind: 'running', session }
    }
    case 'sessionCompleted': {
      const session = sessionOf(state)
      return session === null ? { kind: 'idle' } : { kind: 'finished', task: session.task }
    }
    case 'sessionAbandoned':
      return { kind: 'idle' }
    case 'dismiss':
      return state.kind === 'starting' || state.kind === 'finished' ? { kind: 'idle' } : state
  }
  return state
}

/** Whole seconds left, floored at zero. Derived, never accumulated. */
export function remainingSeconds(session: RunningSession, now: number): number {
  const elapsed = now - Date.parse(session.startedAt)
  const left = session.plannedMin * 60_000 - elapsed
  return left <= 0 ? 0 : Math.ceil(left / 1000)
}

/** 0 at the start, 1 at the planned end. Clamped, so a session left running
 *  past its time does not overflow the bar. */
export function elapsedFraction(session: RunningSession, now: number): number {
  const planned = session.plannedMin * 60_000
  const done = (now - Date.parse(session.startedAt)) / planned
  if (done <= 0) return 0
  return done >= 1 ? 1 : done
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
