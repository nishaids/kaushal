import { DIMENSION_LIST, SCORE_MAX, type Dimension } from '@/lib/rubric'
import { cn } from '@/lib/utils/cn'

/**
 * Five bars, one per dimension, at the student's latest value.
 *
 * The same reading rule as everywhere else in KAUSHAL: a filled graphite bar is
 * a score the instructor confirmed, an open blue outline is one the model
 * proposed and nobody has inked yet. The proposed-versus-confirmed distinction
 * has to survive into the cohort screen, or the screen would be quietly
 * presenting unconfirmed numbers as fact.
 */
export function DimensionBars({
  latest,
  confirmed,
  flagged = [],
  height = 26,
  className,
}: {
  latest: Partial<Record<Dimension, number>>
  /** Per dimension: has the instructor confirmed the latest value? */
  confirmed?: Partial<Record<Dimension, boolean>>
  flagged?: Dimension[]
  height?: number
  className?: string
}) {
  const any = DIMENSION_LIST.some((s) => typeof latest[s.id] === 'number')
  if (!any) {
    return (
      <span className="text-2xs text-v5">no scores yet</span>
    )
  }

  return (
    <span
      className={cn('inline-flex items-end gap-[3px]', className)}
      style={{ height }}
    >
      {DIMENSION_LIST.map((spec) => {
        const v = latest[spec.id]
        const isConfirmed = confirmed?.[spec.id] !== false
        const isFlagged = flagged.includes(spec.id)
        const h = typeof v === 'number' ? Math.max(2, (v / SCORE_MAX) * height) : 2

        return (
          <span
            key={spec.id}
            className="relative w-[7px]"
            style={{ height }}
            title={`${spec.longLabel}: ${typeof v === 'number' ? Math.round(v) : 'not scored'}${isConfirmed ? '' : ', proposed'}`}
          >
            <span
              className={cn(
                'absolute bottom-0 left-0 w-full',
                !isConfirmed && 'border border-dashed border-blue-ink bg-blue-wash',
              )}
              style={{
                height: h,
                backgroundColor: isConfirmed ? spec.ink : undefined,
              }}
            />
            {isFlagged ? (
              <span
                className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 bg-blue-ink"
                aria-hidden="true"
              />
            ) : null}
          </span>
        )
      })}
      <span className="sr-only">
        {DIMENSION_LIST.map((spec) => {
          const v = latest[spec.id]
          if (typeof v !== 'number') return `${spec.longLabel} not scored. `
          const isConfirmed = confirmed?.[spec.id] !== false
          return `${spec.longLabel} ${Math.round(v)} out of 10${isConfirmed ? '' : ', proposed'}. `
        })}
      </span>
    </span>
  )
}
