// When a widget hidden with "Hide until tomorrow" comes back on its own: after
// a long break (the Mac asleep three hours or more), or a day after hiding,
// whichever is first. Beats arrive from the widget's tick and from a once a
// minute pulse while hidden, so a gap between two beats is time the Mac slept.

export default function run(eq, { shouldReappear }) {
  const h = 3_600_000
  const m = 60_000
  const t = Date.parse('2026-10-29T03:00:00Z')
  // shouldReappear(hiddenAt, previousBeat, now)
  eq('a minute after hiding: stays hidden', shouldReappear(t, t, t + m), false)
  eq('asleep 20 minutes (a meeting): stays hidden', shouldReappear(t, t + 10 * m, t + 30 * m), false)
  eq('asleep 2h59: stays hidden', shouldReappear(t, t + m, t + m + 3 * h - 1000), false)
  eq('asleep exactly 3h: back', shouldReappear(t, t + m, t + m + 3 * h), true)
  eq('asleep 03:30 to 11:00: back on wake', shouldReappear(t, t + 30 * m, t + 8 * h), true)
  eq('never slept, 23h59 later: stays hidden', shouldReappear(t, t + 24 * h - 2 * m, t + 24 * h - m), false)
  eq('never slept, 24h later: back', shouldReappear(t, t + 24 * h - m, t + 24 * h), true)
  eq('clock moved backwards: stays hidden', shouldReappear(t, t + 5 * h, t + 4 * h), false)
}
