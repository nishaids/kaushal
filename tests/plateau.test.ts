import { describe, expect, it } from 'vitest'
import { detectPlateaus, explainPlateau } from '@/lib/analytics/plateau'
import { linearSlopePerWeek, toTrajectoryPoints } from '@/lib/analytics/trajectory'
import { DIMENSIONS, type Dimension } from '@/lib/rubric'
import { PLATEAU } from '@/lib/constants'
import type { Score, ScoredWork } from '@/lib/types'

/**
 * Plateau detection is the product's central claim, and the claim is that it is
 * simple enough to check by hand. These tests check it by hand.
 */

const WEEK = 7 * 86_400_000
const NOW = new Date('2026-09-01T10:00:00.000Z')

function work(
  id: string,
  weeksAgoFromStart: number,
  values: Partial<Record<Dimension, number>>,
  opts: { confirmed?: boolean; startWeeksAgo?: number } = {},
): ScoredWork {
  const startWeeksAgo = opts.startWeeksAgo ?? 13
  const at = new Date(
    NOW.getTime() - startWeeksAgo * WEEK + weeksAgoFromStart * WEEK,
  ).toISOString()

  const scores: Score[] = DIMENSIONS.filter((d) => values[d] !== undefined).map(
    (d) => ({
      id: `${id}-${d}`,
      work_id: id,
      dimension: d,
      ai_score: values[d] ?? null,
      ai_rationale: 'test',
      ai_confidence: 0.8,
      source: 'gemini',
      confirmed_score: opts.confirmed === false ? null : (values[d] ?? null),
      confirmed_by: opts.confirmed === false ? null : 'instructor',
      confirmed_at: opts.confirmed === false ? null : at,
      created_at: at,
    }),
  )

  return {
    id,
    student_id: 'student-1',
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

/** Four dimensions climbing, value_range flat from week 7. The demo shape. */
function flatValueRange(): ScoredWork[] {
  const weeks = [0, 3.5, 7, 9, 11, 13]
  const series: Record<Dimension, number[]> = {
    proportion: [4, 5, 6, 7, 8, 9],
    line_control: [4, 4, 5, 6, 7, 8],
    value_range: [3, 5, 6, 6, 6, 6],
    edge_quality: [3, 4, 5, 6, 7, 8],
    composition: [4, 5, 6, 7, 8, 8],
  }
  return weeks.map((w, i) =>
    work(`w${i}`, w, {
      proportion: series.proportion[i],
      line_control: series.line_control[i],
      value_range: series.value_range[i],
      edge_quality: series.edge_quality[i],
      composition: series.composition[i],
    }),
  )
}

describe('linearSlopePerWeek', () => {
  it('is zero for a flat series', () => {
    const t0 = NOW.getTime()
    expect(
      linearSlopePerWeek([
        { t: t0, v: 6 },
        { t: t0 + WEEK, v: 6 },
        { t: t0 + 2 * WEEK, v: 6 },
      ]),
    ).toBe(0)
  })

  it('is one point per week for a series rising one a week', () => {
    const t0 = NOW.getTime()
    expect(
      linearSlopePerWeek([
        { t: t0, v: 1 },
        { t: t0 + WEEK, v: 2 },
        { t: t0 + 2 * WEEK, v: 3 },
      ]),
    ).toBeCloseTo(1, 6)
  })

  it('is negative for a falling series', () => {
    const t0 = NOW.getTime()
    expect(
      linearSlopePerWeek([
        { t: t0, v: 8 },
        { t: t0 + WEEK, v: 7 },
      ]),
    ).toBeCloseTo(-1, 6)
  })

  it('refuses to guess from fewer than two points or zero time variance', () => {
    expect(linearSlopePerWeek([{ t: NOW.getTime(), v: 5 }])).toBe(0)
    expect(
      linearSlopePerWeek([
        { t: NOW.getTime(), v: 5 },
        { t: NOW.getTime(), v: 9 },
      ]),
    ).toBe(0)
  })
})

describe('detectPlateaus', () => {
  it('finds the flat dimension while the others climb', () => {
    const found = detectPlateaus(flatValueRange(), NOW)
    expect(found).toHaveLength(1)
    expect(found[0].dimension).toBe('value_range')
  })

  it('reports a slope of zero and peers well above the threshold', () => {
    const [finding] = detectPlateaus(flatValueRange(), NOW)
    expect(Math.abs(finding.slope)).toBeLessThan(PLATEAU.flatSlope)
    expect(finding.peerSlope).toBeGreaterThan(PLATEAU.peerSlope)
    expect(finding.window).toBe(PLATEAU.window)
  })

  it('dates the run from where the dimension actually stopped, not earlier', () => {
    const works = flatValueRange()
    const [finding] = detectPlateaus(works, NOW)
    // Week 7 is the third work: the one before it reads 5, a full point below
    // the level of the run, so the walk-back must stop there.
    expect(finding.since).toBe(works[2].captured_at)
    expect(finding.weeksFlat).toBeGreaterThan(5.5)
    expect(finding.weeksFlat).toBeLessThan(6.5)
  })

  it('rates a six-week run against fast peers as high severity', () => {
    expect(detectPlateaus(flatValueRange(), NOW)[0].severity).toBe('high')
  })

  it('writes one sentence carrying both real numbers', () => {
    const [finding] = detectPlateaus(flatValueRange(), NOW)
    expect(finding.message).toContain('Value range')
    expect(finding.message).toContain('has not moved')
    expect(finding.message).toContain('0.00')
    expect(finding.message.split('.').filter((p) => p.trim()).length).toBeLessThanOrEqual(3)
  })

  it('says nothing when the whole student is resting', () => {
    // Every dimension flat: that is a rest, not a plateau, and the contrast
    // test is the entire reason the distinction exists.
    const weeks = [0, 3.5, 7, 9, 11, 13]
    const resting = weeks.map((w, i) =>
      work(`r${i}`, w, {
        proportion: 6,
        line_control: 6,
        value_range: 6,
        edge_quality: 6,
        composition: 6,
      }),
    )
    expect(detectPlateaus(resting, NOW)).toHaveLength(0)
  })

  it('says nothing before there are enough works to fit a line through', () => {
    const few = flatValueRange().slice(0, PLATEAU.minWorks - 1)
    expect(detectPlateaus(few, NOW)).toHaveLength(0)
  })

  it('says nothing when the flat run is younger than the minimum', () => {
    // The same shape, compressed so the whole record is two weeks old.
    const weeks = [0, 0.4, 0.8, 1.2, 1.6, 2]
    const recent = weeks.map((w, i) =>
      work(`s${i}`, w, {
        proportion: 4 + i,
        line_control: 4 + i,
        value_range: 6,
        edge_quality: 4 + i,
        composition: 4 + i,
      }, { startWeeksAgo: 2 }),
    )
    for (const f of detectPlateaus(recent, NOW)) {
      expect(f.weeksFlat).toBeGreaterThanOrEqual(PLATEAU.minWeeks)
    }
  })

  it('calls a falling dimension fallen rather than flat', () => {
    const weeks = [0, 3.5, 7, 9, 11, 13]
    const falling = weeks.map((w, i) =>
      work(`f${i}`, w, {
        proportion: [4, 5, 6, 7, 8, 9][i],
        line_control: [4, 5, 6, 7, 8, 9][i],
        value_range: [8, 8, 8, 7, 6, 5][i],
        edge_quality: [4, 5, 6, 7, 8, 9][i],
        composition: [4, 5, 6, 7, 8, 9][i],
      }),
    )
    const finding = detectPlateaus(falling, NOW).find(
      (f) => f.dimension === 'value_range',
    )
    expect(finding).toBeDefined()
    expect(finding!.message).toContain('has fallen')
    expect(finding!.slope).toBeLessThan(0)
  })

  it('survives a record with no scores at all without throwing', () => {
    const empty = [work('e0', 0, {}), work('e1', 4, {}), work('e2', 8, {})]
    expect(() => detectPlateaus(empty, NOW)).not.toThrow()
    expect(detectPlateaus(empty, NOW)).toHaveLength(0)
  })

  it('ignores calibration works entirely', () => {
    const works = flatValueRange().map((w) => ({ ...w, is_calibration: true }))
    expect(toTrajectoryPoints(works)).toHaveLength(0)
    expect(detectPlateaus(works, NOW)).toHaveLength(0)
  })

  it('explains itself with the window, both slopes and the date', () => {
    const [finding] = detectPlateaus(flatValueRange(), NOW)
    const text = explainPlateau(finding)
    expect(text).toContain(String(PLATEAU.window))
    expect(text).toContain('a week')
    expect(text.length).toBeGreaterThan(80)
  })
})

describe('toTrajectoryPoints', () => {
  it('marks a point confirmed only where the instructor confirmed it', () => {
    const works = [
      work('a', 0, { value_range: 5 }, { confirmed: true }),
      work('b', 4, { value_range: 6 }, { confirmed: false }),
    ]
    const points = toTrajectoryPoints(works)
    expect(points[0].confirmed.value_range).toBe(true)
    expect(points[1].confirmed.value_range).toBe(false)
    expect(points[1].values.value_range).toBe(6)
  })

  it('returns points oldest first regardless of input order', () => {
    const works = [work('late', 10, { value_range: 7 }), work('early', 0, { value_range: 3 })]
    const points = toTrajectoryPoints(works)
    expect(points[0].values.value_range).toBe(3)
    expect(points[1].values.value_range).toBe(7)
  })
})
