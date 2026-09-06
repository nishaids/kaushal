'use client'

import { useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { Rule } from './plate'

/**
 * A panel does not darken the page behind it with a black scrim. The page
 * recedes in value — everything behind shifts toward the tooth grey while the
 * panel arrives at paper white. Depth by tone, the same as everywhere else.
 */

export interface PanelProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** Right-hand drawer on desktop, bottom sheet on phones. */
  side?: 'right' | 'center'
  width?: 'md' | 'lg' | 'xl'
  footer?: React.ReactNode
  children: React.ReactNode
}

const widths = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-3xl',
} as const

export function Panel({
  open,
  onClose,
  title,
  description,
  side = 'right',
  width = 'lg',
  footer,
  children,
}: PanelProps) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    const el = ref.current
    el?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      restoreTo.current?.focus?.()
    }
  }, [open])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = ref.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  const enter =
    side === 'right'
      ? { x: reduce ? 0 : '100%' }
      : { y: reduce ? 0 : 24, scale: reduce ? 1 : 0.99 }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex" role="presentation">
          {/* The page recedes in value. No black, no blur. */}
          <motion.button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-v2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.86 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            initial={{ opacity: reduce ? 1 : 0, ...enter }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: reduce ? 1 : 0, ...enter }}
            transition={{ duration: reduce ? 0 : 0.34, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              'relative z-10 flex w-full flex-col bg-v0 outline-none',
              side === 'right'
                ? cn('ml-auto h-full border-l border-v3', widths[width])
                : cn(
                    'mx-auto mt-auto max-h-[92dvh] border border-v3 sm:mt-auto sm:mb-auto',
                    widths[width],
                  ),
            )}
          >
            <header className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg text-v9">{title}</h2>
                {description ? (
                  <p className="mt-1 max-w-[54ch] text-xs text-v6">{description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-1 -mt-1 shrink-0 rounded-[2px] p-2 text-v5 transition-colors hover:bg-v2 hover:text-v9"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d="M1 1l12 12M13 1L1 13"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                </svg>
              </button>
            </header>
            <Rule />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {children}
            </div>
            {footer ? (
              <>
                <Rule />
                <div className="flex flex-wrap justify-end gap-2 px-5 py-4 sm:px-6">
                  {footer}
                </div>
              </>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
