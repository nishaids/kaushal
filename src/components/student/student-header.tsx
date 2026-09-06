'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Student } from '@/lib/types'
import { longDate, pct, relativeDays } from '@/lib/utils/format'
import { MetaItem, PageHeader } from '@/components/ui/plate'
import { ButtonLink } from '@/components/ui/button'
import { IconChevron } from '@/components/ui/icons'
import { StudentSettings } from './student-settings'

export function StudentHeader({
  student,
  worksCount,
  confirmedShare,
  lastWorkAt,
  hasReport,
}: {
  student: Student
  worksCount: number
  confirmedShare: number
  lastWorkAt: string | null
  hasReport: boolean
}) {
  const [editing, setEditing] = useState(false)

  return (
    <>
    <PageHeader
      back={
        <Link
          href="/studio"
          className="inline-flex items-center gap-1.5 rounded-[2px] text-xs text-v6 transition-colors hover:text-v9"
        >
          <IconChevron dir="left" size={12} />
          Cohort
        </Link>
      }
      title={student.name}
      meta={
        <>
          <MetaItem label="Level">{student.level}</MetaItem>
          <span className="h-3 w-px bg-v3" aria-hidden="true" />
          <MetaItem label="Joined">{longDate(student.joined_at)}</MetaItem>
          <span className="h-3 w-px bg-v3" aria-hidden="true" />
          <MetaItem label="Works">{worksCount}</MetaItem>
          {lastWorkAt ? (
            <>
              <span className="h-3 w-px bg-v3" aria-hidden="true" />
              <MetaItem label="Last">{relativeDays(lastWorkAt)}</MetaItem>
            </>
          ) : null}
          {worksCount > 0 ? (
            <>
              <span className="h-3 w-px bg-v3" aria-hidden="true" />
              <MetaItem label="Confirmed by you">{pct(confirmedShare)}</MetaItem>
            </>
          ) : null}
          {student.status !== 'active' ? (
            <>
              <span className="h-3 w-px bg-v3" aria-hidden="true" />
              <span className="text-v7">{student.status}</span>
            </>
          ) : null}
        </>
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-[2px] px-2 py-2 text-xs text-v6 underline underline-offset-4 transition-colors hover:text-v9"
          >
            Edit student
          </button>
          <ButtonLink
            href={`/studio/students/${student.id}/report`}
            variant="outline"
          >
            {hasReport ? 'Parent report' : 'Write a parent report'}
          </ButtonLink>
          <ButtonLink href="/studio/capture" variant="ink">
            Record a work
          </ButtonLink>
        </div>
      }
    />

    <StudentSettings
      student={student}
      open={editing}
      onClose={() => setEditing(false)}
    />
    </>
  )
}
