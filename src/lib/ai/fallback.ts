import 'server-only'

import type { CalibrationAnchor } from '../dal/types'
import type { Dimension } from '../rubric'
import { DIMENSIONS, RUBRIC, SCORE_MAX, SCORE_MIN, clampScore } from '../rubric'
import type { ImageMetrics, TrajectoryAnalysis } from '../types'
import { longDate } from '../utils/format'
import type { AssignmentResponse, ReportResponse, ScoreResponse } from './schemas'

/**
 * The deterministic path. This runs when no key is configured, when the
 * network is gone, or when a provider failed twice.
 *
 * It is not a mock. Every number below is derived from a stated mapping over
 * measurements taken from the pixels, and every rationale says what was
 * measured rather than pretending to have read the drawing. Confidence is
 * capped well below anything the model returns, because a measurement is not
 * a judgement: a photograph shot under flash measures a narrow value range
 * whatever is actually on the paper.
 */

/** Nothing measured can be trusted past this. A pixel statistic is evidence, not a verdict. */
const MAX_FALLBACK_CONFIDENCE = 0.45

/** Per-dimension ceilings, ordered by how directly the pixels speak to the dimension. */
const BASE_CONFIDENCE: Record<Dimension, number> = {
  value_range: 0.42,
  edge_quality: 0.32,
  composition: 0.3,
  line_control: 0.28,
  proportion: 0.12,
}

/** How hard the academy's own anchors pull the measured set towards their mean. */
const RECENTRE_WEIGHT = 0.6

/**
 * Placeholder written when nothing at all could be measured. It is never a
 * proposal: it ships with confidence 0 and source 'manual', and the caller
 * must record ai_score as null rather than this number.
 */
const NO_MEASUREMENT_PLACEHOLDER = 5

const MID_SCORE = (SCORE_MIN + SCORE_MAX) / 2

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

/** Maps a raw measurement onto the 1..10 score band between two stated bounds. */
function band(value: number, low: number, high: number): number {
  if (!Number.isFinite(value) || high === low) return MID_SCORE
  return SCORE_MIN + (SCORE_MAX - SCORE_MIN) * clamp01((value - low) / (high - low))
}

/** The same mapping, inverted: more of the measurement means a lower score. */
function inverseBand(value: number, low: number, high: number): number {
  return SCORE_MIN + (SCORE_MAX - SCORE_MIN) * (1 - clamp01((value - low) / (high - low)))
}

function n2(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '0.00'
}

function n1(v: number): string {
  return Number.isFinite(v) ? v.toFixed(1) : '0.0'
}

function pct(v: number): string {
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : '0%'
}

/** Truncates at a word boundary so a rationale never overruns the schema's 240 characters. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}.`
}

/** Distance from the ink mass centre to the nearest rule-of-thirds intersection. */
function thirdsDistance(centre: { x: number; y: number }): number {
  const thirds = [1 / 3, 2 / 3]
  let best = Number.POSITIVE_INFINITY
  for (const x of thirds) {
    for (const y of thirds) {
      const d = Math.hypot(centre.x - x, centre.y - y)
      if (d < best) best = d
    }
  }
  return Number.isFinite(best) ? best : 0
}

function anchorMeanFor(
  anchors: CalibrationAnchor[],
  dimension: Dimension,
): number | null {
  const values = anchors
    .map((a) => a.scores[dimension])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Mean of every anchor score this academy has set, across all dimensions. */
function academyMean(anchors: CalibrationAnchor[]): number | null {
  const values: number[] = []
  for (const anchor of anchors) {
    for (const d of DIMENSIONS) {
      const v = anchor.scores[d]
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v)
    }
  }
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/* ------------------------------------------------------------------ *
 * measuredScore
 * ------------------------------------------------------------------ */

/**
 * Scores an image from its pixel statistics alone.
 *
 * The mapping, stated so an instructor can argue with it:
 *   value_range   luminance spread, weighted 0.65, plus luminance SD at 0.35.
 *   line_control  stroke coherence at 0.72, gradient variance at 0.28, then a
 *                 penalty for dense marks that do not agree on a direction.
 *   edge_quality  gradient variance against gradient density. A low ratio
 *                 means every edge is being made the same way.
 *   composition   ink mass centre against the thirds, empty share against a
 *                 half-full sheet, and edge energy pushed to the border.
 *   proportion    not measurable from pixels. Sits at the academy's own mean
 *                 anchor score, nudged by the other four, at the lowest
 *                 confidence of the five.
 * With anchors present the whole set is then shifted towards the academy's
 * mean, so even the offline path respects that academy's standard.
 */
export function measuredScore(input: {
  metrics: ImageMetrics | null
  anchors: CalibrationAnchor[]
}): ScoreResponse {
  const { metrics, anchors } = input

  if (!metrics) {
    return {
      subject: 'Not identified. Nothing could be measured from this image.',
      scores: DIMENSIONS.map((dimension) => ({
        dimension,
        score: NO_MEASUREMENT_PLACEHOLDER,
        rationale: clip(
          `No pixel measurements and no model reading were available, so nothing is proposed for ${RUBRIC[dimension].longLabel.toLowerCase()}. Set this score yourself.`,
          240,
        ),
        confidence: 0,
      })),
    }
  }

  const m = metrics

  // value_range: the spread between the darkest and lightest pixel is the
  // most direct evidence any of these statistics gives.
  const rawValue =
    0.65 * band(m.valueSpread, 0.15, 0.9) + 0.35 * band(m.contrastSd, 0.05, 0.26)

  // line_control: coherent gradients mean strokes that agree on a direction.
  // Dense marks with low coherence are the signature of a searching line.
  const searching =
    clamp01((m.edgeDensity - 0.16) / 0.2) * (1 - clamp01(m.strokeCoherence / 0.45))
  const rawLine =
    0.72 * band(m.strokeCoherence, 0.15, 0.7) +
    0.28 * band(m.edgeVariance, 0.02, 0.16) -
    2 * searching

  // edge_quality: variance relative to density. Uniform hard outlines give a
  // low ratio; hard, soft and lost edges together give a high one.
  const edgeRatio = m.edgeDensity > 0.005 ? m.edgeVariance / m.edgeDensity : 0
  const rawEdge = band(edgeRatio, 0.35, 1.4)

  const centreDistance = thirdsDistance(m.massCenter)
  const placement = inverseBand(centreDistance, 0, 0.3)
  const fill = inverseBand(Math.abs(m.emptyShare - 0.5), 0, 0.38)
  const border = inverseBand(m.borderEnergy, 0.1, 0.65)
  const rawComposition = 0.4 * placement + 0.35 * fill + 0.25 * border

  // proportion: pixels cannot tell us whether the head is too big for the
  // body. Anchor it to the academy's own standard and say so.
  const anchorProportion = anchorMeanFor(anchors, 'proportion')
  const othersMean = (rawValue + rawLine + rawEdge + rawComposition) / 4
  const proportionBase = anchorProportion ?? MID_SCORE
  const rawProportion = 0.65 * proportionBase + 0.35 * othersMean

  const raw: Record<Dimension, number> = {
    proportion: rawProportion,
    line_control: rawLine,
    value_range: rawValue,
    edge_quality: rawEdge,
    composition: rawComposition,
  }

  // Recentre on the academy's own mean so the offline path speaks this
  // academy's language rather than a generic one.
  const mean = academyMean(anchors)
  let shift = 0
  if (mean !== null) {
    const rawMean = DIMENSIONS.reduce((sum, d) => sum + raw[d], 0) / DIMENSIONS.length
    shift = (mean - rawMean) * RECENTRE_WEIGHT
  }

  // A photograph this degenerate is telling us about the camera, not the work.
  const poorCapture =
    m.valueSpread < 0.25 ||
    m.emptyShare > 0.92 ||
    m.emptyShare < 0.05 ||
    Math.min(m.width, m.height) < 400
  const captureFactor = poorCapture ? 0.6 : 1
  const calibrationFactor = anchors.length > 0 ? 1 : 0.8

  const rationales: Record<Dimension, string> = {
    value_range: `Measured value spread ${n2(m.valueSpread)} of the full range, darkest ${n2(m.darkest)}, lightest ${n2(m.lightest)}, luminance SD ${n2(m.contrastSd)}. Read from the pixels, not from the drawing.`,
    line_control: `Stroke coherence measured ${n2(m.strokeCoherence)}, gradient variance ${n2(m.edgeVariance)}, gradient density ${n2(m.edgeDensity)}. Coherence is a proxy for marks that agree on a direction.`,
    edge_quality: `Gradient variance ${n2(m.edgeVariance)} against density ${n2(m.edgeDensity)} gives a ratio of ${n2(edgeRatio)}. A low ratio means every edge was made the same way. Measured, not seen.`,
    composition: `Ink mass centres at x ${n2(m.massCenter.x)}, y ${n2(m.massCenter.y)}, ${n2(centreDistance)} from the nearest thirds intersection. ${pct(m.emptyShare)} of the sheet is empty, ${pct(m.borderEnergy)} of edge energy sits at the border.`,
    proportion:
      anchorProportion !== null
        ? `Proportion cannot be measured from pixel statistics. This sits at this academy's own mean anchor score of ${n1(anchorProportion)}, nudged by the other four measurements. Lowest confidence of the five for that reason.`
        : `Proportion cannot be measured from pixel statistics, and this academy has no anchor scores yet. This is the neutral midpoint nudged by the other four measurements. Lowest confidence of the five.`,
  }

  const poorCaptureNote = poorCapture
    ? ' The photograph itself measures poorly, so treat every number here as weak.'
    : ''

  return {
    subject: 'Not identified. These scores come from pixel measurements, not from reading the image.',
    scores: DIMENSIONS.map((dimension) => ({
      dimension,
      score: clampScore(raw[dimension] + shift),
      rationale: clip(
        `${rationales[dimension]}${dimension === 'value_range' ? poorCaptureNote : ''}`,
        240,
      ),
      confidence:
        Math.round(
          Math.min(
            MAX_FALLBACK_CONFIDENCE,
            BASE_CONFIDENCE[dimension] * captureFactor * calibrationFactor,
          ) * 100,
        ) / 100,
    })),
  }
}

/* ------------------------------------------------------------------ *
 * fallbackAssignment
 * ------------------------------------------------------------------ */

interface Exercise {
  title: string
  steps: string[]
  materials: string[]
  baseMinutes: number
  successCriteria: string[]
  /** One sentence on why this exercise moves this dimension. Goes into the rationale. */
  why: string
}

/**
 * Hand-written exercises, one per dimension. These are what a student
 * actually receives when Groq is unreachable, so each one is a real studio
 * exercise with a constraint that makes the target dimension unavoidable.
 */
const EXERCISES: Record<Dimension, Exercise> = {
  value_range: {
    title: 'Three-value notan under one lamp',
    steps: [
      'Put three objects on a white sheet: a mug, a crumpled paper bag and an apple will do. Place one desk lamp low and to the left, then switch every other light in the room off.',
      'Draw the outlines lightly in graphite with no shading. Then squint until the group collapses into flat patches of light and dark, and trace the boundary of every shadow shape.',
      'Mix one mid grey on scrap paper and keep it. From here only three values may appear: the paper white, that one grey, and the blackest the compressed charcoal will give.',
      'Fill every patch with exactly one of those three. No blending, no fourth grey, and no gradient inside a patch.',
      "Go back over the darkest patches a second time until they read as black when you hold the sheet at arm's length beside the untouched paper.",
    ],
    materials: [
      'compressed charcoal stick',
      'A3 cartridge paper',
      'one desk lamp',
      'kneaded eraser',
      'scrap paper for mixing the grey',
    ],
    baseMinutes: 45,
    successCriteria: [
      'Exactly three values appear on the sheet. A fourth grey anywhere is a fail.',
      'The darkest patch reads as black, not dark grey, held beside the bare paper.',
      'Every shadow shape is one flat patch with a hard boundary, not a soft gradient.',
    ],
    why: 'Value range stops moving while a student keeps reaching for the same middle greys. Taking the middle greys away is the most reliable way to make the darks go dark.',
  },
  line_control: {
    title: 'One line, ballpoint, no going back',
    steps: [
      'Set your non-drawing hand on the table in a pose you can hold, or use a pair of open scissors. Sit close enough to see the small changes of direction along each edge.',
      'Draw it with a ballpoint pen in one unbroken line. The pen does not leave the paper until the drawing is finished, and no line is ever drawn over twice.',
      'Keep your eyes on the object for most of the drawing and travel slowly and evenly. When you go wrong, keep going. There is no eraser in this exercise.',
      'Repeat on a fresh sheet four more times at six minutes each, changing the pose slightly between them.',
      'On the last sheet swap to a brush pen and draw twenty thirty-second gestures, one stroke per form, pressing harder where the form turns towards you.',
    ],
    materials: [
      'ballpoint pen',
      'brush pen or a soft-tipped marker',
      'six sheets of A4 paper',
      'a timer',
    ],
    baseMinutes: 50,
    successCriteria: [
      'Each contour is one unbroken line, and no line has been gone over twice.',
      'There are no scratchy repeated searching marks anywhere on the sheets.',
      'On the brush-pen sheet, line weight visibly changes between the near and far edge of the same form.',
    ],
    why: 'A pen that cannot be erased makes hesitation permanent and visible, which is the only way most students notice they are searching for the line instead of stating it.',
  },
  proportion: {
    title: 'Sight-size chair, measured before every mark',
    steps: [
      'Stand a plain chair three metres away and set your paper on a board beside your eye line, so the chair and the drawing can be seen in one glance without moving your head.',
      'Choose one unit and write it at the top of the sheet: the height of the seat from the floor. Everything else on the drawing is stated as a multiple of that unit.',
      "Measure with a knitting needle held at arm's length with the elbow locked. Take the measurement, write the multiple on the sheet, then make the mark. Never the other way round.",
      'Hang a weighted string in front of the chair and mark on the drawing the three places where one vertical line passes through two parts of the object at once.',
      'Halfway through, hold the drawing up to a mirror. Anything that leans or spreads in the mirror gets measured again, not nudged.',
    ],
    materials: [
      'a knitting needle or bamboo skewer',
      'string with a nut tied to one end',
      '2B pencil',
      'A3 paper on a board',
      'a small mirror',
    ],
    baseMinutes: 60,
    successCriteria: [
      'Every major measurement is written on the sheet as a multiple of the stated unit.',
      'Three plumb-line checks are marked on the drawing.',
      'Held to a mirror, the drawing does not visibly lean or spread on one side.',
    ],
    why: 'Proportion improves when measuring comes before marking. Writing the multiple on the sheet before the mark makes it impossible to guess and then justify the guess.',
  },
  edge_quality: {
    title: 'Lost and found on a toned ground',
    steps: [
      'Rub charcoal dust evenly across the sheet with a cloth until it is a flat mid grey with no white left anywhere. This is the ground you will draw into.',
      'Set a white egg or a crumpled sheet of paper on a mid-grey cloth, lit by one lamp bounced off a wall so the light is soft. Sit close.',
      'Draw a small thumbnail first and mark on it the single place you want the eye to land. That is the only hard edge you are allowed on the big sheet.',
      'Work on the big sheet by lifting light out with a kneaded eraser and pushing dark in with the stump. Do not outline anything at any point.',
      'Find at least two places where the tone of the object matches the background exactly, and let the edge disappear there. Do not rescue them.',
    ],
    materials: [
      'charcoal powder or a soft charcoal stick',
      'kneaded eraser',
      'blending stump or a rag',
      'white chalk',
      'cartridge paper',
    ],
    baseMinutes: 55,
    successCriteria: [
      'At least two edges disappear completely into the background.',
      'There is exactly one hard edge, and it sits where the thumbnail said it would.',
      'No continuous outline runs around the form anywhere on the sheet.',
    ],
    why: 'Edges stay uniform while a student is still outlining. Removing the outline entirely, and working out of a toned ground, leaves nowhere for a default hard edge to hide.',
  },
  composition: {
    title: 'Twelve crops, one drawing',
    steps: [
      'Cut a rectangular window the shape of your paper out of a piece of card. This is the viewfinder, and no drawing starts until it has chosen the crop.',
      'Rule a sheet into twelve boxes about five centimetres across. Each box gets one thumbnail and two minutes, no more.',
      'Point the viewfinder at one cluttered corner of the room and fill each box with a different crop of it, using only three values: white, grey and black.',
      'In every thumbnail the subject must touch at least one edge of the frame. A subject floating clear of all four edges is a wasted box.',
      'Pick one thumbnail, and only one. Enlarge it onto a full sheet at the same proportions, keeping every shape where the thumbnail put it.',
    ],
    materials: [
      'a piece of card and a craft knife',
      'soft pencil or a marker',
      'A3 sheet ruled into twelve boxes',
      'one full A3 sheet',
    ],
    baseMinutes: 60,
    successCriteria: [
      'Twelve genuinely different crops, not twelve versions of the same one.',
      'In every thumbnail the subject touches at least one edge of the frame.',
      'In the enlarged drawing the empty shapes are as deliberate as the drawn ones.',
    ],
    why: 'Composition is decided before the drawing starts. Twelve timed crops force the decision into the open, where it can be looked at and chosen rather than defaulted to.',
  },
}

/** Longer sessions for more advanced students, kept inside the schema's 10 to 180 minutes. */
function scaledDuration(base: number, level: number): number {
  const safeLevel = Number.isFinite(level) ? Math.round(level) : 1
  return Math.min(180, Math.max(10, base + (safeLevel - 1) * 5))
}

/**
 * The exercise issued when the text model is unreachable. Real exercises, one
 * per dimension, written to be shippable without editing.
 */
export function fallbackAssignment(input: {
  targetDimension: Dimension
  studentName: string
  level: number
}): AssignmentResponse {
  const { targetDimension, studentName, level } = input
  const exercise = EXERCISES[targetDimension]
  const spec = RUBRIC[targetDimension]

  return {
    title: clip(exercise.title, 90),
    rationale: clip(
      `${studentName} is at level ${Math.max(1, Math.round(level))} and ${spec.longLabel.toLowerCase()} is the dimension to work on next. ${exercise.why}`,
      400,
    ),
    steps: exercise.steps.map((s) => clip(s, 300)),
    materials: exercise.materials.map((s) => clip(s, 80)),
    duration_minutes: scaledDuration(exercise.baseMinutes, level),
    success_criteria: exercise.successCriteria.map((s) => clip(s, 200)),
  }
}

/* ------------------------------------------------------------------ *
 * fallbackReport
 * ------------------------------------------------------------------ */

/** Each dimension said in words a parent who does not draw can picture. */
const PARENT_GLOSS: Record<Dimension, string> = {
  proportion: 'getting the sizes and positions of things right against each other',
  line_control: 'drawing a line that goes where it is meant to go the first time',
  value_range: 'using the whole distance from the white of the paper to a true black',
  edge_quality: 'letting some edges stay sharp and others soften, so the picture has depth',
  composition: 'deciding where things sit on the page and how much space is left around them',
}

/**
 * First and last recorded value for one dimension across the analysis window.
 * The report needs both numbers; the model response only carries the note, so
 * this is what fills in the from and to that a ReportDimensionNote requires.
 */
export function dimensionRange(
  analysis: TrajectoryAnalysis,
  dimension: Dimension,
): { from: number; to: number } {
  let first: number | null = null
  let last: number | null = null
  for (const point of analysis.points) {
    const v = point.values[dimension]
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (first === null) first = v
      last = v
    }
  }
  const latest = analysis.latest[dimension]
  const fallbackValue =
    typeof latest === 'number' && Number.isFinite(latest) ? Math.round(latest) : 0
  return {
    from: first === null ? fallbackValue : Math.round(first),
    to: last === null ? fallbackValue : Math.round(last),
  }
}

/** Dimensions climbing over the window, steepest first. */
function risingDimensions(analysis: TrajectoryAnalysis): Dimension[] {
  return DIMENSIONS.filter((d) => {
    const slope = analysis.slopes[d]
    return typeof slope === 'number' && slope > 0.05
  }).sort((a, b) => (analysis.slopes[b] ?? 0) - (analysis.slopes[a] ?? 0))
}

/** Dimensions that stood still or slipped, flattest first. */
function stalledDimensions(analysis: TrajectoryAnalysis): Dimension[] {
  return DIMENSIONS.filter((d) => {
    const slope = analysis.slopes[d]
    return !(typeof slope === 'number' && slope > 0.05)
  }).sort((a, b) => (analysis.slopes[a] ?? 0) - (analysis.slopes[b] ?? 0))
}

/**
 * The report draft assembled from the record alone, for when the text model
 * is unreachable. Plain sentences, the student's real numbers, no promises,
 * and nothing that hints the instructor did not write it.
 */
export function fallbackReport(input: {
  studentName: string
  analysis: TrajectoryAnalysis
  periodStart: string
  periodEnd: string
  worksInPeriod: number
}): ReportResponse {
  const { studentName, analysis, periodStart, periodEnd, worksInPeriod } = input

  const works = Math.max(0, Math.round(worksInPeriod))
  const worksPhrase = works === 1 ? '1 piece of work' : `${works} pieces of work`
  const start = longDate(periodStart)
  const end = longDate(periodEnd)

  const rising = risingDimensions(analysis)
  const stalled = stalledDimensions(analysis)

  const paragraphs: string[] = []

  paragraphs.push(
    `${studentName} brought in ${worksPhrase} between ${start} and ${end}. Every one was marked on the same five points that every student here is marked on, and each number below was set in the studio.`,
  )

  if (rising.length > 0) {
    const movements = rising.slice(0, 3).map((d) => {
      const r = dimensionRange(analysis, d)
      return `${RUBRIC[d].longLabel.toLowerCase()} went from ${r.from} to ${r.to} out of ten`
    })
    const listed =
      movements.length === 1
        ? movements[0]
        : `${movements.slice(0, -1).join(', ')} and ${movements[movements.length - 1]}`
    paragraphs.push(`The clearest movement was here: ${listed}.`)
  } else {
    paragraphs.push(
      'None of the five points moved up measurably in this period. That happens, and it is worth saying plainly rather than finding something else to report.',
    )
  }

  if (stalled.length > 0) {
    const first = stalled[0]
    const range = dimensionRange(analysis, first)
    paragraphs.push(
      `The next stretch of work is on ${RUBRIC[first].longLabel.toLowerCase()}, which means ${PARENT_GLOSS[first]}. It ended the period at ${range.to} out of ten and has not moved for some weeks.`,
    )
  } else {
    paragraphs.push('All five points moved up over this period.')
  }

  paragraphs.push(
    `These numbers describe what is on the paper, nothing more. They are kept so the same five things can be looked at again at the end of next term and compared against this one.`,
  )

  const improved = rising.slice(0, 5).map((d) => {
    const r = dimensionRange(analysis, d)
    return {
      dimension: d,
      note: clip(
        `${RUBRIC[d].longLabel} — ${PARENT_GLOSS[d]} — moved from ${r.from} to ${r.to} out of ten over ${worksPhrase}.`,
        280,
      ),
    }
  })

  const focus = stalled.slice(0, 3).map((d) => {
    const r = dimensionRange(analysis, d)
    return {
      dimension: d,
      note: clip(
        `${RUBRIC[d].longLabel} — ${PARENT_GLOSS[d]} — has stayed near ${r.to} out of ten. This is what the studio will spend time on next.`,
        280,
      ),
    }
  })

  const weakest = analysis.weakest?.dimension ?? stalled[0] ?? DIMENSIONS[0]
  const nextSteps: string[] = [
    clip(
      `Short weekly exercises aimed at ${PARENT_GLOSS[weakest]}, marked the same way as everything else so the change is visible.`,
      220,
    ),
    clip(
      'One piece kept aside at the end of next term and photographed the same way as the first piece in this report, so the two can be put side by side.',
      220,
    ),
  ]
  if (stalled.length > 1) {
    const second = stalled[1]
    nextSteps.push(
      clip(`Class time on ${PARENT_GLOSS[second]}, which has not moved for several weeks.`, 220),
    )
  }

  return {
    headline: clip(
      `${studentName}: ${works === 1 ? '1 work' : `${works} works`} between ${start} and ${end}`,
      120,
    ),
    summary: paragraphs.join('\n\n'),
    improved,
    focus,
    next_steps: nextSteps.slice(0, 4),
  }
}
