import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { computeStats } from '../types/stats'
import type { Stats as StatsData } from '../types/stats'
import { allCaptureTimes, allSessions, asrsHistory } from '../lib/db'
import type { AsrsRecord } from '../lib/db'
import { describeError, failure, printPage, report } from '../lib/ipc'
import { t } from '../lib/i18n'
import { ReviewList } from './ReviewList'
import { Asrs } from './Asrs'
import { Stats } from './Stats'
import { PrintSheet } from './PrintSheet'

type Tab = 'captures' | 'questionnaire' | 'stats'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'captures', label: t.tabCaptures },
  { id: 'questionnaire', label: t.tabQuestionnaire },
  { id: 'stats', label: t.tabStats },
]

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('captures')
  const [stats, setStats] = useState<StatsData | null>(null)
  const [asrs, setAsrs] = useState<AsrsRecord | null>(null)
  // Shown where the button was pressed. The first version failed silently on
  // macOS for weeks, which is the failure this exists to prevent repeating.
  const [printError, setPrintError] = useState<string | null>(null)

  // Loaded up front as well as on the button, so the sheet is rarely empty, and
  // reloaded on the button so it is never stale.
  //
  // Throws rather than logging: the print button used to chain on this, and a
  // failed read was caught here and printed anyway, giving a doctor "No
  // sessions" or last week's numbers with no error anywhere.
  //
  // flushSync so the new numbers are in the DOM before anything prints them.
  // A state update after an await renders on a later task; the native print
  // dialog lays out whatever is there when it opens.
  const loadSheet = useCallback(async (): Promise<void> => {
    const [sessions, captures, history] = await Promise.all([
      allSessions(),
      allCaptureTimes(),
      asrsHistory(),
    ])
    flushSync(() => {
      setStats(computeStats(sessions, captures, new Date()))
      setAsrs(history[0] ?? null)
    })
  }, [])

  useEffect(() => {
    // Off screen until printed, so a failure here is logged, not shown. The
    // print button reloads and shows its own.
    loadSheet().catch((e: unknown) =>
      report(`could not prepare the printable page: ${describeError(e)}`),
    )
  }, [loadSheet, tab])

  return (
    <>
      <div className="screen">
        <nav className="tabs">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === tab ? 'tab active' : 'tab'}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
          <button
            type="button"
            className="tab print-action"
            onClick={() => {
              setPrintError(null)
              loadSheet()
                .then(() => printPage())
                .catch((e: unknown) => setPrintError(failure(t.errNotPrinted, e)))
            }}
          >
            {t.printAction}
          </button>
        </nav>
        {printError !== null && <p className="error">{printError}</p>}

        {tab === 'captures' && <ReviewList />}
        {tab === 'questionnaire' && <Asrs />}
        {tab === 'stats' && <Stats />}
      </div>

      <PrintSheet stats={stats} asrs={asrs} />
    </>
  )
}
