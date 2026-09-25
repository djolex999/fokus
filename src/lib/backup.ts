import { clearAllSessions, vacuumInto } from './db'
import { backupTarget, describeError, pruneBackups, report } from './ipc'

/** How often a running app checks whether today's copy exists. */
export const BACKUP_CHECK_MS = 60 * 60 * 1000

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Local date, because "today's backup" means the day on the user's wall. */
function localDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/**
 * Writes today's copy if it does not exist yet, then prunes to the newest 14.
 *
 * Silent by design: a backup that interrupts is a notification, and those are
 * forbidden. Failures go to the log, which means a backup that keeps failing
 * will not announce itself; the tray's Open backups folder is where that shows.
 */
export async function backupIfDue(now: Date = new Date()): Promise<void> {
  try {
    const target = await backupTarget(`fokus-${localDate(now)}.db`)
    if (target === null) return
    await vacuumInto(target)
    const pruned = await pruneBackups()
    report(`backup: wrote ${target}${pruned > 0 ? `, pruned ${pruned}` : ''}`)
  } catch (e: unknown) {
    report(`backup: failed: ${describeError(e)}`)
  }
}

/**
 * Clear history, but only once a copy of everything it is about to delete
 * exists. This is the button that once removed 76 captures with nothing to
 * restore them from. If the copy cannot be written, nothing is cleared, and
 * the error reaches the caller, which is on screen because the user just
 * clicked.
 */
export async function clearWithBackup(
  now: Date = new Date(),
): Promise<{ sessions: number; captures: number }> {
  const stamp = `${localDate(now)}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const target = await backupTarget(`fokus-before-clear-${stamp}.db`)
  // A copy from this minute exists: a second clear inside the same minute.
  // Anything captured between the two would be deleted with no copy of it, so
  // this refuses rather than reuse the earlier file.
  if (target === null) {
    throw new Error('a backup from this minute already exists, try again in a minute')
  }
  await vacuumInto(target)
  return clearAllSessions()
}
