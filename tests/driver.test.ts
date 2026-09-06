import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DataDriver } from '@/lib/dal/types'
import { DEMO, DEMO_COHORT_SIZE } from '@/lib/constants'
import { DIMENSIONS } from '@/lib/rubric'

/**
 * The local driver is what the demo runs on, so the contract it implements is
 * tested here rather than trusted. The rules that matter most are the ones a
 * careless re-score could break: a proposal must never overwrite a confirmed
 * score, and one academy must never see another's rows.
 */

let driver: DataDriver
let dir: string
let cwd: string

beforeAll(async () => {
  // The driver persists under process.cwd(); give it a scratch directory.
  dir = mkdtempSync(join(tmpdir(), 'kaushal-test-'))
  cwd = process.cwd()
  process.chdir(dir)
  const { createLocalDriver } = await import('@/lib/dal/local')
  driver = createLocalDriver()
  await driver.resetDemo()
})

afterAll(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

describe('the seeded demo', () => {
  it('builds the academy the demo page promises', async () => {
    const academy = await driver.getAcademy(DEMO.academyId)
    expect(academy).not.toBeNull()
    expect(academy!.name).toBe(DEMO.academyName)
    expect(academy!.calibrated_at).not.toBeNull()
  })

  it('has the full cohort', async () => {
    const students = await driver.listStudents(DEMO.academyId, { status: 'all' })
    const roster = students.filter((s) => s.name !== 'Calibration set')
    expect(roster).toHaveLength(DEMO_COHORT_SIZE)
  })

  it('gives the featured student exactly six works', async () => {
    const works = await driver.listScoredWorks(DEMO.academyId, {
      studentId: DEMO.featuredStudentId,
    })
    expect(works).toHaveLength(6)
  })

  it('returns scored works oldest first', async () => {
    const works = await driver.listScoredWorks(DEMO.academyId, {
      studentId: DEMO.featuredStudentId,
    })
    const times = works.map((w) => new Date(w.captured_at).getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('returns works newest first', async () => {
    const works = await driver.listWorks(DEMO.academyId, {
      studentId: DEMO.featuredStudentId,
    })
    const times = works.map((w) => new Date(w.captured_at).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('scores every dimension as a whole number between 1 and 10', async () => {
    const works = await driver.listScoredWorks(DEMO.academyId, {})
    let checked = 0
    for (const w of works) {
      for (const s of w.scores) {
        for (const v of [s.ai_score, s.confirmed_score]) {
          if (v === null) continue
          expect(Number.isInteger(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(1)
          expect(v).toBeLessThanOrEqual(10)
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('carries ten calibration anchors spanning a real range', async () => {
    const anchors = await driver.listCalibrationAnchors(DEMO.academyId)
    expect(anchors).toHaveLength(10)
    const all = anchors.flatMap((a) =>
      Object.values(a.scores).filter((n): n is number => typeof n === 'number'),
    )
    expect(Math.min(...all)).toBeLessThanOrEqual(3)
    expect(Math.max(...all)).toBeGreaterThanOrEqual(8)
  })

  it('excludes calibration works from a student trajectory', async () => {
    const works = await driver.listScoredWorks(DEMO.academyId, {})
    expect(works.every((w) => !w.is_calibration)).toBe(true)
  })

  it('leaves some scores unconfirmed so the distinction is visible on load', async () => {
    const pending = await driver.countUnconfirmed(DEMO.academyId)
    expect(pending).toBeGreaterThan(0)
  })

  it('resets to the same shape every time', async () => {
    const before = await driver.resetDemo()
    const after = await driver.resetDemo()
    expect(after.students).toBe(before.students)
    expect(after.works).toBe(before.works)
  })
})

describe('score writes', () => {
  it('never lets a proposal overwrite a confirmed score', async () => {
    const works = await driver.listScoredWorks(DEMO.academyId, {
      studentId: DEMO.featuredStudentId,
    })
    const work = works[0]

    await driver.confirmScore(DEMO.academyId, {
      workId: work.id,
      dimension: 'value_range',
      score: 9,
      instructorId: DEMO.instructorId,
    })

    await driver.upsertProposedScores(DEMO.academyId, work.id, [
      {
        dimension: 'value_range',
        score: 2,
        rationale: 'a later proposal',
        confidence: 0.9,
        source: 'gemini',
      },
    ])

    const rows = await driver.listScoresForWork(DEMO.academyId, work.id)
    const row = rows.find((r) => r.dimension === 'value_range')!
    expect(row.confirmed_score).toBe(9)
    expect(row.ai_score).toBe(2)
  })

  it('confirms all five and records who did it', async () => {
    const works = await driver.listScoredWorks(DEMO.academyId, {
      studentId: DEMO.featuredStudentId,
    })
    const work = works[works.length - 1]
    const rows = await driver.confirmAllScores(DEMO.academyId, {
      workId: work.id,
      instructorId: DEMO.instructorId,
    })
    expect(rows).toHaveLength(DIMENSIONS.length)
    for (const r of rows) {
      expect(r.confirmed_score).not.toBeNull()
      expect(r.confirmed_by).toBe(DEMO.instructorId)
    }
  })
})

describe('alert synchronisation', () => {
  const studentId = DEMO.featuredStudentId

  it('is idempotent — running twice does not duplicate an open alert', async () => {
    const open = [
      {
        student_id: studentId,
        dimension: 'value_range' as const,
        type: 'plateau' as const,
        message: 'Value range has not moved.',
        severity: 'high' as const,
        detected_at: new Date('2026-09-01').toISOString(),
      },
    ]
    await driver.syncAlerts(DEMO.academyId, studentId, open)
    await driver.syncAlerts(DEMO.academyId, studentId, open)

    const alerts = await driver.listAlerts(DEMO.academyId, {
      studentId,
      openOnly: true,
    })
    const plateaus = alerts.filter(
      (a) => a.type === 'plateau' && a.dimension === 'value_range',
    )
    expect(plateaus).toHaveLength(1)
  })

  it('resolves an alert that no longer holds', async () => {
    await driver.syncAlerts(DEMO.academyId, studentId, [])
    const open = await driver.listAlerts(DEMO.academyId, {
      studentId,
      openOnly: true,
    })
    expect(open).toHaveLength(0)
  })
})

describe('academy isolation', () => {
  it('hides another academy rows even when the id is known', async () => {
    const other = await driver.createAcademy({
      name: 'Someone Else Studio',
      ownerId: 'owner-2',
      discipline: 'painting',
    })
    const mine = await driver.listStudents(DEMO.academyId, { status: 'all' })
    const theirs = await driver.listStudents(other.id, { status: 'all' })
    expect(theirs).toHaveLength(0)

    const someoneOfMine = mine[0]
    expect(await driver.getStudent(other.id, someoneOfMine.id)).toBeNull()
  })
})

describe('students', () => {
  it('creates, updates and keeps the change', async () => {
    const created = await driver.createStudent({
      academyId: DEMO.academyId,
      name: 'Test Student',
      level: 1,
    })
    const updated = await driver.updateStudent(DEMO.academyId, created.id, {
      level: 3,
      status: 'paused',
    })
    expect(updated.level).toBe(3)
    expect(updated.status).toBe('paused')

    const read = await driver.getStudent(DEMO.academyId, created.id)
    expect(read!.status).toBe('paused')
  })

  it('hands back copies, so a caller cannot mutate the store by reference', async () => {
    const first = await driver.listStudents(DEMO.academyId, { status: 'all' })
    first[0].name = 'Mutated By Accident'
    const second = await driver.listStudents(DEMO.academyId, { status: 'all' })
    expect(second[0].name).not.toBe('Mutated By Accident')
  })
})
