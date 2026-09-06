import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/dal'
import { requireCalibrated } from '@/lib/session'
import { toTrajectoryPoints } from '@/lib/analytics/trajectory'
import { detectPlateaus } from '@/lib/analytics/plateau'
import { PageHeader } from '@/components/ui/plate'
import { IconChevron } from '@/components/ui/icons'
import { ReportWorkspace } from '@/components/report/report-workspace'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const session = await requireCalibrated()
    const driver = await db()
    const student = await driver.getStudent(session.academy.id, id)
    return { title: student ? `${student.name} — report` : 'Report' }
  } catch {
    return { title: 'Report' }
  }
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireCalibrated()
  const driver = await db()

  const student = await driver.getStudent(session.academy.id, id)
  if (!student) notFound()

  const [works, reports] = await Promise.all([
    driver.listScoredWorks(session.academy.id, { studentId: id }),
    driver.listReports(session.academy.id, id),
  ])

  const points = toTrajectoryPoints(works)
  const plateaus = detectPlateaus(works)

  // Default period: the last ninety days, clipped to when they actually joined.
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000)
  const joined = new Date(student.joined_at)
  const defaultStart = (joined > ninetyDaysAgo ? joined : ninetyDaysAgo)
    .toISOString()
    .slice(0, 10)
  const defaultEnd = now.toISOString().slice(0, 10)

  return (
    <>
      <div className="no-print">
        <PageHeader
          back={
            <Link
              href={`/studio/students/${student.id}`}
              className="inline-flex items-center gap-1.5 rounded-[2px] text-xs text-v6 transition-colors hover:text-v9"
            >
              <IconChevron dir="left" size={12} />
              {student.name}
            </Link>
          }
          title="Parent report"
          meta={
            <>
              <span>{student.name}</span>
              <span className="h-3 w-px bg-v3" aria-hidden="true" />
              <span>
                {works.length} {works.length === 1 ? 'work' : 'works'} recorded in
                total
              </span>
            </>
          }
        />
      </div>

      <div className="px-5 py-6 sm:px-8">
        <ReportWorkspace
          student={student}
          academyName={session.academy.name}
          instructorName={session.instructor.name}
          works={works}
          points={points}
          plateaus={plateaus}
          reports={reports}
          defaultStart={defaultStart}
          defaultEnd={defaultEnd}
        />
      </div>
    </>
  )
}
