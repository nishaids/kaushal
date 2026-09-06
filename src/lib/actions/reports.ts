'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import {
  fail,
  ok,
  type ActionResult,
  type Report,
  type ReportContent,
  type ScoredWork,
} from '@/lib/types'
import { generateReport } from '@/lib/ai'
import { analyseTrajectory, effectiveScore } from '@/lib/analytics/trajectory'
import { detectPlateaus } from '@/lib/analytics/plateau'
import { DIMENSIONS, type Dimension } from '@/lib/rubric'

/**
 * The parent report.
 *
 * Built from the student's actual record: their first work and their latest,
 * side by side, and the movement between them in numbers the instructor already
 * confirmed. The instructor approves it before anyone else can see it, and an
 * approved report is a snapshot — it does not change underneath the parent when
 * a later score lands.
 */

export async function draftReport(input: {
  studentId: string
  periodStart: string
  periodEnd: string
}): Promise<ActionResult<{ report: Report; degraded: boolean }>> {
  try {
    const session = await requireSession()
    const driver = await db()

    const student = await driver.getStudent(session.academy.id, input.studentId)
    if (!student) {
      return fail('That student is not in your academy.', 'Pick a student from the cohort.')
    }

    const works = await driver.listScoredWorks(session.academy.id, {
      studentId: input.studentId,
      since: input.periodStart,
      until: input.periodEnd,
    })

    if (works.length === 0) {
      return fail(
        'There is nothing recorded in that period.',
        'Widen the dates, or record a work for this student first — a report with no work in it would say nothing.',
        'empty_period',
      )
    }

    const analysis = analyseTrajectory(works)
    const plateaus = detectPlateaus(works)

    const first = works[0]
    const latest = works[works.length - 1]

    const deltas: ReportContent['deltas'] = {}
    for (const d of DIMENSIONS) {
      const from = dimensionValue(first, d)
      const to = dimensionValue(latest, d)
      if (from !== null && to !== null) deltas[d] = { from, to }
    }

    const drafted = await generateReport({
      studentName: student.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      analysis,
      worksInPeriod: works.length,
      plateaus,
      discipline: session.academy.discipline,
    })

    const content: ReportContent = {
      ...drafted.content,
      improved: drafted.content.improved.map((n) => ({
        ...n,
        from: deltas[n.dimension]?.from ?? 0,
        to: deltas[n.dimension]?.to ?? 0,
      })),
      focus: drafted.content.focus.map((n) => ({
        ...n,
        from: deltas[n.dimension]?.from ?? 0,
        to: deltas[n.dimension]?.to ?? 0,
      })),
      first_work_id: first.id,
      latest_work_id: latest.id,
      works_in_period: works.length,
      deltas,
    }

    const report = await driver.createReport({
      academyId: session.academy.id,
      studentId: input.studentId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      content,
    })

    revalidatePath(`/studio/students/${input.studentId}`)
    return ok({ report, degraded: drafted.degraded })
  } catch {
    return fail(
      'The report could not be drafted.',
      'The student’s record is untouched. Try again, or narrow the period and retry.',
      'draft_failed',
    )
  }
}

/** The confirmed number when there is one, the proposal otherwise. */
function dimensionValue(work: ScoredWork, d: Dimension): number | null {
  const row = work.scores.find((s) => s.dimension === d)
  return row ? effectiveScore(row) : null
}

export async function saveReportEdits(input: {
  id: string
  content: ReportContent
}): Promise<ActionResult<{ saved: true }>> {
  try {
    const session = await requireSession()
    const driver = await db()
    const existing = await driver.getReport(session.academy.id, input.id)
    if (!existing) {
      return fail('That report is no longer here.', 'Generate a new one for the same period.')
    }
    if (existing.approved_at) {
      return fail(
        'This report has already been approved.',
        'An approved report is a fixed record. Generate a new one if something needs to change.',
        'locked',
      )
    }
    await driver.updateReport(session.academy.id, input.id, { content: input.content })
    revalidatePath(`/studio/students/${existing.student_id}`)
    return ok({ saved: true as const })
  } catch {
    return fail('Your edits did not save.', 'Try again — the previous draft is still stored.', 'write_failed')
  }
}

export async function approveReport(id: string): Promise<ActionResult<{ approvedAt: string }>> {
  try {
    const session = await requireSession()
    const driver = await db()
    const approvedAt = new Date().toISOString()
    const updated = await driver.updateReport(session.academy.id, id, {
      approvedAt,
      approvedBy: session.instructor.id,
    })
    revalidatePath(`/studio/students/${updated.student_id}`)
    return ok({ approvedAt })
  } catch {
    return fail(
      'The report was not approved.',
      'Nothing has been shared. Try approving it again.',
      'write_failed',
    )
  }
}
