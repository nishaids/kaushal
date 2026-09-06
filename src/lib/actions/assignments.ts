'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import { isDimension, type Dimension } from '@/lib/rubric'
import { fail, ok, type ActionResult, type Assignment, type AssignmentBrief } from '@/lib/types'
import { generateAssignment } from '@/lib/ai'
import { analyseTrajectory } from '@/lib/analytics/trajectory'
import { detectPlateaus } from '@/lib/analytics/plateau'

/**
 * Assignment generation.
 *
 * The brief is drafted against the student's own numbers and the flagged
 * dimension, then handed to the instructor to edit. It is not issued until they
 * press issue — a generated exercise nobody read is worth less than nothing.
 */

const briefSchema = z.object({
  title: z.string().min(3).max(120),
  rationale: z.string().min(10).max(600),
  steps: z.array(z.string().min(3).max(400)).min(1).max(10),
  materials: z.array(z.string().min(1).max(120)).max(12),
  duration_minutes: z.number().int().min(5).max(240),
  success_criteria: z.array(z.string().min(3).max(300)).max(8),
})

export async function draftAssignment(input: {
  studentId: string
  targetDimension: Dimension
}): Promise<ActionResult<{ brief: AssignmentBrief; degraded: boolean }>> {
  if (!isDimension(input.targetDimension)) {
    return fail('That is not one of the five dimensions.', 'Pick a dimension from the trajectory and try again.')
  }

  try {
    const session = await requireSession()
    const driver = await db()

    const student = await driver.getStudent(session.academy.id, input.studentId)
    if (!student) {
      return fail('That student is not in your academy.', 'Pick a student from the cohort list.')
    }

    const works = await driver.listScoredWorks(session.academy.id, {
      studentId: input.studentId,
    })
    const analysis = analyseTrajectory(works)
    const plateau =
      detectPlateaus(works).find((p) => p.dimension === input.targetDimension) ?? null

    const recent = await driver.listAssignments(session.academy.id, {
      studentId: input.studentId,
    })

    const result = await generateAssignment({
      studentName: student.name,
      level: student.level,
      targetDimension: input.targetDimension,
      analysis,
      plateau,
      discipline: session.academy.discipline,
      recentBriefTitles: recent.slice(0, 6).map((a) => a.brief.title),
    })

    return ok({ brief: result.brief, degraded: result.degraded })
  } catch {
    return fail(
      'The brief could not be drafted.',
      'You can still write one yourself and issue it — press "Write it myself".',
      'draft_failed',
    )
  }
}

export async function saveAssignment(input: {
  studentId: string
  targetDimension: Dimension
  brief: AssignmentBrief
  issue?: boolean
}): Promise<ActionResult<{ assignment: Assignment }>> {
  const parsed = briefSchema.safeParse(input.brief)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return fail(
      'That brief is not ready to save.',
      first
        ? `Check the ${String(first.path[0] ?? 'brief')} field — ${first.message.toLowerCase()}.`
        : 'Fill in the title, the steps and how long it should take.',
      'invalid_input',
    )
  }

  try {
    const session = await requireSession()
    const driver = await db()
    const created = await driver.createAssignment({
      academyId: session.academy.id,
      studentId: input.studentId,
      targetDimension: input.targetDimension,
      brief: input.brief,
    })

    const assignment = input.issue
      ? await driver.updateAssignment(session.academy.id, created.id, {
          issuedAt: new Date().toISOString(),
        })
      : created

    revalidatePath('/studio/assignments')
    revalidatePath(`/studio/students/${input.studentId}`)
    return ok({ assignment })
  } catch {
    return fail(
      'The brief did not save.',
      'Copy the text somewhere safe and try again — nothing has been issued to the student.',
      'write_failed',
    )
  }
}

export async function issueAssignment(id: string): Promise<ActionResult<{ issuedAt: string }>> {
  try {
    const session = await requireSession()
    const driver = await db()
    const issuedAt = new Date().toISOString()
    await driver.updateAssignment(session.academy.id, id, { issuedAt })
    revalidatePath('/studio/assignments')
    return ok({ issuedAt })
  } catch {
    return fail('That assignment was not issued.', 'Try again in a moment.', 'write_failed')
  }
}

export async function updateAssignmentBrief(input: {
  id: string
  brief: AssignmentBrief
}): Promise<ActionResult<{ saved: true }>> {
  const parsed = briefSchema.safeParse(input.brief)
  if (!parsed.success) {
    return fail('That brief is not ready to save.', 'Check the title and the steps.', 'invalid_input')
  }
  try {
    const session = await requireSession()
    const driver = await db()
    await driver.updateAssignment(session.academy.id, input.id, { brief: input.brief })
    revalidatePath('/studio/assignments')
    return ok({ saved: true as const })
  } catch {
    return fail('Your edits did not save.', 'Try again — the previous version is still stored.', 'write_failed')
  }
}
