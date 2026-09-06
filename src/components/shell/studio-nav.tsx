'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { Wordmark } from '@/components/ui/value-scale'
import {
  IconBrief,
  IconCohort,
  IconSheet,
  IconTrajectory,
} from '@/components/ui/icons'

/**
 * Navigation.
 *
 * A rail on the left at desktop widths, a bar along the bottom on a phone —
 * because an instructor using this in a studio is holding the phone in one hand
 * and a student's drawing in the other.
 *
 * The active item is marked by a graphite bar that slides between items rather
 * than by a coloured pill. Movement shows what changed; it does not decorate.
 */

const ITEMS = [
  { href: '/studio', label: 'Cohort', Icon: IconCohort, exact: true },
  { href: '/studio/capture', label: 'Capture', Icon: IconSheet, exact: false },
  { href: '/studio/students', label: 'Students', Icon: IconTrajectory, exact: false },
  { href: '/studio/assignments', label: 'Assignments', Icon: IconBrief, exact: false },
] as const

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname.startsWith(href)
}

export function StudioNav({
  academyName,
  instructorName,
  pendingCount = 0,
}: {
  academyName: string
  instructorName: string
  pendingCount?: number
}) {
  const pathname = usePathname()
  const reduce = useReducedMotion()

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="hidden w-56 shrink-0 flex-col border-r border-v3 bg-v1 lg:flex"
      >
        <div className="px-5 py-6">
          <Link href="/studio" className="inline-block rounded-[2px]">
            <Wordmark size={17} />
          </Link>
          <p className="mt-3 truncate text-xs text-v6">{academyName}</p>
        </div>

        <ul className="flex-1 px-3">
          {ITEMS.map(({ href, label, Icon, exact }) => {
            const active = isActive(pathname, href, exact)
            return (
              <li key={href} className="relative">
                {active ? (
                  <motion.span
                    layoutId={reduce ? undefined : 'nav-mark'}
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-v9"
                    transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  />
                ) : null}
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-[2px] py-2.5 pl-4 pr-3 text-sm transition-colors',
                    active
                      ? 'text-v9'
                      : 'text-v6 hover:bg-v0 hover:text-v9',
                  )}
                >
                  <Icon size={15} />
                  <span className="flex-1">{label}</span>
                  {href === '/studio/capture' && pendingCount > 0 ? (
                    <span className="numeral border border-dashed border-blue-ink px-1 text-2xs text-blue-deep">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-v3 px-5 py-4">
          <p className="truncate text-xs text-v7">{instructorName}</p>
          <Link
            href="/studio/settings"
            className="mt-1 inline-block text-2xs text-v5 underline underline-offset-2 hover:text-v9"
          >
            Settings and calibration
          </Link>
        </div>
      </nav>

      {/* Phone bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-v3 bg-v1 lg:hidden"
      >
        {ITEMS.map(({ href, label, Icon, exact }) => {
          const active = isActive(pathname, href, exact)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-2xs transition-colors',
                active ? 'text-v9' : 'text-v5',
              )}
            >
              {active ? (
                <motion.span
                  layoutId={reduce ? undefined : 'nav-mark-mobile'}
                  className="absolute inset-x-4 top-0 h-[2px] bg-v9"
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                />
              ) : null}
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}

/** Phone-only header, so the academy name is never off screen. */
export function StudioTopBar({ academyName }: { academyName: string }) {
  return (
    <div className="flex items-center justify-between border-b border-v3 bg-v1 px-5 py-3 lg:hidden">
      <Link href="/studio" className="rounded-[2px]">
        <Wordmark size={15} />
      </Link>
      <span className="truncate text-xs text-v6">{academyName}</span>
    </div>
  )
}
