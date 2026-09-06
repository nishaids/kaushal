import type { ScoredWork } from '@/lib/types'
import type { Dimension } from '@/lib/rubric'
import { DIMENSION_LIST } from '@/lib/rubric'
import { longDate } from '@/lib/utils/format'
import { valueForStep } from '@/components/ui/value-scale'

/**
 * The first work and the latest, side by side, at the same size.
 *
 * This is the emotional centre of the product. A parent who cannot read a chart
 * can read this in two seconds, which is the entire reason KAUSHAL bothers
 * storing the images rather than only the numbers.
 */
export function BeforeAfter({
  first,
  latest,
  deltas,
}: {
  first: ScoredWork | null
  latest: ScoredWork | null
  deltas: Partial<Record<Dimension, { from: number; to: number }>>
}) {
  if (!first || !latest) return null

  const sameWork = first.id === latest.id

  return (
    <div>
      <div className="grid gap-px border border-v3 bg-v3 sm:grid-cols-2">
        <figure className="bg-v0 p-4">
          <img
            src={first.image_url}
            alt={`Work from ${longDate(first.captured_at)}`}
            className="aspect-[4/3] w-full border border-v3 bg-v1 object-contain"
          />
          <figcaption className="mt-3">
            <p className="text-sm text-v9">
              {sameWork ? 'The work in this period' : 'Where the period started'}
            </p>
            <p className="mt-0.5 text-xs text-v6">{longDate(first.captured_at)}</p>
          </figcaption>
        </figure>

        <figure className="bg-v0 p-4">
          <img
            src={latest.image_url}
            alt={`Work from ${longDate(latest.captured_at)}`}
            className="aspect-[4/3] w-full border border-v3 bg-v1 object-contain"
          />
          <figcaption className="mt-3">
            <p className="text-sm text-v9">
              {sameWork ? 'Scored on the day' : 'Where it ended'}
            </p>
            <p className="mt-0.5 text-xs text-v6">{longDate(latest.captured_at)}</p>
          </figcaption>
        </figure>
      </div>

      {sameWork ? (
        <p className="font-language mt-4 max-w-[62ch] text-base text-v6">
          There is one work in this period, so there is nothing yet to compare it
          against. The next one will sit beside it here.
        </p>
      ) : (
        <div className="mt-6">
          <p className="text-xs text-v7">What moved, dimension by dimension</p>
          <ul className="mt-3 space-y-2.5">
            {DIMENSION_LIST.map((spec) => {
              const d = deltas[spec.id]
              if (!d) return null
              const change = d.to - d.from
              return (
                <li key={spec.id} className="flex flex-wrap items-center gap-3">
                  <span className="w-36 shrink-0 text-xs text-v6">
                    {spec.longLabel}
                  </span>

                  {/* The travel from the old score to the new one, on the scale. */}
                  <span
                    className="flex items-center gap-1"
                    aria-label={`${spec.longLabel} moved from ${d.from} to ${d.to} out of 10`}
                  >
                    <span
                      className="inline-block h-4 w-4 border border-v4"
                      style={{ backgroundColor: valueForStep(d.from) }}
                    />
                    <span className="inline-block h-px w-6 bg-v4" />
                    <span
                      className="inline-block h-6 w-6 border border-v9"
                      style={{ backgroundColor: valueForStep(d.to) }}
                    />
                  </span>

                  <span className="numeral text-sm text-v9">
                    {Math.round(d.from)} to {Math.round(d.to)}
                  </span>
                  <span className="text-2xs text-v6">
                    {change > 0
                      ? `up ${Math.round(change)}`
                      : change < 0
                        ? `down ${Math.abs(Math.round(change))}`
                        : 'unchanged'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
