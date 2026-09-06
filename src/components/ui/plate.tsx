import { cn } from '@/lib/utils/cn'

/**
 * Layout primitives.
 *
 * A "plate" is a region held at a different value from its surroundings. That
 * is the entire elevation system: nearer is lighter, set back is darker, and
 * the one thing that matters most on a screen may be carbon. There are no
 * shadows in this product, and no stack of identical rounded cards.
 */

type PlateTone = 'raised' | 'recessed' | 'carbon' | 'flat'

const tones: Record<PlateTone, string> = {
  raised: 'bg-v0 border border-v3',
  recessed: 'bg-v2 border border-v3',
  carbon: 'bg-v9 text-v1 border border-v9',
  flat: 'bg-transparent border border-transparent',
}

export function Plate({
  tone = 'raised',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: PlateTone }) {
  return (
    <div
      className={cn('rounded-[2px]', tones[tone], className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** A hairline. One weight, one value, used wherever a boundary is needed. */
export function Rule({
  vertical = false,
  className,
}: {
  vertical?: boolean
  className?: string
}) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn(
        'bg-v3 shrink-0',
        vertical ? 'w-px self-stretch' : 'h-px w-full',
        className,
      )}
    />
  )
}

/**
 * A number the instructor is meant to read at a glance, with the thing it
 * counts written underneath in plain words.
 */
export function Stat({
  value,
  label,
  sub,
  tone = 'ink',
  className,
}: {
  value: React.ReactNode
  label: string
  sub?: string
  tone?: 'ink' | 'guide' | 'quiet'
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div
        className={cn(
          'numeral text-2xl leading-none',
          tone === 'ink' && 'text-v9',
          tone === 'guide' && 'text-blue-ink',
          tone === 'quiet' && 'text-v5',
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-v6">{label}</div>
      {sub ? <div className="mt-0.5 text-2xs text-v5">{sub}</div> : null}
    </div>
  )
}

/** Page shell for every screen inside the studio. */
export function PageHeader({
  title,
  meta,
  action,
  back,
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  back?: React.ReactNode
}) {
  return (
    <header className="border-b border-v3 bg-v1 px-5 py-6 sm:px-8">
      {back ? <div className="mb-3">{back}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl text-v9">{title}</h1>
          {meta ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-v6">
              {meta}
            </div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  )
}

/**
 * Meta items are separated by space and a hairline, never by a middle dot.
 */
export function MetaItem({
  label,
  children,
}: {
  label?: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {label ? <span className="text-v5">{label}</span> : null}
      <span className="text-v7">{children}</span>
    </span>
  )
}
