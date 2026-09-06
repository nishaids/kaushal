'use client'

import { useState } from 'react'
import type { PlateauFinding } from '@/lib/types'
import { RUBRIC } from '@/lib/rubric'
import { explainPlateau } from '@/lib/analytics/plateau'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

/**
 * The flag.
 *
 * When a plateau exists it is the most important thing on the screen, so it is
 * the one element that gets the accent. The message is the detector's own
 * sentence, printed verbatim with the real numbers in it — an instructor should
 * be able to read it aloud to a parent without translating anything.
 */
export function PlateauCard({
  finding,
  studentId,
  onFocus,
  alreadyAssigned,
}: {
  finding: PlateauFinding
  studentId: string
  onFocus?: () => void
  alreadyAssigned?: boolean
}) {
  const [showMethod, setShowMethod] = useState(false)
  const label = RUBRIC[finding.dimension].longLabel

  return (
    <div className="border border-blue-ink bg-blue-wash/60">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6">
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-2 self-start border border-blue-ink bg-v0 px-2.5 py-1.5 text-2xs text-blue-deep',
          )}
        >
          <span className="inline-block h-2 w-2 bg-blue" aria-hidden="true" />
          {finding.severity === 'high'
            ? 'Worth acting on now'
            : finding.severity === 'medium'
              ? 'Worth a look'
              : 'Early sign'}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-lg text-v9">{label} has stopped moving</h3>
          <p className="font-language mt-2 max-w-[64ch] text-base leading-relaxed text-v7">
            {finding.message}
          </p>

          <button
            type="button"
            onClick={() => setShowMethod((v) => !v)}
            aria-expanded={showMethod}
            className="mt-3 text-xs text-blue-deep underline underline-offset-2 transition-colors hover:text-v9"
          >
            {showMethod ? 'Hide how this was worked out' : 'How was this worked out?'}
          </button>

          {showMethod ? (
            <p className="mt-2 max-w-[64ch] text-xs leading-relaxed text-v6">
              {explainPlateau(finding)}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ButtonLink
              href={`/studio/assignments?student=${studentId}&dimension=${finding.dimension}`}
              variant="ink"
            >
              Draft an exercise for this
            </ButtonLink>
            {onFocus ? (
              <button
                type="button"
                onClick={onFocus}
                className="rounded-[2px] border border-v4 bg-v0 px-4 py-2.5 text-sm text-v7 transition-colors hover:border-v9 hover:text-v9"
              >
                Show only this line
              </button>
            ) : null}
            {alreadyAssigned ? (
              <span className="text-2xs text-v6">
                An exercise for this dimension has already been issued.
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
