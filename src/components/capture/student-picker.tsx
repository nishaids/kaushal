'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Student } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import { IconSearch } from '@/components/ui/icons'

const LAST_STUDENT_KEY = 'kaushal:last-student'

/**
 * Picking the student.
 *
 * An instructor photographs a whole class in one sitting, so this remembers who
 * was last chosen in this session and keeps the keyboard in the field: type,
 * arrow down, enter, next drawing.
 */
export function StudentPicker({
  students,
  value,
  onChange,
  autoFocus,
}: {
  students: Student[]
  value: string | null
  onChange: (id: string) => void
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = students.find((s) => s.id === value) ?? null

  // Restore the last student used, so the second drawing of a session is one
  // click rather than a search.
  useEffect(() => {
    if (value) return
    try {
      const last = window.sessionStorage.getItem(LAST_STUDENT_KEY)
      if (last && students.some((s) => s.id === last)) onChange(last)
    } catch {
      // Session storage is unavailable in some privacy modes. Not important.
    }
  }, [value, students, onChange])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = students.filter((s) => s.status !== 'left')
    if (!q) return pool.slice(0, 8)
    return pool.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [students, query])

  function choose(s: Student) {
    onChange(s.id)
    try {
      window.sessionStorage.setItem(LAST_STUDENT_KEY, s.id)
    } catch {
      // Ignore: the picker still works, it just will not remember.
    }
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label htmlFor="student-picker" className="block text-xs font-medium text-v7">
        Student
      </label>

      {selected && !open ? (
        <div className="mt-2 flex items-center justify-between gap-3 border-b border-v9 pb-2">
          <span className="truncate text-base text-v9">{selected.name}</span>
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setQuery('')
              window.setTimeout(() => inputRef.current?.focus(), 0)
            }}
            className="shrink-0 rounded-[2px] text-xs text-v6 underline underline-offset-2 hover:text-v9"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 border-b border-v4 pb-2 focus-within:border-v9">
          <IconSearch size={14} className="text-v5" />
          <input
            ref={inputRef}
            id="student-picker"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="student-options"
            aria-autocomplete="list"
            autoComplete="off"
            autoFocus={autoFocus}
            value={query}
            placeholder="Type a name"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, matches.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const s = matches[active]
                if (s) choose(s)
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            className="w-full bg-transparent text-base text-v9 placeholder:text-v5 focus:outline-none"
          />
        </div>
      )}

      {open ? (
        <ul
          id="student-options"
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto border border-v9 bg-v0"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-xs text-v6">
              No student matches that. Add them from the cohort screen first.
            </li>
          ) : (
            matches.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(s)}
                  className={cn(
                    'flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                    i === active ? 'bg-v9 text-v0' : 'text-v7 hover:bg-v1',
                  )}
                >
                  <span className="truncate">{s.name}</span>
                  <span
                    className={cn(
                      'shrink-0 text-2xs',
                      i === active ? 'text-v3' : 'text-v5',
                    )}
                  >
                    Level {s.level}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
