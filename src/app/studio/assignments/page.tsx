import type { Metadata } from 'next'
import { db } from '@/lib/dal'
import { CALIBRATION_HOLDER_NAME } from '@/lib/constants'
import { requireCalibrated } from '@/lib/session'
import { detectPlateaus } from '@/lib/analytics/plateau'
import { analyseTrajectory } from '@/lib/analytics/trajectory'
import { isDimension, type Dimension } from '@/lib/rubric'
import type { ScoredWork } from '@/lib/types'
import { PageHeader, Rule } from '@/components/ui/plate'
import { AssignmentComposer } from '@/components/assignment/assignment-composer'
import { AssignmentList } from '@/components/assignment/assignment-list'

export const metadata: Metadata = { title: 'Assignments' }

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; dimension?: string }>
}) {
  const { student: studentParam, dimension: dimensionParam } = await searchParams
  const session = await requireCalibrated()
  const driver = await db()

  const [students, assignments, works] = await Promise.all([
    driver.listStudents(session.academy.id, { status: 'all' }),
    driver.listAssignments(session.academy.id),
    driver.listScoredWorks(session.academy.id, {}),
  ])

  const roster = students.filter((s) => s.name !== CALIBRATION_HOLDER_NAME)
  const names = new Map(roster.map((s) => [s.id, s.name]))

  const byStudent = new Map<string, ScoredWork[]>()
  for (const w of works) {
    const list = byStudent.get(w.student_id)
    if (list) list.push(w)
    else byStudent.set(w.student_id, [w])
  }

  // Which dimension is flagged for each student, so the composer can default to
  // the right one and say why it defaulted there.
  const suggestions = new Map<
    string,
    { dimension: Dimension; reason: string } | null
  >()
  for (const s of roster) {
    const studentWorks = byStudent.get(s.id) ?? []
    if (studentWorks.length === 0) {
      suggestions.set(s.id, null)
      continue
    }
    const plateau = detectPlateaus(studentWorks)[0]
    if (plateau) {
      suggestions.set(s.id, { dimension: plateau.dimension, reason: plateau.message })
      continue
    }
    const analysis = analyseTrajectory(studentWorks)
    if (analysis.weakest) {
      suggestions.set(s.id, {
        dimension: analysis.weakest.dimension,
        reason: `This is ${s.name.split(' ')[0]}’s lowest dimension right now, at ${Math.round(analysis.weakest.value)} out of 10.`,
      })
    } else {
      suggestions.set(s.id, null)
    }
  }

  const preselectStudent =
    studentParam && names.has(studentParam) ? studentParam : null
  const preselectDimension =
    dimensionParam && isDimension(dimensionParam) ? dimensionParam : null

  const issued = assignments.filter((a) => a.issued_at !== null)
  const drafts = assignments.filter((a) => a.issued_at === null)

  return (
    <>
      <PageHeader
        title="Assignments"
        meta={
          <>
            <span>{issued.length} issued</span>
            <span className="h-3 w-px bg-v3" aria-hidden="true" />
            <span>{drafts.length} in draft</span>
          </>
        }
      />

      <div className="px-5 py-6 sm:px-8">
        <AssignmentComposer
          students={roster}
          suggestions={Object.fromEntries(suggestions)}
          initialStudentId={preselectStudent}
          initialDimension={preselectDimension}
          arrivedFromFlag={Boolean(preselectStudent && preselectDimension)}
        />

        <Rule className="my-10" />

        <AssignmentList
          heading="Drafts"
          note="Written but not given to anyone yet."
          assignments={drafts}
          names={names}
          emptyBody="Nothing in draft. A brief you generate stays here until you issue it."
        />

        <div className="mt-10">
          <AssignmentList
            heading="Issued"
            note="Given to the student. Link a work to one when you record it."
            assignments={issued}
            names={names}
            emptyBody="Nothing issued yet. Draft an exercise above, edit it into your own words, then issue it."
          />
        </div>
      </div>
    </>
  )
}
