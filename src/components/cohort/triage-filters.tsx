'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { IconSearch } from '@/components/ui/icons'
import type { CohortSortKey } from '@/lib/analytics/cohort'

/**
 * Filters live in the URL, so a filtered cohort is a link an instructor can
 * bookmark or send to themselves, and the back button behaves.
 */

const VIEWS: Array<{ id: string; label: string; count?: keyof Counts }> = [
  { id: 'all', label: 'Everyone', count: 'total' },
  { id: 'flagged', label: 'Flagged', count: 'flagged' },
  { id: 'waiting', label: 'Waiting on me', count: 'unconfirmed' },
  { id: 'dormant', label: 'Gone quiet', count: 'dormant' },
  { id: 'new', label: 'Nothing recorded', count: 'needsFirstWork' },
]

const SORTS: Array<{ id: CohortSortKey; label: string }> = [
  { id: 'attention', label: 'Who needs me first' },
  { id: 'recent', label: 'Most recent work' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'mean', label: 'Latest average' },
  { id: 'works', label: 'Number of works' },
  { id: 'name', label: 'Name' },
]

interface Counts {
  total: number
  flagged: number
  dormant: number
  unconfirmed: number
  needsFirstWork: number
}

export function TriageFilters({
  view,
  query,
  sort,
  dir,
  counts,
}: {
  view: string
  query: string
  sort: CohortSortKey
  dir: 'asc' | 'desc'
  counts: Counts
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [text, setText] = useState(query)
  const timer = useRef<number | null>(null)

  const push = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      const qs = next.toString()
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      })
    },
    [params, pathname, router],
  )

  // Typing should not put one history entry per keystroke, or fire one request
  // per keystroke either.
  useEffect(() => {
    if (text === query) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => push({ q: text || null }), 200)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [text, query, push])

  return (
    <div className="flex flex-col gap-4 border-b border-v3 pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div
        role="group"
        aria-label="Filter the cohort"
        className="flex flex-wrap items-center gap-1"
      >
        {VIEWS.map((v) => {
          const active = view === v.id
          const n = v.count ? counts[v.count] : undefined
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              onClick={() => push({ view: v.id === 'all' ? null : v.id })}
              className={cn(
                'inline-flex items-center gap-2 rounded-[2px] border px-3 py-1.5 text-xs transition-colors',
                active
                  ? 'border-v9 bg-v9 text-v0'
                  : 'border-v3 bg-v0 text-v6 hover:border-v7 hover:text-v9',
              )}
            >
              {v.label}
              {typeof n === 'number' ? (
                <span
                  className={cn('numeral text-2xs', active ? 'text-v3' : 'text-v5')}
                >
                  {n}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <label htmlFor="cohort-search" className="sr-only">
            Search students by name
          </label>
          <div className="flex items-center gap-2 border-b border-v4 pb-1 focus-within:border-v9">
            <IconSearch size={14} className="text-v5" />
            <input
              id="cohort-search"
              type="search"
              value={text}
              placeholder="Find a student"
              onChange={(e) => setText(e.target.value)}
              className="w-40 bg-transparent text-sm text-v9 placeholder:text-v5 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cohort-sort" className="sr-only">
            Sort by
          </label>
          <select
            id="cohort-sort"
            value={sort}
            onChange={(e) => push({ sort: e.target.value })}
            className="border-b border-v4 bg-transparent py-1 text-xs text-v7 focus:border-v9 focus:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => push({ dir: dir === 'desc' ? 'asc' : 'desc' })}
          className="rounded-[2px] border border-v3 px-2.5 py-1.5 text-2xs text-v6 transition-colors hover:border-v7 hover:text-v9"
          aria-label={
            dir === 'desc' ? 'Sorted highest first. Reverse it.' : 'Sorted lowest first. Reverse it.'
          }
        >
          {dir === 'desc' ? 'Highest first' : 'Lowest first'}
        </button>
      </div>
    </div>
  )
}
