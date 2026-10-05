/**
 * One union for the whole widget rather than two that can disagree.
 *
 * Session 1's `CaptureState` (idle / capturing / confirmed / resumed) could not
 * show a session running but not being captured into, or one being started.
 * Keeping capture state and session state as two unions would reintroduce the
 * problem the first was written to avoid: 'capturing' with no session is
 * representable and meaningless. So the union absorbed the session, and every
 * state that belongs to one carries it. `CLAUDE.md` lists the current union.
 */

export type PlannedMinutes = 10 | 25 | 50

export type RunningSession = {
  id: number
  task: string
  plannedMin: PlannedMinutes
  /** ISO 8601 UTC. The countdown is derived from this against the wall clock. */
  startedAt: string
  /**
   * ISO 8601 UTC of the last time the *user* did something, which is not the
   * same as the last time the session was alive. The database column also
   * receives a once a minute heartbeat so an interrupted session can be
   * reconciled to a truthful length; this field must not, or the resume panel
   * would never fire again.
   */
  lastInteractionAt: string
}

/**
 * A session stopped recently enough to offer back after a relaunch. It waits
 * behind Tab rather than in the input: the shortcut still means a thought
 * first, and the offer is only taken by asking for it. `expiresAt` is the stop
 * plus the warm start window, so an app left open for days stops offering it.
 */
export type Offer = { task: string; plannedMin: PlannedMinutes; expiresAt: string }

export type WidgetState =
  | { kind: 'idle' }
  /** Idle, with a stopped session on offer. Shown, not focused. */
  | { kind: 'offered'; offer: Offer }
  /** The shortcut with no session running: a thought, written down without
   *  one. Tab moves to `starting`, to the offer first if there is one. */
  | { kind: 'noting'; draft: string; offer: Offer | null }
  /** One second of "written down" after a thought saved outside a session. No
   *  number: the return counter counts returns within a session. */
  | { kind: 'noted'; offer: Offer | null }
  | { kind: 'starting'; draft: string; plannedMin: PlannedMinutes }
  | { kind: 'running'; session: RunningSession }
  | { kind: 'capturing'; session: RunningSession; draft: string }
  /** Tab from capture: the task name, being corrected. `thought` holds whatever
   *  was half typed in capture, so Tab back returns it. */
  | { kind: 'renaming'; session: RunningSession; draft: string; thought: string }
  | { kind: 'confirmed'; session: RunningSession; returnNumber: number }
  /** Back after five minutes or more away: the task, and the last three things
   *  captured, so the thread can be picked up without opening anything. */
  | { kind: 'resumed'; session: RunningSession; recent: string[] }
  /** The countdown reached zero. Shows 0:00 until the next shortcut press or
   *  `FINISHED_MS` passes, whichever is first. */
  | { kind: 'finished'; task: string }

export type WidgetAction =
  | { type: 'shortcut' }
  | { type: 'resume'; recent: string[] }
  | { type: 'warmStart'; offer: Offer }
  | { type: 'offerExpired' }
  | { type: 'touched'; at: string }
  | { type: 'edit'; draft: string }
  /** Tab: thought, then each duration, then back to thought. */
  | { type: 'cycle' }
  | { type: 'noteSaved' }
  | { type: 'renamed'; task: string }
  | { type: 'sessionStarted'; session: RunningSession }
  | { type: 'captureConfirmed'; returnNumber: number }
  | { type: 'captureDismissed' }
  | { type: 'sessionCompleted' }
  | { type: 'sessionAbandoned' }
  | { type: 'dismiss' }

/** States that show an input and take the keyboard. Leaving one for a state
 *  without an input means focus has to be handed back explicitly, or the
 *  widget keeps it with nothing to type into. */
export function holdsKeyboard(state: WidgetState): boolean {
  switch (state.kind) {
    case 'noting':
    case 'starting':
    case 'capturing':
    case 'renaming':
    case 'resumed':
      return true
    case 'idle':
    case 'offered':
    case 'noted':
    case 'running':
    case 'confirmed':
    case 'finished':
      return false
  }
}

/**
 * Whether arriving in `after` from `before` should select the input's text.
 *
 * Select on arrival, so a prefilled task name is replaced by the first
 * keystroke. Anything the user has already typed is carried and left alone:
 * - the same state again (the shortcut pressed twice mid draft),
 * - the draft moving round the idle ring,
 * - a thought coming back from renaming, or out of a session that ended,
 * - the first keystroke in the resume panel, which becomes the draft. Selecting
 *   it there meant the second keystroke replaced the first.
 * Except Tab onto an offer: that puts text in an empty input that was not
 * typed, so it is an arrival.
 */
export function selectsOnFocus(before: WidgetState, after: WidgetState): boolean {
  if (
    before.kind === 'noting' &&
    before.draft.trim() === '' &&
    after.kind === 'starting' &&
    after.draft !== ''
  ) {
    return true
  }
  const ring = (k: WidgetState['kind']): boolean => k === 'noting' || k === 'starting'
  const carried =
    before.kind === after.kind ||
    (ring(before.kind) && ring(after.kind)) ||
    ((before.kind === 'renaming' || before.kind === 'resumed') && after.kind === 'capturing') ||
    ((before.kind === 'capturing' || before.kind === 'renaming') && after.kind === 'noting')
  return !carried
}

/** The session the widget is currently attached to, if any. */
export function sessionOf(state: WidgetState): RunningSession | null {
  switch (state.kind) {
    case 'running':
    case 'capturing':
    case 'renaming':
    case 'confirmed':
    case 'resumed':
      return state.session
    case 'idle':
    case 'offered':
    case 'noting':
    case 'noted':
    case 'starting':
    case 'finished':
      return null
  }
}

/** The offer the widget is holding, if any. */
export function offerOf(state: WidgetState): Offer | null {
  switch (state.kind) {
    case 'offered':
      return state.offer
    case 'noting':
    case 'noted':
      return state.offer
    default:
      return null
  }
}

/** Back to resting: showing the offer if one is still held, otherwise idle. */
function rest(offer: Offer | null): WidgetState {
  return offer === null ? { kind: 'idle' } : { kind: 'offered', offer }
}

/**
 * The order Tab visits the choices in, starting from the thought. Durations
 * follow from the default rather than from `DURATIONS` order, so one Tab lands
 * on 25, the length used most, and the rest wrap round after it.
 */
export const DEFAULT_DURATION: PlannedMinutes = 25

/** The duration after `current` in the ring, or null when the ring wraps back
 *  to the thought. */
function afterDuration(current: PlannedMinutes): PlannedMinutes | null {
  const next = nextDuration(current)
  return next === DEFAULT_DURATION ? null : next
}

export function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case 'shortcut':
      switch (state.kind) {
        // Nothing running: the shortcut writes a thought down. It used to open
        // session start, so the capture habit, typed with no session, produced
        // a session named after the thought.
        case 'idle':
        case 'finished':
          return { kind: 'noting', draft: '', offer: null }
        case 'offered':
        case 'noted':
          return { kind: 'noting', draft: '', offer: state.offer }
        case 'running':
          return { kind: 'capturing', session: state.session, draft: '' }
        case 'confirmed':
          return { kind: 'capturing', session: state.session, draft: '' }
        case 'resumed':
          return state
        // Firing again mid typing keeps the draft: the shortcut can be pressed
        // twice before the window is up.
        case 'noting':
        case 'starting':
        case 'capturing':
        case 'renaming':
          return state
      }
      break
    case 'edit':
      if (state.kind === 'noting') return { ...state, draft: action.draft }
      if (state.kind === 'starting') return { ...state, draft: action.draft }
      if (state.kind === 'capturing') return { ...state, draft: action.draft }
      if (state.kind === 'renaming') return { ...state, draft: action.draft }
      // The resume panel clears on the first keystroke, and that keystroke is
      // kept rather than swallowed.
      if (state.kind === 'resumed') {
        return { kind: 'capturing', session: state.session, draft: action.draft }
      }
      return state
    case 'cycle': {
      // In a session, Tab swaps what Enter does: write a thought down, or
      // correct the task name.
      if (state.kind === 'capturing') {
        return {
          kind: 'renaming',
          session: state.session,
          draft: state.session.task,
          thought: state.draft,
        }
      }
      if (state.kind === 'resumed') {
        return {
          kind: 'renaming',
          session: state.session,
          draft: state.session.task,
          thought: '',
        }
      }
      if (state.kind === 'renaming') {
        return { kind: 'capturing', session: state.session, draft: state.thought }
      }
      if (state.kind === 'noting') {
        // Nothing typed and something on offer: the first Tab is the offer.
        // Typed text means a new task, so it starts from the default instead.
        if (state.offer !== null && state.draft.trim() === '') {
          return { kind: 'starting', draft: state.offer.task, plannedMin: state.offer.plannedMin }
        }
        return { kind: 'starting', draft: state.draft, plannedMin: DEFAULT_DURATION }
      }
      if (state.kind !== 'starting') return state
      const next = afterDuration(state.plannedMin)
      return next === null
        ? { kind: 'noting', draft: state.draft, offer: null }
        : { ...state, plannedMin: next }
    }
    case 'noteSaved':
      return state.kind === 'noting' ? { kind: 'noted', offer: state.offer } : state
    case 'renamed': {
      if (state.kind !== 'renaming') return state
      const session = { ...state.session, task: action.task }
      // A thought half typed before Tab is still owed somewhere. Saving the
      // name goes back to it rather than throwing it away.
      return state.thought.trim() === ''
        ? { kind: 'running', session }
        : { kind: 'capturing', session, draft: state.thought }
    }
    case 'resume':
      return state.kind === 'running'
        ? { kind: 'resumed', session: state.session, recent: action.recent }
        : state
    case 'warmStart':
      // Only ever seen on a cold start, and never allowed to interrupt anything.
      return state.kind === 'idle' ? { kind: 'offered', offer: action.offer } : state
    case 'offerExpired':
      switch (state.kind) {
        case 'offered':
          return { kind: 'idle' }
        case 'noting':
        case 'noted':
          return { ...state, offer: null }
        default:
          return state
      }
    case 'touched': {
      const session = sessionOf(state)
      if (session === null) return state
      const touched = { ...session, lastInteractionAt: action.at }
      switch (state.kind) {
        case 'running':
          return { kind: 'running', session: touched }
        case 'capturing':
          return { kind: 'capturing', session: touched, draft: state.draft }
        case 'renaming':
          return { ...state, session: touched }
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
      // The clock ran out with a thought half typed: the session is over, the
      // thought is not. It stays in the input as a thought with no session, so
      // Enter still writes it down and nothing typed is lost to a timer.
      const unsaved =
        state.kind === 'capturing' ? state.draft : state.kind === 'renaming' ? state.thought : ''
      if (unsaved.trim() !== '') return { kind: 'noting', draft: unsaved, offer: null }
      const session = sessionOf(state)
      return session === null ? { kind: 'idle' } : { kind: 'finished', task: session.task }
    }
    case 'sessionAbandoned':
      return { kind: 'idle' }
    case 'dismiss':
      switch (state.kind) {
        // Escape from a thought, or the acknowledgement clearing, does not
        // decline the offer; it goes back to being offered.
        case 'noting':
        case 'noted':
          return rest(state.offer)
        case 'starting':
        case 'finished':
        case 'offered':
          return { kind: 'idle' }
        default:
          return state
      }
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

/**
 * The wall clock time a session is due to end, for display. A countdown says how
 * much is left and nothing about where that lands in the day, which is the half
 * time blindness loses: "12 minutes" is abstract, "until 14:35" is a time that
 * can be planned around. System locale decides 12 or 24 hour.
 */
export function formatEndTime(session: RunningSession): string {
  const end = new Date(Date.parse(session.startedAt) + session.plannedMin * 60_000)
  return end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** A session found still open at startup, straight from the database. */
export type OpenSessionRow = {
  id: number
  task: string
  planned_min: number
  started_at: string
  last_active_at: string | null
}

/**
 * Decides what to do with sessions left open by a previous run.
 *
 * Originally every one of them was abandoned, which is what `PLAN.md` item 7
 * says. In use that is wrong: quitting the app at minute six of twenty five and
 * reopening it loses a session that was never actually over. Time is what ends a
 * session, not the process holding the timer.
 *
 * So a session whose planned window has not elapsed is picked back up, and only
 * the ones whose time genuinely ran out while nothing was watching are closed.
 * If several are somehow open, the newest wins and the rest are closed, because
 * two running sessions is not a state the widget can represent.
 */
export function partitionOpenSessions(
  rows: OpenSessionRow[],
  now: number,
): { resume: OpenSessionRow | null; close: OpenSessionRow[] } {
  const live = rows.filter((row) => {
    const ends = Date.parse(row.started_at) + row.planned_min * 60_000
    return Number.isFinite(ends) && now < ends
  })

  const newest = live.reduce<OpenSessionRow | null>((best, row) => {
    if (best === null) return row
    return Date.parse(row.started_at) > Date.parse(best.started_at) ? row : best
  }, null)

  return {
    resume: newest,
    close: rows.filter((row) => row.id !== newest?.id),
  }
}

/**
 * The durations offered, in the order the toggle cycles through them. Declared
 * once: the reducer, the widget row and the narrowing below all read from here,
 * so a fourth duration cannot be added to one of them and forgotten in another.
 */
export const DURATIONS = [10, 25, 50] as const

/** The next duration in the cycle, wrapping at the end. */
export function nextDuration(current: PlannedMinutes): PlannedMinutes {
  const at = DURATIONS.indexOf(current)
  return DURATIONS[(at + 1) % DURATIONS.length] ?? 25
}

/**
 * Narrows a stored duration to the ones the app offers. A row written by a
 * future version, or corrupted, is read as 25 rather than trusted into a type
 * it does not belong to.
 */
export function toPlannedMinutes(value: number): PlannedMinutes {
  return DURATIONS.find((d) => d === value) ?? 25
}

export function toRunningSession(row: OpenSessionRow): RunningSession {
  return {
    id: row.id,
    task: row.task,
    plannedMin: toPlannedMinutes(row.planned_min),
    startedAt: row.started_at,
    lastInteractionAt: row.last_active_at ?? row.started_at,
  }
}
