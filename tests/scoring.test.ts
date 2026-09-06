import { describe, expect, it } from 'vitest'
import {
  attentionReason,
  buildCohortRows,
  cohortSummary,
  sortCohort,
} from '@/lib/analytics/cohort'
import { deriveAlerts } from '@/lib/analytics/alerts'
import { measuredScore, fallbackAssignment, fallbackReport } from '@/lib/ai/fallback'
import {
  assignmentResponseSchema,
  reportResponseSchema,
  scoreResponseSchema,
} from '@/lib/ai/schemas'
import { analyseTrajectory } from '@/lib/analytics/trajectory'
import { DIMENSIONS, type Dimension } from '@/lib/rubric'
import { DORMANT_DAYS } from '@/lib/constants'
import type { ImageMetrics, Score, ScoredWork, Student } from '@/lib/types'

const NOW = new Date('2026-09-01T10:00:00.000Z')
const DAY = 86_400_000

function student(id: string, over: Partial<Student> = {}): Student {
  return {
    id,
    academy_id: 'a1',
    name: `Student ${id}`,
    joined_at: new Date(NOW.getTime() - 200 * DAY).toISOString(),
    level: 2,
    status: 'active',
    created_at: new Date(NOW.getTime() - 200 * DAY).toISOString(),
    ...over,
  }
}

function work(id: string, daysAgo: number, value: number, confirmed = true): ScoredWork {
  const at = new Date(NOW.getTime() - daysAgo * DAY).toISOString()
  const scores: Score[] = DIMENSIONS.map((d) => ({
    id: `${id}-${d}`,
    work_id: id,
    dimension: d,
    ai_score: value,
    ai_rationale: 'test',
    ai_confidence: 0.7,
    source: 'gemini',
    confirmed_score: confirmed ? value : null,
    confirmed_by: confirmed ? 'i1' : null,
    confirmed_at: confirmed ? at : null,
    created_at: at,
  }))
  return {
    id,
    student_id: 'does-not-matter',
    image_url: 'data:,',
    thumb_url: null,
    captured_at: at,
    assignment_id: null,
    notes: null,
    is_calibration: false,
    metrics: null,
    created_at: at,
    scores,
  }
}

function metrics(over: Partial<ImageMetrics> = {}): ImageMetrics {
  return {
    histogram: Array.from({ length: 16 }, () => 1 / 16),
    darkest: 0.1,
    lightest: 0.9,
    valueSpread: 0.8,
    contrastSd: 0.25,
    inkCoverage: 0.3,
    edgeDensity: 0.08,
    edgeVariance: 0.05,
    borderEnergy: 0.4,
    massCenter: { x: 0.5, y: 0.5 },
    emptyShare: 0.2,
    strokeCoherence: 0.7,
    width: 1200,
    height: 900,
    ...over,
  }
}

describe('cohort triage', () => {
  it('survives a student with no works at all', () => {
    const rows = buildCohortRows({
      students: [student('s1')],
      worksByStudent: new Map(),
      alertsByStudent: new Map(),
      now: NOW,
    })
    expect(rows[0].worksCount).toBe(0)
    expect(rows[0].mean).toBeNull()
    expect(rows[0].momentum).toBeNull()
    expect(Number.isFinite(rows[0].attention)).toBe(true)
    expect(JSON.stringify(rows)).not.toContain('NaN')
  })

  it('puts the student who needs attention first', () => {
    const quiet = student('quiet')
    const active = student('active')
    const rows = buildCohortRows({
      students: [active, quiet],
      worksByStudent: new Map([
        ['active', [work('a1', 30, 5), work('a2', 14, 6), work('a3', 2, 7)]],
        ['quiet', [work('q1', 90, 5), work('q2', DORMANT_DAYS + 20, 6)]],
      ]),
      alertsByStudent: new Map(),
      now: NOW,
    })
    const sorted = sortCohort(rows, 'attention', 'desc')
    expect(sorted[0].student.id).toBe('quiet')
  })

  it('caps attention at 100 and always explains itself', () => {
    const rows = buildCohortRows({
      students: [student('s1')],
      worksByStudent: new Map([['s1', [work('w1', 120, 5), work('w2', 90, 5)]]]),
      alertsByStudent: new Map([
        [
          's1',
          [
            {
              id: 'x1',
              student_id: 's1',
              dimension: 'value_range' as Dimension,
              type: 'plateau' as const,
              message: 'flat',
              severity: 'high' as const,
              detected_at: NOW.toISOString(),
              resolved_at: null,
            },
          ],
        ],
      ]),
      now: NOW,
    })
    expect(rows[0].attention).toBeLessThanOrEqual(100)
    expect(attentionReason(rows[0]).length).toBeGreaterThan(10)
  })

  it('sorts stably, so the list does not shuffle between renders', () => {
    const students = ['c', 'a', 'b'].map((id) => student(id, { name: id }))
    const first = sortCohort(
      buildCohortRows({
        students,
        worksByStudent: new Map(),
        alertsByStudent: new Map(),
        now: NOW,
      }),
      'attention',
      'desc',
    ).map((r) => r.student.id)
    const second = sortCohort(
      buildCohortRows({
        students,
        worksByStudent: new Map(),
        alertsByStudent: new Map(),
        now: NOW,
      }),
      'attention',
      'desc',
    ).map((r) => r.student.id)
    expect(first).toEqual(second)
  })

  it('counts students rather than scores in the summary', () => {
    const rows = buildCohortRows({
      students: [student('s1'), student('s2')],
      worksByStudent: new Map([
        ['s1', [work('w1', 5, 5, false), work('w2', 3, 6, false)]],
      ]),
      alertsByStudent: new Map(),
      now: NOW,
    })
    const summary = cohortSummary(rows)
    expect(summary.total).toBe(2)
    expect(summary.unconfirmed).toBe(1)
    expect(summary.needsFirstWork).toBe(1)
  })

  it('handles a cohort of sixty-two quickly', () => {
    const students = Array.from({ length: 62 }, (_, i) => student(`s${i}`))
    const worksByStudent = new Map(
      students.map((s, i) => [
        s.id,
        Array.from({ length: 14 }, (_, j) => work(`${s.id}-${j}`, 120 - j * 8, 3 + (j % 7))),
      ] as const),
    )
    const started = Date.now()
    const rows = buildCohortRows({
      students,
      worksByStudent: new Map(worksByStudent),
      alertsByStudent: new Map(),
      now: NOW,
    })
    expect(rows).toHaveLength(62)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('derived alerts', () => {
  it('flags a student who has gone quiet', () => {
    const alerts = deriveAlerts('s1', [work('w1', DORMANT_DAYS + 12, 6)], NOW)
    expect(alerts.some((a) => a.type === 'dormant')).toBe(true)
  })

  it('does not flag a student who submitted this week', () => {
    const alerts = deriveAlerts('s1', [work('w1', 3, 6)], NOW)
    expect(alerts.some((a) => a.type === 'dormant')).toBe(false)
  })

  it('says nothing at all about a student with no works', () => {
    expect(deriveAlerts('s1', [], NOW)).toHaveLength(0)
  })

  it('never raises two flags for the same dimension', () => {
    const works = [0, 1, 2, 3, 4, 5].map((i) => work(`w${i}`, 90 - i * 14, 8 - i))
    const alerts = deriveAlerts('s1', works, NOW)
    const dims = alerts.filter((a) => a.dimension).map((a) => a.dimension)
    expect(new Set(dims).size).toBe(dims.length)
  })
})

describe('the deterministic scorer', () => {
  it('produces a valid response for every dimension', () => {
    const response = measuredScore({ metrics: metrics(), anchors: [] })
    expect(() => scoreResponseSchema.parse(response)).not.toThrow()
    expect(response.scores).toHaveLength(DIMENSIONS.length)
    expect(new Set(response.scores.map((s) => s.dimension)).size).toBe(
      DIMENSIONS.length,
    )
  })

  it('never claims more confidence than a measurement deserves', () => {
    for (const spread of [0, 0.25, 0.5, 0.8, 1]) {
      const response = measuredScore({
        metrics: metrics({ valueSpread: spread, darkest: 0, lightest: spread }),
        anchors: [],
      })
      for (const s of response.scores) {
        expect(s.confidence).toBeLessThanOrEqual(0.45)
      }
    }
  })

  it('scores a wide tonal range above a narrow one', () => {
    const wide = measuredScore({
      metrics: metrics({ valueSpread: 0.92, darkest: 0.04, lightest: 0.96, contrastSd: 0.3 }),
      anchors: [],
    })
    const narrow = measuredScore({
      metrics: metrics({ valueSpread: 0.18, darkest: 0.4, lightest: 0.58, contrastSd: 0.05 }),
      anchors: [],
    })
    const valueOf = (r: typeof wide) =>
      r.scores.find((s) => s.dimension === 'value_range')!.score
    expect(valueOf(wide)).toBeGreaterThan(valueOf(narrow))
  })

  it('stays finite on a blank sheet', () => {
    const blank = measuredScore({
      metrics: metrics({
        valueSpread: 0,
        darkest: 1,
        lightest: 1,
        contrastSd: 0,
        inkCoverage: 0,
        edgeDensity: 0,
        edgeVariance: 0,
        emptyShare: 1,
        strokeCoherence: 0,
      }),
      anchors: [],
    })
    expect(() => scoreResponseSchema.parse(blank)).not.toThrow()
  })

  it('writes rationales about what was measured, not about the subject', () => {
    const response = measuredScore({ metrics: metrics(), anchors: [] })
    for (const s of response.scores) {
      expect(s.rationale.length).toBeGreaterThan(12)
      expect(s.rationale.toLowerCase()).not.toContain('creativity')
      expect(s.rationale.toLowerCase()).not.toContain('talent')
    }
  })
})

describe('the built-in exercise library', () => {
  it('has a real, valid exercise for every dimension', () => {
    for (const dimension of DIMENSIONS) {
      const brief = fallbackAssignment({
        targetDimension: dimension,
        studentName: 'Aarav',
        level: 2,
      })
      expect(() => assignmentResponseSchema.parse(brief)).not.toThrow()
      expect(brief.steps.length).toBeGreaterThanOrEqual(3)
      expect(brief.success_criteria.length).toBeGreaterThanOrEqual(2)
      expect(brief.title.length).toBeGreaterThan(6)
    }
  })
})

describe('the fallback report', () => {
  it('is valid and free of vocabulary a parent should not have to read', () => {
    const works = [0, 1, 2, 3, 4, 5].map((i) => work(`w${i}`, 90 - i * 14, 4 + i))
    const content = fallbackReport({
      studentName: 'Aarav Krishnan',
      analysis: analyseTrajectory(works),
      periodStart: works[0].captured_at,
      periodEnd: works[works.length - 1].captured_at,
      worksInPeriod: works.length,
    })
    expect(() => reportResponseSchema.parse(content)).not.toThrow()
    const text = `${content.headline} ${content.summary}`.toLowerCase()
    for (const banned of ['ai', 'algorithm', 'model']) {
      expect(text.split(/\W+/)).not.toContain(banned)
    }
  })
})
