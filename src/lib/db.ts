import Database from '@tauri-apps/plugin-sql'

const DB_URL = 'sqlite:fokus.db'

/**
 * Session 1 has no session lifecycle, so captures hang off the seeded row
 * created by migration 4. Session 2 replaces this with the live session id.
 */
export const PLACEHOLDER_SESSION_ID = 1

let connection: Promise<Database> | null = null

/** Opened once and reused. Opening it inside the capture path would cost the
 *  first capture of the day several hundred milliseconds. */
export function db(): Promise<Database> {
  if (connection === null) {
    connection = Database.load(DB_URL)
  }
  return connection
}

/** Warms the connection at startup so the first capture is not the slow one. */
export async function openDatabase(): Promise<void> {
  await db()
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

export async function insertCapture(sessionId: number, text: string): Promise<void> {
  const conn = await db()
  await conn.execute(
    'INSERT INTO captures (session_id, text, created_at) VALUES ($1, $2, $3)',
    [sessionId, text, new Date().toISOString()],
  )
}
