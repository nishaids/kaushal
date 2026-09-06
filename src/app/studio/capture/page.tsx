import type { Metadata } from 'next'
import { db } from '@/lib/dal'
import { CALIBRATION_HOLDER_NAME } from '@/lib/constants'
import { requireCalibrated } from '@/lib/session'
import type { ScoredWork } from '@/lib/types'
import { PageHeader, Rule } from '@/components/ui/plate'
import { CaptureFlow } from '@/components/capture/capture-flow'
import { PendingList } from '@/components/capture/pending-list'

export const metadata: Metadata = { title: 'Record a work' }

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>
}) {
  const { student } = await searchParams
  const session = await requireCalibrated()
  const driver = await db()

  const [students, works, assignments] = await Promise.all([
    driver.listStudents(session.academy.id, { status: 'all' }),
    driver.listScoredWorks(session.academy.id, {}),
    driver.listAssignments(session.academy.id, { issuedOnly: true }),
  ])

  const roster = students.filter((s) => s.name !== CALIBRATION_HOLDER_NAME)
  const names = new Map(roster.map((s) => [s.id, s.name]))

  // The queue: anything whose five scores are not all confirmed yet.
  const pending: ScoredWork[] = works
    .filter(
      (w) =>
        names.has(w.student_id) &&
        w.scores.some((s) => s.confirmed_score === null),
    )
    .sort(
      (a, b) =>
        new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime(),
    )
    .slice(0, 24)

  return (
    <>
      <PageHeader
        title="Record a work"
        meta={
          <>
            <span>One photo per student at the end of class</span>
            <span className="h-3 w-px bg-v3" aria-hidden="true" />
            <span>
              {pending.length === 0
                ? 'Nothing waiting on you'
                : `${pending.length} waiting on you`}
            </span>
          </>
        }
      />

      <div className="px-5 py-6 sm:px-8">
        <CaptureFlow
          students={roster}
          assignments={assignments}
          initialStudentId={student ?? null}
        />

        <Rule className="my-10" />

        <PendingList works={pending} names={names} />
      </div>
    </>
  )
}
