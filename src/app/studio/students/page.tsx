import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/dal'
import { CALIBRATION_HOLDER_NAME } from '@/lib/constants'
import { requireCalibrated } from '@/lib/session'
import type { ScoredWork } from '@/lib/types'
import { relativeDays } from '@/lib/utils/format'
import { PageHeader } from '@/components/ui/plate'
import { EmptyState } from '@/components/ui/states'
import { ButtonLink } from '@/components/ui/button'
import { DimensionBars } from '@/components/cohort/dimension-bars'
import { deriveAlerts } from '@/lib/analytics/alerts'
import { DIMENSIONS } from '@/lib/rubric'
import type { Dimension } from '@/lib/rubric'

export const metadata: Metadata = { title: 'Students' }

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const session = await requireCalibrated()
  const driver = await db()

  const [students, works] = await Promise.all([
    driver.listStudents(session.academy.id, { status: 'all', search: q }),
    driver.listScoredWorks(session.academy.id, {}),
  ])

  const byStudent = new Map<string, ScoredWork[]>()
  for (const w of works) {
    const list = byStudent.get(w.student_id)
    if (list) list.push(w)
    else byStudent.set(w.student_id, [w])
  }

  const now = new Date()
  const flaggedStudents = new Set(
    students
      .filter((s) => deriveAlerts(s.id, byStudent.get(s.id) ?? [], now).length > 0)
      .map((s) => s.id),
  )

  const roster = students
    .filter((s) => s.name !== CALIBRATION_HOLDER_NAME)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader
        title="Students"
        meta={<span>{roster.length} on the roster, alphabetical</span>}
        action={
          <ButtonLink href="/studio" variant="outline">
            Sort by who needs me
          </ButtonLink>
        }
      />

      <div className="px-5 py-6 sm:px-8">
        {roster.length === 0 ? (
          <EmptyState
            title="Nobody on the roster yet"
            body="Add students from the cohort screen. Each one gets a trajectory as soon as you record their first work."
            action={
              <ButtonLink href="/studio" variant="ink">
                Go to the cohort
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-px border border-v3 bg-v3 sm:grid-cols-2 xl:grid-cols-3">
            {roster.map((s) => {
              const studentWorks = byStudent.get(s.id) ?? []
              const latest = latestValues(studentWorks)
              const last = studentWorks[studentWorks.length - 1] ?? null

              return (
                <li key={s.id} className="bg-v0">
                  <Link
                    href={`/studio/students/${s.id}`}
                    className="flex items-start gap-4 p-4 transition-colors hover:bg-v1"
                  >
                    <span className="h-14 w-14 shrink-0 overflow-hidden border border-v3 bg-v1">
                      {last?.thumb_url || last?.image_url ? (
                        <img
                          src={last.thumb_url ?? last.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm text-v9">{s.name}</span>
                        {flaggedStudents.has(s.id) ? (
                          <span
                            className="inline-block h-1.5 w-1.5 shrink-0 bg-blue-ink"
                            aria-label="carrying a flag"
                          />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-2xs text-v5">
                        Level {s.level} — {studentWorks.length}{' '}
                        {studentWorks.length === 1 ? 'work' : 'works'}
                        {last ? ` — ${relativeDays(last.captured_at)}` : ' — nothing yet'}
                      </span>
                      <span className="mt-2 block">
                        <DimensionBars latest={latest} height={20} />
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

function latestValues(works: ScoredWork[]): Partial<Record<Dimension, number>> {
  const out: Partial<Record<Dimension, number>> = {}
  for (let i = works.length - 1; i >= 0; i -= 1) {
    for (const d of DIMENSIONS) {
      if (out[d] !== undefined) continue
      const row = works[i].scores.find((s) => s.dimension === d)
      const v = row ? (row.confirmed_score ?? row.ai_score) : null
      if (v !== null && v !== undefined) out[d] = v
    }
  }
  return out
}
