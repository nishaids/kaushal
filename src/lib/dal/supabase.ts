import 'server-only'

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { DEMO } from '../constants'
import { DIMENSIONS, clampScore } from '../rubric'
import type { Dimension } from '../rubric'
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from '../supabase/server'
import type {
  Academy,
  Alert,
  AlertType,
  Assignment,
  AssignmentBrief,
  Calibration,
  Discipline,
  ImageMetrics,
  Instructor,
  Report,
  ReportContent,
  Score,
  ScoreSource,
  ScoredWork,
  Student,
  StudentStatus,
  Work,
} from '../types'
import type { CalibrationAnchor, DataDriver, ProposedScoreInput } from './types'

/**
 * The Supabase driver.
 *
 * Two rules run through every method here.
 *
 * First, academy scoping is written into the query even though row level
 * security already enforces it. RLS is the wall; the explicit filter is the
 * lock. It also keeps the query plan honest — an index on
 * students(academy_id, status) is useless to a query that never mentions the
 * column.
 *
 * Second, only two tables carry academy_id: academies and calibrations. Works,
 * scores, assignments, alerts and reports reach their academy through students,
 * exactly as src/lib/types.ts declares them, so those queries scope with an
 * inner-joined embed. PostgREST can filter a SELECT through an embed but not an
 * UPDATE or a DELETE, so writes to a child table read the ownership row first
 * and then write by primary key.
 */

const WORKS_BUCKET = 'works'

/** Rows per insert during the demo reset. Well under any statement limit. */
const INSERT_CHUNK = 200

const ACADEMY_COLS = 'id, name, owner_id, discipline, calibrated_at, created_at'
const INSTRUCTOR_COLS = 'id, academy_id, email, name, created_at'
const STUDENT_COLS = 'id, academy_id, name, joined_at, level, status, created_at'
const WORK_COLS =
  'id, student_id, image_url, thumb_url, captured_at, assignment_id, notes, is_calibration, metrics, created_at'
const SCORE_COLS =
  'id, work_id, dimension, ai_score, ai_rationale, ai_confidence, source, confirmed_score, confirmed_by, confirmed_at, created_at'
const CALIBRATION_COLS = 'id, academy_id, work_id, dimension, anchor_score, created_at'
const ASSIGNMENT_COLS =
  'id, student_id, target_dimension, brief, issued_at, completed, created_at'
const ALERT_COLS =
  'id, student_id, dimension, type, message, severity, detected_at, resolved_at'
const REPORT_COLS =
  'id, student_id, period_start, period_end, content, approved_at, approved_by, created_at'

/** Scopes a child table to an academy through its parent student. */
const VIA_STUDENT = 'students!inner(academy_id)'
const VIA_STUDENT_KEY = 'students.academy_id'
/** Scopes scores to an academy through work then student. */
const VIA_WORK = 'works!inner(is_calibration, students!inner(academy_id))'
const VIA_WORK_KEY = 'works.students.academy_id'

/* ------------------------------------------------------------------ *
 * Errors. Thrown, never logged. The Postgres message travels with the
 * error so a server action can put something true in front of the user.
 * ------------------------------------------------------------------ */

export class SupabaseDriverError extends Error {
  /** The Postgres SQLSTATE, when the failure came from the database. */
  readonly code?: string

  constructor(context: string, message: string, code?: string) {
    super(`${context}: ${message}`)
    this.name = 'SupabaseDriverError'
    this.code = code
  }
}

interface QueryResult {
  data: unknown
  error: PostgrestError | null
}

function raise(context: string, error: PostgrestError | null): never {
  throw new SupabaseDriverError(context, error?.message ?? 'unknown error', error?.code)
}

/** Unwraps a multi-row result, or throws carrying the Postgres message. */
function rows<T>(context: string, res: QueryResult): T[] {
  if (res.error) raise(context, res.error)
  return (res.data ?? []) as T[]
}

/** Unwraps a maybeSingle() result. */
function maybeRow<T>(context: string, res: QueryResult): T | null {
  if (res.error) raise(context, res.error)
  return (res.data ?? null) as T | null
}

/** Unwraps a result that must have produced exactly one row. */
function oneRow<T>(context: string, res: QueryResult): T {
  const row = maybeRow<T>(context, res)
  if (!row) throw new SupabaseDriverError(context, 'the write returned no row')
  return row
}

/* ------------------------------------------------------------------ *
 * Row shapes and mapping. Postgres hands back jsonb as parsed JSON and
 * numeric as either a number or a string depending on the column type,
 * so every value is narrowed on the way in.
 * ------------------------------------------------------------------ */

interface AcademyRow {
  id: string
  name: string
  owner_id: string
  discipline: string
  calibrated_at: string | null
  created_at: string
}

interface InstructorRow {
  id: string
  academy_id: string
  email: string
  name: string
  created_at: string
}

interface StudentRow {
  id: string
  academy_id: string
  name: string
  joined_at: string
  level: number | string
  status: string
  created_at: string
}

interface WorkRow {
  id: string
  student_id: string
  image_url: string
  thumb_url: string | null
  captured_at: string
  assignment_id: string | null
  notes: string | null
  is_calibration: boolean
  metrics: unknown
  created_at: string
}

interface ScoreRow {
  id: string
  work_id: string
  dimension: string
  ai_score: number | string | null
  ai_rationale: string | null
  ai_confidence: number | string | null
  source: string
  confirmed_score: number | string | null
  confirmed_by: string | null
  confirmed_at: string | null
  created_at: string
}

interface ScoredWorkRow extends WorkRow {
  scores: ScoreRow[] | null
}

interface CalibrationRow {
  id: string
  academy_id: string
  work_id: string
  dimension: string
  anchor_score: number | string
  created_at: string
}

interface AssignmentRow {
  id: string
  student_id: string
  target_dimension: string
  brief: unknown
  issued_at: string | null
  completed: boolean
  created_at: string
}

interface AlertRow {
  id: string
  student_id: string
  dimension: string | null
  type: string
  message: string
  severity: string
  detected_at: string
  resolved_at: string | null
}

interface ReportRow {
  id: string
  student_id: string
  period_start: string
  period_end: string
  content: unknown
  approved_at: string | null
  approved_by: string | null
  created_at: string
}

const DISCIPLINES: readonly string[] = [
  'drawing',
  'painting',
  'sculpture',
  'craft',
  'other',
]
const STATUSES: readonly string[] = ['active', 'paused', 'left']
const SOURCES: readonly string[] = ['gemini', 'measured', 'manual', 'cached']
const ALERT_TYPES: readonly string[] = [
  'plateau',
  'regression',
  'dormant',
  'uncalibrated',
]
const SEVERITIES: readonly string[] = ['high', 'medium', 'low']

function asDiscipline(v: string): Discipline {
  return DISCIPLINES.includes(v) ? (v as Discipline) : 'other'
}

function asStatus(v: string): StudentStatus {
  return STATUSES.includes(v) ? (v as StudentStatus) : 'active'
}

function asSource(v: string): ScoreSource {
  return SOURCES.includes(v) ? (v as ScoreSource) : 'manual'
}

function asAlertType(v: string): AlertType {
  return ALERT_TYPES.includes(v) ? (v as AlertType) : 'plateau'
}

function asSeverity(v: string): Alert['severity'] {
  return SEVERITIES.includes(v) ? (v as Alert['severity']) : 'low'
}

function asDimension(v: string): Dimension {
  return (DIMENSIONS as readonly string[]).includes(v) ? (v as Dimension) : DIMENSIONS[0]
}

function asDimensionOrNull(v: string | null): Dimension | null {
  if (v === null) return null
  return (DIMENSIONS as readonly string[]).includes(v) ? (v as Dimension) : null
}

/** Postgres numeric arrives as a string on some column types. */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function intOr(v: number | string | null | undefined, fallback: number): number {
  const n = num(v)
  return n === null ? fallback : Math.round(n)
}

/**
 * jsonb columns hold objects this codebase wrote and this codebase reads. The
 * shape is checked far enough to know the row is not empty or a scalar; past
 * that the column is trusted, the way a serialised value has to be.
 */
function asMetrics(v: unknown): ImageMetrics | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  if (!('histogram' in v)) return null
  return v as ImageMetrics
}

function emptyBrief(): AssignmentBrief {
  return {
    title: '',
    rationale: '',
    steps: [],
    materials: [],
    duration_minutes: 0,
    success_criteria: [],
  }
}

function asBrief(v: unknown): AssignmentBrief {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return emptyBrief()
  if (!('title' in v)) return emptyBrief()
  return v as AssignmentBrief
}

function emptyReportContent(): ReportContent {
  return {
    headline: '',
    summary: '',
    improved: [],
    focus: [],
    next_steps: [],
    first_work_id: null,
    latest_work_id: null,
    works_in_period: 0,
    deltas: {},
  }
}

function asReportContent(v: unknown): ReportContent {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return emptyReportContent()
  if (!('headline' in v)) return emptyReportContent()
  return v as ReportContent
}

function mapAcademy(r: AcademyRow): Academy {
  return {
    id: r.id,
    name: r.name,
    owner_id: r.owner_id,
    discipline: asDiscipline(r.discipline),
    calibrated_at: r.calibrated_at,
    created_at: r.created_at,
  }
}

function mapInstructor(r: InstructorRow): Instructor {
  return {
    id: r.id,
    academy_id: r.academy_id,
    email: r.email,
    name: r.name,
    created_at: r.created_at,
  }
}

function mapStudent(r: StudentRow): Student {
  return {
    id: r.id,
    academy_id: r.academy_id,
    name: r.name,
    joined_at: r.joined_at,
    level: intOr(r.level, 1),
    status: asStatus(r.status),
    created_at: r.created_at,
  }
}

function mapWork(r: WorkRow): Work {
  return {
    id: r.id,
    student_id: r.student_id,
    image_url: r.image_url,
    thumb_url: r.thumb_url,
    captured_at: r.captured_at,
    assignment_id: r.assignment_id,
    notes: r.notes,
    is_calibration: r.is_calibration,
    metrics: asMetrics(r.metrics),
    created_at: r.created_at,
  }
}

function mapScore(r: ScoreRow): Score {
  return {
    id: r.id,
    work_id: r.work_id,
    dimension: asDimension(r.dimension),
    ai_score: num(r.ai_score),
    ai_rationale: r.ai_rationale,
    ai_confidence: num(r.ai_confidence),
    source: asSource(r.source),
    confirmed_score: num(r.confirmed_score),
    confirmed_by: r.confirmed_by,
    confirmed_at: r.confirmed_at,
    created_at: r.created_at,
  }
}

/** Scores always come back in rubric order so the UI never reshuffles. */
function sortScores(scores: Score[]): Score[] {
  const order = new Map<string, number>(DIMENSIONS.map((d, i) => [d, i]))
  return [...scores].sort(
    (a, b) => (order.get(a.dimension) ?? 99) - (order.get(b.dimension) ?? 99),
  )
}

function mapScoredWork(r: ScoredWorkRow): ScoredWork {
  return { ...mapWork(r), scores: sortScores((r.scores ?? []).map(mapScore)) }
}

function mapCalibration(r: CalibrationRow): Calibration {
  return {
    id: r.id,
    academy_id: r.academy_id,
    work_id: r.work_id,
    dimension: asDimension(r.dimension),
    anchor_score: intOr(r.anchor_score, 1),
    created_at: r.created_at,
  }
}

function mapAssignment(r: AssignmentRow): Assignment {
  return {
    id: r.id,
    student_id: r.student_id,
    target_dimension: asDimension(r.target_dimension),
    brief: asBrief(r.brief),
    issued_at: r.issued_at,
    completed: r.completed,
    created_at: r.created_at,
  }
}

function mapAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    student_id: r.student_id,
    dimension: asDimensionOrNull(r.dimension),
    type: asAlertType(r.type),
    message: r.message,
    severity: asSeverity(r.severity),
    detected_at: r.detected_at,
    resolved_at: r.resolved_at,
  }
}

function mapReport(r: ReportRow): Report {
  return {
    id: r.id,
    student_id: r.student_id,
    period_start: r.period_start,
    period_end: r.period_end,
    content: asReportContent(r.content),
    approved_at: r.approved_at,
    approved_by: r.approved_by,
    created_at: r.created_at,
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * PostgREST reads commas and parentheses inside a filter value as syntax, and
 * % and _ are ilike wildcards. Search text is punctuation-stripped rather than
 * escaped, because a name search needs neither.
 */
function likePattern(search: string): string {
  return `%${search.replace(/[%_,()"\\.]/g, ' ').trim()}%`
}

/** Storage object keys stay flat and predictable. */
function safeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 120) : `work-${Date.now()}.jpg`
}

/** Alert identity for the idempotent sync: one open alert per student, type, dimension. */
function alertKey(type: AlertType, dimension: Dimension | null): string {
  return `${type}|${dimension ?? ''}`
}

/* ------------------------------------------------------------------ *
 * The driver
 * ------------------------------------------------------------------ */

class SupabaseDriver implements DataDriver {
  readonly name = 'supabase' as const

  /**
   * A fresh session-bound client per call. lib/dal/index.ts caches the driver
   * instance across requests, so the driver must never hold a client of its
   * own — that would carry one instructor's session into the next request.
   */
  private client(): Promise<SupabaseClient> {
    return createSupabaseServerClient()
  }

  /* ---- session / academy ---- */

  async getAcademyForOwner(ownerId: string): Promise<Academy | null> {
    const sb = await this.client()
    const res = await sb
      .from('academies')
      .select(ACADEMY_COLS)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const row = maybeRow<AcademyRow>('academies.getForOwner', res)
    return row ? mapAcademy(row) : null
  }

  async getAcademy(academyId: string): Promise<Academy | null> {
    const sb = await this.client()
    const res = await sb
      .from('academies')
      .select(ACADEMY_COLS)
      .eq('id', academyId)
      .maybeSingle()
    const row = maybeRow<AcademyRow>('academies.get', res)
    return row ? mapAcademy(row) : null
  }

  async createAcademy(input: {
    name: string
    ownerId: string
    discipline: Discipline
  }): Promise<Academy> {
    const sb = await this.client()
    const res = await sb
      .from('academies')
      .insert({
        name: input.name,
        owner_id: input.ownerId,
        discipline: input.discipline,
      })
      .select(ACADEMY_COLS)
      .single()
    return mapAcademy(oneRow<AcademyRow>('academies.create', res))
  }

  async markCalibrated(academyId: string, at: string): Promise<Academy> {
    const sb = await this.client()
    const res = await sb
      .from('academies')
      .update({ calibrated_at: at })
      .eq('id', academyId)
      .select(ACADEMY_COLS)
      .single()
    return mapAcademy(oneRow<AcademyRow>('academies.markCalibrated', res))
  }

  async getInstructor(id: string): Promise<Instructor | null> {
    const sb = await this.client()
    const res = await sb
      .from('instructors')
      .select(INSTRUCTOR_COLS)
      .eq('id', id)
      .maybeSingle()
    const row = maybeRow<InstructorRow>('instructors.get', res)
    return row ? mapInstructor(row) : null
  }

  async getInstructorByEmail(email: string): Promise<Instructor | null> {
    const sb = await this.client()
    const res = await sb
      .from('instructors')
      .select(INSTRUCTOR_COLS)
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()
    const row = maybeRow<InstructorRow>('instructors.getByEmail', res)
    return row ? mapInstructor(row) : null
  }

  async createInstructor(input: {
    academyId: string
    email: string
    name: string
    id?: string
  }): Promise<Instructor> {
    const sb = await this.client()
    // id is supplied when the row has to equal auth.uid(): the RLS helper
    // current_academy_id() resolves a session through exactly that join.
    const payload: Record<string, string> = {
      academy_id: input.academyId,
      email: input.email.trim().toLowerCase(),
      name: input.name,
    }
    if (input.id) payload.id = input.id
    const res = await sb
      .from('instructors')
      .insert(payload)
      .select(INSTRUCTOR_COLS)
      .single()
    return mapInstructor(oneRow<InstructorRow>('instructors.create', res))
  }

  /* ---- students ---- */

  async listStudents(
    academyId: string,
    opts?: { status?: StudentStatus | 'all'; search?: string },
  ): Promise<Student[]> {
    const sb = await this.client()
    // Default is 'active'. The explicit 'all' in the contract is the escape
    // hatch, which only means something if the default is narrower.
    const status = opts?.status ?? 'active'
    let q = sb.from('students').select(STUDENT_COLS).eq('academy_id', academyId)
    if (status !== 'all') q = q.eq('status', status)
    const search = opts?.search?.trim()
    if (search) q = q.ilike('name', likePattern(search))
    const res = await q.order('name', { ascending: true })
    return rows<StudentRow>('students.list', res).map(mapStudent)
  }

  async getStudent(academyId: string, studentId: string): Promise<Student | null> {
    const sb = await this.client()
    const res = await sb
      .from('students')
      .select(STUDENT_COLS)
      .eq('id', studentId)
      .eq('academy_id', academyId)
      .maybeSingle()
    const row = maybeRow<StudentRow>('students.get', res)
    return row ? mapStudent(row) : null
  }

  async createStudent(input: {
    academyId: string
    name: string
    level?: number
    joinedAt?: string
  }): Promise<Student> {
    const sb = await this.client()
    const res = await sb
      .from('students')
      .insert({
        academy_id: input.academyId,
        name: input.name,
        level: input.level ?? 1,
        joined_at: input.joinedAt ?? new Date().toISOString(),
        status: 'active',
      })
      .select(STUDENT_COLS)
      .single()
    return mapStudent(oneRow<StudentRow>('students.create', res))
  }

  async updateStudent(
    academyId: string,
    studentId: string,
    patch: Partial<Pick<Student, 'name' | 'level' | 'status'>>,
  ): Promise<Student> {
    const sb = await this.client()
    const res = await sb
      .from('students')
      .update(patch)
      .eq('id', studentId)
      .eq('academy_id', academyId)
      .select(STUDENT_COLS)
      .single()
    return mapStudent(oneRow<StudentRow>('students.update', res))
  }

  /* ---- works ---- */

  async listWorks(
    academyId: string,
    opts: {
      studentId?: string
      includeCalibration?: boolean
      limit?: number
      since?: string
      until?: string
    },
  ): Promise<Work[]> {
    const sb = await this.client()
    let q = sb
      .from('works')
      .select(`${WORK_COLS}, ${VIA_STUDENT}`)
      .eq(VIA_STUDENT_KEY, academyId)
    if (opts.studentId) q = q.eq('student_id', opts.studentId)
    if (!opts.includeCalibration) q = q.eq('is_calibration', false)
    if (opts.since) q = q.gte('captured_at', opts.since)
    if (opts.until) q = q.lte('captured_at', opts.until)
    q = q
      .order('captured_at', { ascending: false })
      .order('created_at', { ascending: false })
    if (opts.limit && opts.limit > 0) q = q.limit(opts.limit)
    return rows<WorkRow>('works.list', await q).map(mapWork)
  }

  async listScoredWorks(
    academyId: string,
    opts: {
      studentId?: string
      includeCalibration?: boolean
      since?: string
      until?: string
    },
  ): Promise<ScoredWork[]> {
    const sb = await this.client()
    // One round trip. The trajectory screen asks for a whole record at once,
    // and a per-work score query would be sixty requests for one chart.
    let q = sb
      .from('works')
      .select(`${WORK_COLS}, ${VIA_STUDENT}, scores(${SCORE_COLS})`)
      .eq(VIA_STUDENT_KEY, academyId)
    if (opts.studentId) q = q.eq('student_id', opts.studentId)
    if (!opts.includeCalibration) q = q.eq('is_calibration', false)
    if (opts.since) q = q.gte('captured_at', opts.since)
    if (opts.until) q = q.lte('captured_at', opts.until)
    q = q
      .order('captured_at', { ascending: true })
      .order('created_at', { ascending: true })
    return rows<ScoredWorkRow>('works.listScored', await q).map(mapScoredWork)
  }

  async getWork(academyId: string, workId: string): Promise<ScoredWork | null> {
    const sb = await this.client()
    const res = await sb
      .from('works')
      .select(`${WORK_COLS}, ${VIA_STUDENT}, scores(${SCORE_COLS})`)
      .eq('id', workId)
      .eq(VIA_STUDENT_KEY, academyId)
      .maybeSingle()
    const row = maybeRow<ScoredWorkRow>('works.get', res)
    return row ? mapScoredWork(row) : null
  }

  async createWork(input: {
    academyId: string
    studentId: string
    imageUrl: string
    thumbUrl?: string | null
    capturedAt?: string
    assignmentId?: string | null
    notes?: string | null
    isCalibration?: boolean
    metrics?: ImageMetrics | null
  }): Promise<Work> {
    const sb = await this.client()
    await this.assertStudent(sb, input.academyId, input.studentId)
    const res = await sb
      .from('works')
      .insert({
        student_id: input.studentId,
        image_url: input.imageUrl,
        thumb_url: input.thumbUrl ?? null,
        captured_at: input.capturedAt ?? new Date().toISOString(),
        assignment_id: input.assignmentId ?? null,
        notes: input.notes ?? null,
        is_calibration: input.isCalibration ?? false,
        metrics: input.metrics ?? null,
      })
      .select(WORK_COLS)
      .single()
    return mapWork(oneRow<WorkRow>('works.create', res))
  }

  async deleteWork(academyId: string, workId: string): Promise<void> {
    const sb = await this.client()
    await this.assertWork(sb, academyId, workId)
    const res = await sb.from('works').delete().eq('id', workId)
    if (res.error) raise('works.delete', res.error)
  }

  /* ---- scores ---- */

  async upsertProposedScores(
    academyId: string,
    workId: string,
    proposals: ProposedScoreInput[],
  ): Promise<Score[]> {
    const sb = await this.client()
    await this.assertWork(sb, academyId, workId)
    if (proposals.length === 0) return this.listScoresForWork(academyId, workId)

    const existing = await this.listScoresForWork(academyId, workId)
    const byDimension = new Map(existing.map((s) => [s.dimension, s]))

    // The confirmation is carried forward by hand. An upsert replaces the whole
    // row, so without this a re-run of the scorer would erase an instructor's
    // number — the one value in the table that is not the model's to touch.
    const payload = proposals.map((p) => {
      const prev = byDimension.get(p.dimension)
      return {
        work_id: workId,
        dimension: p.dimension,
        ai_score: p.score === null ? null : clampScore(p.score),
        ai_rationale: p.rationale,
        ai_confidence: p.confidence === null ? null : clamp01(p.confidence),
        source: p.source,
        confirmed_score: prev?.confirmed_score ?? null,
        confirmed_by: prev?.confirmed_by ?? null,
        confirmed_at: prev?.confirmed_at ?? null,
      }
    })

    const res = await sb.from('scores').upsert(payload, { onConflict: 'work_id,dimension' })
    if (res.error) raise('scores.upsertProposed', res.error)
    return this.listScoresForWork(academyId, workId)
  }

  async confirmScore(
    academyId: string,
    input: {
      workId: string
      dimension: Dimension
      score: number
      instructorId: string
    },
  ): Promise<Score> {
    const sb = await this.client()
    await this.assertWork(sb, academyId, input.workId)
    const patch = {
      confirmed_score: clampScore(input.score),
      confirmed_by: input.instructorId,
      confirmed_at: new Date().toISOString(),
    }

    const updated = await sb
      .from('scores')
      .update(patch)
      .eq('work_id', input.workId)
      .eq('dimension', input.dimension)
      .select(SCORE_COLS)
      .maybeSingle()
    const row = maybeRow<ScoreRow>('scores.confirm', updated)
    if (row) return mapScore(row)

    // No proposal existed for this dimension: the instructor scored the image
    // directly, which is a first-class path, not an error.
    const inserted = await sb
      .from('scores')
      .insert({
        work_id: input.workId,
        dimension: input.dimension,
        ai_score: null,
        ai_rationale: null,
        ai_confidence: null,
        source: 'manual',
        ...patch,
      })
      .select(SCORE_COLS)
      .single()
    return mapScore(oneRow<ScoreRow>('scores.confirmInsert', inserted))
  }

  async confirmAllScores(
    academyId: string,
    input: { workId: string; instructorId: string },
  ): Promise<Score[]> {
    const sb = await this.client()
    await this.assertWork(sb, academyId, input.workId)
    const existing = await this.listScoresForWork(academyId, input.workId)
    const at = new Date().toISOString()

    // A proposal the model could not produce has nothing to accept, so it is
    // left for the instructor to type a number into.
    const pending = existing.filter(
      (s) => s.confirmed_score === null && s.ai_score !== null,
    )
    if (pending.length === 0) return existing

    const payload = pending.map((s) => ({
      work_id: s.work_id,
      dimension: s.dimension,
      ai_score: s.ai_score,
      ai_rationale: s.ai_rationale,
      ai_confidence: s.ai_confidence,
      source: s.source,
      confirmed_score: clampScore(s.ai_score ?? 1),
      confirmed_by: input.instructorId,
      confirmed_at: at,
    }))

    const res = await sb.from('scores').upsert(payload, { onConflict: 'work_id,dimension' })
    if (res.error) raise('scores.confirmAll', res.error)
    return this.listScoresForWork(academyId, input.workId)
  }

  async listScoresForWork(academyId: string, workId: string): Promise<Score[]> {
    const sb = await this.client()
    const res = await sb
      .from('scores')
      .select(`${SCORE_COLS}, ${VIA_WORK}`)
      .eq('work_id', workId)
      .eq(VIA_WORK_KEY, academyId)
    return sortScores(rows<ScoreRow>('scores.listForWork', res).map(mapScore))
  }

  async countUnconfirmed(academyId: string): Promise<number> {
    const sb = await this.client()
    // Proposals waiting on an instructor. Calibration anchors are excluded:
    // their numbers come from the calibration wizard, so they would otherwise
    // sit in this queue for good.
    const res = await sb
      .from('scores')
      .select(`id, ${VIA_WORK}`, { count: 'exact', head: true })
      .is('confirmed_score', null)
      .eq('works.is_calibration', false)
      .eq(VIA_WORK_KEY, academyId)
    if (res.error) raise('scores.countUnconfirmed', res.error)
    return res.count ?? 0
  }

  /* ---- calibration ---- */

  async listCalibrations(academyId: string): Promise<Calibration[]> {
    const sb = await this.client()
    const res = await sb
      .from('calibrations')
      .select(CALIBRATION_COLS)
      .eq('academy_id', academyId)
      .order('created_at', { ascending: true })
    return rows<CalibrationRow>('calibrations.list', res).map(mapCalibration)
  }

  async listCalibrationAnchors(academyId: string): Promise<CalibrationAnchor[]> {
    const calibrations = await this.listCalibrations(academyId)
    if (calibrations.length === 0) return []

    const workIds = [...new Set(calibrations.map((c) => c.work_id))]
    const sb = await this.client()
    const res = await sb
      .from('works')
      .select(`${WORK_COLS}, ${VIA_STUDENT}`)
      .in('id', workIds)
      .eq(VIA_STUDENT_KEY, academyId)
      .order('captured_at', { ascending: true })
    const works = rows<WorkRow>('calibrations.listAnchors', res).map(mapWork)

    const byWork = new Map<string, Partial<Record<Dimension, number>>>()
    for (const c of calibrations) {
      const bucket = byWork.get(c.work_id) ?? {}
      bucket[c.dimension] = c.anchor_score
      byWork.set(c.work_id, bucket)
    }
    return works.map((work) => ({ work, scores: byWork.get(work.id) ?? {} }))
  }

  async setCalibration(
    academyId: string,
    input: { workId: string; scores: Partial<Record<Dimension, number>> },
  ): Promise<Calibration[]> {
    const sb = await this.client()
    await this.assertWork(sb, academyId, input.workId)

    const payload = DIMENSIONS.filter((d) => typeof input.scores[d] === 'number').map(
      (d) => ({
        academy_id: academyId,
        work_id: input.workId,
        dimension: d,
        anchor_score: clampScore(input.scores[d] as number),
      }),
    )

    if (payload.length > 0) {
      const res = await sb
        .from('calibrations')
        .upsert(payload, { onConflict: 'academy_id,work_id,dimension' })
      if (res.error) raise('calibrations.set', res.error)
    }

    const all = await sb
      .from('calibrations')
      .select(CALIBRATION_COLS)
      .eq('academy_id', academyId)
      .eq('work_id', input.workId)
      .order('created_at', { ascending: true })
    return rows<CalibrationRow>('calibrations.setRead', all).map(mapCalibration)
  }

  /* ---- assignments ---- */

  async listAssignments(
    academyId: string,
    opts?: { studentId?: string; issuedOnly?: boolean },
  ): Promise<Assignment[]> {
    const sb = await this.client()
    let q = sb
      .from('assignments')
      .select(`${ASSIGNMENT_COLS}, ${VIA_STUDENT}`)
      .eq(VIA_STUDENT_KEY, academyId)
    if (opts?.studentId) q = q.eq('student_id', opts.studentId)
    if (opts?.issuedOnly) q = q.not('issued_at', 'is', null)
    const res = await q.order('created_at', { ascending: false })
    return rows<AssignmentRow>('assignments.list', res).map(mapAssignment)
  }

  async getAssignment(academyId: string, id: string): Promise<Assignment | null> {
    const sb = await this.client()
    const res = await sb
      .from('assignments')
      .select(`${ASSIGNMENT_COLS}, ${VIA_STUDENT}`)
      .eq('id', id)
      .eq(VIA_STUDENT_KEY, academyId)
      .maybeSingle()
    const row = maybeRow<AssignmentRow>('assignments.get', res)
    return row ? mapAssignment(row) : null
  }

  async createAssignment(input: {
    academyId: string
    studentId: string
    targetDimension: Dimension
    brief: AssignmentBrief
  }): Promise<Assignment> {
    const sb = await this.client()
    await this.assertStudent(sb, input.academyId, input.studentId)
    const res = await sb
      .from('assignments')
      .insert({
        student_id: input.studentId,
        target_dimension: input.targetDimension,
        brief: input.brief,
        issued_at: null,
        completed: false,
      })
      .select(ASSIGNMENT_COLS)
      .single()
    return mapAssignment(oneRow<AssignmentRow>('assignments.create', res))
  }

  async updateAssignment(
    academyId: string,
    id: string,
    patch: { brief?: AssignmentBrief; issuedAt?: string | null; completed?: boolean },
  ): Promise<Assignment> {
    const sb = await this.client()
    const existing = await this.getAssignment(academyId, id)
    if (!existing) {
      throw new SupabaseDriverError(
        'assignments.update',
        `assignment ${id} is not in academy ${academyId}`,
      )
    }
    const row: Record<string, unknown> = {}
    if (patch.brief !== undefined) row.brief = patch.brief
    if (patch.issuedAt !== undefined) row.issued_at = patch.issuedAt
    if (patch.completed !== undefined) row.completed = patch.completed
    if (Object.keys(row).length === 0) return existing

    const res = await sb
      .from('assignments')
      .update(row)
      .eq('id', id)
      .select(ASSIGNMENT_COLS)
      .single()
    return mapAssignment(oneRow<AssignmentRow>('assignments.update', res))
  }

  /* ---- alerts ---- */

  async listAlerts(
    academyId: string,
    opts?: { studentId?: string; openOnly?: boolean },
  ): Promise<Alert[]> {
    const sb = await this.client()
    let q = sb
      .from('alerts')
      .select(`${ALERT_COLS}, ${VIA_STUDENT}`)
      .eq(VIA_STUDENT_KEY, academyId)
    if (opts?.studentId) q = q.eq('student_id', opts.studentId)
    if (opts?.openOnly) q = q.is('resolved_at', null)
    const res = await q.order('detected_at', { ascending: false })
    return rows<AlertRow>('alerts.list', res).map(mapAlert)
  }

  /**
   * Idempotent alert sync.
   *
   * Detection re-runs whenever a work lands, so this has to be safe to repeat.
   * An alert already open for the same student, type and dimension is kept —
   * message and severity refreshed, detected_at untouched, because the date the
   * plateau began is the fact worth keeping. Anything open that detection no
   * longer reports is resolved. Anything new is inserted.
   */
  async syncAlerts(
    academyId: string,
    studentId: string,
    open: Array<Omit<Alert, 'id' | 'resolved_at'>>,
  ): Promise<Alert[]> {
    const sb = await this.client()
    await this.assertStudent(sb, academyId, studentId)

    const currentRes = await sb
      .from('alerts')
      .select(ALERT_COLS)
      .eq('student_id', studentId)
      .is('resolved_at', null)
    const current = rows<AlertRow>('alerts.syncRead', currentRes).map(mapAlert)

    const desired = new Map<string, Omit<Alert, 'id' | 'resolved_at'>>()
    for (const a of open) desired.set(alertKey(a.type, a.dimension), a)

    const now = new Date().toISOString()
    const seen = new Set<string>()
    const toResolve: string[] = []
    const toRefresh: Array<{
      id: string
      message: string
      severity: Alert['severity']
    }> = []

    for (const a of current) {
      const key = alertKey(a.type, a.dimension)
      const want = desired.get(key)
      if (!want || seen.has(key)) {
        // Either detection dropped it, or it is a duplicate left by an older
        // run. Both close.
        toResolve.push(a.id)
        continue
      }
      seen.add(key)
      if (want.message !== a.message || want.severity !== a.severity) {
        toRefresh.push({ id: a.id, message: want.message, severity: want.severity })
      }
    }

    const toInsert = [...desired.entries()]
      .filter(([key]) => !seen.has(key))
      .map(([, a]) => ({
        student_id: studentId,
        dimension: a.dimension,
        type: a.type,
        message: a.message,
        severity: a.severity,
        detected_at: a.detected_at,
        resolved_at: null,
      }))

    if (toResolve.length > 0) {
      const res = await sb.from('alerts').update({ resolved_at: now }).in('id', toResolve)
      if (res.error) raise('alerts.syncResolve', res.error)
    }
    for (const r of toRefresh) {
      const res = await sb
        .from('alerts')
        .update({ message: r.message, severity: r.severity })
        .eq('id', r.id)
      if (res.error) raise('alerts.syncRefresh', res.error)
    }
    if (toInsert.length > 0) {
      const res = await sb.from('alerts').insert(toInsert)
      if (res.error) raise('alerts.syncInsert', res.error)
    }

    return this.listAlerts(academyId, { studentId, openOnly: true })
  }

  async resolveAlert(academyId: string, alertId: string, at: string): Promise<Alert> {
    const sb = await this.client()
    const owned = await sb
      .from('alerts')
      .select(`id, ${VIA_STUDENT}`)
      .eq('id', alertId)
      .eq(VIA_STUDENT_KEY, academyId)
      .maybeSingle()
    if (!maybeRow<{ id: string }>('alerts.resolveCheck', owned)) {
      throw new SupabaseDriverError(
        'alerts.resolve',
        `alert ${alertId} is not in academy ${academyId}`,
      )
    }
    const res = await sb
      .from('alerts')
      .update({ resolved_at: at })
      .eq('id', alertId)
      .select(ALERT_COLS)
      .single()
    return mapAlert(oneRow<AlertRow>('alerts.resolve', res))
  }

  /* ---- reports ---- */

  async listReports(academyId: string, studentId?: string): Promise<Report[]> {
    const sb = await this.client()
    let q = sb
      .from('reports')
      .select(`${REPORT_COLS}, ${VIA_STUDENT}`)
      .eq(VIA_STUDENT_KEY, academyId)
    if (studentId) q = q.eq('student_id', studentId)
    const res = await q.order('created_at', { ascending: false })
    return rows<ReportRow>('reports.list', res).map(mapReport)
  }

  async getReport(academyId: string, id: string): Promise<Report | null> {
    const sb = await this.client()
    const res = await sb
      .from('reports')
      .select(`${REPORT_COLS}, ${VIA_STUDENT}`)
      .eq('id', id)
      .eq(VIA_STUDENT_KEY, academyId)
      .maybeSingle()
    const row = maybeRow<ReportRow>('reports.get', res)
    return row ? mapReport(row) : null
  }

  async createReport(input: {
    academyId: string
    studentId: string
    periodStart: string
    periodEnd: string
    content: ReportContent
  }): Promise<Report> {
    const sb = await this.client()
    await this.assertStudent(sb, input.academyId, input.studentId)
    const res = await sb
      .from('reports')
      .insert({
        student_id: input.studentId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        content: input.content,
        approved_at: null,
        approved_by: null,
      })
      .select(REPORT_COLS)
      .single()
    return mapReport(oneRow<ReportRow>('reports.create', res))
  }

  async updateReport(
    academyId: string,
    id: string,
    patch: {
      content?: ReportContent
      approvedAt?: string | null
      approvedBy?: string | null
    },
  ): Promise<Report> {
    const sb = await this.client()
    const existing = await this.getReport(academyId, id)
    if (!existing) {
      throw new SupabaseDriverError(
        'reports.update',
        `report ${id} is not in academy ${academyId}`,
      )
    }
    const row: Record<string, unknown> = {}
    if (patch.content !== undefined) row.content = patch.content
    if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt
    if (patch.approvedBy !== undefined) row.approved_by = patch.approvedBy
    if (Object.keys(row).length === 0) return existing

    const res = await sb
      .from('reports')
      .update(row)
      .eq('id', id)
      .select(REPORT_COLS)
      .single()
    return mapReport(oneRow<ReportRow>('reports.update', res))
  }

  /* ---- storage ---- */

  async putImage(input: {
    academyId: string
    bytes: ArrayBuffer | Uint8Array
    contentType: string
    filename: string
  }): Promise<{ url: string }> {
    const sb = await this.client()
    // The academy id is the first path segment because the storage policies
    // read exactly that segment to decide who may touch the object.
    const path = `${input.academyId}/${safeFilename(input.filename)}`
    const body =
      input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes)

    const uploaded = await sb.storage.from(WORKS_BUCKET).upload(path, body, {
      contentType: input.contentType,
      upsert: true,
    })
    if (uploaded.error) {
      throw new SupabaseDriverError('storage.upload', uploaded.error.message)
    }
    const { data } = sb.storage.from(WORKS_BUCKET).getPublicUrl(path)
    return { url: data.publicUrl }
  }

  /* ---- demo ---- */

  /**
   * Rebuilds the demo academy from src/lib/dal/seed-data.ts.
   *
   * The only method that uses the service role, because it writes rows for an
   * academy no session owns. Deleting the academy row is enough — every child
   * table cascades from it — and the seed then goes back in parent first, so no
   * foreign key is ever pointed at a row that does not exist yet.
   *
   * Alerts are not seeded. SeedBundle does not carry them, and it should not:
   * detection derives them from the works on the next read, which is the same
   * path a real academy takes.
   */
  async resetDemo(): Promise<{ academyId: string; students: number; works: number }> {
    const admin = createSupabaseServiceClient()
    const { buildSeed } = await import('./seed-data')
    const seed = buildSeed()

    const deleted = await admin.from('academies').delete().eq('id', DEMO.academyId)
    if (deleted.error) raise('demo.reset.delete', deleted.error)

    await this.insertAll(admin, 'academies', [seed.academy], 'demo.reset.academy')
    await this.insertAll(
      admin,
      'instructors',
      [seed.instructor],
      'demo.reset.instructors',
    )
    await this.insertAll(admin, 'students', seed.students, 'demo.reset.students')
    await this.insertAll(
      admin,
      'assignments',
      seed.assignments,
      'demo.reset.assignments',
    )
    await this.insertAll(admin, 'works', seed.works, 'demo.reset.works')
    await this.insertAll(admin, 'scores', seed.scores, 'demo.reset.scores')
    await this.insertAll(
      admin,
      'calibrations',
      seed.calibrations,
      'demo.reset.calibrations',
    )
    await this.insertAll(admin, 'reports', seed.reports, 'demo.reset.reports')

    return {
      academyId: seed.academy.id,
      students: seed.students.length,
      works: seed.works.length,
    }
  }

  /* ---- internals ---- */

  /** Ownership check for writes PostgREST cannot filter through a join. */
  private async assertStudent(
    sb: SupabaseClient,
    academyId: string,
    studentId: string,
  ): Promise<void> {
    const res = await sb
      .from('students')
      .select('id')
      .eq('id', studentId)
      .eq('academy_id', academyId)
      .maybeSingle()
    if (!maybeRow<{ id: string }>('students.assert', res)) {
      throw new SupabaseDriverError(
        'students.assert',
        `student ${studentId} is not in academy ${academyId}`,
      )
    }
  }

  /** The same check for works, which reach their academy through the student. */
  private async assertWork(
    sb: SupabaseClient,
    academyId: string,
    workId: string,
  ): Promise<{ id: string; student_id: string }> {
    const res = await sb
      .from('works')
      .select(`id, student_id, ${VIA_STUDENT}`)
      .eq('id', workId)
      .eq(VIA_STUDENT_KEY, academyId)
      .maybeSingle()
    const row = maybeRow<{ id: string; student_id: string }>('works.assert', res)
    if (!row) {
      throw new SupabaseDriverError(
        'works.assert',
        `work ${workId} is not in academy ${academyId}`,
      )
    }
    return row
  }

  /** Chunked insert, used only by the demo reset. */
  private async insertAll(
    admin: SupabaseClient,
    table: string,
    values: readonly object[],
    context: string,
  ): Promise<void> {
    for (let i = 0; i < values.length; i += INSERT_CHUNK) {
      const res = await admin.from(table).insert(values.slice(i, i + INSERT_CHUNK))
      if (res.error) raise(context, res.error)
    }
  }
}

/** The Supabase-backed DataDriver. Selected by lib/dal/index.ts when keys exist. */
export function createSupabaseDriver(): DataDriver {
  return new SupabaseDriver()
}
