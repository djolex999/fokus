import { useCallback, useEffect, useState } from 'react'
import { computeStats } from '../types/stats'
import type { Stats as StatsData } from '../types/stats'
import { allCaptureTimes, allSessions, asrsHistory } from '../lib/db'
import type { AsrsRecord } from '../lib/db'
import { describeError, printPage } from '../lib/ipc'
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

  // Loaded up front rather than on the button, so the print action prints
  // what is already on screen instead of opening a print dialog over a blank page.
  const loadSheet = useCallback(async (): Promise<void> => {
    try {
      const [sessions, captures, history] = await Promise.all([
        allSessions(),
        allCaptureTimes(),
        asrsHistory(),
      ])
      setStats(computeStats(sessions, captures, new Date()))
      setAsrs(history[0] ?? null)
    } catch (e: unknown) {
      console.error('could not prepare the printable page:', describeError(e))
    }
  }, [])

  useEffect(() => {
    void loadSheet()
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
              void loadSheet().then(() => printPage())
            }}
          >
            {t.printAction}
          </button>
        </nav>

        {tab === 'captures' && <ReviewList />}
        {tab === 'questionnaire' && <Asrs />}
        {tab === 'stats' && <Stats />}
      </div>

      <PrintSheet stats={stats} asrs={asrs} />
    </>
  )
}
