// Clear history must never run without its backup (Session 6). The database
// and IPC are stand-ins that record what was called and fail on command.

export default async function run(eq, { module: backup, db, ipc }) {
  const at = new Date(2026, 8, 25, 14, 12)
  const reset = () => {
    db.log.length = 0
    db.fail.vacuum = false
    ipc.fail.target = false
    ipc.fail.exists = false
  }
  const clear = async () => {
    try {
      await backup.clearWithBackup(at)
      return 'ok'
    } catch (e) {
      return e.message
    }
  }

  reset()
  eq('backup written, then cleared', [await clear(), db.log.includes('CLEARED')], ['ok', true])
  eq('the backup comes first', db.log[1], 'vacuum /b/fokus-before-clear-2026-09-25-1412.db')

  reset()
  db.fail.vacuum = true
  eq('copy fails: nothing cleared, error raised', [await clear(), db.log.includes('CLEARED')], ['disk full', false])

  reset()
  ipc.fail.target = true
  eq('folder unavailable: nothing cleared', [await clear(), db.log.includes('CLEARED')], ['no home directory', false])

  reset()
  ipc.fail.exists = true
  eq('same-minute copy exists: refused', [await clear(), db.log.includes('CLEARED')], ['same minute', false])

  reset()
  await backup.backupIfDue(at)
  eq('daily: due -> copy, then prune', db.log.slice(0, 3), ['target fokus-2026-09-25.db', 'vacuum /b/fokus-2026-09-25.db', 'prune'])

  reset()
  ipc.fail.exists = true
  await backup.backupIfDue(at)
  eq('daily: already done today -> nothing', db.log, ['target fokus-2026-09-25.db'])

  reset()
  db.fail.vacuum = true
  let threw = false
  try {
    await backup.backupIfDue(at)
  } catch {
    threw = true
  }
  eq('daily: copy fails -> logged, no prune, no throw', [threw, db.log.includes('prune'), db.log.some((l) => l.startsWith('report: backup: failed'))], [false, false, true])
}
