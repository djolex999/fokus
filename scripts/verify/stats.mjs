// How a session's ending is read, and the numbers built on it. These go on the
// page meant for a doctor, so each threshold is checked on both sides.

export default function run(eq, { classifyEnding, computeStats, median }) {
  const t0 = '2026-01-01T00:00:00.000Z'
  const at = (ms) => new Date(Date.parse(t0) + ms).toISOString()
  const ab = (endMs) => ({ planned_min: 25, started_at: t0, ended_at: at(endMs), outcome: 'abandoned' })

  // classifyEnding (review of 2026-09-23 and its restart rule).
  eq('59 s stop is a false start', classifyEnding(ab(59_000)), 'falseStart')
  eq('60 s stop is a stop', classifyEnding(ab(60_000)), 'stoppedEarly')
  eq('22m29s of 25 is a stop', classifyEnding(ab(1_349_000)), 'stoppedEarly')
  eq('22m30s of 25 (90%) is completed', classifyEnding(ab(1_350_000)), 'completed')
  eq('9 of 10 minutes is completed', classifyEnding({ ...ab(540_000), planned_min: 10 }), 'completed')
  eq('ran out the clock is completed', classifyEnding({ ...ab(1_500_000), outcome: 'completed' }), 'completed')
  eq('running is open', classifyEnding({ ...ab(0), outcome: null, ended_at: null }), 'open')
  eq('abandoned with no end is a stop', classifyEnding({ ...ab(0), ended_at: null }), 'stoppedEarly')
  eq('95 s, next 4 s later: a rename', classifyEnding(ab(95_000), at(99_000)), 'falseStart')
  eq('95 s, next 15 s later: still a rename', classifyEnding(ab(95_000), at(110_000)), 'falseStart')
  eq('95 s, next 16 s later: a stop', classifyEnding(ab(95_000), at(111_000)), 'stoppedEarly')
  eq('4m59s then a quick restart: a rename', classifyEnding(ab(299_000), at(303_000)), 'falseStart')
  eq('5m00s then a quick restart: a stop', classifyEnding(ab(300_000), at(304_000)), 'stoppedEarly')
  eq('next session before the end: a stop', classifyEnding(ab(95_000), at(90_000)), 'stoppedEarly')

  eq('median of nothing', median([]), null)
  eq('median of an even count', median([1, 3, 5, 7]), 4)

  // A running session is not data yet (review group 2).
  const sess = (id, startMs, mins, outcome) => ({
    id,
    planned_min: 25,
    started_at: at(startMs),
    ended_at: outcome === null ? null : at(startMs + mins * 60_000),
    outcome,
  })
  const day = 86_400_000
  const rows = [
    ...[0, 1, 2, 3, 4].map((i) => sess(i + 1, i * day, 25, 'completed')),
    ...[5, 6, 7, 8, 9].map((i) => sess(i + 1, i * day, 5, 'abandoned')),
    sess(11, 10 * day, 0, null),
  ]
  const st = computeStats(rows, [], new Date(Date.parse(t0) + 10 * day + 300_000))
  eq('running session left out of the count', st.sessionCount, 10)
  eq('completion is 5 of 10, not 5 of 11', [st.byDuration[0].completed, st.byDuration[0].total], [5, 10])

  // Calendar weeks across a clock change (review group 2). Needs a zone with
  // DST; where the runtime cannot switch zone, it says so rather than passing.
  const previous = process.env.TZ
  process.env.TZ = 'Europe/Belgrade'
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let note = ''
  if (zone === 'Europe/Belgrade') {
    const cap = (local) => ({ session_id: null, created_at: new Date(local).toISOString() })
    let r = computeStats([], [cap('2026-03-22T23:30:00'), cap('2026-03-23T09:00:00')], new Date('2026-04-01T12:00:00'))
    eq('spring DST: only Monday counts as last week', [r.returnsThisWeek, r.returnsLastWeek], [0, 1])
    r = computeStats([], [cap('2026-10-19T00:30:00')], new Date('2026-10-28T12:00:00'))
    eq('autumn DST: Monday 00:30 is last week', [r.returnsThisWeek, r.returnsLastWeek], [0, 1])
  } else {
    note = `DST cases skipped: could not switch to Europe/Belgrade, got ${zone}`
  }
  if (previous === undefined) delete process.env.TZ
  else process.env.TZ = previous
  return note
}
