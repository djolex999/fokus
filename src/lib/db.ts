import Database from '@tauri-apps/plugin-sql'
import type { PlannedMinutes, RunningSession } from '../types/session'
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
 * Closes out sessions left open by a previous run.
 *
 * Marking a session abandoned on shutdown only covers a clean exit. A crash, a
 * SIGINT, or a force quit leaves `ended_at` null forever, and the next launch
 * would otherwise adopt a stale session as live. Reconciling at startup covers
 * every one of those, so it is the load bearing half of the pair.
 *
 * `ended_at` falls back to `last_active_at` rather than now, because the user
 * stopped working when they stopped interacting, not when they next opened
 * the app. Where there was no interaction at all, `started_at` is the only
 * honest answer.
 */
export async function reconcileOpenSessions(): Promise<number> {
  const conn = await db()
  const result = await conn.execute(
    `UPDATE sessions
        SET outcome = 'abandoned',
            ended_at = COALESCE(last_active_at, started_at)
      WHERE ended_at IS NULL`,
  )
  return result.rowsAffected
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
  return { id: result.lastInsertId, task, plannedMin, startedAt, lastActiveAt: startedAt }
}

export async function endSession(
  sessionId: number,
  outcome: 'completed' | 'abandoned',
): Promise<void> {
  const conn = await db()
  await conn.execute(
    `UPDATE sessions SET outcome = $1, ended_at = $2 WHERE id = $3 AND ended_at IS NULL`,
    [outcome, nowIso(), sessionId],
  )
}

/** Written on session start, capture open and capture commit. Not per keystroke:
 *  that would be a disk write per character for a field read once a session.
 *  Returns the timestamp written so state can mirror it without a read back. */
export async function touchSession(sessionId: number): Promise<string> {
  const conn = await db()
  const at = nowIso()
  await conn.execute(`UPDATE sessions SET last_active_at = $1 WHERE id = $2`, [at, sessionId])
  return at
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
