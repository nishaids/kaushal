'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { SCORE_MAX, SCORE_MIN } from '@/lib/rubric'

/**
 * The core visual grammar of KAUSHAL.
 *
 * A proposed score is a construction line: non-photo blue, dashed, low in
 * value — the pencil an art student draws guidelines with precisely because it
 * disappears when the work is reproduced. A confirmed score has been inked: the
 * darkest dark on the sheet, solid border, full contrast.
 *
 * Confirming is not a state change with a checkmark. It is an overdraw. A
 * graphite plate wipes across the blue one, left to right, the way you ink in a
 * line you have decided to keep.
 */

export type MarkState = 'proposed' | 'confirmed' | 'empty'

export interface ScoreMarkProps {
  value: number | null
  state: MarkState
  /** 0..1 from the model. Low confidence renders literally fainter. */
  confidence?: number | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Announced to screen readers in place of the bare numeral. */
  label?: string
}

const sizeCls = {
  sm: 'h-7 w-7 text-sm',
  md: 'h-10 w-10 text-lg',
  lg: 'h-14 w-14 text-2xl',
} as const

export function ScoreMark({
  value,
  state,
  confidence,
  size = 'md',
  className,
  label,
}: ScoreMarkProps) {
  const reduce = useReducedMotion()
  const faint = state === 'proposed' && typeof confidence === 'number' && confidence < 0.55

  const text =
    state === 'empty' || value === null
      ? '—'
      : String(Math.round(value))

  const description =
    label ??
    (state === 'confirmed'
      ? `${text} out of 10, confirmed by you`
      : state === 'proposed'
        ? `${text} out of 10, proposed, not yet confirmed`
        : 'not scored')

  return (
    <span
      className={cn(
        'numeral relative inline-grid place-items-center overflow-hidden rounded-[2px] font-medium tabular-nums',
        sizeCls[size],
        state === 'confirmed' && 'mark-confirmed',
        state === 'proposed' && 'mark-proposed',
        state === 'empty' && 'border border-dotted border-v4 text-v5',
        faint && 'mark-faint',
        className,
      )}
      role="img"
      aria-label={description}
    >
      <AnimatePresence initial={false}>
        {state === 'confirmed' && (
          <motion.span
            key="ink"
            aria-hidden="true"
            className="absolute inset-0 bg-v9"
            initial={reduce ? { clipPath: 'inset(0 0 0 0)' } : { clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: 'inset(0 0 0 0)' }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.26, ease: [0.65, 0, 0.35, 1] }
            }
          />
        )}
      </AnimatePresence>
      <span
        className={cn(
          'relative z-10 transition-colors duration-200',
          state === 'confirmed' && 'text-v0',
        )}
      >
        {text}
      </span>
    </span>
  )
}

/**
 * Override control. Ten ticks, because the rubric has ten steps and a slider
 * would imply a precision the rubric does not have. The instructor's current
 * choice is the darkest mark in the row.
 */
export interface ValueTicksProps {
  value: number | null
  proposed?: number | null
  onChange: (n: number) => void
  disabled?: boolean
  /** Widened hit targets and a visible hint when the model was unsure. */
  uncertain?: boolean
  labelledBy?: string
}

export function ValueTicks({
  value,
  proposed,
  onChange,
  disabled,
  uncertain,
  labelledBy,
}: ValueTicksProps) {
  const reduce = useReducedMotion()
  const steps = Array.from(
    { length: SCORE_MAX - SCORE_MIN + 1 },
    (_, i) => SCORE_MIN + i,
  )

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn('flex items-end gap-[3px]', disabled && 'opacity-40')}
    >
      {steps.map((n) => {
        const selected = value === n
        const isProposal = proposed === n && value !== n
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${n} out of 10${isProposal ? ', the proposed score' : ''}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'group relative flex flex-col items-center justify-end rounded-[2px] transition-colors',
              uncertain ? 'w-8' : 'w-7',
            )}
          >
            <span
              className={cn(
                'w-full origin-bottom transition-[height,background-color] duration-200 ease-out',
                selected
                  ? 'bg-v9'
                  : isProposal
                    ? 'border border-dashed border-blue-ink bg-blue-wash'
                    : 'bg-v3 group-hover:bg-v5',
              )}
              style={{
                height: reduce
                  ? 18
                  : 8 + (n / SCORE_MAX) * (selected ? 20 : 14),
              }}
            />
            <span
              className={cn(
                'numeral mt-1 text-2xs transition-colors',
                selected ? 'text-v9' : 'text-v5 group-hover:text-v7',
              )}
            >
              {n}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Confidence rendered as what it is: faintness. Six marks on a value ramp —
 * a confident proposal is dark, an unsure one is barely there. There is no
 * coloured badge anywhere in this product.
 */
export function ConfidenceMeter({
  confidence,
  className,
}: {
  confidence: number | null | undefined
  className?: string
}) {
  if (typeof confidence !== 'number') return null
  const filled = Math.max(1, Math.round(confidence * 6))
  const wording =
    confidence >= 0.75
      ? 'Confident'
      : confidence >= 0.55
        ? 'Fairly sure'
        : confidence >= 0.35
          ? 'Unsure'
          : 'Low — check this one'

  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      title={`Model confidence ${Math.round(confidence * 100)} per cent`}
    >
      <span className="flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className="h-3 w-[3px]"
            style={{
              backgroundColor:
                i < filled
                  ? `color-mix(in srgb, var(--color-v9) ${28 + i * 14}%, var(--color-v3))`
                  : 'var(--color-v2)',
            }}
          />
        ))}
      </span>
      <span className="text-2xs text-v5">
        {wording}
        <span className="sr-only">
          {' '}
          — model confidence {Math.round(confidence * 100)} per cent
        </span>
      </span>
    </span>
  )
}
