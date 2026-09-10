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
  sessions: SessionRow[],
  captures: CaptureRow[],
  now: Date,
): Stats {
  const durations = new Map<number, DurationRow>()
  for (const session of sessions) {
    const row = durations.get(session.planned_min) ?? {
      plannedMin: session.planned_min,
      total: 0,
      completed: 0,
      abandoned: 0,
    }
    row.total += 1
    if (session.outcome === 'completed') row.completed += 1
    if (session.outcome === 'abandoned') row.abandoned += 1
    durations.set(session.planned_min, row)
  }

  const abandonMinutes: number[] = []
  for (const session of sessions) {
    if (session.outcome !== 'abandoned' || session.ended_at === null) continue
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
    if (session.outcome === 'abandoned') row.abandoned += 1
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
    capturesPerSession: sessions.length === 0 ? 0 : captures.length / sessions.length,
    byHour,
    returnsThisWeek,
    returnsLastWeek,
    firstSession: starts[0] ?? null,
    lastSession: starts[starts.length - 1] ?? null,
  }
}
