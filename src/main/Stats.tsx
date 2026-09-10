import { useCallback, useEffect, useState } from 'react'
import { MINIMUM_SESSIONS, computeStats } from '../types/stats'
import type { Stats as StatsData } from '../types/stats'
import { allCaptureTimes, allSessions } from '../lib/db'
import { failure } from '../lib/ipc'
import { formatDate } from './format'

/** Serbian counts by the last digit, except in the teens: 1 sesija, 2 do 4
 *  sesije, 5 and up sesija, and 11 to 14 back to sesija. */
function pluralSessions(count: number): string {
  const lastTwo = count % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'sesija'
  const last = count % 10
  if (last === 1) return 'sesija'
  if (last >= 2 && last <= 4) return 'sesije'
  return 'sesija'
}

export function Stats(): JSX.Element {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const [sessions, captures] = await Promise.all([allSessions(), allCaptureTimes()])
      setStats(computeStats(sessions, captures, new Date()))
    } catch (e: unknown) {
      setError(failure('ne mogu da učitam', e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error !== null) return <p className="error">{error}</p>
  if (stats === null) return <div />

  if (stats.sessionCount < MINIMUM_SESSIONS) {
    const remaining = MINIMUM_SESSIONS - stats.sessionCount
    return (
      <div>
        <header className="header">
          <h1>statistika</h1>
          <span className="count">{stats.sessionCount}</span>
        </header>
        {/* A count, not a nudge. It says what is missing and nothing about you. */}
        <p className="empty">
          Treba još {remaining} {pluralSessions(remaining)} pre nego što brojevi počnu da znače
          nešto.
        </p>
      </div>
    )
  }

  return (
    <div>
      <header className="header">
        <h1>statistika</h1>
        <span className="count">
          {stats.firstSession !== null && stats.lastSession !== null
            ? `${formatDate(stats.firstSession)} do ${formatDate(stats.lastSession)}`
            : ''}
        </span>
      </header>

      <StatsBody stats={stats} />
    </div>
  )
}

/** Split out so the printed page can render the same numbers without the
 *  screen's header and navigation. */
export function StatsBody({ stats }: { stats: StatsData }): JSX.Element {
  const busiest = Math.max(1, ...stats.byHour.map((h) => h.started))

  return (
    <>
      <section className="stat">
        <h2>završeno po dužini</h2>
        <ul className="bars">
          {stats.byDuration.map((row) => {
            const rate = row.total === 0 ? 0 : row.completed / row.total
            return (
              <li key={row.plannedMin}>
                <span className="bar-label">{row.plannedMin} min</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${rate * 100}%` }} />
                </span>
                <span className="bar-value">
                  {Math.round(rate * 100)}% ({row.completed}/{row.total})
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="stat">
        <h2>prekid</h2>
        <p className="figure">
          {stats.medianAbandonMinutes === null
            ? 'nema prekinutih sesija'
            : `${Math.round(stats.medianAbandonMinutes)} min do prekida, medijana`}
        </p>
      </section>

      <section className="stat">
        <h2>povrataka po sesiji</h2>
        <p className="figure">{stats.capturesPerSession.toFixed(1)}</p>
      </section>

      <section className="stat">
        <h2>po dobu dana</h2>
        <ul className="hours">
          {stats.byHour.map((row) => (
            <li key={row.hour}>
              <span className="hour-column">
                <span
                  className="hour-started"
                  style={{ height: `${(row.started / busiest) * 100}%` }}
                />
                <span
                  className="hour-abandoned"
                  style={{ height: `${(row.abandoned / busiest) * 100}%` }}
                />
              </span>
              <span className="hour-label">{row.hour % 6 === 0 ? row.hour : ''}</span>
            </li>
          ))}
        </ul>
        {/* Named with swatches rather than by brightness: which of two greys is
            "light" is not something a legend should ask the reader to decide. */}
        <p className="legend">
          <span className="swatch swatch-started" /> počelo
          <span className="swatch swatch-abandoned" /> prekinuto
        </p>
      </section>

      <section className="stat">
        <h2>povratci</h2>
        <p className="figure">
          {stats.returnsThisWeek} ove nedelje, {stats.returnsLastWeek} prošle
        </p>
      </section>
    </>
  )
}
