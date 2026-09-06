'use client'

import type { QualityReport } from '@/lib/metrics/quality-gate'
import { verdictLabel } from '@/lib/metrics/quality-gate'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'

/**
 * What the quality gate found, before anything is scored.
 *
 * The verdict is not decoration. A blocked photo is genuinely not sent for a
 * proposal, and this is where the instructor is told why and what to do about
 * it. Every issue carries the physical action that fixes it — "move closer",
 * "turn off the flash" — because "low quality image" is a complaint, not help.
 *
 * Status is carried by a word and a mark, never by colour alone.
 */
export function QualityNotice({
  report,
  onRetake,
  onUseAnyway,
  className,
}: {
  report: QualityReport
  onRetake?: () => void
  /** Present only when the instructor is allowed to override a block. */
  onUseAnyway?: () => void
  className?: string
}) {
  const blocked = report.verdict === 'retake'

  return (
    <div
      className={cn(
        'border p-4',
        blocked ? 'border-v9 bg-v2' : 'border-v3 bg-v0',
        className,
      )}
      role={blocked ? 'alert' : undefined}
    >
      <div className="flex items-start gap-3">
        <QualityMark verdict={report.verdict} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-v9">{verdictLabel(report.verdict)}</p>
          <p className="font-language mt-1 max-w-[54ch] text-base text-v7">
            {report.summary}
          </p>

          {report.issues.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {report.issues.map((issue) => (
                <li key={issue.code} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 inline-block h-1.5 w-1.5 shrink-0',
                      issue.severity === 'blocking' ? 'bg-v9' : 'bg-v5',
                    )}
                  />
                  <span className="text-xs leading-relaxed text-v7">
                    <span className="sr-only">
                      {issue.severity === 'blocking' ? 'Blocking. ' : 'Worth fixing. '}
                    </span>
                    {issue.message}{' '}
                    <span className="text-v6">{issue.fix}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {blocked ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {onRetake ? (
                <Button size="sm" variant="ink" onClick={onRetake}>
                  Take another photo
                </Button>
              ) : null}
              {onUseAnyway ? (
                <button
                  type="button"
                  onClick={onUseAnyway}
                  className="text-xs text-v6 underline underline-offset-2 hover:text-v9"
                >
                  Keep it and score it myself
                </button>
              ) : null}
              <span className="max-w-[44ch] text-2xs text-v5">
                The work is saved either way. What a poor photo does not get is a
                machine opinion resting on evidence we can already measure as
                unreliable.
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * The verdict as a value, not a colour: three filled steps for good, two for
 * usable, one for retake. Readable in greyscale and to a screen reader.
 */
function QualityMark({ verdict }: { verdict: QualityReport['verdict'] }) {
  const filled = verdict === 'good' ? 3 : verdict === 'usable' ? 2 : 1
  return (
    <span className="mt-0.5 flex shrink-0 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'w-[5px] border border-v9',
            i < filled ? 'bg-v9' : 'bg-transparent',
          )}
          style={{ height: 8 + i * 5 }}
        />
      ))}
    </span>
  )
}
