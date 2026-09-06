'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import type { CohortRow } from '@/lib/types'
import type { Dimension } from '@/lib/rubric'
import { attentionReason } from '@/lib/analytics/cohort'
import { relativeDays, slope } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { DimensionBars } from './dimension-bars'

/**
 * The triage list.
 *
 * At sixty-two rows the job is scanning, not browsing: a fixed header, hairline
 * separators, no zebra striping, and exactly one link per row so the eye has a
 * single target. Severity is expressed in value — the students who need
 * attention are the darkest rows on the screen — because there is no red in
 * this product.
 *
 * On a phone the same information becomes a stack of plates. Nothing is
 * dropped and nothing scrolls sideways; an instructor holding a drawing in one
 * hand still needs the whole picture.
 */

export function TriageTable({ rows }: { rows: CohortRow[] }) {
  const reduce = useReducedMotion()

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden border border-v3 bg-v0 lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Students, sorted by who needs attention first
          </caption>
          <thead>
            <tr className="border-b border-v3 bg-v1 text-left">
              <Th className="w-[26%]">Student</Th>
              <Th className="w-[22%]">Why they are here</Th>
              <Th className="w-[15%]">Latest five</Th>
              <Th className="w-[11%]">Momentum</Th>
              <Th className="w-[12%]">Last work</Th>
              <Th className="w-[14%]">Waiting on you</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <motion.tr
                key={row.student.id}
                layout={!reduce}
                transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
                className={cn(
                  'border-b border-v3 align-middle transition-colors last:border-b-0 hover:bg-v1',
                  i % 2 === 1 && 'bg-transparent',
                )}
              >
                <td className="px-4 py-3.5">
                  <Link
                    href={`/studio/students/${row.student.id}`}
                    className="block rounded-[2px] text-v9 hover:underline"
                  >
                    {row.student.name}
                  </Link>
                  <span className="mt-0.5 block text-2xs text-v5">
                    Level {row.student.level}
                    {row.student.status !== 'active' ? ` — ${row.student.status}` : ''}
                  </span>
                </td>

                <td className="px-4 py-3.5">
                  <AttentionCell row={row} />
                </td>

                <td className="px-4 py-3.5">
                  <DimensionBars
                    latest={row.latest}
                    flagged={flaggedDimensions(row)}
                  />
                </td>

                <td className="numeral px-4 py-3.5 text-v7">
                  {row.momentum === null ? (
                    <span className="text-v5">—</span>
                  ) : (
                    <span
                      title={`${slope(row.momentum)} points a week across all five dimensions`}
                    >
                      {slope(row.momentum)}
                      <span className="ml-1 text-2xs text-v5">/wk</span>
                    </span>
                  )}
                </td>

                <td className="px-4 py-3.5 text-v6">
                  {row.lastWorkAt ? relativeDays(row.lastWorkAt) : (
                    <span className="text-v5">never</span>
                  )}
                </td>

                <td className="px-4 py-3.5">
                  {row.unconfirmedCount > 0 ? (
                    <span className="numeral inline-flex items-center gap-1.5 border border-dashed border-blue-ink px-2 py-1 text-2xs text-blue-deep">
                      {row.unconfirmedCount} to confirm
                    </span>
                  ) : (
                    <span className="text-2xs text-v5">nothing</span>
                  )}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone */}
      <ul className="space-y-2 lg:hidden">
        {rows.map((row) => (
          <li key={row.student.id}>
            <Link
              href={`/studio/students/${row.student.id}`}
              className="block border border-v3 bg-v0 p-4 transition-colors hover:border-v7"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="block truncate text-base text-v9">
                    {row.student.name}
                  </span>
                  <span className="mt-0.5 block text-2xs text-v5">
                    Level {row.student.level} — {row.worksCount} works —{' '}
                    {row.lastWorkAt ? relativeDays(row.lastWorkAt) : 'nothing recorded'}
                  </span>
                </div>
                <DimensionBars
                  latest={row.latest}
                  flagged={flaggedDimensions(row)}
                  height={22}
                />
              </div>
              <div className="mt-3">
                <AttentionCell row={row} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      scope="col"
      className={cn('px-4 py-2.5 text-2xs font-medium text-v6', className)}
    >
      {children}
    </th>
  )
}

/**
 * The attention number is only useful if the instructor can see where it came
 * from, so the reason travels with it. A number nobody can audit is a number
 * nobody should act on.
 */
function AttentionCell({ row }: { row: CohortRow }) {
  const open = row.alerts
  const highest = open[0]

  if (open.length === 0 && row.attention === 0) {
    return <span className="text-2xs text-v5">Nothing needs you here</span>
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-4 w-1.5 shrink-0"
          style={{ backgroundColor: severityInk(row.attention) }}
          aria-hidden="true"
        />
        <span className="numeral text-sm text-v9">{row.attention}</span>
        <span className="text-2xs text-v5">of 100</span>
      </div>
      <p className="mt-1 max-w-[34ch] text-2xs leading-relaxed text-v6">
        {highest ? highest.message : attentionReason(row)}
      </p>
    </div>
  )
}

/** Severity as a value, not a hue. Darker means look sooner. */
function severityInk(attention: number): string {
  if (attention >= 60) return 'var(--color-v9)'
  if (attention >= 35) return 'var(--color-v7)'
  if (attention >= 15) return 'var(--color-v5)'
  return 'var(--color-v3)'
}

function flaggedDimensions(row: CohortRow): Dimension[] {
  const out: Dimension[] = []
  for (const a of row.alerts) {
    if (a.dimension && !out.includes(a.dimension)) out.push(a.dimension)
  }
  return out
}
