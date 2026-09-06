import { describe, expect, it } from 'vitest'
import { assessQuality } from '@/lib/metrics/quality-gate'
import { detectSignals, evidenceFor, MIN_OBSERVATIONS } from '@/lib/analytics/signals'
import type { Dimension } from '@/lib/rubric'
import type { ImageMetrics, Score, ScoredWork } from '@/lib/types'

const NOW = new Date('2026-09-01T10:00:00.000Z')
const WEEK = 7 * 86_400_000

function metrics(over: Partial<ImageMetrics> = {}): ImageMetrics {
  return {
    histogram: Array.from({ length: 16 }, () => 1 / 16),
    darkest: 0.06,
    lightest: 0.94,
    valueSpread: 0.88,
    contrastSd: 0.22,
    inkCoverage: 0.3,
    edgeDensity: 0.08,
    edgeVariance: 0.05,
    borderEnergy: 0.4,
    massCenter: { x: 0.5, y: 0.5 },
    emptyShare: 0.3,
    strokeCoherence: 0.7,
    width: 1600,
    height: 1200,
    ...over,
  }
}

/** Histogram with `share` of the frame blown out into the top bucket. */
function glaring(share: number): number[] {
  const h = Array.from({ length: 16 }, () => (1 - share) / 15)
  h[15] = share
  return h
}

describe('the media quality gate', () => {
  it('passes a sharp, well-lit, well-framed photo', () => {
    const r = assessQuality(metrics())
    expect(r.verdict).toBe('good')
    expect(r.assessable).toBe(true)
  })

  it('blocks a blurred photo and says what to do about it', () => {
    const r = assessQuality(metrics({ edgeDensity: 0.004 }))
    expect(r.verdict).toBe('retake')
    expect(r.assessable).toBe(false)
    const blur = r.issues.find((i) => i.code === 'blurred')!
    expect(blur.severity).toBe('blocking')
    expect(blur.fix.toLowerCase()).toContain('focus')
  })

  it('blocks a photo that is mostly blown out', () => {
    const r = assessQuality(metrics({ histogram: glaring(0.3) }))
    expect(r.issues.some((i) => i.code === 'glare' && i.severity === 'blocking')).toBe(true)
    expect(r.assessable).toBe(false)
  })

  it('blocks a screenshot-sized image', () => {
    const r = assessQuality(metrics({ width: 320, height: 240 }))
    expect(r.issues.some((i) => i.code === 'low_resolution')).toBe(true)
    expect(r.assessable).toBe(false)
  })

  it('blocks a photo shot in the dark', () => {
    const r = assessQuality(metrics({ lightest: 0.3 }))
    expect(r.issues.some((i) => i.code === 'underexposed')).toBe(true)
    expect(r.assessable).toBe(false)
  })

  it('warns without blocking when the work runs off the edge', () => {
    const r = assessQuality(metrics({ borderEnergy: 0.85 }))
    expect(r.issues.some((i) => i.code === 'crowded_frame')).toBe(true)
    expect(r.assessable).toBe(true)
  })

  it('warns when the work sits well off to one side', () => {
    const r = assessQuality(metrics({ massCenter: { x: 0.86, y: 0.5 } }))
    expect(r.issues.some((i) => i.code === 'off_centre')).toBe(true)
  })

  it('gives every issue an action, never just a complaint', () => {
    const r = assessQuality(
      metrics({ edgeDensity: 0.004, width: 300, height: 220, lightest: 0.2 }),
    )
    for (const issue of r.issues) {
      expect(issue.message.length).toBeGreaterThan(10)
      expect(issue.fix.length).toBeGreaterThan(10)
    }
  })

  it('does not block when it has nothing to go on', () => {
    // Unmeasured media is unknown, not bad. Blocking here would stop uploads
    // from any path that has not been through the browser measurement.
    const r = assessQuality(null)
    expect(r.assessable).toBe(true)
    expect(r.verdict).toBe('usable')
  })
})

/* ------------------------------------------------------------------ */

function work(
  id: string,
  weeksAgo: number,
  values: Record<string, number>,
  difficulty: number | null = null,
): ScoredWork {
  const at = new Date(NOW.getTime() - weeksAgo * WEEK).toISOString()
  const scores: Score[] = Object.entries(values).map(([dimension, v]) => ({
    id: `${id}-${dimension}`,
    work_id: id,
    dimension: dimension as Dimension,
    ai_score: v,
    ai_rationale: 'test',
    ai_confidence: 0.8,
    source: 'gemini',
    confirmed_score: v,
    confirmed_by: 'i1',
    confirmed_at: at,
    created_at: at,
  }))
  return {
    id,
    student_id: 's1',
    image_url: 'data:,',
    thumb_url: null,
    captured_at: at,
    assignment_id: null,
    notes: null,
    is_calibration: false,
    difficulty,
    quality: null,
    metrics: null,
    created_at: at,
    scores,
  }
}

/** Series builder: weeksAgo descending so the last entry is the most recent. */
function series(rows: Array<{ w: number; v: Record<string, number>; d?: number }>) {
  return rows.map((r, i) => work(`w${i}`, r.w, r.v, r.d ?? null))
}

describe('learning signals', () => {
  it('says nothing at all when there is not enough evidence', () => {
    const works = series([
      { w: 4, v: { a: 5, b: 5 } },
      { w: 2, v: { a: 5, b: 6 } },
    ])
    expect(detectSignals(works, { now: NOW })).toHaveLength(0)
  })

  it('grades evidence rather than asserting equally from any sample', () => {
    expect(evidenceFor(3, 2)).toBe('low')
    expect(evidenceFor(6, 4)).toBe('moderate')
    expect(evidenceFor(10, 8)).toBe('strong')
  })

  it('finds a plateau only when the rest of the learner is moving', () => {
    const climbing = series([
      { w: 12, v: { flat: 6, other: 3, third: 3 } },
      { w: 9, v: { flat: 6, other: 4, third: 4 } },
      { w: 6, v: { flat: 6, other: 5, third: 5 } },
      { w: 3, v: { flat: 6, other: 6, third: 6 } },
      { w: 0, v: { flat: 6, other: 7, third: 7 } },
    ])
    const signals = detectSignals(climbing, { now: NOW })
    const plateau = signals.find((s) => s.kind === 'plateau')
    expect(plateau?.dimension).toBe('flat')
    expect(plateau?.message).toContain('has not moved')
  })

  it('calls a whole-learner flat run a rest, not a plateau', () => {
    const resting = series([
      { w: 12, v: { a: 6, b: 6, c: 6 } },
      { w: 9, v: { a: 6, b: 6, c: 6 } },
      { w: 6, v: { a: 6, b: 6, c: 6 } },
      { w: 3, v: { a: 6, b: 6, c: 6 } },
      { w: 0, v: { a: 6, b: 6, c: 6 } },
    ])
    expect(detectSignals(resting, { now: NOW }).some((s) => s.kind === 'plateau')).toBe(
      false,
    )
  })

  it('does not call a stretch a decline', () => {
    // The scores drop, but every recent submission was a harder task. This is
    // the exact case the old single-signal detector got wrong.
    const stretching = series([
      { w: 12, v: { a: 7, b: 7 }, d: 1 },
      { w: 9, v: { a: 7, b: 7 }, d: 1 },
      { w: 6, v: { a: 6, b: 7 }, d: 2 },
      { w: 3, v: { a: 6, b: 7 }, d: 2 },
      { w: 0, v: { a: 6, b: 7 }, d: 2 },
    ])
    const decline = detectSignals(stretching, { now: NOW }).find(
      (s) => s.kind === 'decline' && s.dimension === 'a',
    )
    expect(decline).toBeUndefined()
  })

  it('still reports a genuine decline at unchanged difficulty', () => {
    const falling = series([
      { w: 12, v: { a: 9, b: 6 }, d: 1 },
      { w: 9, v: { a: 8, b: 6 }, d: 1 },
      { w: 6, v: { a: 7, b: 6 }, d: 1 },
      { w: 3, v: { a: 6, b: 6 }, d: 1 },
      { w: 0, v: { a: 5, b: 6 }, d: 1 },
    ])
    const decline = detectSignals(falling, { now: NOW }).find(
      (s) => s.kind === 'decline' && s.dimension === 'a',
    )
    expect(decline).toBeDefined()
    expect(decline!.tone).toBe('concern')
  })

  it('notices a breakthrough after a flat run and frames it positively', () => {
    const jump = series([
      { w: 15, v: { a: 5, b: 5 } },
      { w: 12, v: { a: 5, b: 5 } },
      { w: 9, v: { a: 5, b: 5 } },
      { w: 6, v: { a: 5, b: 5 } },
      { w: 3, v: { a: 7, b: 5 } },
      { w: 0, v: { a: 7, b: 5 } },
    ])
    const s = detectSignals(jump, { now: NOW }).find((x) => x.kind === 'breakthrough')
    expect(s).toBeDefined()
    expect(s!.tone).toBe('positive')
  })

  it('separates swinging from trending', () => {
    const erratic = series([
      { w: 12, v: { a: 4, b: 6 } },
      { w: 9, v: { a: 8, b: 6 } },
      { w: 6, v: { a: 3, b: 6 } },
      { w: 3, v: { a: 8, b: 6 } },
      { w: 0, v: { a: 4, b: 6 } },
    ])
    const s = detectSignals(erratic, { now: NOW }).find((x) => x.kind === 'inconsistent')
    expect(s).toBeDefined()
    expect(s!.message).toContain('swinging')
  })

  it('flags a student coasting on unchanged difficulty', () => {
    const coasting = series([
      { w: 12, v: { a: 9, b: 9 }, d: 1 },
      { w: 9, v: { a: 9, b: 9 }, d: 1 },
      { w: 6, v: { a: 9, b: 9 }, d: 1 },
      { w: 3, v: { a: 9, b: 9 }, d: 1 },
      { w: 0, v: { a: 9, b: 9 }, d: 1 },
    ])
    expect(
      detectSignals(coasting, { now: NOW }).some((s) => s.kind === 'under_challenged'),
    ).toBe(true)
  })

  it('reads everything-low as the task being too hard, not the student failing', () => {
    const struggling = series([
      { w: 9, v: { a: 3, b: 3, c: 3 } },
      { w: 6, v: { a: 3, b: 3, c: 3 } },
      { w: 3, v: { a: 3, b: 3, c: 3 } },
      { w: 0, v: { a: 3, b: 3, c: 3 } },
    ])
    const s = detectSignals(struggling, { now: NOW }).find(
      (x) => x.kind === 'over_challenged',
    )
    expect(s).toBeDefined()
    expect(s!.message).toContain('pitched above')
  })

  it('never labels a student, only describes the work', () => {
    // The rule is that the product never labels a *student*. Describing a
    // dimension as low or behind is accurate and allowed; describing a child
    // as weak or lazy is not.
    const banned = [
      'lazy',
      'untalented',
      'unmotivated',
      'weak student',
      'poor student',
      'bad student',
      'low performer',
      'struggling student',
      'gifted',
    ]
    const works = series([
      { w: 12, v: { a: 3, b: 8 } },
      { w: 9, v: { a: 3, b: 8 } },
      { w: 6, v: { a: 3, b: 8 } },
      { w: 3, v: { a: 3, b: 8 } },
      { w: 0, v: { a: 3, b: 8 } },
    ])
    for (const s of detectSignals(works, { now: NOW })) {
      const text = `${s.message} ${s.explanation}`.toLowerCase()
      for (const word of banned) expect(text).not.toContain(word)
    }
  })

  it('carries evidence and observation count on every signal', () => {
    const works = series([
      { w: 12, v: { a: 6, b: 3 } },
      { w: 9, v: { a: 6, b: 4 } },
      { w: 6, v: { a: 6, b: 5 } },
      { w: 3, v: { a: 6, b: 6 } },
      { w: 0, v: { a: 6, b: 7 } },
    ])
    for (const s of detectSignals(works, { now: NOW })) {
      expect(['low', 'moderate', 'strong']).toContain(s.evidence)
      expect(s.observations).toBeGreaterThanOrEqual(MIN_OBSERVATIONS)
      expect(s.explanation.length).toBeGreaterThan(40)
    }
  })

  it('uses the rubric label rather than the raw key', () => {
    const works = series([
      { w: 12, v: { bowing_technique: 6, tone: 3 } },
      { w: 9, v: { bowing_technique: 6, tone: 4 } },
      { w: 6, v: { bowing_technique: 6, tone: 5 } },
      { w: 3, v: { bowing_technique: 6, tone: 6 } },
      { w: 0, v: { bowing_technique: 6, tone: 7 } },
    ])
    const signals = detectSignals(works, {
      now: NOW,
      label: (d) => (d === 'bowing_technique' ? 'Bowing technique' : 'Tone'),
    })
    expect(signals.some((s) => s.message.includes('Bowing technique'))).toBe(true)
  })

  it('works on a rubric that has nothing to do with drawing', () => {
    const coding = series([
      { w: 12, v: { correctness: 6, debugging: 3, structure: 4 } },
      { w: 9, v: { correctness: 6, debugging: 4, structure: 5 } },
      { w: 6, v: { correctness: 6, debugging: 5, structure: 6 } },
      { w: 3, v: { correctness: 6, debugging: 6, structure: 7 } },
      { w: 0, v: { correctness: 6, debugging: 7, structure: 8 } },
    ])
    const s = detectSignals(coding, { now: NOW })
    expect(s.some((x) => x.dimension === 'correctness' && x.kind === 'plateau')).toBe(true)
  })
})
