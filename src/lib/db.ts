import Database from '@tauri-apps/plugin-sql'
import type { OpenSessionRow, PlannedMinutes, RunningSession } from '../types/session'
import type { Answers } from '../types/asrs'
import type { CaptureRow, SessionRow } from '../types/stats'

const DB_URL = 'sqlite:fokus.db'

let connection: Promise<Database> | null = null

/** Opened once and reused. Opening it inside the capture path would cost the
 *  first capture of the day several hundred milliseconds. */
export function db(): Promise<Database> {
  if (connection === null) {
    connection = Database.load(DB_URL)
  }
  return connection
}

export async function openDatabase(): Promise<void> {
  await db()
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Sessions the previous run left open. Their fate is decided by
 * `partitionOpenSessions`, not here: whether a session can be picked back up is
 * a question about time, and time is easier to reason about, and to test, away
 * from SQL.
 */
export async function openSessions(): Promise<OpenSessionRow[]> {
  const conn = await db()
  return conn.select<OpenSessionRow[]>(
    `SELECT id, task, planned_min, started_at, last_active_at
       FROM sessions
      WHERE ended_at IS NULL
      ORDER BY started_at`,
  )
}

/**
 * Closes a session whose time ran out while nothing was watching.
 *
 * `ended_at` falls back to `last_active_at` rather than now, because the session
 * stopped when the app stopped, not when it was next opened. `started_at` is the
 * last resort, and thanks to the once a minute heartbeat it is now only reached
 * by a session that died within its first minute.
 */
export async function closeAbandoned(sessionId: number): Promise<void> {
  const conn = await db()
  await conn.execute(
    `UPDATE sessions
        SET outcome = 'abandoned',
            ended_at = COALESCE(last_active_at, started_at)
      WHERE id = $1 AND ended_at IS NULL`,
    [sessionId],
  )
}

export async function startSession(
  task: string,
  plannedMin: PlannedMinutes,
): Promise<RunningSession> {
  const conn = await db()
  const startedAt = nowIso()
  const result = await conn.execute(
    `INSERT INTO sessions (task, planned_min, started_at, last_active_at)
     VALUES ($1, $2, $3, $3)`,
    [task, plannedMin, startedAt],
  )
  // The sqlite driver only omits this if the insert did not happen.
  if (result.lastInsertId === undefined) {
    throw new Error('session insert returned no id')
  }
  return { id: result.lastInsertId, task, plannedMin, startedAt, lastInteractionAt: startedAt }
}

/**
 * A completed session ended when its time ran out, not when something noticed.
 *
 * Completion is detected on a one second tick, so writing `now` was a second
 * late in the ordinary case and wildly wrong in one that matters: sleep through
 * a session and the machine wakes hours later, the tick fires, and a 25 minute
 * session records as three hours. Its length becomes fiction.
 *
 * An abandoned session is the opposite: it genuinely ended at the moment it was
 * abandoned, so that one does take `now`.
 */
export async function endSession(
  session: RunningSession,
  outcome: 'completed' | 'abandoned',
): Promise<void> {
  const endedAt =
    outcome === 'completed'
      ? new Date(Date.parse(session.startedAt) + session.plannedMin * 60_000).toISOString()
      : nowIso()

  const conn = await db()
  await conn.execute(
    `UPDATE sessions SET outcome = $1, ended_at = $2 WHERE id = $3 AND ended_at IS NULL`,
    [outcome, endedAt, session.id],
  )
}

/** Written on session start, capture open and capture commit. Not per keystroke:
 *  that would be a disk write per character for a field read once a session.
 *  Returns the timestamp written so state can mirror it without a read back.
 *
 *  Guarded on `ended_at IS NULL` so a late write cannot disturb a session that
 *  has already been closed. */
export async function touchSession(sessionId: number): Promise<string> {
  const conn = await db()
  const at = nowIso()
  await conn.execute(
    `UPDATE sessions SET last_active_at = $1 WHERE id = $2 AND ended_at IS NULL`,
    [at, sessionId],
  )
  return at
}

/**
 * Liveness, written once a minute while a session runs.
 *
 * Without it, `last_active_at` only advances when the user interacts, so a
 * session with no captures that does not end cleanly reconciles to
 * `ended_at = started_at` and records as zero minutes. That is the exact
 * opposite of the sessions worth measuring accurately, and it drags down the
 * median time to abandonment, which is the one number meant for a clinician.
 *
 * Deliberately does not report back into widget state. The resume panel asks
 * "how long since the user did something", and a heartbeat is not the user
 * doing something; feeding this into that clock would mean the panel never
 * appears again.
 */
export async function heartbeatSession(sessionId: number): Promise<void> {
  const conn = await db()
  await conn.execute(
    `UPDATE sessions SET last_active_at = $1 WHERE id = $2 AND ended_at IS NULL`,
    [nowIso(), sessionId],
  )
}

/** The task and duration of the session most recently abandoned, for the warm
 *  start. Null when there has never been one. */
export async function lastAbandonedSession(): Promise<{
  task: string
  plannedMin: PlannedMinutes
} | null> {
  const conn = await db()
  const rows = await conn.select<Array<{ task: string; planned_min: number }>>(
    `SELECT task, planned_min
       FROM sessions
      WHERE outcome = 'abandoned'
      ORDER BY ended_at DESC
      LIMIT 1`,
  )
  const first = rows[0]
  if (first === undefined) return null
  // Anything other than the two known durations is treated as the short one
  // rather than trusted into a type it does not belong to.
  return { task: first.task, plannedMin: first.planned_min === 50 ? 50 : 25 }
}

/** The most recent capture texts for a session, newest first. Feeds the resume
 *  panel, which shows three. */
export async function recentCaptureTexts(sessionId: number, limit: number): Promise<string[]> {
  const conn = await db()
  const rows = await conn.select<Array<{ text: string }>>(
    `SELECT text FROM captures
      WHERE session_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [sessionId, limit],
  )
  return rows.map((row) => row.text)
}

export async function insertCapture(sessionId: number, text: string): Promise<void> {
  const conn = await db()
  await conn.execute(
    'INSERT INTO captures (session_id, text, created_at) VALUES ($1, $2, $3)',
    [sessionId, text, nowIso()],
  )
}

/** Derived on demand, never stored. A counter column would be duplicate state
 *  that can drift, and a temptation to correct later. */
export async function countCaptures(sessionId: number): Promise<number> {
  const conn = await db()
  const rows = await conn.select<Array<{ n: number }>>(
    'SELECT COUNT(*) AS n FROM captures WHERE session_id = $1',
    [sessionId],
  )
  const first = rows[0]
  if (first === undefined) {
    throw new Error('COUNT returned no rows')
  }
  return first.n
}

export type Resolution = 'done' | 'scheduled' | 'deleted'

export type PendingCapture = {
  id: number
  text: string
  created_at: string
  task: string
}

export async function pendingCaptures(): Promise<PendingCapture[]> {
  const conn = await db()
  return conn.select<PendingCapture[]>(
    `SELECT c.id, c.text, c.created_at, s.task
       FROM captures c
       JOIN sessions s ON s.id = c.session_id
      WHERE c.resolved IS NULL
      ORDER BY c.created_at DESC`,
  )
}

export async function resolveCapture(id: number, resolution: Resolution): Promise<void> {
  const conn = await db()
  await conn.execute('UPDATE captures SET resolved = $1 WHERE id = $2', [resolution, id])
}

// --- ASRS -----------------------------------------------------------------

export type AsrsRecord = {
  id: number
  answers_json: string
  part_a_score: number
  taken_at: string
}

/** Every take is kept. Results are never overwritten: a screener taken on a bad
 *  week and one taken on a good week are both real, and the pattern across them
 *  is worth more to a clinician than the latest number. */
export async function saveAsrs(answers: Answers, partAScore: number): Promise<void> {
  const conn = await db()
  await conn.execute(
    'INSERT INTO asrs (answers_json, part_a_score, taken_at) VALUES ($1, $2, $3)',
    [JSON.stringify(answers), partAScore, nowIso()],
  )
}

export async function asrsHistory(): Promise<AsrsRecord[]> {
  const conn = await db()
  return conn.select<AsrsRecord[]>(
    'SELECT id, answers_json, part_a_score, taken_at FROM asrs ORDER BY taken_at DESC',
  )
}

// --- statistics -----------------------------------------------------------

/** Loaded whole and aggregated in TypeScript. One person's sessions is a small
 *  enough dataset that SQL would buy nothing and cost testability. */
export async function allSessions(): Promise<SessionRow[]> {
  const conn = await db()
  return conn.select<SessionRow[]>(
    'SELECT id, planned_min, started_at, ended_at, outcome FROM sessions ORDER BY started_at',
  )
}

export async function allCaptureTimes(): Promise<CaptureRow[]> {
  const conn = await db()
  return conn.select<CaptureRow[]>('SELECT session_id, created_at FROM captures')
}

/**
 * Deletes every session and every capture. There is no separate "statistics"
 * to clear: the numbers are derived from these two tables, so clearing them
 * means deleting the rows they are derived from.
 *
 * ASRS results are deliberately left alone. They are a dated record of a
 * clinical screener rather than a by product of using the timer, and someone
 * clearing their session history is not asking to lose them.
 *
 * Captures go first: `captures.session_id` is a NOT NULL foreign key, so the
 * other order would leave orphans behind wherever enforcement is off.
 */
export async function clearAllSessions(): Promise<{ sessions: number; captures: number }> {
  const conn = await db()
  const captures = await conn.execute('DELETE FROM captures')
  const sessions = await conn.execute('DELETE FROM sessions')
  return { sessions: sessions.rowsAffected, captures: captures.rowsAffected }
}
