import type { Dimension } from '../rubric'
import type { ScoredWork, TrajectoryPoint } from '../types'
import { PLATEAU } from '../constants'
import { linearSlopePerWeek, toTrajectoryPoints } from './trajectory'
import { pluralise } from '../utils/format'

/**
 * Learning signals.
 *
 * The product used to detect one thing — a plateau — and treat everything else
 * as silence. That answered "has this stopped?" and nothing else, which meant a
 * student breaking through, a student whose work had become erratic, and a
 * student coasting on work far below their level all looked identical.
 *
 * Two rules govern everything here.
 *
 * First: every signal carries an evidence level, and a signal built on three
 * submissions says so rather than borrowing the authority of one built on
 * twelve. The product would rather say "not enough evidence yet" than be
 * confidently wrong about a child.
 *
 * Second: difficulty is accounted for. A student who attempts a harder task and
 * scores lower has not declined — they have stretched. Reporting that as a
 * decline would punish exactly the behaviour teaching is trying to produce.
 */

export type SignalKind =
  | 'plateau'
  | 'decline'
  | 'breakthrough'
  | 'inconsistent'
  | 'rapid_growth'
  | 'under_challenged'
  | 'over_challenged'
  | 'skill_imbalance'
  | 'neglected'

export type EvidenceLevel = 'low' | 'moderate' | 'strong'

export interface LearningSignal {
  kind: SignalKind
  /** Null for signals about the whole learner rather than one dimension. */
  dimension: Dimension | null
  /** One sentence, plain language, with the real numbers in it. */
  message: string
  /** The longer version, for a tooltip or a "why am I seeing this?" panel. */
  explanation: string
  evidence: EvidenceLevel
  /** How many submissions the signal was computed from. */
  observations: number
  severity: 'high' | 'medium' | 'low'
  /** Positive signals are worth surfacing too — this is not only a problem list. */
  tone: 'concern' | 'neutral' | 'positive'
  detected_at: string
}

/* ------------------------------------------------------------------ *
 * Evidence
 * ------------------------------------------------------------------ */

/** Fewer than this and the product does not make claims about a dimension. */
export const MIN_OBSERVATIONS = 3

export function evidenceFor(observations: number, weeksSpanned: number): EvidenceLevel {
  if (observations >= 8 && weeksSpanned >= 6) return 'strong'
  if (observations >= 5 && weeksSpanned >= 3) return 'moderate'
  return 'low'
}

export function evidenceLabel(e: EvidenceLevel): string {
  return e === 'strong'
    ? 'Strong evidence'
    : e === 'moderate'
      ? 'Moderate evidence'
      : 'Limited evidence'
}

/* ------------------------------------------------------------------ *
 * Per-dimension series
 * ------------------------------------------------------------------ */

interface Series {
  dimension: Dimension
  points: Array<{ t: number; v: number; difficulty: number }>
}

/** Difficulty defaults to 1 (baseline). Higher means a harder task. */
const BASELINE_DIFFICULTY = 1

function seriesFrom(points: TrajectoryPoint[], works: ScoredWork[]): Series[] {
  const difficultyByWork = new Map<string, number>()
  for (const w of works) {
    const d = (w as ScoredWork & { difficulty?: number | null }).difficulty
    difficultyByWork.set(w.id, typeof d === 'number' && d > 0 ? d : BASELINE_DIFFICULTY)
  }

  const keys = new Set<Dimension>()
  for (const p of points) for (const k of Object.keys(p.values)) keys.add(k)

  return [...keys].map((dimension) => ({
    dimension,
    points: points
      .filter((p) => typeof p.values[dimension] === 'number')
      .map((p) => ({
        t: p.t,
        v: p.values[dimension] as number,
        difficulty: difficultyByWork.get(p.work_id) ?? BASELINE_DIFFICULTY,
      })),
  }))
}

/** Population standard deviation. Zero for fewer than two points. */
function sd(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Scores adjusted for how hard the task was.
 *
 * A score of 6 on a task a level above the student's usual is not the same
 * achievement as a 6 on their standard exercise. The adjustment is deliberately
 * gentle — a tenth of a point per difficulty step — because the aim is to stop
 * the system misreading a stretch as a decline, not to manufacture progress that
 * did not happen.
 */
function challengeAdjusted(p: { v: number; difficulty: number }): number {
  return p.v + (p.difficulty - BASELINE_DIFFICULTY) * 1.0
}

const MS_PER_WEEK = 604_800_000
const MINUS = '−'

function rate(n: number): string {
  const v = Math.abs(n) < 0.005 ? 0 : n
  return `${v < 0 ? MINUS : ''}${Math.abs(v).toFixed(2)}`
}

/* ------------------------------------------------------------------ *
 * Detection
 * ------------------------------------------------------------------ */

export function detectSignals(
  works: ScoredWork[],
  opts: { now?: Date; label?: (d: Dimension) => string } = {},
): LearningSignal[] {
  const now = opts.now ?? new Date()
  const label = opts.label ?? ((d: Dimension) => d)
  const detectedAt = now.toISOString()

  const points = toTrajectoryPoints(works)
  if (points.length === 0) return []

  const all = seriesFrom(points, works)
  const out: LearningSignal[] = []

  const spanWeeks =
    points.length > 1
      ? (points[points.length - 1].t - points[0].t) / MS_PER_WEEK
      : 0

  // Slopes across the recent window, used both per dimension and as the peer
  // baseline that makes a plateau mean something.
  const recentSlope = new Map<Dimension, number>()
  const recentPoints = new Map<Dimension, Series['points']>()
  for (const s of all) {
    const window = s.points.slice(-PLATEAU.window)
    recentPoints.set(s.dimension, window)
    recentSlope.set(
      s.dimension,
      window.length >= 2
        ? linearSlopePerWeek(window.map((p) => ({ t: p.t, v: challengeAdjusted(p) })))
        : 0,
    )
  }

  for (const s of all) {
    const window = recentPoints.get(s.dimension) ?? []
    const observations = s.points.length
    const slope = recentSlope.get(s.dimension) ?? 0

    if (observations < MIN_OBSERVATIONS) continue

    const windowWeeks =
      window.length > 1 ? (window[window.length - 1].t - window[0].t) / MS_PER_WEEK : 0
    const evidence = evidenceFor(observations, spanWeeks)
    const name = label(s.dimension)

    // Peers: every other dimension's recent slope.
    const peers = [...recentSlope.entries()]
      .filter(([k]) => k !== s.dimension)
      .map(([, v]) => v)
    const peerSlope =
      peers.length > 0 ? peers.reduce((a, b) => a + b, 0) / peers.length : 0

    const values = window.map((p) => p.v)
    const volatility = sd(values)
    const raised = window.some((p) => p.difficulty > BASELINE_DIFFICULTY)

    /**
     * A series that swings is not a series that declines.
     *
     * Fitting a line through 8, 3, 8, 4 produces a downward slope, but calling
     * that a decline tells the instructor something false and hides the thing
     * that is actually true — the work has become erratic. Volatility is
     * checked first so the more accurate description wins.
     */
    const swinging = volatility >= 1.6

    /* ---- decline ---- */
    if (slope <= -0.15 && window.length >= MIN_OBSERVATIONS && !swinging) {
      out.push({
        kind: 'decline',
        dimension: s.dimension,
        message: `${name} has been falling — ${rate(slope)} a week across the last ${pluralise(window.length, 'submission')}.`,
        explanation: `A straight line through the last ${window.length} submissions for ${name} slopes down at ${rate(slope)} points a week. ${raised ? 'Some of those were harder tasks, and the figure already allows for that.' : 'Task difficulty was steady across them.'}`,
        evidence,
        observations,
        severity: slope <= -0.3 ? 'high' : 'medium',
        tone: 'concern',
        detected_at: detectedAt,
      })
      continue
    }

    /* ---- plateau: flat while the rest of the learner moves ---- */
    if (
      slope < PLATEAU.flatSlope &&
      peerSlope >= PLATEAU.peerSlope &&
      window.length >= PLATEAU.minWorks &&
      windowWeeks >= PLATEAU.minWeeks
    ) {
      out.push({
        kind: 'plateau',
        dimension: s.dimension,
        message: `${name} has not moved in ${pluralise(Math.round(windowWeeks), 'week')} — ${rate(slope)} a week — while the other dimensions rose ${rate(peerSlope)}.`,
        explanation: `We fit a straight line through the last ${window.length} submissions. ${name} is flat at ${rate(slope)} points a week; everything else the student is doing averages ${rate(peerSlope)} over exactly the same work. That contrast is what makes this a plateau rather than a rest — a student taking a break goes flat on every line at once.`,
        evidence,
        observations,
        severity: windowWeeks >= 6 && peerSlope >= 0.2 ? 'high' : 'medium',
        tone: 'concern',
        detected_at: detectedAt,
      })
      continue
    }

    /* ---- breakthrough: a step change after a flat run ---- */
    if (s.points.length >= 5) {
      const prior = s.points.slice(-6, -2)
      const latest = s.points.slice(-2)
      if (prior.length >= 3 && latest.length === 2) {
        const priorMean = prior.reduce((a, p) => a + p.v, 0) / prior.length
        const latestMean = latest.reduce((a, p) => a + p.v, 0) / latest.length
        const priorSlope = linearSlopePerWeek(
          prior.map((p) => ({ t: p.t, v: p.v })),
        )
        const jump = latestMean - priorMean
        if (jump >= 1.2 && priorSlope < PLATEAU.flatSlope) {
          out.push({
            kind: 'breakthrough',
            dimension: s.dimension,
            message: `${name} jumped ${jump.toFixed(1)} points after being flat — worth telling the student.`,
            explanation: `${name} averaged ${priorMean.toFixed(1)} across the four submissions before this, moving at ${rate(priorSlope)} a week. The last two average ${latestMean.toFixed(1)}. A step of that size after a flat run usually means something specific clicked; finding out what it was is worth more than the number.`,
            evidence,
            observations,
            severity: 'low',
            tone: 'positive',
            detected_at: detectedAt,
          })
          continue
        }
      }
    }

    /* ---- rapid growth ---- */
    if (slope >= 0.5 && window.length >= MIN_OBSERVATIONS) {
      out.push({
        kind: 'rapid_growth',
        dimension: s.dimension,
        message: `${name} is climbing quickly — ${rate(slope)} a week.`,
        explanation: `Across the last ${window.length} submissions ${name} is rising at ${rate(slope)} points a week. This is a good moment to raise the difficulty rather than repeat the same exercise.`,
        evidence,
        observations,
        severity: 'low',
        tone: 'positive',
        detected_at: detectedAt,
      })
      continue
    }

    /* ---- inconsistency: swinging rather than trending ---- */
    if (swinging && window.length >= 4) {
      out.push({
        kind: 'inconsistent',
        dimension: s.dimension,
        message: `${name} is swinging between submissions rather than trending — ${volatility.toFixed(1)} points of spread.`,
        explanation: `The last ${window.length} scores for ${name} vary by ${volatility.toFixed(1)} points either side of their average without moving in any direction. That usually points at something situational — the setup, the time available, the medium — rather than at the skill itself.`,
        evidence,
        observations,
        severity: 'medium',
        tone: 'neutral',
        detected_at: detectedAt,
      })
    }
  }

  /* ---- whole-learner signals ---- */

  const latestByDim = new Map<Dimension, number>()
  for (const s of all) {
    const last = s.points[s.points.length - 1]
    if (last) latestByDim.set(s.dimension, last.v)
  }
  const latestValues = [...latestByDim.values()]

  if (latestValues.length >= 2 && points.length >= MIN_OBSERVATIONS) {
    const max = Math.max(...latestValues)
    const min = Math.min(...latestValues)
    const evidence = evidenceFor(points.length, spanWeeks)

    if (max - min >= 3.5) {
      const weakest = [...latestByDim.entries()].find(([, v]) => v === min)
      const strongest = [...latestByDim.entries()].find(([, v]) => v === max)
      if (weakest && strongest) {
        out.push({
          kind: 'skill_imbalance',
          dimension: weakest[0],
          message: `${label(weakest[0])} is ${(max - min).toFixed(0)} points behind ${label(strongest[0])}.`,
          explanation: `The gap between this student's highest and lowest dimension is ${(max - min).toFixed(1)} points. A gap that wide usually means practice has concentrated on what they already enjoy. It is worth deciding deliberately whether to close it or to let it stand.`,
          evidence,
          observations: points.length,
          severity: max - min >= 5 ? 'medium' : 'low',
          tone: 'neutral',
          detected_at: detectedAt,
        })
      }
    }

    /* ---- under-challenged: scoring high on unchanged difficulty ---- */
    const mean = latestValues.reduce((a, b) => a + b, 0) / latestValues.length
    const difficulties = works
      .map((w) => (w as ScoredWork & { difficulty?: number | null }).difficulty)
      .filter((d): d is number => typeof d === 'number' && d > 0)
    const difficultySpread =
      difficulties.length >= 2 ? Math.max(...difficulties) - Math.min(...difficulties) : 0

    if (mean >= 8 && difficultySpread === 0 && points.length >= 5) {
      out.push({
        kind: 'under_challenged',
        dimension: null,
        message: `Scoring ${mean.toFixed(1)} on average with no change in task difficulty — ready for harder work.`,
        explanation: `The last submissions average ${mean.toFixed(1)} and every one was set at the same difficulty. Consistently high scores on unchanging work measure comfort rather than growth; raising the difficulty is what turns the next score back into information.`,
        evidence,
        observations: points.length,
        severity: 'low',
        tone: 'neutral',
        detected_at: detectedAt,
      })
    }

    if (mean <= 3.5 && points.length >= 4) {
      out.push({
        kind: 'over_challenged',
        dimension: null,
        message: `Scores are sitting low across the board — the work may be pitched above where this student is.`,
        explanation: `The recent average across all dimensions is ${mean.toFixed(1)}. When everything is low at once it is more often the difficulty of the task than the ability of the student. Worth trying one step easier and seeing whether the scores separate.`,
        evidence,
        observations: points.length,
        severity: 'medium',
        tone: 'concern',
        detected_at: detectedAt,
      })
    }
  }

  /* ---- neglected dimension: tracked but rarely scored ---- */
  if (points.length >= 5) {
    for (const s of all) {
      const coverage = s.points.length / points.length
      if (coverage < 0.4) {
        out.push({
          kind: 'neglected',
          dimension: s.dimension,
          message: `${label(s.dimension)} has only been scored on ${s.points.length} of ${points.length} submissions.`,
          explanation: `${label(s.dimension)} is part of this rubric but is rarely being assessed. Either the work being set does not exercise it, or it is being skipped during review. Both are worth knowing; neither shows up as a low score.`,
          evidence: 'moderate',
          observations: s.points.length,
          severity: 'low',
          tone: 'neutral',
          detected_at: detectedAt,
        })
      }
    }
  }

  return out.sort((a, b) => rank(b) - rank(a))
}

function rank(s: LearningSignal): number {
  const severity = s.severity === 'high' ? 3 : s.severity === 'medium' ? 2 : 1
  const evidence = s.evidence === 'strong' ? 3 : s.evidence === 'moderate' ? 2 : 1
  const concern = s.tone === 'concern' ? 2 : s.tone === 'neutral' ? 1 : 0
  return severity * 10 + concern * 4 + evidence
}

/** The one-line method note the UI prints under a chart. */
export const SIGNAL_METHOD_SENTENCE =
  `We fit a straight line through each dimension's last ${PLATEAU.window} submissions and compare it with the rest of the student's work over the same period. ` +
  `Scores are adjusted for task difficulty first, so attempting something harder does not read as going backwards.`

/** Human summary of what a signal kind means, for the "why?" panel. */
export const SIGNAL_DESCRIPTIONS: Record<SignalKind, string> = {
  plateau: 'One dimension has stopped moving while the rest of the student keeps improving.',
  decline: 'Scores on this dimension are trending downward, after allowing for task difficulty.',
  breakthrough: 'A clear step up after a flat run.',
  inconsistent: 'Scores swing between submissions rather than trending in any direction.',
  rapid_growth: 'This dimension is improving quickly enough to warrant harder work.',
  under_challenged: 'Consistently high scores on work whose difficulty has not changed.',
  over_challenged: 'Everything is scoring low at once, which usually means the task is pitched too high.',
  skill_imbalance: 'A wide gap between the strongest and weakest dimension.',
  neglected: 'A dimension in the rubric that is rarely being assessed.',
}

export function describeSignal(kind: SignalKind): string {
  return SIGNAL_DESCRIPTIONS[kind]
}
