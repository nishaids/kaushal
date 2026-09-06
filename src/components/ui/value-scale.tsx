import { cn } from '@/lib/utils/cn'
import { SCORE_MAX } from '@/lib/rubric'

/**
 * The value scale.
 *
 * Every art student is handed one of these on their first day: a printed strip
 * running from paper white to the darkest dark the medium can make, used to
 * judge where a tone sits. KAUSHAL scores 1 to 10, so the strip has ten steps,
 * and it is the same object throughout the product — the chart's y-axis, the
 * mark in the corner of the page, and the device a report uses to show a parent
 * how far their child has moved.
 *
 * It is not decoration. It is the unit the product is denominated in.
 */

export function valueForStep(step: number): string {
  // Step 1 is near paper, step 10 is the darkest dark. Perceptually spaced
  // rather than linear, so the light end does not collapse into the paper.
  const t = (step - 1) / (SCORE_MAX - 1)
  const eased = Math.pow(t, 0.82)
  const l = 92 - eased * 88
  return `hsl(34 8% ${l}%)`
}

export function ValueScale({
  orientation = 'vertical',
  size = 12,
  length,
  highlight,
  showNumbers = false,
  className,
}: {
  orientation?: 'vertical' | 'horizontal'
  /** Thickness of the strip in pixels. */
  size?: number
  /** Total length in pixels. Defaults to filling the parent. */
  length?: number
  /** A step to mark, e.g. the student's latest score on this dimension. */
  highlight?: number | null
  showNumbers?: boolean
  className?: string
}) {
  const steps = Array.from({ length: SCORE_MAX }, (_, i) => i + 1)
  const vertical = orientation === 'vertical'

  return (
    <div
      className={cn(
        'flex',
        vertical ? 'flex-col-reverse items-start' : 'flex-row items-end',
        className,
      )}
      style={vertical ? { width: size, height: length } : { height: size, width: length }}
      aria-hidden="true"
    >
      {steps.map((s) => (
        <div
          key={s}
          className="relative flex-1"
          style={{ backgroundColor: valueForStep(s) }}
        >
          {highlight === s ? (
            <span
              className={cn(
                'absolute bg-blue',
                vertical
                  ? 'top-1/2 left-full h-[2px] w-2 -translate-y-1/2'
                  : 'left-1/2 bottom-full h-2 w-[2px] -translate-x-1/2',
              )}
            />
          ) : null}
          {showNumbers ? (
            <span
              className={cn(
                'numeral absolute text-2xs',
                s > 5 ? 'text-v1' : 'text-v8',
                vertical
                  ? 'top-1/2 left-1 -translate-y-1/2'
                  : 'bottom-0.5 left-1/2 -translate-x-1/2',
              )}
            >
              {s}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/**
 * The mark. Five graphite bars at the five dimension values, read left to
 * right, which is also exactly what the trajectory chart draws. The product's
 * logo is a small instance of its main screen.
 */
export function KaushalMark({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  const heights = [0.45, 0.68, 0.55, 0.86, 1]
  return (
    <span
      className={cn('inline-flex items-end gap-[2px]', className)}
      style={{ height: size }}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            height: `${h * 100}%`,
            width: Math.max(2, size / 9),
            backgroundColor: valueForStep(3 + i * 1.6),
          }}
        />
      ))}
    </span>
  )
}

export function Wordmark({
  className,
  size = 18,
}: {
  className?: string
  size?: number
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <KaushalMark size={size} />
      <span
        className="font-medium tracking-[0.06em] text-v9"
        style={{ fontSize: size * 0.78, fontStretch: '112%' }}
      >
        KAUSHAL
      </span>
    </span>
  )
}
