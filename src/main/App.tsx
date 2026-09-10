import { useCallback, useEffect, useState } from 'react'
import { computeStats } from '../types/stats'
import type { Stats as StatsData } from '../types/stats'
import { allCaptureTimes, allSessions, asrsHistory } from '../lib/db'
import type { AsrsRecord } from '../lib/db'
import { describeError, printPage } from '../lib/ipc'
import { ReviewList } from './ReviewList'
import { Asrs } from './Asrs'
import { Stats } from './Stats'
import { PrintSheet } from './PrintSheet'

type Tab = 'zapisano' | 'upitnik' | 'statistika'

const TABS: Tab[] = ['zapisano', 'upitnik', 'statistika']

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('zapisano')
  const [stats, setStats] = useState<StatsData | null>(null)
  const [asrs, setAsrs] = useState<AsrsRecord | null>(null)

  // Loaded up front rather than on the button, so "pripremi za pregled" prints
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
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              className={name === tab ? 'tab active' : 'tab'}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            className="tab print-action"
            onClick={() => {
              void loadSheet().then(() => printPage())
            }}
          >
            pripremi za pregled
          </button>
        </nav>

        {tab === 'zapisano' && <ReviewList />}
        {tab === 'upitnik' && <Asrs />}
        {tab === 'statistika' && <Stats />}
      </div>

      <PrintSheet stats={stats} asrs={asrs} />
    </>
  )
}
