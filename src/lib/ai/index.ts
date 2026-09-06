import 'server-only'

import type { CalibrationAnchor, ProposedScoreInput } from '../dal/types'
import type { Dimension } from '../rubric'
import { DIMENSIONS } from '../rubric'
import type {
  AssignmentBrief,
  Discipline,
  ImageMetrics,
  PlateauFinding,
  ReportContent,
  ReportDimensionNote,
  ScoreSource,
  TrajectoryAnalysis,
} from '../types'
import {
  dimensionRange,
  fallbackAssignment,
  fallbackReport,
  measuredScore,
} from './fallback'
import { AiError, geminiAvailable, geminiScore } from './gemini'
import { groqAvailable, groqJson } from './groq'
import { buildAssignmentPrompt, buildReportPrompt, buildScorePrompt } from './prompt'
import type { AssignmentResponse, ReportResponse, ScoreResponse } from './schemas'
import {
  assignmentJsonSchema,
  assignmentResponseSchema,
  reportJsonSchema,
  reportResponseSchema,
} from './schemas'

/**
 * The three calls the rest of the app makes.
 *
 * Every one of them tries the real provider, catches everything, and falls
 * through to the deterministic path in ./fallback. None of them rethrows. A
 * degraded result carries a note written in the interface's voice, saying what
 * happened and what the instructor should do about it; that string is rendered
 * on screen, so it is written for them and not for a log.
 */

/**
 * AiError is declared in ./gemini so both providers can throw the same class
 * without a cycle through this module. It is re-exported here because this is
 * the module callers import: `import { AiError } from '@/lib/ai'`.
 */
export { AiError } from './gemini'
export type { AiErrorCode } from './gemini'

export type ScoreOutcome = {
  response: ScoreResponse
  source: ScoreSource
  degraded: boolean
  /** Rendered verbatim in the UI when degraded. Absent on the happy path. */
  note?: string
}

/** What generateReport can fill in. The caller adds the work ids, the count and the deltas. */
export type ReportDraft = Omit<
  ReportContent,
  'first_work_id' | 'latest_work_id' | 'works_in_period' | 'deltas'
>

const CAUSE = {
  no_key: 'No model key is configured on this deployment',
  timeout: 'The model did not answer within 20 seconds',
  invalid_json: 'The model returned an unusable answer twice',
  http: 'The model service refused the request',
  network: 'The model service could not be reached',
} as const

/** A short clause naming what went wrong, for the front of a degraded note. */
function causeOf(err: unknown): string {
  if (err instanceof AiError) {
    const base = CAUSE[err.code]
    return err.code === 'http' && typeof err.status === 'number'
      ? `${base} (HTTP ${err.status})`
      : base
  }
  return 'The model call failed'
}

/** Bytes we are willing to pull from a stored image before giving up on it. */
const MAX_IMAGE_BYTES = 8_000_000
const IMAGE_FETCH_MS = 8_000

/** Chart and table code reads these in order; the model is not obliged to. */
function orderScores(response: ScoreResponse): ScoreResponse {
  const byDimension = new Map(response.scores.map((s) => [s.dimension, s]))
  const ordered = DIMENSIONS.map((d) => byDimension.get(d)).filter(
    (s): s is ScoreResponse['scores'][number] => s !== undefined,
  )
  return ordered.length === response.scores.length
    ? { ...response, scores: ordered }
    : response
}

function readDataUrl(value: string): { base64: string; mimeType: string } | null {
  const trimmed = value.trim()
  const match = /^data:([^;,]+)?(?:;[^,]*)*;base64,/i.exec(trimmed)
  if (!match) return null
  return {
    mimeType: match[1] || 'image/jpeg',
    base64: trimmed.slice(match[0].length),
  }
}

/**
 * Normalises whatever the caller happens to hold into base64 plus a mime type.
 *
 * The local driver stores images as data URLs and Supabase stores them behind
 * an https URL, so a caller with a Work row has one or the other and should
 * not have to care which. Returns null when there is nothing scoreable, which
 * sends the caller down the deterministic path.
 */
async function resolveImage(input: {
  imageBase64?: string | null
  mimeType?: string | null
  imageUrl?: string | null
  signal?: AbortSignal
}): Promise<{ base64: string; mimeType: string } | null> {
  const inline = input.imageBase64?.trim()
  if (inline) {
    const embedded = readDataUrl(inline)
    if (embedded) {
      return { base64: embedded.base64, mimeType: input.mimeType ?? embedded.mimeType }
    }
    return { base64: inline, mimeType: input.mimeType ?? 'image/jpeg' }
  }

  const url = input.imageUrl?.trim()
  if (!url) return null

  const embedded = readDataUrl(url)
  if (embedded) {
    return { base64: embedded.base64, mimeType: input.mimeType ?? embedded.mimeType }
  }
  if (!/^https?:\/\//i.test(url)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_MS)
  const onAbort = (): void => controller.abort()
  if (input.signal) {
    if (input.signal.aborted) controller.abort()
    else input.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) return null
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null
    const headerType = res.headers.get('content-type')?.split(';')[0]?.trim()
    return {
      base64: Buffer.from(bytes).toString('base64'),
      mimeType: input.mimeType ?? (headerType || 'image/jpeg'),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    if (input.signal) input.signal.removeEventListener('abort', onAbort)
  }
}

/* ------------------------------------------------------------------ *
 * Scores
 * ------------------------------------------------------------------ */

/**
 * Propose five scores for one work.
 *
 * Gemini when there is a key and an image, pixel measurements otherwise. The
 * returned source is what the UI labels the numbers with, and it is never
 * hidden: an instructor confirming a 'measured' seven should know that nobody
 * looked at the drawing.
 */
export async function proposeScores(input: {
  discipline: Discipline
  anchors: CalibrationAnchor[]
  metrics: ImageMetrics | null
  /** Raw base64 or a full data URL. */
  imageBase64?: string | null
  /** A stored image URL instead, data: or https:. Used when imageBase64 is absent. */
  imageUrl?: string | null
  mimeType?: string | null
  notes?: string | null
  assignmentBrief?: AssignmentBrief | null
  signal?: AbortSignal
}): Promise<ScoreOutcome> {
  const prompt = buildScorePrompt({
    discipline: input.discipline,
    anchors: input.anchors,
    metrics: input.metrics,
    notes: input.notes,
    assignmentBrief: input.assignmentBrief,
  })

  const image = geminiAvailable()
    ? await resolveImage({
        imageBase64: input.imageBase64,
        imageUrl: input.imageUrl,
        mimeType: input.mimeType,
        signal: input.signal,
      })
    : null

  let cause: string
  if (!geminiAvailable()) {
    cause = CAUSE.no_key
  } else if (!image) {
    cause = 'No image could be read for this work'
  } else {
    try {
      const response = await geminiScore({
        imageBase64: image.base64,
        mimeType: image.mimeType,
        prompt,
        signal: input.signal,
      })
      return { response: orderScores(response), source: 'gemini', degraded: false }
    } catch (err) {
      cause = causeOf(err)
    }
  }

  const response = orderScores(
    measuredScore({ metrics: input.metrics, anchors: input.anchors }),
  )

  if (!input.metrics) {
    return {
      response,
      source: 'manual',
      degraded: true,
      note: `${cause}, and nothing could be measured from this image either. No scores are proposed here. Set all five yourself.`,
    }
  }

  return {
    response,
    source: 'measured',
    degraded: true,
    note: `${cause}. These five numbers were derived from measurements taken off the pixels, not from looking at the work. Read each rationale before you confirm the number.`,
  }
}

/**
 * Turns an outcome into rows for the data layer.
 *
 * A 'manual' outcome carries a placeholder score that must never be recorded,
 * so this writes null for both score and confidence in that case. Use this
 * rather than mapping the response by hand.
 */
export function toProposedScores(outcome: ScoreOutcome): ProposedScoreInput[] {
  const manual = outcome.source === 'manual'
  return outcome.response.scores.map((s) => ({
    dimension: s.dimension,
    score: manual ? null : s.score,
    rationale: s.rationale,
    confidence: manual ? null : s.confidence,
    source: outcome.source,
  }))
}

/* ------------------------------------------------------------------ *
 * Assignments
 * ------------------------------------------------------------------ */

function toBrief(response: AssignmentResponse): AssignmentBrief {
  return {
    title: response.title,
    rationale: response.rationale,
    steps: response.steps,
    materials: response.materials,
    duration_minutes: response.duration_minutes,
    success_criteria: response.success_criteria,
  }
}

/**
 * Draft one exercise aimed at a single dimension. The instructor edits it
 * before it is issued, so a degraded draft is still usable — it is one of the
 * studio's own standard exercises rather than a placeholder.
 */
export async function generateAssignment(input: {
  studentName: string
  level: number
  targetDimension: Dimension
  analysis: TrajectoryAnalysis
  plateau?: PlateauFinding | null
  discipline: Discipline
  recentBriefTitles?: string[]
  signal?: AbortSignal
}): Promise<{ brief: AssignmentBrief; degraded: boolean; note?: string }> {
  let cause: string
  if (!groqAvailable()) {
    cause = CAUSE.no_key
  } else {
    try {
      const response = await groqJson<AssignmentResponse>({
        prompt: buildAssignmentPrompt({
          studentName: input.studentName,
          level: input.level,
          targetDimension: input.targetDimension,
          analysis: input.analysis,
          plateau: input.plateau,
          discipline: input.discipline,
          recentBriefTitles: input.recentBriefTitles ?? [],
        }),
        schema: assignmentResponseSchema,
        jsonSchema: assignmentJsonSchema,
        system:
          'You are an art instructor drafting one practice exercise for a named student. You answer with a single JSON object and nothing else.',
        maxTokens: 1_200,
        signal: input.signal,
      })
      return { brief: toBrief(response), degraded: false }
    } catch (err) {
      cause = causeOf(err)
    }
  }

  const brief = toBrief(
    fallbackAssignment({
      targetDimension: input.targetDimension,
      studentName: input.studentName,
      level: input.level,
    }),
  )

  return {
    brief,
    degraded: true,
    note: `${cause}. This is the studio's standard exercise for that dimension rather than one written for this student. Edit it before you issue it.`,
  }
}

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

function toDraft(response: ReportResponse, analysis: TrajectoryAnalysis): ReportDraft {
  const withRange = (entry: {
    dimension: Dimension
    note: string
  }): ReportDimensionNote => {
    const range = dimensionRange(analysis, entry.dimension)
    return {
      dimension: entry.dimension,
      note: entry.note,
      from: range.from,
      to: range.to,
    }
  }

  return {
    headline: response.headline,
    summary: response.summary,
    improved: response.improved.map(withRange),
    focus: response.focus.map(withRange),
    next_steps: response.next_steps,
  }
}

/**
 * Draft a term report for a parent. The instructor approves it before anyone
 * outside the studio sees it, and their name is on it either way.
 */
export async function generateReport(input: {
  studentName: string
  periodStart: string
  periodEnd: string
  analysis: TrajectoryAnalysis
  worksInPeriod: number
  plateaus?: PlateauFinding[]
  discipline: Discipline
  signal?: AbortSignal
}): Promise<{ content: ReportDraft; degraded: boolean; note?: string }> {
  let cause: string
  if (!groqAvailable()) {
    cause = CAUSE.no_key
  } else {
    try {
      const response = await groqJson<ReportResponse>({
        prompt: buildReportPrompt({
          studentName: input.studentName,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          analysis: input.analysis,
          worksInPeriod: input.worksInPeriod,
          plateaus: input.plateaus ?? [],
          discipline: input.discipline,
        }),
        schema: reportResponseSchema,
        jsonSchema: reportJsonSchema,
        system:
          'You are an art instructor writing to the parent of one of your students. You answer with a single JSON object and nothing else.',
        maxTokens: 1_600,
        signal: input.signal,
      })
      return { content: toDraft(response, input.analysis), degraded: false }
    } catch (err) {
      cause = causeOf(err)
    }
  }

  const draft = toDraft(
    fallbackReport({
      studentName: input.studentName,
      analysis: input.analysis,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      worksInPeriod: input.worksInPeriod,
    }),
    input.analysis,
  )

  return {
    content: draft,
    degraded: true,
    note: `${cause}. This draft was assembled from the student's recorded numbers alone. Read it and rewrite anything that does not sound like you before you approve it.`,
  }
}
