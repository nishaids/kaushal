import { cn } from '@/lib/utils/cn'

/**
 * Empty and error states.
 *
 * An empty state that says "No data" tells the instructor nothing. Every one of
 * these names the next action and says what will happen when they take it. Every
 * error says what went wrong, in the interface's voice, and what to do about it.
 */

export function EmptyState({
  title,
  body,
  action,
  compact = false,
  className,
}: {
  title: string
  body: string
  action?: React.ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-4 border border-dashed border-v4 bg-v1/60 rounded-[2px]',
        compact ? 'p-5' : 'p-8 sm:p-10',
        className,
      )}
    >
      <BlankSheet />
      <div>
        <h3 className="text-lg text-v9">{title}</h3>
        <p className="font-language mt-2 max-w-[52ch] text-base text-v6">{body}</p>
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  title = 'That did not go through',
  body,
  hint,
  action,
  className,
}: {
  title?: string
  body: string
  hint?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 border-l-2 border-v9 bg-v2 p-5 rounded-[2px]',
        className,
      )}
    >
      <div>
        <h3 className="text-base text-v9">{title}</h3>
        <p className="font-language mt-1.5 max-w-[58ch] text-base text-v7">{body}</p>
        {hint ? (
          <p className="mt-2 max-w-[58ch] text-xs text-v6">{hint}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/**
 * A degraded notice. Not an error — the product worked, it just did not have
 * the model available and is telling the truth about it.
 */
export function DegradedNotice({
  note,
  className,
}: {
  note: string
  className?: string
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 border border-dashed border-blue-ink bg-blue-wash/60 px-3 py-2 text-xs text-blue-deep rounded-[2px]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-[3px] inline-block h-2 w-2 shrink-0 border border-blue-ink"
      />
      <span>{note}</span>
    </p>
  )
}

/** Loading placeholders drawn as ruled lines on paper, not grey pills. */
export function SkeletonLines({
  rows = 3,
  className,
}: {
  rows?: number
  className?: string
}) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-px w-full bg-v3"
          style={{ width: `${100 - (i % 3) * 14}%`, opacity: 0.9 - i * 0.12 }}
        />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  )
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('border border-dashed border-v3 bg-v2/50 rounded-[2px]', className)}
    />
  )
}

/**
 * The empty-state device: a blank sheet with one non-photo blue guideline on
 * it. Nothing has been drawn yet, but the page is ready.
 */
function BlankSheet() {
  return (
    <svg
      width="44"
      height="52"
      viewBox="0 0 44 52"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="51"
        fill="var(--color-v0)"
        stroke="var(--color-v4)"
      />
      <line
        x1="6"
        y1="34"
        x2="38"
        y2="34"
        stroke="var(--color-blue)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <line
        x1="14"
        y1="8"
        x2="14"
        y2="44"
        stroke="var(--color-blue)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        opacity="0.7"
      />
    </svg>
  )
}
