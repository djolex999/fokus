import { useCallback, useEffect, useState } from 'react'
import { MINIMUM_SESSIONS, computeStats } from '../types/stats'
import type { Stats as StatsData } from '../types/stats'
import { emit } from '@tauri-apps/api/event'
import { allCaptureTimes, allSessions, clearAllSessions } from '../lib/db'
import { failure } from '../lib/ipc'
import { fill, sessionsWord, t } from '../lib/i18n'
import { formatDate } from './format'

export function Stats(): JSX.Element {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const [sessions, captures] = await Promise.all([allSessions(), allCaptureTimes()])
      setStats(computeStats(sessions, captures, new Date()))
    } catch (e: unknown) {
      setError(failure(t.errCannotLoad, e))
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
          <h1>{t.tabStats}</h1>
          <span className="count">{stats.sessionCount}</span>
        </header>
        {/* A count, not a nudge. It says what is missing and nothing about you. */}
        <p className="empty">
          {fill(t.notEnoughSessions, { n: `${remaining} ${sessionsWord(remaining)}` })}
        </p>
        {stats.sessionCount > 0 && <ClearSessions onCleared={load} />}
      </div>
    )
  }

  return (
    <div>
      <header className="header">
        <h1>{t.tabStats}</h1>
        <span className="count">
          {stats.firstSession !== null && stats.lastSession !== null
            ? `${formatDate(stats.firstSession)} ${t.printRange} ${formatDate(stats.lastSession)}`
            : ''}
        </span>
      </header>

      <StatsBody stats={stats} />
      <ClearSessions onCleared={load} />
    </div>
  )
}

/**
 * Two steps, because this is not undoable and the numbers behind it took weeks
 * to accumulate. Inline rather than a dialog: a modal over an anti-distraction
 * tool to ask "are you sure" is its own small interruption.
 */
function ClearSessions({ onCleared }: { onCleared: () => Promise<void> }): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clear = useCallback(async (): Promise<void> => {
    try {
      await clearAllSessions()
      setConfirming(false)
      await onCleared()
      // The review list is reading the same captures.
      void emit('captures:changed')
      // And the widget may be counting down a session that no longer exists.
      // Left alone it would keep running, then fail its next capture on a
      // foreign key pointing at a deleted row.
      void emit('sessions:cleared')
    } catch (e: unknown) {
      setError(failure(t.errNotDeleted, e))
    }
  }, [onCleared])

  return (
    <div className="clear">
      {error !== null && <p className="error">{error}</p>}
      {confirming ? (
        <>
          <span className="clear-warning">{t.clearWarning}</span>
          <button type="button" className="clear-confirm" onClick={() => void clear()}>
            {t.clearConfirm}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {t.clearCancel}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>
          {t.clearSessions}
        </button>
      )}
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
        <h2>{t.statCompletion}</h2>
        <ul className="bars">
          {stats.byDuration.map((row) => {
            const rate = row.total === 0 ? 0 : row.completed / row.total
            return (
              <li key={row.plannedMin}>
                <span className="bar-label">
                  {row.plannedMin} {t.minutes}
                </span>
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
        <h2>{t.statAbandon}</h2>
        <p className="figure">
          {stats.medianAbandonMinutes === null
            ? t.noAbandoned
            : fill(t.medianAbandon, { n: Math.round(stats.medianAbandonMinutes) })}
        </p>
      </section>

      <section className="stat">
        <h2>{t.statCapturesPerSession}</h2>
        <p className="figure">{stats.capturesPerSession.toFixed(1)}</p>
      </section>

      <section className="stat">
        <h2>{t.statTimeOfDay}</h2>
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
          <span className="swatch swatch-started" /> {t.legendStarted}
          <span className="swatch swatch-abandoned" /> {t.legendAbandoned}
        </p>
      </section>

      <section className="stat">
        <h2>{t.statReturns}</h2>
        <p className="figure">
          {fill(t.returnsWeek, { a: stats.returnsThisWeek, b: stats.returnsLastWeek })}
        </p>
      </section>
    </>
  )
}
