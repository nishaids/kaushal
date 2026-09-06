'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import { DIMENSIONS, clampScore, type Dimension } from '@/lib/rubric'
import { fail, ok, type ActionResult, type ImageMetrics } from '@/lib/types'
import { CALIBRATION_HOLDER_NAME, CALIBRATION_MINIMUM, CALIBRATION_TARGET } from '@/lib/constants'

/**
 * Calibration.
 *
 * Ten past works, scored by the instructor, become that academy's anchors. They
 * are injected as few-shot references into every future scoring call, which is
 * why two academies running KAUSHAL on the same drawing get different — and
 * correctly different — proposals.
 *
 * Nothing here asks a model for anything. These numbers are the instructor's,
 * full stop; if they were proposed first the anchors would be anchored to the
 * model rather than the other way round.
 */

const anchorSchema = z.object({
  workId: z.string().min(1),
  scores: z.record(z.string(), z.number().int().min(1).max(10)),
})

export async function saveCalibrationAnchor(input: {
  workId: string
  scores: Partial<Record<Dimension, number>>
}): Promise<ActionResult<{ anchored: number }>> {
  const parsed = anchorSchema.safeParse(input)
  if (!parsed.success) {
    return fail(
      'Those anchor scores were not stored.',
      'Give every one of the five dimensions a number from 1 to 10, then save.',
      'invalid_input',
    )
  }

  const clean: Partial<Record<Dimension, number>> = {}
  for (const d of DIMENSIONS) {
    const v = input.scores[d]
    if (typeof v === 'number') clean[d] = clampScore(v)
  }
  if (Object.keys(clean).length !== DIMENSIONS.length) {
    return fail(
      'That work is missing a dimension.',
      'An anchor is only useful when all five are set — that is what makes it a reference point.',
      'incomplete',
    )
  }

  try {
    const session = await requireSession()
    const driver = await db()
    await driver.setCalibration(session.academy.id, {
      workId: input.workId,
      scores: clean,
    })
    revalidatePath('/calibrate')
    return ok({ anchored: Object.keys(clean).length })
  } catch {
    return fail(
      'That anchor did not save.',
      'Your earlier anchors are safe. Try saving this one again.',
      'write_failed',
    )
  }
}

export async function addCalibrationWork(input: {
  imageUrl: string
  thumbUrl?: string | null
  metrics?: ImageMetrics | null
  notes?: string | null
}): Promise<ActionResult<{ workId: string }>> {
  try {
    const session = await requireSession()
    const driver = await db()

    // Calibration works belong to the academy rather than to a student, so they
    // hang off a hidden roster entry and are excluded from every trajectory.
    const students = await driver.listStudents(session.academy.id, { status: 'all' })
    let holder = students.find((s) => s.name === CALIBRATION_HOLDER_NAME)
    if (!holder) {
      holder = await driver.createStudent({
        academyId: session.academy.id,
        name: CALIBRATION_HOLDER_NAME,
        level: 0,
      })
      await driver.updateStudent(session.academy.id, holder.id, { status: 'paused' })
    }

    const work = await driver.createWork({
      academyId: session.academy.id,
      studentId: holder.id,
      imageUrl: input.imageUrl,
      thumbUrl: input.thumbUrl ?? null,
      notes: input.notes ?? null,
      isCalibration: true,
      metrics: input.metrics ?? null,
    })

    return ok({ workId: work.id })
  } catch {
    return fail(
      'That image did not upload.',
      'Check your connection and add the work again. Anchors you have already saved are kept.',
      'upload_failed',
    )
  }
}

export async function finishCalibration(): Promise<ActionResult<{ anchors: number }>> {
  try {
    const session = await requireSession()
    const driver = await db()
    const anchors = await driver.listCalibrationAnchors(session.academy.id)

    if (anchors.length < CALIBRATION_MINIMUM) {
      return fail(
        'There are not enough anchors yet.',
        `Score at least ${CALIBRATION_MINIMUM} works — ${CALIBRATION_TARGET} is what makes the rubric properly yours.`,
        'too_few',
      )
    }

    await driver.markCalibrated(session.academy.id, new Date().toISOString())
    revalidatePath('/studio')
    revalidatePath('/calibrate')
    return ok({ anchors: anchors.length })
  } catch {
    return fail(
      'Calibration did not finish.',
      'Your anchors are saved. Try again, and nothing will be scored twice.',
      'write_failed',
    )
  }
}
