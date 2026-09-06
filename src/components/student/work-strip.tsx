'use client'

import type { ScoredWork } from '@/lib/types'
import type { Dimension } from '@/lib/rubric'
import { shortDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

/**
 * Every work, oldest to newest.
 *
 * The first and the latest carry a mark, because those two images side by side
 * are what a parent actually understands. A work with scores still waiting on
 * the instructor is outlined in non-photo blue, the same as everywhere else.
 */
export function WorkStrip({
  works,
  onSelect,
  focus,
}: {
  works: ScoredWork[]
  onSelect: (workId: string) => void
  focus?: Dimension | null
}) {
  if (works.length === 0) return null

  return (
    <ul
      className="flex gap-3 overflow-x-auto pb-3"
      tabIndex={0}
      aria-label="Recorded works, oldest first. Scroll sideways to see them all."
    >
      {works.map((w, i) => {
        const isFirst = i === 0
        const isLatest = i === works.length - 1
        const unconfirmed = w.scores.filter((s) => s.confirmed_score === null).length
        const focusScore = focus
          ? w.scores.find((s) => s.dimension === focus)
          : null
        const focusValue = focusScore
          ? (focusScore.confirmed_score ?? focusScore.ai_score)
          : null

        return (
          <li key={w.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSelect(w.id)}
              className="group block w-28 text-left"
            >
              <span
                className={cn(
                  'relative block h-28 w-28 overflow-hidden border bg-v0 transition-colors',
                  unconfirmed > 0
                    ? 'border-dashed border-blue-ink'
                    : 'border-v3 group-hover:border-v9',
                )}
              >
                {w.thumb_url || w.image_url ? (
                  <img
                    src={w.thumb_url ?? w.image_url}
                    alt={`Work from ${shortDate(w.captured_at)}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}

                {focus && focusValue !== null ? (
                  <span className="absolute bottom-0 right-0 border-l border-t border-v9 bg-v0 px-1.5 py-0.5">
                    <span className="numeral text-2xs text-v9">
                      {Math.round(focusValue)}
                    </span>
                  </span>
                ) : null}
              </span>

              <span className="mt-1.5 block text-2xs text-v6">
                {shortDate(w.captured_at)}
              </span>
              {isFirst || isLatest ? (
                <span className="mt-0.5 block text-2xs text-v9">
                  {isFirst && isLatest ? 'only work' : isFirst ? 'first' : 'latest'}
                </span>
              ) : unconfirmed > 0 ? (
                <span className="mt-0.5 block text-2xs text-blue-deep">
                  {unconfirmed} to confirm
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
