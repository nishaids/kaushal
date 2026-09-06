'use client'

import { forwardRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/**
 * One primary action per screen, and it is the darkest thing on that screen.
 * Hierarchy here is value, not colour and not size.
 *
 * `guide` is the exception that proves the rule: it is drawn in non-photo blue
 * because it acts on a proposal that has not been inked yet.
 */
type Variant = 'ink' | 'outline' | 'quiet' | 'guide' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex items-center justify-center gap-2 rounded-[2px] font-medium ' +
  'transition-[background-color,color,border-color,transform] duration-150 ease-out ' +
  'disabled:pointer-events-none disabled:opacity-40 select-none ' +
  'active:translate-y-px'

const variants: Record<Variant, string> = {
  ink: 'bg-v9 text-v0 border border-v9 hover:bg-v8 hover:border-v8',
  outline: 'bg-v0 text-v8 border border-v4 hover:border-v8 hover:bg-v0',
  quiet:
    'bg-transparent text-v6 border border-transparent hover:text-v9 hover:bg-v2',
  guide:
    'bg-blue-wash text-blue-deep border border-dashed border-blue-ink hover:bg-blue hover:text-v9',
  danger: 'bg-v0 text-v8 border border-v5 hover:bg-v9 hover:text-v0 hover:border-v9',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Replaces the label while an action is in flight. Never leaves the user guessing. */
  busy?: boolean
  busyLabel?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'outline',
      size = 'md',
      busy = false,
      busyLabel,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {busy ? (
          <>
            <PencilTick />
            <span>{busyLabel ?? 'Working'}</span>
          </>
        ) : (
          children
        )}
      </button>
    )
  },
)

export interface ButtonLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  variant?: Variant
  size?: Size
}

export function ButtonLink({
  href,
  variant = 'outline',
  size = 'md',
  className,
  children,
  ...props
}: ButtonLinkProps) {
  const external = href.startsWith('http')
  const cls = cn(base, variants[variant], sizes[size], className)
  if (external) {
    return (
      <a
        href={href}
        className={cls}
        rel="noreferrer noopener"
        target="_blank"
        {...props}
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls} {...props}>
      {children}
    </Link>
  )
}

/**
 * The busy indicator: a pencil stroke being laid down and lifted. Three dashes
 * advancing, not a spinning ring — a spinner in this product would be the one
 * piece of visual language borrowed from somewhere else.
 */
function PencilTick() {
  return (
    <svg
      width="14"
      height="8"
      viewBox="0 0 14 8"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="1" y1="4" x2="4" y2="4">
          <animate
            attributeName="stroke-opacity"
            values="0.25;1;0.25"
            dur="1.05s"
            repeatCount="indefinite"
            begin="0s"
          />
        </line>
        <line x1="5.5" y1="4" x2="8.5" y2="4">
          <animate
            attributeName="stroke-opacity"
            values="0.25;1;0.25"
            dur="1.05s"
            repeatCount="indefinite"
            begin="0.18s"
          />
        </line>
        <line x1="10" y1="4" x2="13" y2="4">
          <animate
            attributeName="stroke-opacity"
            values="0.25;1;0.25"
            dur="1.05s"
            repeatCount="indefinite"
            begin="0.36s"
          />
        </line>
      </g>
    </svg>
  )
}
