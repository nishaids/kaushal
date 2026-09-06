import 'server-only'

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { DEMO } from '../constants'
import { DIMENSIONS, clampScore } from '../rubric'
import type { Dimension } from '../rubric'
import type {
  Academy,
  Alert,
  Assignment,
  Calibration,
  Discipline,
  ImageMetrics,
  Instructor,
  Report,
  Score,
  ScoredWork,
  Student,
  Work,
} from '../types'
import { SEED_VERSION, buildSeed } from './seed-data'
import type { CalibrationAnchor, DataDriver, ProposedScoreInput } from './types'

/**
 * The local driver.
 *
 * A complete implementation of DataDriver over an in-process store that is
 * persisted to `.data/kaushal.json`. It exists so the product runs with no
 * credentials at all — no Supabase project, no network — with the same
 * semantics, the same ordering and the same academy isolation the Supabase
 * driver gets from row level security.
 *
 * Nothing here logs. A corrupt file, a missing directory or a read-only
 * filesystem all degrade to serving the seed from memory.
 */

const STORE_DIR = '.data'
const STORE_FILE = 'kaushal.json'
/** One disk write per burst, not one per row. */
const FLUSH_DEBOUNCE_MS = 200

interface Store {
  version: string
  academies: Academy[]
  instructors: Instructor[]
  students: Student[]
  works: Work[]
  scores: Score[]
  calibrations: Calibration[]
  assignments: Assignment[]
  alerts: Alert[]
  reports: Report[]
}

class LocalDataError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'LocalDataError'
    this.code = code
  }
}

function notFound(what: string): LocalDataError {
  return new LocalDataError(`${what} not found in this academy.`, 'not_found')
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

let store: Store | null = null
let loading: Promise<Store> | null = null
/** Set once a write fails. Vercel's filesystem is read-only; that is fine. */
let memoryOnly = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let flushAgain = false

function storePath(): string {
  return path.join(process.cwd(), STORE_DIR, STORE_FILE)
}

function seededStore(now: Date = new Date()): Store {
  const seed = buildSeed(now)
  return {
    version: SEED_VERSION,
    academies: [seed.academy],
    instructors: [seed.instructor],
    students: seed.students,
    works: seed.works,
    scores: seed.scores,
    calibrations: seed.calibrations,
    assignments: seed.assignments,
    alerts: [],
    reports: seed.reports,
  }
}

/** True only for a file that matches the current seed version and shape. */
function isUsable(value: unknown): value is Store {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.version !== SEED_VERSION) return false
  const arrays = [
    'academies',
    'instructors',
    'students',
    'works',
    'scores',
    'calibrations',
    'assignments',
    'alerts',
    'reports',
  ] as const
  for (const key of arrays) {
    if (!Array.isArray(candidate[key])) return false
  }
  return (candidate.academies as unknown[]).length > 0
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isUsable(parsed)) return parsed
  } catch {
    // Missing, unreadable or malformed. Rebuilding is always the right answer.
  }
  const fresh = seededStore()
  scheduleFlush(fresh)
  return fresh
}

async function load(): Promise<Store> {
  if (store) return store
  if (!loading) {
    loading = readStore().then((loaded) => {
      store = loaded
      loading = null
      return loaded
    })
  }
  return loading
}

function scheduleFlush(next?: Store): void {
  if (next) store = next
  if (memoryOnly || flushTimer) return
  const timer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, FLUSH_DEBOUNCE_MS)
  flushTimer = timer
  // Never hold a dev server open for a pending write.
  const handle = timer as unknown as { unref?: () => void }
  if (typeof handle.unref === 'function') handle.unref()
}

/** Write to a temp file and rename, so a reader never sees a half file. */
async function flush(): Promise<void> {
  if (memoryOnly || !store) return
  if (flushing) {
    flushAgain = true
    return
  }
  flushing = true
  const target = storePath()
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    const payload = JSON.stringify(store)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(temp, payload, 'utf8')
    await rename(temp, target)
  } catch {
    // A read-only filesystem is a supported deployment, not an error. Stop
    // trying, keep serving from memory, and say nothing.
    memoryOnly = true
    try {
      await unlink(temp)
    } catch {
      // The temp file was never created. Nothing to clean up.
    }
  } finally {
    flushing = false
    if (flushAgain) {
      flushAgain = false
      scheduleFlush()
    }
  }
}

/* ------------------------------------------------------------------ *
 * Read isolation
 * ------------------------------------------------------------------ */

/** Callers get their own copy. The store is never handed out by reference. */
function clone<T>(value: T): T {
  return structuredClone(value)
}

function nowIso(): string {
  return new Date().toISOString()
}

function studentIdsIn(s: Store, academyId: string): Set<string> {
  const ids = new Set<string>()
  for (const student of s.students) {
    if (student.academy_id === academyId) ids.add(student.id)
  }
  return ids
}

/** The work, only if its student belongs to this academy. */
function findWork(s: Store, academyId: string, workId: string): Work | null {
  const work = s.works.find((w) => w.id === workId)
  if (!work) return null
  const student = s.students.find((st) => st.id === work.student_id)
  if (!student || student.academy_id !== academyId) return null
  return work
}

function findStudent(s: Store, academyId: string, studentId: string): Student | null {
  const student = s.students.find((st) => st.id === studentId)
  if (!student || student.academy_id !== academyId) return null
  return student
}

const DIMENSION_ORDER = new Map<Dimension, number>(DIMENSIONS.map((d, i) => [d, i]))

function byDimension(a: Score, b: Score): number {
  return (DIMENSION_ORDER.get(a.dimension) ?? 99) - (DIMENSION_ORDER.get(b.dimension) ?? 99)
}

function scoresFor(s: Store, workId: string): Score[] {
  return s.scores.filter((sc) => sc.work_id === workId).sort(byDimension)
}

function time(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

function inRange(iso: string, since?: string, until?: string): boolean {
  const t = time(iso)
  if (since && t < time(since)) return false
  if (until && t > time(until)) return false
  return true
}

const SEVERITY_RANK: Record<Alert['severity'], number> = { high: 0, medium: 1, low: 2 }

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Buffer.from(view).toString('base64')
}

/* ------------------------------------------------------------------ *
 * Driver
 * ------------------------------------------------------------------ */

/**
 * Build the local driver. Cheap to call: the store loads on first use, not
 * here, so importing this module costs nothing until something reads.
 */
export function createLocalDriver(): DataDriver {
  const driver: DataDriver = {
    name: 'local',

    /* ---- session / academy ---- */

    async getAcademyForOwner(ownerId) {
      const s = await load()
      return clone(s.academies.find((a) => a.owner_id === ownerId) ?? null)
    },

    async getAcademy(academyId) {
      const s = await load()
      return clone(s.academies.find((a) => a.id === academyId) ?? null)
    },

    async createAcademy(input: { name: string; ownerId: string; discipline: Discipline }) {
      const s = await load()
      const academy: Academy = {
        id: randomUUID(),
        name: input.name,
        owner_id: input.ownerId,
        discipline: input.discipline,
        calibrated_at: null,
        created_at: nowIso(),
      }
      s.academies.push(academy)
      scheduleFlush()
      return clone(academy)
    },

    async markCalibrated(academyId, at) {
      const s = await load()
      const academy = s.academies.find((a) => a.id === academyId)
      if (!academy) throw notFound('Academy')
      academy.calibrated_at = at
      scheduleFlush()
      return clone(academy)
    },

    async getInstructor(id) {
      const s = await load()
      return clone(s.instructors.find((i) => i.id === id) ?? null)
    },

    async getInstructorByEmail(email) {
      const s = await load()
      const wanted = email.trim().toLowerCase()
      return clone(s.instructors.find((i) => i.email.toLowerCase() === wanted) ?? null)
    },

    async createInstructor(input) {
      const s = await load()
      const instructor: Instructor = {
        id: input.id ?? randomUUID(),
        academy_id: input.academyId,
        email: input.email,
        name: input.name,
        created_at: nowIso(),
      }
      const existing = s.instructors.findIndex((i) => i.id === instructor.id)
      if (existing >= 0) s.instructors[existing] = instructor
      else s.instructors.push(instructor)
      scheduleFlush()
      return clone(instructor)
    },

    /* ---- students ---- */

    async listStudents(academyId, opts) {
      const s = await load()
      const status = opts?.status ?? 'all'
      const search = opts?.search?.trim().toLowerCase()
      const rows = s.students
        .filter((st) => st.academy_id === academyId)
        .filter((st) => (status === 'all' ? true : st.status === status))
        .filter((st) => (search ? st.name.toLowerCase().includes(search) : true))
        .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      return clone(rows)
    },

    async getStudent(academyId, studentId) {
      const s = await load()
      return clone(findStudent(s, academyId, studentId))
    },

    async createStudent(input) {
      const s = await load()
      const created = nowIso()
      const student: Student = {
        id: randomUUID(),
        academy_id: input.academyId,
        name: input.name,
        joined_at: input.joinedAt ?? created,
        level: input.level ?? 1,
        status: 'active',
        created_at: created,
      }
      s.students.push(student)
      scheduleFlush()
      return clone(student)
    },

    async updateStudent(academyId, studentId, patch) {
      const s = await load()
      const student = findStudent(s, academyId, studentId)
      if (!student) throw notFound('Student')
      if (patch.name !== undefined) student.name = patch.name
      if (patch.level !== undefined) student.level = patch.level
      if (patch.status !== undefined) student.status = patch.status
      scheduleFlush()
      return clone(student)
    },

    /* ---- works ---- */

    async listWorks(academyId, opts) {
      const s = await load()
      const rows = selectWorks(s, academyId, opts).sort(
        (a, b) => time(b.captured_at) - time(a.captured_at) || time(b.created_at) - time(a.created_at),
      )
      return clone(opts.limit && opts.limit > 0 ? rows.slice(0, opts.limit) : rows)
    },

    async listScoredWorks(academyId, opts) {
      const s = await load()
      const rows = selectWorks(s, academyId, opts).sort(
        (a, b) => time(a.captured_at) - time(b.captured_at) || time(a.created_at) - time(b.created_at),
      )
      const scored: ScoredWork[] = rows.map((w) => ({ ...w, scores: scoresFor(s, w.id) }))
      return clone(scored)
    },

    async getWork(academyId, workId) {
      const s = await load()
      const work = findWork(s, academyId, workId)
      if (!work) return null
      return clone({ ...work, scores: scoresFor(s, work.id) })
    },

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
    }) {
      const s = await load()
      if (!findStudent(s, input.academyId, input.studentId)) throw notFound('Student')
      const created = nowIso()
      const work: Work = {
        id: randomUUID(),
        student_id: input.studentId,
        image_url: input.imageUrl,
        thumb_url: input.thumbUrl ?? null,
        captured_at: input.capturedAt ?? created,
        assignment_id: input.assignmentId ?? null,
        notes: input.notes ?? null,
        is_calibration: input.isCalibration ?? false,
        metrics: input.metrics ?? null,
        created_at: created,
      }
      s.works.push(work)
      scheduleFlush()
      return clone(work)
    },

    async deleteWork(academyId, workId) {
      const s = await load()
      const work = findWork(s, academyId, workId)
      if (!work) throw notFound('Work')
      s.works = s.works.filter((w) => w.id !== workId)
      s.scores = s.scores.filter((sc) => sc.work_id !== workId)
      s.calibrations = s.calibrations.filter((c) => c.work_id !== workId)
      scheduleFlush()
    },

    /* ---- scores ---- */

    /**
     * Replaces the proposal on each (work, dimension) and leaves any
     * confirmed number exactly where it was. A re-score never overwrites the
     * instructor's judgement. Returns every score row on the work.
     */
    async upsertProposedScores(academyId, workId, proposals: ProposedScoreInput[]) {
      const s = await load()
      const work = findWork(s, academyId, workId)
      if (!work) throw notFound('Work')
      const created = nowIso()

      for (const proposal of proposals) {
        const existing = s.scores.find(
          (sc) => sc.work_id === workId && sc.dimension === proposal.dimension,
        )
        if (existing) {
          existing.ai_score = proposal.score
          existing.ai_rationale = proposal.rationale
          existing.ai_confidence = proposal.confidence
          existing.source = proposal.source
          // confirmed_score, confirmed_by and confirmed_at are untouched.
          continue
        }
        s.scores.push({
          id: randomUUID(),
          work_id: workId,
          dimension: proposal.dimension,
          ai_score: proposal.score,
          ai_rationale: proposal.rationale,
          ai_confidence: proposal.confidence,
          source: proposal.source,
          confirmed_score: null,
          confirmed_by: null,
          confirmed_at: null,
          created_at: created,
        })
      }

      scheduleFlush()
      return clone(scoresFor(s, workId))
    },

    async confirmScore(academyId, input) {
      const s = await load()
      const work = findWork(s, academyId, input.workId)
      if (!work) throw notFound('Work')
      const at = nowIso()
      const value = clampScore(input.score)

      let row = s.scores.find(
        (sc) => sc.work_id === input.workId && sc.dimension === input.dimension,
      )
      if (!row) {
        row = {
          id: randomUUID(),
          work_id: input.workId,
          dimension: input.dimension,
          ai_score: null,
          ai_rationale: null,
          ai_confidence: null,
          source: 'manual',
          confirmed_score: null,
          confirmed_by: null,
          confirmed_at: null,
          created_at: at,
        }
        s.scores.push(row)
      }
      row.confirmed_score = value
      row.confirmed_by = input.instructorId
      row.confirmed_at = at
      scheduleFlush()
      return clone(row)
    },

    /**
     * Confirms every dimension at the number the model proposed, leaving
     * anything already confirmed alone. A dimension with no proposal stays
     * unconfirmed — there is nothing to accept.
     */
    async confirmAllScores(academyId, input) {
      const s = await load()
      const work = findWork(s, academyId, input.workId)
      if (!work) throw notFound('Work')
      const at = nowIso()

      for (const dimension of DIMENSIONS) {
        let row = s.scores.find(
          (sc) => sc.work_id === input.workId && sc.dimension === dimension,
        )
        if (!row) {
          row = {
            id: randomUUID(),
            work_id: input.workId,
            dimension,
            ai_score: null,
            ai_rationale: null,
            ai_confidence: null,
            source: 'manual',
            confirmed_score: null,
            confirmed_by: null,
            confirmed_at: null,
            created_at: at,
          }
          s.scores.push(row)
        }
        if (row.confirmed_score !== null) continue
        if (row.ai_score === null) continue
        row.confirmed_score = clampScore(row.ai_score)
        row.confirmed_by = input.instructorId
        row.confirmed_at = at
      }

      scheduleFlush()
      return clone(scoresFor(s, input.workId))
    },

    async listScoresForWork(academyId, workId) {
      const s = await load()
      if (!findWork(s, academyId, workId)) return []
      return clone(scoresFor(s, workId))
    },

    /** How many real works are still waiting on the instructor, not how many rows. */
    async countUnconfirmed(academyId) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const pending = new Set<string>()
      const eligible = new Set(
        s.works.filter((w) => !w.is_calibration && ids.has(w.student_id)).map((w) => w.id),
      )
      for (const score of s.scores) {
        if (score.confirmed_score === null && eligible.has(score.work_id)) {
          pending.add(score.work_id)
        }
      }
      return pending.size
    },

    /* ---- calibration ---- */

    async listCalibrations(academyId) {
      const s = await load()
      const rows = s.calibrations
        .filter((c) => c.academy_id === academyId)
        .sort(
          (a, b) =>
            time(a.created_at) - time(b.created_at) ||
            (DIMENSION_ORDER.get(a.dimension) ?? 99) - (DIMENSION_ORDER.get(b.dimension) ?? 99),
        )
      return clone(rows)
    },

    async listCalibrationAnchors(academyId) {
      const s = await load()
      const grouped = new Map<string, Partial<Record<Dimension, number>>>()
      for (const row of s.calibrations) {
        if (row.academy_id !== academyId) continue
        const bucket = grouped.get(row.work_id) ?? {}
        bucket[row.dimension] = row.anchor_score
        grouped.set(row.work_id, bucket)
      }

      const anchors: CalibrationAnchor[] = []
      for (const [workId, scores] of grouped) {
        const work = findWork(s, academyId, workId)
        if (!work) continue
        anchors.push({ work, scores })
      }
      anchors.sort((a, b) => time(a.work.captured_at) - time(b.work.captured_at))
      return clone(anchors)
    },

    async setCalibration(academyId, input) {
      const s = await load()
      const work = findWork(s, academyId, input.workId)
      if (!work) throw notFound('Work')
      const at = nowIso()
      // Scoring a work as an anchor is what makes it an anchor.
      work.is_calibration = true

      for (const dimension of DIMENSIONS) {
        const value = input.scores[dimension]
        if (value === undefined) continue
        const existing = s.calibrations.find(
          (c) =>
            c.academy_id === academyId && c.work_id === input.workId && c.dimension === dimension,
        )
        if (existing) {
          existing.anchor_score = clampScore(value)
          continue
        }
        s.calibrations.push({
          id: randomUUID(),
          academy_id: academyId,
          work_id: input.workId,
          dimension,
          anchor_score: clampScore(value),
          created_at: at,
        })
      }

      scheduleFlush()
      const rows = s.calibrations
        .filter((c) => c.academy_id === academyId && c.work_id === input.workId)
        .sort(
          (a, b) =>
            (DIMENSION_ORDER.get(a.dimension) ?? 99) - (DIMENSION_ORDER.get(b.dimension) ?? 99),
        )
      return clone(rows)
    },

    /* ---- assignments ---- */

    async listAssignments(academyId, opts) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const rows = s.assignments
        .filter((a) => ids.has(a.student_id))
        .filter((a) => (opts?.studentId ? a.student_id === opts.studentId : true))
        .filter((a) => (opts?.issuedOnly ? a.issued_at !== null : true))
        .sort((a, b) => time(b.created_at) - time(a.created_at))
      return clone(rows)
    },

    async getAssignment(academyId, id) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const row = s.assignments.find((a) => a.id === id && ids.has(a.student_id))
      return clone(row ?? null)
    },

    async createAssignment(input) {
      const s = await load()
      if (!findStudent(s, input.academyId, input.studentId)) throw notFound('Student')
      const assignment: Assignment = {
        id: randomUUID(),
        student_id: input.studentId,
        target_dimension: input.targetDimension,
        brief: input.brief,
        issued_at: null,
        completed: false,
        created_at: nowIso(),
      }
      s.assignments.push(assignment)
      scheduleFlush()
      return clone(assignment)
    },

    async updateAssignment(academyId, id, patch) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const assignment = s.assignments.find((a) => a.id === id && ids.has(a.student_id))
      if (!assignment) throw notFound('Assignment')
      if (patch.brief !== undefined) assignment.brief = patch.brief
      if (patch.issuedAt !== undefined) assignment.issued_at = patch.issuedAt
      if (patch.completed !== undefined) assignment.completed = patch.completed
      scheduleFlush()
      return clone(assignment)
    },

    /* ---- alerts ---- */

    async listAlerts(academyId, opts) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const rows = s.alerts
        .filter((a) => ids.has(a.student_id))
        .filter((a) => (opts?.studentId ? a.student_id === opts.studentId : true))
        .filter((a) => (opts?.openOnly ? a.resolved_at === null : true))
        .sort(
          (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            time(b.detected_at) - time(a.detected_at),
        )
      return clone(rows)
    },

    /**
     * Idempotent by (student, dimension, type). An alert that is already open
     * keeps its id and its detected_at — the instructor's sense of "this has
     * been flagged since the 4th" must not reset every time detection runs —
     * and only its message and severity are refreshed. Anything open that
     * detection no longer reports is resolved.
     */
    async syncAlerts(academyId, studentId, open) {
      const s = await load()
      if (!findStudent(s, academyId, studentId)) return []
      const at = nowIso()

      const key = (dimension: Dimension | null, type: Alert['type']): string =>
        `${dimension ?? '-'}::${type}`
      const wanted = new Set(open.map((a) => key(a.dimension, a.type)))

      for (const incoming of open) {
        const existing = s.alerts.find(
          (a) =>
            a.student_id === studentId &&
            a.resolved_at === null &&
            a.dimension === incoming.dimension &&
            a.type === incoming.type,
        )
        if (existing) {
          existing.message = incoming.message
          existing.severity = incoming.severity
          continue
        }
        s.alerts.push({
          id: randomUUID(),
          student_id: studentId,
          dimension: incoming.dimension,
          type: incoming.type,
          message: incoming.message,
          severity: incoming.severity,
          detected_at: incoming.detected_at,
          resolved_at: null,
        })
      }

      for (const alert of s.alerts) {
        if (alert.student_id !== studentId) continue
        if (alert.resolved_at !== null) continue
        if (wanted.has(key(alert.dimension, alert.type))) continue
        alert.resolved_at = at
      }

      scheduleFlush()
      const rows = s.alerts
        .filter((a) => a.student_id === studentId && a.resolved_at === null)
        .sort(
          (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            time(b.detected_at) - time(a.detected_at),
        )
      return clone(rows)
    },

    async resolveAlert(academyId, alertId, at) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const alert = s.alerts.find((a) => a.id === alertId && ids.has(a.student_id))
      if (!alert) throw notFound('Alert')
      alert.resolved_at = at
      scheduleFlush()
      return clone(alert)
    },

    /* ---- reports ---- */

    async listReports(academyId, studentId) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const rows = s.reports
        .filter((r) => ids.has(r.student_id))
        .filter((r) => (studentId ? r.student_id === studentId : true))
        .sort(
          (a, b) => time(b.period_end) - time(a.period_end) || time(b.created_at) - time(a.created_at),
        )
      return clone(rows)
    },

    async getReport(academyId, id) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      return clone(s.reports.find((r) => r.id === id && ids.has(r.student_id)) ?? null)
    },

    async createReport(input) {
      const s = await load()
      if (!findStudent(s, input.academyId, input.studentId)) throw notFound('Student')
      const report: Report = {
        id: randomUUID(),
        student_id: input.studentId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        content: input.content,
        approved_at: null,
        approved_by: null,
        created_at: nowIso(),
      }
      s.reports.push(report)
      scheduleFlush()
      return clone(report)
    },

    async updateReport(academyId, id, patch) {
      const s = await load()
      const ids = studentIdsIn(s, academyId)
      const report = s.reports.find((r) => r.id === id && ids.has(r.student_id))
      if (!report) throw notFound('Report')
      if (patch.content !== undefined) report.content = patch.content
      if (patch.approvedAt !== undefined) report.approved_at = patch.approvedAt
      if (patch.approvedBy !== undefined) report.approved_by = patch.approvedBy
      scheduleFlush()
      return clone(report)
    },

    /* ---- storage ---- */

    /** There is no object store here, so the image becomes its own URL. */
    async putImage(input) {
      const s = await load()
      if (!s.academies.some((a) => a.id === input.academyId)) throw notFound('Academy')
      const type = input.contentType || 'image/jpeg'
      return { url: `data:${type};base64,${toBase64(input.bytes)}` }
    },

    /* ---- demo ---- */

    async resetDemo() {
      await load()
      const fresh = seededStore()
      store = fresh
      // Written immediately: a reset on stage has to survive a page reload.
      await flush()
      const ids = studentIdsIn(fresh, DEMO.academyId)
      return {
        academyId: DEMO.academyId,
        students: ids.size,
        works: fresh.works.filter((w) => ids.has(w.student_id)).length,
      }
    },
  }

  return driver
}

/* ------------------------------------------------------------------ *
 * Shared work selection. listWorks and listScoredWorks must filter
 * identically and differ only in their ordering.
 * ------------------------------------------------------------------ */

function selectWorks(
  s: Store,
  academyId: string,
  opts: {
    studentId?: string
    includeCalibration?: boolean
    since?: string
    until?: string
  },
): Work[] {
  const ids = studentIdsIn(s, academyId)
  if (opts.studentId && !ids.has(opts.studentId)) return []
  return s.works.filter((w) => {
    if (!ids.has(w.student_id)) return false
    if (opts.studentId && w.student_id !== opts.studentId) return false
    if (!opts.includeCalibration && w.is_calibration) return false
    return inRange(w.captured_at, opts.since, opts.until)
  })
}
