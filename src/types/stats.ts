/**
 * All statistics are computed here, in one pure function, from rows loaded
 * whole. The dataset is one person's sessions, so it is small enough that doing
 * it in SQL would buy nothing and cost the ability to check the arithmetic.
 *
 * Time of day has to be local: SQLite holds UTC strings, and a session started
 * at 23:30 local is a late night session no matter what the UTC hour says.
 */

export type SessionRow = {
  id: number
  planned_min: number
  started_at: string
  ended_at: string | null
  outcome: 'completed' | 'abandoned' | null
}

export type CaptureRow = {
  session_id: number
  created_at: string
}

/** Below this, the numbers describe noise rather than a habit. */
export const MINIMUM_SESSIONS = 10

/**
 * Shorter than this and a session was never a session: a task typed wrong and
 * restarted, a shortcut hit by accident. Observed: nine seconds, then the same
 * work restarted under a better name.
 */
export const FALSE_START_MS = 60_000

/**
 * A session stopped inside this long and replaced within `RESTART_GAP_MS` is a
 * false start too, however long past a minute it ran. The running task cannot
 * be renamed, so fixing a typo means ending the session and starting another,
 * and the tell is not the duration but the immediate replacement. Observed:
 * 95 seconds, next session four seconds later, same work.
 */
export const RESTART_MAX_MS = 5 * 60_000
export const RESTART_GAP_MS = 15_000

/**
 * A session ended by hand counts as completed once it has run this share of its
 * planned time. Ninety rather than lower on purpose: the statistics end up on a
 * page meant for a doctor, and a threshold that flattered completion would be
 * as wrong as the one that condemned it.
 */
export const FINISHED_SHARE = 0.9

/**
 * What a session's ending means, as opposed to what was stored.
 *
 * The stored `outcome` is a record of what happened: the clock ran out, or it
 * did not. That is kept exactly as written. What it cannot say on its own is
 * whether a session ended by hand at minute 24 of 25 was a stop or a finish,
 * and every reader of it (the statistics, the printed page, the warm start)
 * needs that answer and needs the same answer. So it is derived here, once,
 * the same way the return count is: from the rows, never stored beside them.
 */
export type Ending = 'completed' | 'stoppedEarly' | 'falseStart' | 'open'

/**
 * `nextStartedAt` is when the following session began, or null if none has.
 * It is what separates a quick stop from a quick restart.
 */
export function classifyEnding(
  session: Pick<SessionRow, 'planned_min' | 'started_at' | 'ended_at' | 'outcome'>,
  nextStartedAt: string | null = null,
): Ending {
  if (session.outcome === 'completed') return 'completed'
  if (session.outcome === null) return 'open'
  if (session.ended_at === null) return 'stoppedEarly'
  const ended = Date.parse(session.ended_at)
  const elapsed = ended - Date.parse(session.started_at)
  if (!Number.isFinite(elapsed)) return 'stoppedEarly'
  if (elapsed < FALSE_START_MS) return 'falseStart'
  if (elapsed < RESTART_MAX_MS && nextStartedAt !== null) {
    const gap = Date.parse(nextStartedAt) - ended
    if (Number.isFinite(gap) && gap >= 0 && gap <= RESTART_GAP_MS) return 'falseStart'
  }
  const planned = session.planned_min * 60_000
  return planned > 0 && elapsed >= planned * FINISHED_SHARE ? 'completed' : 'stoppedEarly'
}

export type DurationRow = {
  plannedMin: number
  total: number
  completed: number
  abandoned: number
}

export type HourRow = {
  hour: number
  started: number
  abandoned: number
}

export type Stats = {
  sessionCount: number
  byDuration: DurationRow[]
  medianAbandonMinutes: number | null
  capturesPerSession: number
  byHour: HourRow[]
  returnsThisWeek: number
  returnsLastWeek: number
  firstSession: string | null
  lastSession: string | null
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null
  }
  const low = sorted[middle - 1]
  const high = sorted[middle]
  if (low === undefined || high === undefined) return null
  return (low + high) / 2
}

/** Midnight on the Monday of the week containing `at`, in local time. */
export function startOfWeek(at: Date): Date {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  // getDay is 0 for Sunday, which belongs to the week that started six days ago.
  const offset = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - offset)
  return day
}

export function computeStats(
  allSessions: SessionRow[],
  captures: CaptureRow[],
  now: Date,
): Stats {
  const ordered = [...allSessions].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const endings = new Map<number, Ending>(
    ordered.map((s, i) => [s.id, classifyEnding(s, ordered[i + 1]?.started_at ?? null)]),
  )
  const endingOf = (s: SessionRow): Ending => endings.get(s.id) ?? classifyEnding(s)
  const sessions = allSessions.filter((s) => endingOf(s) !== 'falseStart')
  const counted = new Set(sessions.map((s) => s.id))

  const durations = new Map<number, DurationRow>()
  for (const session of sessions) {
    const row = durations.get(session.planned_min) ?? {
      plannedMin: session.planned_min,
      total: 0,
      completed: 0,
      abandoned: 0,
    }
    row.total += 1
    const ending = endingOf(session)
    if (ending === 'completed') row.completed += 1
    if (ending === 'stoppedEarly') row.abandoned += 1
    durations.set(session.planned_min, row)
  }

  const abandonMinutes: number[] = []
  for (const session of sessions) {
    if (endingOf(session) !== 'stoppedEarly' || session.ended_at === null) continue
    const elapsed = Date.parse(session.ended_at) - Date.parse(session.started_at)
    if (Number.isFinite(elapsed) && elapsed >= 0) abandonMinutes.push(elapsed / 60_000)
  }

  const byHour: HourRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    started: 0,
    abandoned: 0,
  }))
  for (const session of sessions) {
    const started = new Date(session.started_at)
    if (Number.isNaN(started.getTime())) continue
    const row = byHour[started.getHours()]
    if (row === undefined) continue
    row.started += 1
    if (endingOf(session) === 'stoppedEarly') row.abandoned += 1
  }

  const weekStart = startOfWeek(now).getTime()
  const previousWeekStart = weekStart - 7 * 24 * 60 * 60 * 1000
  let returnsThisWeek = 0
  let returnsLastWeek = 0
  for (const capture of captures) {
    const at = Date.parse(capture.created_at)
    if (!Number.isFinite(at)) continue
    if (at >= weekStart) returnsThisWeek += 1
    else if (at >= previousWeekStart) returnsLastWeek += 1
  }

  const starts = sessions
    .map((s) => s.started_at)
    .filter((s) => !Number.isNaN(Date.parse(s)))
    .sort()

  return {
    sessionCount: sessions.length,
    byDuration: [...durations.values()].sort((a, b) => a.plannedMin - b.plannedMin),
    medianAbandonMinutes: median(abandonMinutes),
    capturesPerSession:
      sessions.length === 0
        ? 0
        : captures.filter((c) => counted.has(c.session_id)).length / sessions.length,
    byHour,
    returnsThisWeek,
    returnsLastWeek,
    firstSession: starts[0] ?? null,
    lastSession: starts[starts.length - 1] ?? null,
  }
}
