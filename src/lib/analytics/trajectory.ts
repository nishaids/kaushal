import { DIMENSIONS } from '../rubric'
import type { Dimension } from '../rubric'
import type {
  Score,
  ScoredWork,
  TrajectoryAnalysis,
  TrajectoryPoint,
} from '../types'
import { detectPlateaus } from './plateau'

/**
 * Trajectory maths.
 *
 * Everything here is ordinary least squares on a handful of points. That is a
 * deliberate ceiling: an instructor or a parent must be able to follow the
 * claim "this line is going up 0.3 points a week" without taking anything on
 * faith, so there is no smoothing, no weighting and no model.
 *
 * Note the small import cycle with ./plateau — plateau reads the primitives
 * here, analyseTrajectory reports its findings. Neither module touches the
 * other at evaluation time, so the cycle is inert.
 */

const MS_PER_WEEK = 604_800_000

/** The number that counts: the instructor's, or the model's until they rule. */
export function effectiveScore(s: Score): number | null {
  const v = s.confirmed_score ?? s.ai_score
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** True once an instructor has put their own number on this dimension. */
export function isConfirmed(s: Score): boolean {
  return typeof s.confirmed_score === 'number' && Number.isFinite(s.confirmed_score)
}

/**
 * One chart point per work, oldest first. Calibration anchors are onboarding
 * exercises, not part of anybody's record, so they are excluded here and
 * everywhere downstream.
 */
export function toTrajectoryPoints(works: ScoredWork[]): TrajectoryPoint[] {
  const dated: Array<{ work: ScoredWork; t: number }> = []
  for (const work of works) {
    if (work.is_calibration) continue
    const t = Date.parse(work.captured_at)
    // A work we cannot place in time cannot be plotted or fitted. Dropping it
    // is the only option that does not put NaN into a chart.
    if (!Number.isFinite(t)) continue
    dated.push({ work, t })
  }

  dated.sort((a, b) => a.t - b.t || a.work.id.localeCompare(b.work.id))

  return dated.map(({ work, t }) => {
    const chosen = new Map<Dimension, Score>()
    for (const s of work.scores) {
      chosen.set(s.dimension, preferredScore(chosen.get(s.dimension), s))
    }

    const values: Partial<Record<Dimension, number>> = {}
    const confirmed: Partial<Record<Dimension, boolean>> = {}
    let confirmedCount = 0

    for (const d of DIMENSIONS) {
      const s = chosen.get(d)
      if (!s) continue
      const v = effectiveScore(s)
      if (v !== null) values[d] = v
      const inked = isConfirmed(s)
      confirmed[d] = inked
      if (inked) confirmedCount += 1
    }

    return {
      work_id: work.id,
      captured_at: work.captured_at,
      t,
      thumb_url: work.thumb_url,
      values,
      confirmed,
      fullyConfirmed: confirmedCount === DIMENSIONS.length,
    }
  })
}

/**
 * Least-squares slope of v against time, in points per week.
 *
 * Returns 0 rather than throwing or returning NaN when there is nothing to
 * fit: fewer than two points, or every point on the same day.
 */
export function linearSlopePerWeek(points: Array<{ t: number; v: number }>): number {
  const usable = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
  const n = usable.length
  if (n < 2) return 0

  let sumX = 0
  let sumY = 0
  for (const p of usable) {
    sumX += p.t / MS_PER_WEEK
    sumY += p.v
  }
  const meanX = sumX / n
  const meanY = sumY / n

  let covariance = 0
  let variance = 0
  for (const p of usable) {
    const dx = p.t / MS_PER_WEEK - meanX
    covariance += dx * (p.v - meanY)
    variance += dx * dx
  }

  if (variance === 0) return 0
  const slope = covariance / variance
  return Number.isFinite(slope) ? slope : 0
}

/** Everything the student page needs about one student's record. */
export function analyseTrajectory(works: ScoredWork[]): TrajectoryAnalysis {
  const points = toTrajectoryPoints(works)

  const latest: Partial<Record<Dimension, number>> = {}
  const series = new Map<Dimension, Array<{ t: number; v: number }>>()
  for (const d of DIMENSIONS) series.set(d, [])

  for (const p of points) {
    for (const d of DIMENSIONS) {
      const v = p.values[d]
      if (v === undefined) continue
      latest[d] = v
      series.get(d)?.push({ t: p.t, v })
    }
  }

  const slopes: Partial<Record<Dimension, number>> = {}
  for (const d of DIMENSIONS) {
    const s = series.get(d)
    if (!s || s.length === 0) continue
    slopes[d] = linearSlopePerWeek(s)
  }

  // Lowest latest score wins; a tie goes to whichever is climbing more slowly,
  // because that is the one that will still be lowest next month.
  let weakest: { dimension: Dimension; value: number } | null = null
  for (const d of DIMENSIONS) {
    const value = latest[d]
    if (value === undefined) continue
    if (weakest === null || value < weakest.value) {
      weakest = { dimension: d, value }
      continue
    }
    if (value === weakest.value) {
      const here = slopes[d] ?? 0
      const best = slopes[weakest.dimension] ?? 0
      if (here < best) weakest = { dimension: d, value }
    }
  }

  let scoreCount = 0
  let confirmedCount = 0
  for (const work of works) {
    if (work.is_calibration) continue
    for (const s of work.scores) {
      scoreCount += 1
      if (isConfirmed(s)) confirmedCount += 1
    }
  }

  return {
    points,
    latest,
    slopes,
    plateaus: detectPlateaus(works),
    weakest,
    confirmedShare: scoreCount === 0 ? 0 : confirmedCount / scoreCount,
  }
}

/**
 * A dimension can carry more than one score row for a work — a model proposal
 * and, later, the instructor's confirmation. The instructor's always wins, and
 * between two of the same kind the newer row wins.
 */
function preferredScore(current: Score | undefined, next: Score): Score {
  if (!current) return next
  const currentInked = isConfirmed(current)
  const nextInked = isConfirmed(next)
  if (currentInked !== nextInked) return nextInked ? next : current
  return Date.parse(next.created_at) >= Date.parse(current.created_at) ? next : current
}
