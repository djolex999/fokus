import type { Stats as StatsData } from '../types/stats'
import type { AsrsRecord } from '../lib/db'
import { StatsBody } from './Stats'
import { formatDate } from './format'
import { fill, t } from '../lib/i18n'

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
      ? `${formatDate(stats.firstSession)} ${t.printRange} ${formatDate(stats.lastSession)}`
      : null

  return (
    <div className="print-sheet">
      <header className="print-header">
        <h1>fokus</h1>
        {range !== null && <span>{range}</span>}
      </header>

      <section>
        <h2>{t.printAsrsHeading}</h2>
        {asrs === null ? (
          <>
            <p>{t.printNoAsrs}</p>
            <p className="print-note">{t.disclaimer}</p>
          </>
        ) : (
          <>
            <p className="print-score">
              {asrs.part_a_score} od 6 &middot; {formatDate(asrs.taken_at)}
            </p>
            <p>{fill(t.printShaded, { n: asrs.part_a_score })}</p>
            {/* The translation caveat belongs only where a translation was used. */}
            <p className="print-note">{t.printNote}</p>
            <p className="print-note">{t.disclaimer}</p>
          </>
        )}
      </section>

      <section>
        <h2>{t.printSessionsHeading}</h2>
        {stats === null || stats.sessionCount === 0 ? (
          <p>{t.printNoSessions}</p>
        ) : (
          <StatsBody stats={stats} />
        )}
      </section>
    </div>
  )
}
