import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/dal'
import { requireCalibrated } from '@/lib/session'
import { analyseTrajectory } from '@/lib/analytics/trajectory'
import { detectPlateaus } from '@/lib/analytics/plateau'
import { StudentHeader } from '@/components/student/student-header'
import { TrajectoryPanel } from '@/components/student/trajectory-panel'
import { EmptyState } from '@/components/ui/states'
import { ButtonLink } from '@/components/ui/button'

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
    return { title: student ? student.name : 'Student' }
  } catch {
    return { title: 'Student' }
  }
}

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireCalibrated()
  const driver = await db()

  const student = await driver.getStudent(session.academy.id, id)
  if (!student) notFound()

  const [works, alerts, assignments, reports] = await Promise.all([
    driver.listScoredWorks(session.academy.id, { studentId: id }),
    driver.listAlerts(session.academy.id, { studentId: id, openOnly: true }),
    driver.listAssignments(session.academy.id, { studentId: id }),
    driver.listReports(session.academy.id, id),
  ])

  const analysis = analyseTrajectory(works)
  const plateaus = detectPlateaus(works)

  return (
    <>
      <StudentHeader
        student={student}
        worksCount={works.length}
        confirmedShare={analysis.confirmedShare}
        lastWorkAt={works.length ? works[works.length - 1].captured_at : null}
        hasReport={reports.length > 0}
      />

      <div className="px-5 py-6 sm:px-8">
        {works.length === 0 ? (
          <EmptyState
            title={`Nothing recorded for ${student.name.split(' ')[0]} yet`}
            body="A trajectory needs at least one work to start, and four before KAUSHAL will say anything about a plateau. Photograph their next piece at the end of class and the line begins here."
            action={
              <ButtonLink href="/studio/capture" variant="ink">
                Record their first work
              </ButtonLink>
            }
          />
        ) : (
          <TrajectoryPanel
            student={student}
            works={works}
            analysis={analysis}
            plateaus={plateaus}
            alerts={alerts}
            assignments={assignments}
          />
        )}
      </div>
    </>
  )
}
