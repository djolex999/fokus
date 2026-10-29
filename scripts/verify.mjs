// Checks for the pure logic, with no test framework: the dependency budget
// does not stretch to one, and the code under test needs none. The modules are
// compiled with the project's own tsc into a temporary directory and driven
// from node. `npm run verify`.
//
// What is covered is what has broken: the widget reducer and the rule for
// selecting input text (Sessions 5 to 7), the statistics (review group 2), and
// the guarantee that clear history never runs without its backup (Session 6).
// Event handlers and effects are not reachable from here; that is why the
// decisions they used to make were moved into pure functions.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(join(tmpdir(), 'fokus-verify-'))

function compile(files, into) {
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      ...files,
      '--outDir', into,
      '--module', 'es2022',
      '--target', 'es2022',
      '--moduleResolution', 'bundler',
      '--strict',
      '--skipLibCheck',
    ],
    { stdio: 'inherit' },
  )
  writeFileSync(join(into, 'package.json'), '{"type":"module"}')
}

// backup.ts talks to the database, to Rust and to the copy tables. Each is
// replaced by a stand-in that records calls and fails on command, and the
// import paths are rewritten to reach them.
function stageBackup(into) {
  const src = readFileSync(join(root, 'src', 'lib', 'backup.ts'), 'utf8')
    .replace("from './db'", "from './db.js'")
    .replace("from './ipc'", "from './ipc.js'")
    .replace("from './i18n'", "from './i18n.js'")
  writeFileSync(join(into, 'backup.ts'), src)
  writeFileSync(
    join(into, 'db.ts'),
    `export const log: string[] = []
export const fail = { vacuum: false }
export async function vacuumInto(path: string): Promise<void> {
  log.push('vacuum ' + path)
  if (fail.vacuum) throw new Error('disk full')
}
export async function clearAllSessions(): Promise<{ sessions: number; captures: number }> {
  log.push('CLEARED')
  return { sessions: 0, captures: 0 }
}
`,
  )
  writeFileSync(
    join(into, 'ipc.ts'),
    `import { log } from './db.js'
export const fail = { target: false, exists: false }
export async function backupTarget(name: string): Promise<string | null> {
  log.push('target ' + name)
  if (fail.target) throw new Error('no home directory')
  return fail.exists ? null : '/b/' + name
}
export async function pruneBackups(): Promise<number> {
  log.push('prune')
  return 0
}
export function report(message: string): void {
  log.push('report: ' + message)
}
export function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
`,
  )
  writeFileSync(
    join(into, 'i18n.ts'),
    `export const t = { errBackupThisMinute: 'same minute' }\n`,
  )
}

let total = 0
let failed = 0
function checker(suite) {
  return (name, got, want) => {
    total += 1
    if (isDeepStrictEqual(got, want)) return
    failed += 1
    console.log(`FAIL  ${suite}: ${name}`)
    console.log(`      got  ${JSON.stringify(got)}`)
    console.log(`      want ${JSON.stringify(want)}`)
  }
}

try {
  compile([join(root, 'src', 'types', 'session.ts'), join(root, 'src', 'types', 'stats.ts')], out)
  const backupDir = join(out, 'backup')
  mkdirSync(backupDir)
  stageBackup(backupDir)
  compile(
    ['backup.ts', 'db.ts', 'ipc.ts', 'i18n.ts'].map((f) => join(backupDir, f)),
    backupDir,
  )

  const session = await import(pathToFileURL(join(out, 'session.js')).href)
  const stats = await import(pathToFileURL(join(out, 'stats.js')).href)
  const backup = {
    module: await import(pathToFileURL(join(backupDir, 'backup.js')).href),
    db: await import(pathToFileURL(join(backupDir, 'db.js')).href),
    ipc: await import(pathToFileURL(join(backupDir, 'ipc.js')).href),
  }

  const suites = [
    ['reducer', './verify/reducer.mjs', session],
    ['selection', './verify/selection.mjs', session],
    ['visibility', './verify/visibility.mjs', session],
    ['stats', './verify/stats.mjs', stats],
    ['backup', './verify/backup.mjs', backup],
  ]
  for (const [name, path, target] of suites) {
    const [t0, f0] = [total, failed]
    const { default: run } = await import(new URL(path, import.meta.url).href)
    const notes = await run(checker(name), target)
    const [ran, bad] = [total - t0, failed - f0]
    const line = bad === 0 ? `${ran} pass` : `${bad} of ${ran} FAILED`
    console.log(`${name.padEnd(10)} ${line}${notes ? `  (${notes})` : ''}`)
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}

console.log(failed === 0 ? `all ${total} checks pass` : `${failed} of ${total} checks FAILED`)
process.exit(failed === 0 ? 0 : 1)
