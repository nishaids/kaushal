import { DORMANT_DAYS, PLATEAU } from '../constants'
import type { Dimension } from '../rubric'
import type { Alert, CohortRow, ScoredWork, Student } from '../types'
import { pluralise } from '../utils/format'
import { isConfirmed, linearSlopePerWeek, toTrajectoryPoints } from './trajectory'

/**
 * The cohort table.
 *
 * Attention is the only number in the product that is not a score, so it is
 * built to be taken apart: a short list of additive reasons, each with a fixed
 * weight, capped at 100. attentionReason names the largest reason in words, so
 * an instructor never has to ask what "92" meant.
 */

const DAY = 86_400_000

const WEIGHT = {
  alertHigh: 40,
  alertMedium: 25,
  alertLow: 12,
  dormant: 20,
  neverSubmitted: 15,
  /** Maximum, scaled by how fast the student is falling. */
  regression: 15,
  unconfirmed: 8,
} as const

/** Falling half a point a week is as bad as the regression term gets. */
const REGRESSION_FULL_SCALE = 0.5

const ATTENTION_CAP = 100

/** Two points make a line. Fewer is not an estimate, it is a guess. */
const MIN_POINTS_FOR_LINE = 2

const SEVERITY_RANK: Record<Alert['severity'], number> = { high: 0, medium: 1, low: 2 }

export type CohortSortKey = 'attention' | 'name' | 'recent' | 'momentum' | 'mean' | 'works'

interface Contribution {
  points: number
  /** A noun phrase. It has to survive being dropped into a sentence. */
  label: string
}

/**
 * One row per student, ready to render and sort. Linear in the number of
 * works, so a 60-student academy with 20 works each is a single pass.
 */
export function buildCohortRows(input: {
  students: Student[]
  worksByStudent: Map<string, ScoredWork[]>
  alertsByStudent: Map<string, Alert[]>
  now?: Date
}): CohortRow[] {
  const nowMs = (input.now ?? new Date()).getTime()
  const rows: CohortRow[] = []

  for (const student of input.students) {
    const works = input.worksByStudent.get(student.id) ?? []
    const points = toTrajectoryPoints(works)

    let worksCount = 0
    let unconfirmedCount = 0
    for (const w of works) {
      if (w.is_calibration) continue
      worksCount += 1
      for (const s of w.scores) {
        if (!isConfirmed(s)) unconfirmedCount += 1
      }
    }

    const last = points.length > 0 ? points[points.length - 1] : null
    const lastWorkAt = last ? last.captured_at : null
    const daysSinceLastWork = last
      ? Math.max(0, Math.floor((nowMs - last.t) / DAY))
      : null

    // The keys this student has actually been scored on, rather than a fixed
    // list — an academy's rubric may have three dimensions or nine.
    const dimensionKeys: Dimension[] = []
    const seenKeys = new Set<Dimension>()
    for (const p of points) {
      for (const k of Object.keys(p.values)) {
        if (!seenKeys.has(k)) {
          seenKeys.add(k)
          dimensionKeys.push(k)
        }
      }
    }

    const latest: Partial<Record<Dimension, number>> = {}
    for (const p of points) {
      for (const d of dimensionKeys) {
        const v = p.values[d]
        if (v !== undefined) latest[d] = v
      }
    }

    const values = dimensionKeys.map((d) => latest[d]).filter(
      (v): v is number => v !== undefined,
    )
    const mean =
      values.length === 0
        ? null
        : round2(values.reduce((total, v) => total + v, 0) / values.length)

    // Momentum is the mean dimension slope over the same recent window the
    // plateau detector uses, so the two never tell different stories.
    const windowPoints = points.slice(Math.max(0, points.length - PLATEAU.window))
    const dimensionSlopes: number[] = []
    for (const d of dimensionKeys) {
      const series: Array<{ t: number; v: number }> = []
      for (const p of windowPoints) {
        const v = p.values[d]
        if (v !== undefined) series.push({ t: p.t, v })
      }
      if (series.length >= MIN_POINTS_FOR_LINE) {
        dimensionSlopes.push(linearSlopePerWeek(series))
      }
    }
    const momentum =
      dimensionSlopes.length === 0
        ? null
        : round2(
            dimensionSlopes.reduce((total, s) => total + s, 0) /
              dimensionSlopes.length,
          )

    // The row carries open alerts only, worst first. A resolved alert is
    // history, and history does not belong in a queue of work to do.
    const alerts = (input.alertsByStudent.get(student.id) ?? [])
      .filter((a) => a.resolved_at === null)
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          Date.parse(b.detected_at) - Date.parse(a.detected_at) ||
          a.id.localeCompare(b.id),
      )

    const row: CohortRow = {
      student,
      worksCount,
      lastWorkAt,
      daysSinceLastWork,
      latest,
      mean,
      momentum,
      alerts,
      attention: 0,
      unconfirmedCount,
    }
    row.attention = Math.min(
      ATTENTION_CAP,
      Math.round(contributions(row).reduce((total, c) => total + c.points, 0)),
    )
    rows.push(row)
  }

  return rows
}

/**
 * Stable sort. Nulls sink to the bottom whichever way the column points, and
 * every tie breaks on name, so a re-render never reshuffles rows under the
 * instructor's cursor.
 */
export function sortCohort(
  rows: CohortRow[],
  key: CohortSortKey,
  dir: 'asc' | 'desc' = DEFAULT_DIRECTION[key],
): CohortRow[] {
  const sign = dir === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    if (key === 'name') {
      return sign * compareName(a, b)
    }
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    if (av === null && bv === null) return compareName(a, b)
    if (av === null) return 1
    if (bv === null) return -1
    if (av !== bv) return sign * (av - bv)
    return compareName(a, b)
  })
}

/** One sentence saying where this student's attention number came from. */
export function attentionReason(row: CohortRow): string {
  const parts = contributions(row)
  if (parts.length === 0) {
    return `Attention ${row.attention} of ${ATTENTION_CAP} — nothing is waiting on you for this student.`
  }

  let largest = parts[0]
  for (const p of parts) {
    if (p.points > largest.points) largest = p
  }

  // The score is capped, so never quote a part that is larger than the whole.
  const shown = Math.min(Math.round(largest.points), row.attention)
  return `Attention ${row.attention} of ${ATTENTION_CAP} — mostly ${largest.label}, worth ${shown} points.`
}

/** Counts for the strip above the table. Every field counts students. */
export function cohortSummary(rows: CohortRow[]): {
  total: number
  flagged: number
  dormant: number
  unconfirmed: number
  needsFirstWork: number
} {
  let flagged = 0
  let dormant = 0
  let unconfirmed = 0
  let needsFirstWork = 0

  for (const row of rows) {
    if (row.alerts.some((a) => a.resolved_at === null)) flagged += 1
    if (row.daysSinceLastWork !== null && row.daysSinceLastWork > DORMANT_DAYS) {
      dormant += 1
    }
    if (row.unconfirmedCount > 0) unconfirmed += 1
    if (row.worksCount === 0) needsFirstWork += 1
  }

  return { total: rows.length, flagged, dormant, unconfirmed, needsFirstWork }
}

const DEFAULT_DIRECTION: Record<CohortSortKey, 'asc' | 'desc'> = {
  attention: 'desc',
  name: 'asc',
  recent: 'desc',
  momentum: 'desc',
  mean: 'desc',
  works: 'desc',
}

/**
 * The attention score, itemised. buildCohortRows adds these up and
 * attentionReason reads the biggest one back out, so the number and the
 * explanation cannot drift apart.
 */
function contributions(row: CohortRow): Contribution[] {
  const out: Contribution[] = []

  let high = 0
  let medium = 0
  let low = 0
  for (const a of row.alerts) {
    if (a.resolved_at !== null) continue
    if (a.severity === 'high') high += 1
    else if (a.severity === 'medium') medium += 1
    else low += 1
  }
  if (high > 0) {
    out.push({
      points: high * WEIGHT.alertHigh,
      label: pluralise(high, 'open high-severity alert'),
    })
  }
  if (medium > 0) {
    out.push({
      points: medium * WEIGHT.alertMedium,
      label: pluralise(medium, 'open medium-severity alert'),
    })
  }
  if (low > 0) {
    out.push({
      points: low * WEIGHT.alertLow,
      label: pluralise(low, 'open low-severity alert'),
    })
  }

  if (row.daysSinceLastWork !== null && row.daysSinceLastWork > DORMANT_DAYS) {
    out.push({
      points: WEIGHT.dormant,
      label: `${pluralise(row.daysSinceLastWork, 'day')} without a new work`,
    })
  }

  if (row.worksCount === 0) {
    out.push({ points: WEIGHT.neverSubmitted, label: 'no work submitted yet' })
  }

  if (row.momentum !== null && row.momentum < 0) {
    const share = Math.min(1, Math.abs(row.momentum) / REGRESSION_FULL_SCALE)
    const points = Math.round(share * WEIGHT.regression)
    if (points > 0) {
      out.push({
        points,
        label: `scores falling ${Math.abs(row.momentum).toFixed(2)} points a week`,
      })
    }
  }

  if (row.unconfirmedCount > 0) {
    out.push({
      points: WEIGHT.unconfirmed,
      label: pluralise(
        row.unconfirmedCount,
        'score waiting on your confirmation',
        'scores waiting on your confirmation',
      ),
    })
  }

  return out
}

function sortValue(row: CohortRow, key: Exclude<CohortSortKey, 'name'>): number | null {
  switch (key) {
    case 'attention':
      return row.attention
    case 'recent':
      return row.lastWorkAt === null ? null : Date.parse(row.lastWorkAt)
    case 'momentum':
      return row.momentum
    case 'mean':
      return row.mean
    case 'works':
      return row.worksCount
  }
}

function compareName(a: CohortRow, b: CohortRow): number {
  return (
    a.student.name.localeCompare(b.student.name, 'en') ||
    a.student.id.localeCompare(b.student.id)
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
