import { PLATEAU } from '../constants'
import { DIMENSIONS, RUBRIC } from '../rubric'
import type { Dimension } from '../rubric'
import type { PlateauFinding, ScoredWork, TrajectoryPoint } from '../types'
import { longDate, pluralise } from '../utils/format'
import { linearSlopePerWeek, toTrajectoryPoints } from './trajectory'

/**
 * Plateau detection.
 *
 * The whole idea is a contrast, not a threshold. A student who stops for a
 * fortnight is resting, and every line goes flat together; that is not worth
 * an instructor's attention. A plateau is one dimension standing still while
 * the same student, on the same works, keeps improving in the other four.
 *
 * The method, in full: fit a least-squares line through the last
 * PLATEAU.window works for each dimension, in points per week. Flag a
 * dimension when its line is below PLATEAU.flatSlope and the mean line of the
 * other four is at least PLATEAU.peerSlope. Every one of those numbers is
 * shown in the UI, because a threshold nobody can see is a threshold nobody
 * can argue with.
 */

const MS_PER_WEEK = 604_800_000

/** Two points make a line. Fewer is not an estimate, it is a guess. */
const MIN_POINTS_FOR_LINE = 2

/** Below this the printed rate is just noise on the last decimal. */
const RATE_EPSILON = 0.005

/**
 * How far a score may sit from the level of a flat run and still count as part
 * of it. Three quarters of a point: inside the rounding an instructor would
 * argue about, outside the gap between two rungs of the rubric. It stops a
 * genuine climb from being absorbed into the plateau behind it just because a
 * long enough flat tail drags the aggregate line down.
 */
const FLAT_BAND = 0.75

/** U+2212. A hyphen in front of a number is a typographic error. */
const MINUS = '−'

const SEVERITY = {
  /** A flat run this long, against peers climbing this fast, is urgent. */
  highWeeks: 6,
  highPeerSlope: 0.2,
  mediumWeeks: 4,
} as const

/** The method line rendered under the trajectory chart. */
export const PLATEAU_METHOD_SENTENCE =
  `We fit a straight line through the last ${PLATEAU.window} works for each dimension. ` +
  `A dimension is flagged when its line is flat — under ${PLATEAU.flatSlope} points a week — ` +
  `and the other four are still climbing at ${PLATEAU.peerSlope} a week or more.`

/**
 * Find the dimensions that have stopped moving while the rest of the student
 * kept going. Returns an empty list — never a guess — when the record is too
 * short or too new to support the claim.
 */
export function detectPlateaus(works: ScoredWork[], now: Date = new Date()): PlateauFinding[] {
  const points = toTrajectoryPoints(works)
  if (points.length < PLATEAU.minWorks) return []

  const windowStart = Math.max(0, points.length - PLATEAU.window)
  const windowPoints = points.slice(windowStart)

  // One fit per dimension over the window. null means the dimension was not
  // scored often enough in this window to fit anything.
  const windowSlopes = new Map<Dimension, number | null>()
  for (const d of DIMENSIONS) {
    const series = seriesFor(windowPoints, d)
    windowSlopes.set(
      d,
      series.length >= MIN_POINTS_FOR_LINE ? linearSlopePerWeek(series) : null,
    )
  }

  const nowMs = now.getTime()
  const findings: PlateauFinding[] = []

  for (const dimension of DIMENSIONS) {
    const slope = windowSlopes.get(dimension) ?? null
    if (slope === null) continue
    if (slope >= PLATEAU.flatSlope) continue

    const peers: number[] = []
    for (const other of DIMENSIONS) {
      if (other === dimension) continue
      const s = windowSlopes.get(other) ?? null
      if (s !== null) peers.push(s)
    }
    if (peers.length === 0) continue

    const peerSlope = peers.reduce((total, s) => total + s, 0) / peers.length
    // The contrast test. Without it this is a rest, not a plateau.
    if (peerSlope < PLATEAU.peerSlope) continue

    const since = flatRunStartedAt(points, dimension, windowStart)
    const sinceMs = Date.parse(since)
    if (!Number.isFinite(sinceMs)) continue

    const weeksFlat = (nowMs - sinceMs) / MS_PER_WEEK
    if (!Number.isFinite(weeksFlat) || weeksFlat < PLATEAU.minWeeks) continue

    const weeks = Math.round(weeksFlat)
    const severity: PlateauFinding['severity'] =
      weeksFlat >= SEVERITY.highWeeks && peerSlope >= SEVERITY.highPeerSlope
        ? 'high'
        : weeksFlat >= SEVERITY.mediumWeeks
          ? 'medium'
          : 'low'

    const label = RUBRIC[dimension].longLabel
    // Falling and flat are different problems, and the boundary between them
    // is the same flatness threshold used to raise the flag in the first place.
    const stalled =
      slope <= -PLATEAU.flatSlope
        ? `has fallen for ${pluralise(weeks, 'week')}`
        : `has not moved in ${pluralise(weeks, 'week')}`

    findings.push({
      dimension,
      slope,
      peerSlope,
      window: windowPoints.length,
      since,
      weeksFlat,
      severity,
      message:
        `${label} ${stalled} — ${rate(slope)} points a week — while the other four ` +
        `dimensions rose ${rate(peerSlope)} a week over the same ` +
        `${pluralise(windowPoints.length, 'work')}.`,
    })
  }

  return findings
}

/** The longer version, for the tooltip behind the one-sentence flag. */
export function explainPlateau(f: PlateauFinding): string {
  const label = RUBRIC[f.dimension].longLabel
  return (
    `We fit a line through the last ${pluralise(f.window, 'work')}. ` +
    `${label} is moving at ${rate(f.slope)} points a week; the other four average ` +
    `${rate(f.peerSlope)} a week over exactly the same works. ` +
    `It has been this way since the work of ${longDate(f.since)}, ` +
    `${pluralise(Math.round(f.weeksFlat), 'week')} ago.`
  )
}

/** The scores for one dimension, as (time, value) pairs the fit can take. */
function seriesFor(points: TrajectoryPoint[], d: Dimension): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = []
  for (const p of points) {
    const v = p.values[d]
    if (v === undefined) continue
    out.push({ t: p.t, v })
  }
  return out
}

/**
 * How far back the flatness actually goes.
 *
 * The window is where the flag is decided, but the run usually started
 * earlier. We walk backwards one work at a time and extend the run while two
 * things hold: the line through everything from there to today is still flat,
 * AND the work we are about to swallow sits at the same level as the run
 * rather than below it. The second test is what keeps the answer honest — a
 * student who climbed for a month and then stopped has a plateau that started
 * when they stopped, not when they began.
 *
 * Cost is quadratic in one student's works, which is tens, not thousands.
 */
function flatRunStartedAt(
  points: TrajectoryPoint[],
  d: Dimension,
  windowStart: number,
): string {
  let start = windowStart
  let runMean = meanFor(points.slice(windowStart), d)

  for (let i = windowStart - 1; i >= 0; i -= 1) {
    const candidate = points[i].values[d]
    if (candidate === undefined) continue
    if (runMean !== null && Math.abs(candidate - runMean) > FLAT_BAND) break

    const series = seriesFor(points.slice(i), d)
    if (series.length < MIN_POINTS_FOR_LINE) break
    if (linearSlopePerWeek(series) >= PLATEAU.flatSlope) break

    start = i
    runMean = meanFor(points.slice(i), d)
  }
  for (let i = start; i < points.length; i += 1) {
    if (points[i].values[d] !== undefined) return points[i].captured_at
  }
  return points[start].captured_at
}

/** The level a run is sitting at, or null when it carries no scores. */
function meanFor(points: TrajectoryPoint[], d: Dimension): number | null {
  const series = seriesFor(points, d)
  if (series.length === 0) return null
  return series.reduce((total, p) => total + p.v, 0) / series.length
}

/** "0.31", "−0.04". Two decimals, a real minus sign, no plus sign. */
function rate(n: number): string {
  const v = Math.abs(n) < RATE_EPSILON ? 0 : n
  return `${v < 0 ? MINUS : ''}${Math.abs(v).toFixed(2)}`
}
