import { CALIBRATION_TARGET } from '@/lib/constants'
import { ValueScale } from '@/components/ui/value-scale'
import { cn } from '@/lib/utils/cn'

/**
 * Progress, drawn as ten sheets filling with graphite rather than as a bar.
 *
 * Beside it, the spread: the lowest and highest scores this academy has given
 * so far, marked on the value scale. That widening range IS the academy's
 * standard taking shape, and watching it widen is the reason calibration does
 * not feel like data entry.
 */
export function CalibrationProgress({
  anchored,
  spread,
}: {
  anchored: number
  spread: { low: number; high: number } | null
}) {
  const sheets = Array.from({ length: CALIBRATION_TARGET }, (_, i) => i < anchored)

  return (
    <div className="flex flex-col gap-6 border border-v3 bg-v0 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-v9">
          <span className="numeral">{anchored}</span> of{' '}
          <span className="numeral">{CALIBRATION_TARGET}</span> anchored
        </p>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {sheets.map((filled, i) => (
            <span
              key={i}
              className={cn(
                'block h-9 w-7 border',
                filled ? 'border-v9 bg-v9' : 'border-dashed border-v4 bg-v1',
              )}
            />
          ))}
        </div>
        <p className="mt-3 max-w-[46ch] text-xs text-v6">{message(anchored)}</p>
      </div>

      <div className="sm:text-right">
        <p className="text-xs text-v6">Your range so far</p>
        {spread ? (
          <>
            <p className="numeral mt-1 text-lg text-v9">
              {spread.low} to {spread.high}
            </p>
            <div className="mt-3 flex justify-start sm:justify-end">
              <ValueScale
                orientation="horizontal"
                size={16}
                length={180}
                highlight={spread.high}
                showNumbers
              />
            </div>
            <p className="mt-2 max-w-[30ch] text-2xs text-v5 sm:ml-auto">
              {spread.high - spread.low >= 5
                ? 'Wide enough to tell a weak work from a strong one.'
                : 'Add a work at each end of your scale — a weak one and a strong one.'}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-v5">Nothing anchored yet</p>
        )}
      </div>
    </div>
  )
}

/** What the count actually buys the instructor, said plainly. */
function message(n: number): string {
  if (n === 0) {
    return 'Start with a work you would call weak. The bottom of your scale is the hardest thing for a generic rubric to guess.'
  }
  if (n === 1) {
    return 'One anchor. KAUSHAL knows one point on your scale and nothing about the rest of it.'
  }
  if (n === 2) {
    return 'Two anchors. One more and proposals start being made against your standard.'
  }
  if (n < 5) {
    return `${n} anchors. KAUSHAL can already tell a 4 from an 8 at this academy.`
  }
  if (n < CALIBRATION_TARGET) {
    return `${n} anchors. Solid. The last few mostly sharpen the ends of the scale.`
  }
  return 'Ten anchors. Every proposal from here is made against your standard.'
}
