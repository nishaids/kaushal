'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import { DIMENSIONS, clampScore, isDimension, type Dimension } from '@/lib/rubric'
import {
  fail,
  ok,
  type ActionResult,
  type ImageMetrics,
  type ScoredWork,
  type WorkQuality,
} from '@/lib/types'
import { proposeScores, toProposedScores } from '@/lib/ai'
import { refreshAlertsFor } from './alerts'

/**
 * Everything that writes a score.
 *
 * Two rules hold across all of it. A proposal never overwrites a confirmation,
 * and no path here throws at the client — a failure comes back as a result with
 * a message the interface can render and a hint saying what to do next.
 */

const confirmSchema = z.object({
  workId: z.string().min(1),
  dimension: z.string().refine(isDimension, 'Unknown dimension'),
  score: z.number().int().min(1).max(10),
})

export async function confirmScoreAction(input: {
  workId: string
  dimension: Dimension
  score: number
}): Promise<ActionResult<{ confirmed: number }>> {
  const parsed = confirmSchema.safeParse(input)
  if (!parsed.success) {
    return fail(
      'That score was not one KAUSHAL could store.',
      'Scores run from 1 to 10. Pick a value on the scale and confirm again.',
      'invalid_input',
    )
  }

  try {
    const session = await requireSession()
    const driver = await db()
    await driver.confirmScore(session.academy.id, {
      workId: parsed.data.workId,
      dimension: parsed.data.dimension as Dimension,
      score: clampScore(parsed.data.score),
      instructorId: session.instructor.id,
    })

    const work = await driver.getWork(session.academy.id, parsed.data.workId)
    if (work) {
      await refreshAlertsFor(session.academy.id, work.student_id)
      revalidatePath(`/studio/students/${work.student_id}`)
    }
    revalidatePath('/studio')
    revalidatePath('/studio/capture')

    return ok({ confirmed: parsed.data.score })
  } catch {
    return fail(
      'That score did not save.',
      'Nothing was lost. Check your connection and press confirm again.',
      'write_failed',
    )
  }
}

export async function confirmAllScoresAction(
  workId: string,
): Promise<ActionResult<{ confirmed: number }>> {
  if (!workId) {
    return fail('There is no work to confirm.', 'Upload a work first.')
  }
  try {
    const session = await requireSession()
    const driver = await db()
    const rows = await driver.confirmAllScores(session.academy.id, {
      workId,
      instructorId: session.instructor.id,
    })

    const work = await driver.getWork(session.academy.id, workId)
    if (work) {
      await refreshAlertsFor(session.academy.id, work.student_id)
      revalidatePath(`/studio/students/${work.student_id}`)
    }
    revalidatePath('/studio')
    revalidatePath('/studio/capture')

    return ok({ confirmed: rows.filter((r) => r.confirmed_score !== null).length })
  } catch {
    return fail(
      'Those scores did not save.',
      'Nothing was lost. Press confirm again, or set the scores one at a time.',
      'write_failed',
    )
  }
}

/* ------------------------------------------------------------------ */

const createWorkSchema = z.object({
  studentId: z.string().min(1),
  imageUrl: z.string().min(1),
  thumbUrl: z.string().nullable().optional(),
  capturedAt: z.string().optional(),
  notes: z.string().max(500).nullable().optional(),
  assignmentId: z.string().nullable().optional(),
  isCalibration: z.boolean().optional(),
})

export interface CreateWorkInput {
  studentId: string
  imageUrl: string
  thumbUrl?: string | null
  capturedAt?: string
  notes?: string | null
  assignmentId?: string | null
  isCalibration?: boolean
  metrics?: ImageMetrics | null
  /** The compressed data URL the browser already holds. Never re-fetched. */
  imageBase64?: string | null
  mimeType?: string | null
  /** Verdict from the media quality gate, measured in the browser. */
  quality?: WorkQuality | null
}

/**
 * Store the work, then ask for proposals. The work exists the moment it is
 * uploaded, whether or not scoring succeeds — an instructor who photographed
 * thirty drawings must never lose one because a model was unreachable.
 */
export async function createWorkAndScore(
  input: CreateWorkInput,
): Promise<ActionResult<{ work: ScoredWork; degradedNote: string | null; subject: string | null }>> {
  const parsed = createWorkSchema.safeParse(input)
  if (!parsed.success) {
    return fail(
      'That upload was missing something.',
      'Pick a student and an image, then try again.',
      'invalid_input',
    )
  }

  let workId: string | null = null
  let academyId: string | null = null

  try {
    const session = await requireSession()
    academyId = session.academy.id
    const driver = await db()

    const student = await driver.getStudent(session.academy.id, input.studentId)
    if (!student) {
      return fail(
        'That student is not in your academy.',
        'Go back to the cohort and pick the student from the list.',
        'not_found',
      )
    }

    const work = await driver.createWork({
      academyId: session.academy.id,
      studentId: input.studentId,
      imageUrl: input.imageUrl,
      thumbUrl: input.thumbUrl ?? null,
      capturedAt: input.capturedAt,
      assignmentId: input.assignmentId ?? null,
      notes: input.notes ?? null,
      isCalibration: input.isCalibration ?? false,
      metrics: input.metrics ?? null,
      quality: input.quality ?? null,
    })
    workId = work.id

    const anchors = await driver.listCalibrationAnchors(session.academy.id)
    const assignment = input.assignmentId
      ? await driver.getAssignment(session.academy.id, input.assignmentId)
      : null

    // A photo the quality gate blocked is stored and scoreable by hand, but is
    // never sent for a proposal: a score resting on evidence already measured as
    // unreliable is worse than no score at all.
    const gateBlocked = input.quality?.assessable === false

    const outcome = await proposeScores({
      discipline: session.academy.discipline,
      anchors,
      metrics: input.metrics ?? null,
      imageBase64: gateBlocked
        ? null
        : (input.imageBase64 ?? asDataUrl(work.image_url)),
      mimeType: input.mimeType ?? null,
      notes: input.notes ?? null,
      assignmentBrief: assignment?.brief ?? null,
    })

    await driver.upsertProposedScores(
      session.academy.id,
      work.id,
      toProposedScores(outcome),
    )

    const stored = await driver.getWork(session.academy.id, work.id)
    revalidatePath('/studio/capture')
    revalidatePath(`/studio/students/${input.studentId}`)

    return ok({
      work: stored ?? { ...work, scores: [] },
      degradedNote: gateBlocked
        ? 'This photo did not pass the quality check, so no proposal was made from it. Set the scores yourself, or record the work again with a better photo.'
        : outcome.degraded
          ? (outcome.note ?? null)
          : null,
      subject: outcome.response.subject ?? null,
    })
  } catch {
    // The work may already exist. Hand it back unscored rather than losing it.
    if (workId && academyId) {
      try {
        const driver = await db()
        const stored = await driver.getWork(academyId, workId)
        if (stored) {
          await ensureBlankScores(academyId, workId)
          const withBlanks = await driver.getWork(academyId, workId)
          return ok({
            work: withBlanks ?? stored,
            degradedNote:
              'The work is saved, but scoring did not run. Set the five scores yourself and they will be recorded as yours.',
            subject: null,
          })
        }
      } catch {
        // fall through to the generic failure below
      }
    }
    return fail(
      'That work did not upload.',
      'Check your connection and try the upload again. Nothing has been recorded.',
      'upload_failed',
    )
  }
}

/** A data URL can go straight to the model; anything else needs fetching. */
function asDataUrl(url: string): string | null {
  return url.startsWith('data:') ? url : null
}

/**
 * Re-scoring happens minutes or months after the upload, so the browser's copy
 * of the image is long gone. A stored object has to be read back once.
 */
async function imageAsBase64(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url
  if (!/^https?:\/\//.test(url)) return null
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 8_000_000) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Blank, source-'manual' rows so the instructor always has somewhere to type. */
async function ensureBlankScores(academyId: string, workId: string): Promise<void> {
  const driver = await db()
  const existing = await driver.listScoresForWork(academyId, workId)
  if (existing.length > 0) return
  await driver.upsertProposedScores(
    academyId,
    workId,
    DIMENSIONS.map((d) => ({
      dimension: d,
      score: null,
      rationale: null,
      confidence: null,
      source: 'manual' as const,
    })),
  )
}

/**
 * Re-run scoring on a work that has none, or whose proposals came from the
 * fallback. Confirmed scores are untouched.
 */
export async function rescoreWork(
  workId: string,
): Promise<ActionResult<{ degradedNote: string | null }>> {
  try {
    const session = await requireSession()
    const driver = await db()
    const work = await driver.getWork(session.academy.id, workId)
    if (!work) {
      return fail('That work is no longer here.', 'Return to the student and pick another work.')
    }

    const anchors = await driver.listCalibrationAnchors(session.academy.id)
    const outcome = await proposeScores({
      discipline: session.academy.discipline,
      anchors,
      metrics: work.metrics,
      imageBase64: await imageAsBase64(work.image_url),
      notes: work.notes,
      assignmentBrief: null,
    })

    await driver.upsertProposedScores(
      session.academy.id,
      workId,
      toProposedScores(outcome),
    )

    revalidatePath(`/studio/students/${work.student_id}`)
    return ok({ degradedNote: outcome.degraded ? (outcome.note ?? null) : null })
  } catch {
    return fail(
      'Scoring did not run.',
      'The work and any scores you already confirmed are safe. Try again in a moment.',
      'score_failed',
    )
  }
}
