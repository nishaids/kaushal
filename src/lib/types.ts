import type { Dimension } from './rubric'

/* ------------------------------------------------------------------ *
 * Entities. These mirror supabase/schema.sql one-for-one. If you change
 * a field here, change it there in the same commit.
 * ------------------------------------------------------------------ */

export type Discipline = 'drawing' | 'painting' | 'sculpture' | 'craft' | 'other'

export type StudentStatus = 'active' | 'paused' | 'left'

export interface Academy {
  id: string
  name: string
  owner_id: string
  discipline: Discipline
  /** Set once the instructor finishes scoring the 10 calibration anchors. */
  calibrated_at: string | null
  created_at: string
}

export interface Instructor {
  id: string
  academy_id: string
  email: string
  name: string
  created_at: string
}

export interface Student {
  id: string
  academy_id: string
  name: string
  joined_at: string
  level: number
  status: StudentStatus
  created_at: string
}

export interface Work {
  id: string
  student_id: string
  image_url: string
  /** Small inline preview so lists and hovers never wait on storage. */
  thumb_url: string | null
  captured_at: string
  assignment_id: string | null
  notes: string | null
  /** True when this work is one of the 10 onboarding calibration anchors. */
  is_calibration: boolean
  /** Deterministic pixel statistics measured at upload. See lib/metrics. */
  metrics: ImageMetrics | null
  created_at: string
}

export interface Score {
  id: string
  work_id: string
  dimension: Dimension
  /** What the model proposed. Null when the model could not be reached. */
  ai_score: number | null
  ai_rationale: string | null
  /** 0..1. Low confidence renders fainter and widens the override affordance. */
  ai_confidence: number | null
  /** Which scorer produced ai_score. Surfaced in the UI, never hidden. */
  source: ScoreSource
  /** The instructor's number. Null until confirmed. This is the only truth. */
  confirmed_score: number | null
  confirmed_by: string | null
  confirmed_at: string | null
  created_at: string
}

export type ScoreSource = 'gemini' | 'measured' | 'manual' | 'cached'

export interface Calibration {
  id: string
  academy_id: string
  work_id: string
  dimension: Dimension
  anchor_score: number
  created_at: string
}

export interface Assignment {
  id: string
  student_id: string
  target_dimension: Dimension
  /** Instructor-editable brief. Stored after they edit, not before. */
  brief: AssignmentBrief
  issued_at: string | null
  completed: boolean
  created_at: string
}

export interface AssignmentBrief {
  title: string
  /** Why this exercise, tied to the student's own numbers. */
  rationale: string
  steps: string[]
  materials: string[]
  duration_minutes: number
  /** What the instructor should look for when it comes back. */
  success_criteria: string[]
}

export type AlertType = 'plateau' | 'regression' | 'dormant' | 'uncalibrated'

export interface Alert {
  id: string
  student_id: string
  dimension: Dimension | null
  type: AlertType
  /** One sentence, plain language. Rendered verbatim in the UI. */
  message: string
  severity: 'high' | 'medium' | 'low'
  detected_at: string
  resolved_at: string | null
}

export interface Report {
  id: string
  student_id: string
  period_start: string
  period_end: string
  content: ReportContent
  approved_at: string | null
  approved_by: string | null
  created_at: string
}

export interface ReportContent {
  headline: string
  /** Two or three short paragraphs in the instructor's register. */
  summary: string
  improved: ReportDimensionNote[]
  focus: ReportDimensionNote[]
  next_steps: string[]
  first_work_id: string | null
  latest_work_id: string | null
  works_in_period: number
  /** Snapshot so an approved report never changes under the parent's feet. */
  deltas: Partial<Record<Dimension, { from: number; to: number }>>
}

export interface ReportDimensionNote {
  dimension: Dimension
  note: string
  from: number
  to: number
}

/* ------------------------------------------------------------------ *
 * Deterministic image measurement, computed client-side on the canvas
 * that already exists for compression. Zero server cost, zero deps.
 * These are real numbers off the pixels. They ground the model prompt
 * and, when the model is unreachable, they produce the fallback score.
 * ------------------------------------------------------------------ */

export interface ImageMetrics {
  /** Normalised luminance histogram, 16 buckets, sums to 1. */
  histogram: number[]
  /** Luminance of the 1st percentile pixel, 0..1. The darkest dark. */
  darkest: number
  /** Luminance of the 99th percentile pixel, 0..1. The lightest light. */
  lightest: number
  /** lightest minus darkest. Direct evidence for the value_range dimension. */
  valueSpread: number
  /** Standard deviation of luminance. Flat drawings score low. */
  contrastSd: number
  /** Share of pixels below 0.35 luminance. Ink coverage. */
  inkCoverage: number
  /** Mean Sobel gradient magnitude. Mark density. */
  edgeDensity: number
  /** SD of local gradient magnitude. High means hard and soft edges coexist. */
  edgeVariance: number
  /** Share of gradient energy in the outer 15% of the frame. Crowding. */
  borderEnergy: number
  /** Centre of ink mass, 0..1 each axis. 0.5/0.5 is dead centre. */
  massCenter: { x: number; y: number }
  /** Share of the sheet with effectively no marks. */
  emptyShare: number
  /** Directional consistency of gradients. Stroke confidence proxy, 0..1. */
  strokeCoherence: number
  width: number
  height: number
}

/* ------------------------------------------------------------------ *
 * Derived view models
 * ------------------------------------------------------------------ */

/** A work with its five scores attached. The unit most screens render. */
export interface ScoredWork extends Work {
  scores: Score[]
}

/** One point on the trajectory chart. */
export interface TrajectoryPoint {
  work_id: string
  captured_at: string
  /** Milliseconds. Recharts needs a number on a time axis. */
  t: number
  thumb_url: string | null
  values: Partial<Record<Dimension, number>>
  /** Per dimension: is this point inked, or still a blue guideline? */
  confirmed: Partial<Record<Dimension, boolean>>
  /** True when every one of the five dimensions is confirmed. */
  fullyConfirmed: boolean
}

export interface PlateauFinding {
  dimension: Dimension
  /** Points per week over the analysis window. Near zero means flat. */
  slope: number
  /** Mean slope of the other four dimensions over the same window. */
  peerSlope: number
  /** How many works the window covers. */
  window: number
  /** ISO date the flat stretch began. */
  since: string
  weeksFlat: number
  /** The one sentence shown in the UI. Written by lib/analytics/plateau.ts. */
  message: string
  severity: 'high' | 'medium' | 'low'
}

export interface TrajectoryAnalysis {
  points: TrajectoryPoint[]
  /** Latest confirmed-or-proposed value per dimension. */
  latest: Partial<Record<Dimension, number>>
  /** Slope in points per week per dimension across the whole record. */
  slopes: Partial<Record<Dimension, number>>
  plateaus: PlateauFinding[]
  /** The dimension the instructor should work on next. */
  weakest: { dimension: Dimension; value: number } | null
  confirmedShare: number
}

export interface CohortRow {
  student: Student
  worksCount: number
  lastWorkAt: string | null
  daysSinceLastWork: number | null
  latest: Partial<Record<Dimension, number>>
  /** Mean of the five latest values. A sort key, never shown alone. */
  mean: number | null
  /** Points per week across all dimensions over the recent window. */
  momentum: number | null
  alerts: Alert[]
  /** Higher means look at this student first. Always explained in the UI. */
  attention: number
  unconfirmedCount: number
}

/* ------------------------------------------------------------------ *
 * Action results. Server Actions return these, they never throw to the
 * client, and every failure carries a hint the UI can render as advice.
 * ------------------------------------------------------------------ */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; hint?: string; code?: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail<T = never>(
  error: string,
  hint?: string,
  code?: string,
): ActionResult<T> {
  return { ok: false, error, hint, code }
}
