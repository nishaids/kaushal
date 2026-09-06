import type { Dimension } from '../rubric'
import type {
  Academy,
  Alert,
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

/**
 * The data access contract.
 *
 * Two drivers implement it: `supabase` when credentials are present, and
 * `local` otherwise. Same surface, same semantics, same ordering guarantees.
 * Nothing above this layer knows which one is running — which is the reason
 * the demo cannot break: no key, no network, still a working product.
 *
 * Every method takes an explicit `academyId` where the row is academy-owned.
 * The Supabase driver additionally relies on RLS; the argument is defence in
 * depth, not the only guard.
 */
export interface DataDriver {
  readonly name: 'supabase' | 'local'

  /* ---- session / academy ---- */
  getAcademyForOwner(ownerId: string): Promise<Academy | null>
  getAcademy(academyId: string): Promise<Academy | null>
  createAcademy(input: {
    name: string
    ownerId: string
    discipline: Discipline
  }): Promise<Academy>
  markCalibrated(academyId: string, at: string): Promise<Academy>

  getInstructor(id: string): Promise<Instructor | null>
  getInstructorByEmail(email: string): Promise<Instructor | null>
  createInstructor(input: {
    academyId: string
    email: string
    name: string
    id?: string
  }): Promise<Instructor>

  /* ---- students ---- */
  listStudents(
    academyId: string,
    opts?: { status?: StudentStatus | 'all'; search?: string },
  ): Promise<Student[]>
  getStudent(academyId: string, studentId: string): Promise<Student | null>
  createStudent(input: {
    academyId: string
    name: string
    level?: number
    joinedAt?: string
  }): Promise<Student>
  updateStudent(
    academyId: string,
    studentId: string,
    patch: Partial<Pick<Student, 'name' | 'level' | 'status'>>,
  ): Promise<Student>

  /* ---- works ---- */
  /** Newest first. `limit` bounds the page; the trajectory screen asks for all. */
  listWorks(
    academyId: string,
    opts: {
      studentId?: string
      includeCalibration?: boolean
      limit?: number
      since?: string
      until?: string
    },
  ): Promise<Work[]>
  /** Works with their scores attached, oldest first. The trajectory unit. */
  listScoredWorks(
    academyId: string,
    opts: {
      studentId?: string
      includeCalibration?: boolean
      since?: string
      until?: string
    },
  ): Promise<ScoredWork[]>
  getWork(academyId: string, workId: string): Promise<ScoredWork | null>
  createWork(input: {
    academyId: string
    studentId: string
    imageUrl: string
    thumbUrl?: string | null
    capturedAt?: string
    assignmentId?: string | null
    notes?: string | null
    isCalibration?: boolean
    metrics?: ImageMetrics | null
  }): Promise<Work>
  deleteWork(academyId: string, workId: string): Promise<void>

  /* ---- scores ---- */
  /** Replaces any existing proposal for (work, dimension). Never clears a confirm. */
  upsertProposedScores(
    academyId: string,
    workId: string,
    proposals: ProposedScoreInput[],
  ): Promise<Score[]>
  confirmScore(
    academyId: string,
    input: {
      workId: string
      dimension: Dimension
      score: number
      instructorId: string
    },
  ): Promise<Score>
  confirmAllScores(
    academyId: string,
    input: { workId: string; instructorId: string },
  ): Promise<Score[]>
  listScoresForWork(academyId: string, workId: string): Promise<Score[]>
  countUnconfirmed(academyId: string): Promise<number>

  /* ---- calibration ---- */
  listCalibrations(academyId: string): Promise<Calibration[]>
  /** Anchor works with their instructor-set scores, for few-shot injection. */
  listCalibrationAnchors(academyId: string): Promise<CalibrationAnchor[]>
  setCalibration(
    academyId: string,
    input: { workId: string; scores: Partial<Record<Dimension, number>> },
  ): Promise<Calibration[]>

  /* ---- assignments ---- */
  listAssignments(
    academyId: string,
    opts?: { studentId?: string; issuedOnly?: boolean },
  ): Promise<Assignment[]>
  getAssignment(academyId: string, id: string): Promise<Assignment | null>
  createAssignment(input: {
    academyId: string
    studentId: string
    targetDimension: Dimension
    brief: AssignmentBrief
  }): Promise<Assignment>
  updateAssignment(
    academyId: string,
    id: string,
    patch: { brief?: AssignmentBrief; issuedAt?: string | null; completed?: boolean },
  ): Promise<Assignment>

  /* ---- alerts ---- */
  listAlerts(
    academyId: string,
    opts?: { studentId?: string; openOnly?: boolean },
  ): Promise<Alert[]>
  /**
   * Idempotent. Re-running detection must not duplicate an open alert for the
   * same (student, dimension, type). Resolves open alerts no longer present.
   */
  syncAlerts(
    academyId: string,
    studentId: string,
    open: Array<Omit<Alert, 'id' | 'resolved_at'>>,
  ): Promise<Alert[]>
  resolveAlert(academyId: string, alertId: string, at: string): Promise<Alert>

  /* ---- reports ---- */
  listReports(academyId: string, studentId?: string): Promise<Report[]>
  getReport(academyId: string, id: string): Promise<Report | null>
  createReport(input: {
    academyId: string
    studentId: string
    periodStart: string
    periodEnd: string
    content: ReportContent
  }): Promise<Report>
  updateReport(
    academyId: string,
    id: string,
    patch: { content?: ReportContent; approvedAt?: string | null; approvedBy?: string | null },
  ): Promise<Report>

  /* ---- storage ---- */
  /** Returns a URL the app can render. Local driver returns a data URL. */
  putImage(input: {
    academyId: string
    bytes: ArrayBuffer | Uint8Array
    contentType: string
    filename: string
  }): Promise<{ url: string }>

  /* ---- demo ---- */
  /** Wipes the demo academy and rebuilds it to the exact seeded state. */
  resetDemo(): Promise<{ academyId: string; students: number; works: number }>
}

export interface ProposedScoreInput {
  dimension: Dimension
  score: number | null
  rationale: string | null
  confidence: number | null
  source: ScoreSource
}

export interface CalibrationAnchor {
  work: Work
  scores: Partial<Record<Dimension, number>>
}
