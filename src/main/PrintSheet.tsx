import { PART_A_THRESHOLD } from '../types/asrs'
import type { Stats as StatsData } from '../types/stats'
import type { AsrsRecord } from '../lib/db'
import { StatsBody } from './Stats'
import { formatDate } from './format'

/**
 * One page, for handing to a psychiatrist. Hidden on screen, laid out for paper
 * by the print stylesheet. Browser print to PDF is the whole export mechanism;
 * a PDF library would be a dependency bought for one button.
 */
export function PrintSheet({
  stats,
  asrs,
}: {
  stats: StatsData | null
  asrs: AsrsRecord | null
}): JSX.Element {
  const range =
    stats !== null && stats.firstSession !== null && stats.lastSession !== null
      ? `${formatDate(stats.firstSession)} do ${formatDate(stats.lastSession)}`
      : null

  return (
    <div className="print-sheet">
      <header className="print-header">
        <h1>fokus</h1>
        {range !== null && <span>{range}</span>}
      </header>

      <section>
        <h2>ASRS v1.1, deo A</h2>
        {asrs === null ? (
          <p>Upitnik nije popunjen.</p>
        ) : (
          <>
            <p className="print-score">
              {asrs.part_a_score} od 6 &middot; {formatDate(asrs.taken_at)}
            </p>
            <p>
              {asrs.part_a_score >= PART_A_THRESHOLD ? 'Četiri ili više' : 'Manje od četiri'} od
              šest stavki u osenčenom opsegu.
            </p>
            <p className="print-note">
              Upitnik za probir, ne dijagnoza. Ne postavlja dijagnozu i ne isključuje je. Stavke su
              date u prevodu na srpski, ne u zvaničnoj validovanoj verziji.
            </p>
          </>
        )}
      </section>

      <section>
        <h2>Sesije</h2>
        {stats === null || stats.sessionCount === 0 ? (
          <p>Nema sesija.</p>
        ) : (
          <StatsBody stats={stats} />
        )}
      </section>
    </div>
  )
}
