import { RUBRIC } from '../rubric'
import type { Alert, ScoredWork } from '../types'
import { DORMANT_DAYS } from '../constants'
import { daysBetween, longDate } from '../utils/format'
import { detectPlateaus } from './plateau'
import { analyseTrajectory } from './trajectory'

/**
 * Deriving what is wrong with a student's record.
 *
 * This is a pure function over works, which matters twice over. The cohort
 * screen calls it on read, so sixty-two students are triaged honestly the
 * moment the page loads rather than only after somebody presses a button. The
 * alerts action calls the same function before writing, so what is stored and
 * what is shown can never disagree.
 *
 * Running it across 62 students with a dozen works each costs a few
 * milliseconds, which is cheaper than being wrong.
 */

export type DerivedAlert = Omit<Alert, 'id' | 'resolved_at'>

/** A falling dimension is a different problem from one that merely stopped. */
const REGRESSION_SLOPE = -0.15
const REGRESSION_SEVERE = -0.3

export function deriveAlerts(
  studentId: string,
  works: ScoredWork[],
  now: Date = new Date(),
): DerivedAlert[] {
  const out: DerivedAlert[] = []
  const detectedAt = now.toISOString()

  for (const p of detectPlateaus(works, now)) {
    out.push({
      student_id: studentId,
      dimension: p.dimension,
      type: 'plateau',
      message: p.message,
      severity: p.severity,
      detected_at: detectedAt,
    })
  }

  const analysis = analyseTrajectory(works)
  for (const [dim, slope] of Object.entries(analysis.slopes)) {
    if (typeof slope !== 'number' || slope > REGRESSION_SLOPE) continue
    const key = dim as keyof typeof RUBRIC
    // A dimension already flagged as a plateau does not need a second flag.
    if (out.some((a) => a.dimension === key)) continue
    out.push({
      student_id: studentId,
      dimension: key,
      type: 'regression',
      message: `${RUBRIC[key].longLabel} has been falling — ${slope.toFixed(2).replace('-', '−')} points a week across the whole record.`,
      severity: slope <= REGRESSION_SEVERE ? 'high' : 'medium',
      detected_at: detectedAt,
    })
  }

  if (works.length > 0) {
    const last = works[works.length - 1]
    const days = daysBetween(last.captured_at, now)
    if (days > DORMANT_DAYS) {
      out.push({
        student_id: studentId,
        dimension: null,
        type: 'dormant',
        message: `No work recorded for ${days} days. The last one was on ${longDate(last.captured_at)}.`,
        severity: days > DORMANT_DAYS * 2 ? 'high' : 'medium',
        detected_at: detectedAt,
      })
    }
  }

  return out
}

/**
 * Give derived alerts stable ids so React can key them and so a cohort row
 * built from derived alerts behaves exactly like one built from stored rows.
 * The id is deterministic, which means it does not change on every render.
 */
export function asAlerts(derived: DerivedAlert[]): Alert[] {
  return derived.map((a) => ({
    ...a,
    id: `derived:${a.student_id}:${a.type}:${a.dimension ?? 'none'}`,
    resolved_at: null,
  }))
}
