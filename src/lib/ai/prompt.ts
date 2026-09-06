import 'server-only'

import type { CalibrationAnchor } from '../dal/types'
import type { Dimension } from '../rubric'
import { DIMENSIONS, RUBRIC, SCORE_MAX, SCORE_MIN } from '../rubric'
import type {
  AssignmentBrief,
  Discipline,
  ImageMetrics,
  PlateauFinding,
  TrajectoryAnalysis,
} from '../types'
import { longDate } from '../utils/format'

/**
 * Prompt construction.
 *
 * The calibration block in buildScorePrompt is the part of this product that
 * is hard to copy. A generic vision model has a generic idea of what a 6 is.
 * An academy has its own, set by the instructor's own hand on ten anchor
 * works, and every proposal here is written against that standard rather than
 * against the model's. When an academy has no anchors yet we say so in the
 * prompt and force the proposals to be visibly less confident, because an
 * uncalibrated academy should look uncalibrated on screen.
 */

/** How many anchor works we are willing to spend prompt budget on. */
const MAX_ANCHORS = 10

/** Words that turn a rationale into flattery. Banned in every score prompt. */
const BANNED_WORDS = ['creativity', 'talent', 'potential'] as const

const DISCIPLINE_NOTE: Record<Discipline, string> = {
  drawing:
    'The academy teaches drawing. Expect graphite, charcoal, ink and coloured pencil on paper.',
  painting:
    'The academy teaches painting. Value range and edge quality are read through paint, so a soft edge may be a wet blend rather than a rubbed one.',
  sculpture:
    'The academy teaches sculpture. You are looking at a photograph of a three-dimensional object, so value range and edge quality are partly a property of the lighting the student chose. Keep those two confidences lower than usual and say why.',
  craft:
    'The academy teaches craft. Judge the made object: proportion is the object against its intended form, line control is the cut, seam, join or stitch.',
  other:
    'The discipline is not recorded. Read the image for what it is and say in the subject field what you believe you are looking at.',
}

/** Concrete constraints that force each dimension. Given to the model as raw material, not as a menu to copy. */
const FORCING_CONSTRAINTS: Record<Dimension, string> = {
  proportion:
    'sight-size setup at a fixed distance, comparative measurement against one stated unit, plumb-line and horizontal checks marked on the sheet, a mirror or upside-down check at the halfway point.',
  line_control:
    'a single unbroken contour drawn in ballpoint so nothing can be erased, a ban on going over any line twice, timed gesture drawings that leave no room to hesitate, one stroke per form with a brush pen so weight has to vary.',
  value_range:
    'a strict three-value notan, a single light source with every other light switched off, a limit of one grey mixed once and reused, a requirement that the darkest patch reach the full black the material can give.',
  edge_quality:
    'a toned ground worked with an eraser rather than an outline, a rule of exactly one hard edge on the sheet, a required number of lost edges where the form dissolves into the background, a ban on any continuous outline.',
  composition:
    'a card viewfinder, a fixed number of small thumbnails at a fixed size and time, a rule that the subject must touch at least one edge of the frame, a ban on centring the subject unless the thumbnails show it was chosen.',
}

/* ------------------------------------------------------------------ *
 * Small formatters. Every number that reaches a prompt goes through
 * one of these so the model never sees 0.4099999999999999.
 * ------------------------------------------------------------------ */

function n2(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'unknown'
}

function n1(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : 'unknown'
}

function pct(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v)
    ? `${Math.round(v * 100)}%`
    : 'unknown'
}

function section(title: string, body: string[]): string {
  return [title, ...body].join('\n')
}

/* ------------------------------------------------------------------ *
 * Score prompt
 * ------------------------------------------------------------------ */

function rubricBlock(): string {
  const rows: string[] = []
  for (const d of DIMENSIONS) {
    const spec = RUBRIC[d]
    rows.push(`${d} — ${spec.longLabel}`)
    rows.push(`  Looking for: ${spec.question}`)
    rows.push(`  ${SCORE_MIN}-3  ${spec.anchors.low}`)
    rows.push(`  4-7  ${spec.anchors.mid}`)
    rows.push(`  8-${SCORE_MAX}  ${spec.anchors.high}`)
  }
  return section(
    `THE RUBRIC — five dimensions, integer scores ${SCORE_MIN} to ${SCORE_MAX}`,
    rows,
  )
}

/** Per-dimension mean of the instructor's own anchor scores. Null when no anchor carries that dimension. */
function anchorMeans(
  anchors: CalibrationAnchor[],
): Partial<Record<Dimension, number>> {
  const out: Partial<Record<Dimension, number>> = {}
  for (const d of DIMENSIONS) {
    const values = anchors
      .map((a) => a.scores[d])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (values.length > 0) {
      out[d] = values.reduce((sum, v) => sum + v, 0) / values.length
    }
  }
  return out
}

function calibrationBlock(anchors: CalibrationAnchor[]): string {
  const used = anchors.slice(0, MAX_ANCHORS)
  if (used.length === 0) {
    return section('THIS ACADEMY IS NOT CALIBRATED YET', [
      'No instructor-scored anchor works exist for this academy. There is no local standard to match, so you are guessing at what this academy calls a 6. Because of that:',
      '  - Keep every confidence at or below 0.55, however clear the image looks.',
      '  - Stay inside 4 to 7 unless the image makes a stronger number unavoidable.',
      '  - Say in at least one rationale that no local standard was available to compare against.',
    ])
  }

  const rows: string[] = [
    'The instructor at this academy scored the works below by hand. They define what a number means here. When this academy calls a work a 6 for line control, this is the 6 they mean. Match this standard, not your own and not a general one.',
    '',
  ]

  used.forEach((anchor, i) => {
    const parts = DIMENSIONS.map((d) => {
      const v = anchor.scores[d]
      return typeof v === 'number' ? `${d} ${Math.round(v)}` : `${d} —`
    }).join(', ')
    rows.push(`  Anchor ${i + 1}: ${parts}`)
    const note = anchor.work.notes?.trim()
    if (note) rows.push(`    Instructor note: ${note.slice(0, 120)}`)
  })

  const means = anchorMeans(used)
  const meanRow = DIMENSIONS.map((d) => {
    const v = means[d]
    return typeof v === 'number' ? `${d} ${n1(v)}` : `${d} —`
  }).join(', ')

  rows.push('')
  rows.push(`  This academy's anchor means: ${meanRow}`)
  rows.push(
    'Score this image against those means. If you are about to place a number more than three points away from the academy mean for that dimension, name in the rationale the thing in this image that justifies the distance.',
  )

  return section(
    `THIS ACADEMY'S CALIBRATION — ${used.length} anchor work${used.length === 1 ? '' : 's'}`,
    rows,
  )
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

function evidenceBlock(metrics: ImageMetrics | null): string {
  if (!metrics) {
    return section('MEASURED EVIDENCE', [
      'No pixel measurements were available for this image. Judge from the image alone and lower every confidence by roughly 0.15 to reflect that you are working without them.',
    ])
  }

  const m = metrics
  const rows: string[] = []

  rows.push(
    `  - Value spread: ${n2(m.valueSpread)}. The darkest pixels sit at ${n2(m.darkest)} and the lightest at ${n2(m.lightest)} on a 0-to-1 luminance scale. A drawing using the full scale measures close to 1.00.`,
  )
  rows.push(
    `  - Contrast, as the standard deviation of luminance: ${n2(m.contrastSd)}. Flat, evenly grey work measures below 0.12.`,
  )
  rows.push(
    `  - Ink coverage: ${pct(m.inkCoverage)} of pixels are darker than 0.35 luminance.`,
  )

  if (Array.isArray(m.histogram) && m.histogram.length > 0) {
    let peak = 0
    for (let i = 1; i < m.histogram.length; i += 1) {
      if ((m.histogram[i] ?? 0) > (m.histogram[peak] ?? 0)) peak = i
    }
    const bands = m.histogram.length
    const occupied = m.histogram.filter((v) => v > 0.02).length
    const lo = (peak / bands).toFixed(2)
    const hi = ((peak + 1) / bands).toFixed(2)
    rows.push(
      `  - Luminance histogram: ${occupied} of ${bands} bands carry more than 2% of the pixels, and the fullest band is ${lo} to ${hi}, holding ${pct(m.histogram[peak])}.`,
    )
  }

  rows.push(
    `  - Edge density, the mean gradient across the sheet: ${n2(m.edgeDensity)}. Edge variance, the spread of that gradient: ${n2(m.edgeVariance)}. When variance is small next to density, every edge is being treated the same way.`,
  )
  rows.push(
    `  - Empty share: ${pct(m.emptyShare)} of the sheet carries effectively no marks.`,
  )
  rows.push(
    `  - Centre of ink mass: x ${n2(m.massCenter.x)}, y ${n2(m.massCenter.y)}, where 0.50, 0.50 is dead centre. It sits ${n2(thirdsDistance(m.massCenter))} away from the nearest rule-of-thirds intersection.`,
  )
  rows.push(
    `  - Border energy: ${pct(m.borderEnergy)} of all edge energy sits in the outer band of the frame.`,
  )
  rows.push(
    `  - Stroke coherence: ${n2(m.strokeCoherence)} on a 0-to-1 scale. High means the marks agree on a direction; low means searching or scribbled marks.`,
  )
  rows.push(`  - Image: ${m.width} by ${m.height} pixels.`)

  rows.push('')
  rows.push(
    'These numbers were measured from the pixels of this image. They are facts about the file, not judgements about the work. Reconcile your scores with them.',
  )
  rows.push(
    'If your judgement disagrees with a measurement, say so plainly in that dimension\'s rationale and explain the disagreement. A photograph shot under flash measures a narrow value range even when the drawing on the desk has a full one, and a phone photograph taken at an angle measures a mass centre that is not where the student put it.',
  )

  return section('MEASURED EVIDENCE', rows)
}

function contextBlock(
  notes: string | null | undefined,
  brief: AssignmentBrief | null | undefined,
): string | null {
  const rows: string[] = []
  const trimmed = notes?.trim()
  if (trimmed) rows.push(`  Instructor note on this work: ${trimmed.slice(0, 400)}`)
  if (brief) {
    rows.push(`  This work answers a brief titled "${brief.title}".`)
    if (brief.success_criteria.length > 0) {
      rows.push('  The brief asked the instructor to look for:')
      for (const c of brief.success_criteria.slice(0, 5)) rows.push(`    - ${c}`)
    }
    rows.push(
      '  Judge the work on the rubric, not on the brief. Mention the brief in a rationale only where the image plainly meets or misses one of those criteria.',
    )
  }
  return rows.length > 0 ? section('CONTEXT', rows) : null
}

/**
 * The scoring prompt: role, rubric, this academy's own calibration, the pixel
 * measurements the model must reconcile with, and the rules for rationales and
 * confidence.
 */
export function buildScorePrompt(input: {
  discipline: Discipline
  anchors: CalibrationAnchor[]
  metrics: ImageMetrics | null
  notes?: string | null
  assignmentBrief?: AssignmentBrief | null
}): string {
  const { discipline, anchors, metrics, notes, assignmentBrief } = input

  const blocks: (string | null)[] = [
    section('ROLE', [
      'You propose scores for a single piece of student work. An instructor reads every number you produce and either confirms it or replaces it before anything is recorded. You are not the authority on this student and you never will be.',
      'Propose, explain what you are looking at, and be explicit about what you cannot see. A proposal the instructor has to correct costs them ten seconds. A proposal that sounds certain and is wrong costs them a parent meeting.',
      DISCIPLINE_NOTE[discipline],
    ]),
    rubricBlock(),
    calibrationBlock(anchors),
    evidenceBlock(metrics),
    contextBlock(notes, assignmentBrief),
    section('WRITING THE RATIONALES', [
      '  - One sentence per dimension, under 240 characters.',
      '  - Every rationale must point at something visible in THIS image, or at one of the measurements above. "The cast shadow under the jug stays the same grey as the wall behind it" is a rationale. "Shows a good understanding of value" is not.',
      `  - Banned words, in any form: ${BANNED_WORDS.join(', ')}. Do not reach for a synonym either.`,
      '  - No generic praise, no encouragement, no summary of the rubric back at the reader. The instructor is deciding a number, not being reassured.',
      '  - Do not guess at the student\'s age, effort or intent. You are looking at a photograph of a sheet of paper.',
      '  - If a dimension cannot be judged from this photograph, say that in the rationale and drop the confidence rather than inventing a reading.',
    ]),
    section('CONFIDENCE', [
      'Return a confidence between 0 and 1 for each dimension and make it vary. It is read directly by the interface: a low confidence renders fainter and opens the override control wider.',
      '  - 0.80 and above: unambiguous evidence, and the work sits close to an anchor you were given.',
      '  - 0.50 to 0.80: the ordinary case.',
      '  - Below 0.40: the photograph is poor — glare, a shadow across the sheet, heavy skew, out of focus, cropped — or the medium is ambiguous, or this work is unlike anything in the anchors.',
      'Proportion judged without knowing the real subject, and value range judged from a photograph with visible glare, are the two that should most often sit low.',
      'Five identical confidences will be read as a refusal to answer the question.',
    ]),
    section('OUTPUT', [
      'Return JSON matching the supplied schema and nothing else. No prose before it, no code fence around it.',
      '  - subject: a few words naming what you believe you are looking at.',
      `  - scores: exactly five entries, one for each of ${DIMENSIONS.join(', ')}. One entry per dimension, no duplicates and no omissions.`,
      `  - Each score is an integer from ${SCORE_MIN} to ${SCORE_MAX}.`,
    ]),
  ]

  return blocks.filter((b): b is string => b !== null).join('\n\n')
}

/* ------------------------------------------------------------------ *
 * Assignment prompt
 * ------------------------------------------------------------------ */

function trajectoryBlock(analysis: TrajectoryAnalysis): string[] {
  const rows: string[] = []
  for (const d of DIMENSIONS) {
    const latest = analysis.latest[d]
    const slope = analysis.slopes[d]
    const latestText = typeof latest === 'number' ? n1(latest) : 'no score yet'
    const slopeText =
      typeof slope === 'number' ? `${slope >= 0 ? '+' : '-'}${n2(Math.abs(slope))} points per week` : 'trend unknown'
    rows.push(`  - ${RUBRIC[d].longLabel}: currently ${latestText}, moving ${slopeText}.`)
  }
  rows.push(`  - Works on record: ${analysis.points.length}.`)
  rows.push(
    `  - Share of scores the instructor has confirmed: ${pct(analysis.confirmedShare)}.`,
  )
  return rows
}

/**
 * The assignment prompt. Produces one exercise aimed at a single dimension,
 * with a constraint that makes the dimension impossible to avoid.
 */
export function buildAssignmentPrompt(input: {
  studentName: string
  level: number
  targetDimension: Dimension
  analysis: TrajectoryAnalysis
  plateau?: PlateauFinding | null
  discipline: Discipline
  recentBriefTitles: string[]
}): string {
  const {
    studentName,
    level,
    targetDimension,
    analysis,
    plateau,
    discipline,
    recentBriefTitles,
  } = input

  const spec = RUBRIC[targetDimension]
  const current = analysis.latest[targetDimension]

  const plateauRows: string[] = []
  if (plateau) {
    plateauRows.push(
      `  ${spec.longLabel} has been flat since ${longDate(plateau.since)} — ${plateau.weeksFlat} weeks, moving ${n2(plateau.slope)} points per week while the other four dimensions moved ${n2(plateau.peerSlope)}.`,
    )
    plateauRows.push(`  What the instructor is being shown: ${plateau.message}`)
    plateauRows.push(
      '  Whatever this student has been doing has stopped moving this dimension. Do not prescribe more of it. Change the constraint, the material, the scale or the time limit so the old habit cannot be used.',
    )
  }

  const blocks: (string | null)[] = [
    section('ROLE', [
      'You are drafting one practice exercise for an art instructor to hand to a student. The instructor edits it before it is issued, so write something they would want to edit rather than replace.',
      'This has to be a real exercise. A student will read it, set up their table and spend the stated time on it. Vague instructions waste a session.',
      DISCIPLINE_NOTE[discipline],
    ]),
    section('THE STUDENT', [
      `  Name: ${studentName}`,
      `  Level: ${level}. Level 1 is a beginner, level 5 is close to portfolio work. Pitch the difficulty and the vocabulary at this level.`,
      ...trajectoryBlock(analysis),
    ]),
    section('THE TARGET', [
      `  Dimension: ${targetDimension} — ${spec.longLabel}.`,
      `  What it measures: ${spec.question}`,
      `  Current score: ${typeof current === 'number' ? n1(current) : 'not yet scored'} out of ${SCORE_MAX}.`,
      `  A weak result looks like: ${spec.anchors.low}`,
      `  A strong result looks like: ${spec.anchors.high}`,
      `  Constraints that force this dimension include: ${FORCING_CONSTRAINTS[targetDimension]}`,
      'Pick or invent one such constraint and build the exercise around it. The exercise must be impossible to complete well without improving this dimension. An exercise that a student could pass by working on something else is a failed exercise.',
    ]),
    plateauRows.length > 0 ? section('WHY NOW', plateauRows) : null,
    recentBriefTitles.length > 0
      ? section('DO NOT REPEAT', [
          'This student has recently been given:',
          ...recentBriefTitles.slice(0, 12).map((t) => `  - ${t}`),
          'Do not reissue any of these and do not issue a rewording of one. Change the subject, the material or the constraint.',
        ])
      : null,
    section('WHAT THE BRIEF MUST CONTAIN', [
      '  - A specific setup. Name the objects, the light, the distance and the surface. "A still life" is not a setup. "Three objects on a white sheet, one desk lamp at 45 degrees to the left, every other light off, viewed from two metres" is.',
      '  - One constraint that forces the target dimension, stated as a rule the student can break. Rules that can be broken are rules a student can feel themselves keeping.',
      '  - A time box in minutes that a student will actually honour. Split it across the steps if the exercise has stages.',
      '  - Materials the student is likely to already own. Do not specify a brand or anything that must be ordered.',
      '  - Success criteria the instructor can check by looking at the returned sheet. "Only three values appear, and a fourth grey is a fail" can be checked. "Shows improved control" cannot.',
      '  - A rationale that names this student\'s own numbers, so they know why they in particular got this exercise.',
    ]),
    section('OUTPUT', [
      'Return JSON matching the supplied schema and nothing else.',
      '  - title: names the exercise, not the dimension. Under 90 characters.',
      '  - rationale: why this student is doing this now, citing their score and trend.',
      '  - steps: 3 to 7 steps, each one thing the student does, in order.',
      '  - materials: what they need on the table.',
      '  - duration_minutes: a single number for the whole exercise.',
      '  - success_criteria: 2 to 5 checks the instructor makes by looking.',
      'Plain sentences. No encouragement, no exclamation marks, and no words about how this exercise will make the student feel.',
    ]),
  ]

  return blocks.filter((b): b is string => b !== null).join('\n\n')
}

/* ------------------------------------------------------------------ *
 * Report prompt
 * ------------------------------------------------------------------ */

/**
 * The parent report prompt. The instructor is the author of anything this
 * produces, so the register is theirs and the reader is a parent who does not
 * draw.
 */
export function buildReportPrompt(input: {
  studentName: string
  periodStart: string
  periodEnd: string
  analysis: TrajectoryAnalysis
  worksInPeriod: number
  plateaus: PlateauFinding[]
  discipline: Discipline
}): string {
  const {
    studentName,
    periodStart,
    periodEnd,
    analysis,
    worksInPeriod,
    plateaus,
    discipline,
  } = input

  const rising: Dimension[] = []
  const flat: Dimension[] = []
  for (const d of DIMENSIONS) {
    const slope = analysis.slopes[d]
    if (typeof slope === 'number' && slope > 0.05) rising.push(d)
    else flat.push(d)
  }

  const numberRows = trajectoryBlock(analysis)
  const plateauRows = plateaus.map(
    (p) =>
      `  - ${RUBRIC[p.dimension].longLabel} has been flat for ${p.weeksFlat} weeks, since ${longDate(p.since)}.`,
  )

  const blocks: (string | null)[] = [
    section('ROLE', [
      `You are drafting a progress report that ${studentName}'s instructor will sign and send. The instructor is the author. Write in their voice: the person who has watched this student work every week and is telling a parent what they have seen.`,
      'The instructor reads and edits every line before it goes out. Write the version they would edit lightly, not the version they would delete.',
    ]),
    section('THE READER', [
      'A fee-paying parent who does not draw and does not know what an edge or a value is. They want to know whether the money is buying anything.',
      '  - Plain sentences. One idea per sentence.',
      '  - No art vocabulary unless the same sentence explains it. "Her darks now reach a true black instead of stopping at grey" explains itself. "Improved tonal range" does not.',
      '  - Cite the real numbers. A parent can hold "5 to 7 out of 10 across eleven works" in their head.',
      '  - Say what happens next in the studio, in terms the parent can picture.',
    ]),
    section('THE RECORD', [
      `  Period: ${longDate(periodStart)} to ${longDate(periodEnd)}.`,
      `  Works in the period: ${worksInPeriod}.`,
      `  Discipline: ${discipline}.`,
      ...numberRows,
      rising.length > 0
        ? `  Moving up: ${rising.map((d) => RUBRIC[d].longLabel).join(', ')}.`
        : '  Nothing moved up measurably in this period. Say so plainly rather than finding something to praise.',
      flat.length > 0
        ? `  Flat or slipping: ${flat.map((d) => RUBRIC[d].longLabel).join(', ')}.`
        : '  Every dimension moved up in this period.',
      ...plateauRows,
    ]),
    section('RULES', [
      '  - Never use the words "AI", "algorithm", "model", "automatically", "system" or "generated". The instructor scored this student. Anything that suggests otherwise makes the report worthless.',
      '  - Never promise an outcome. No exam results, no admissions, no future scores. Describe what has happened and what the studio will work on next.',
      '  - Never compare this student to other students or to an average.',
      '  - Do not describe the student\'s character, effort or attitude. You have not met them. You have their work.',
      '  - Where a number went down or stood still, say so. A report where everything improves is a report a parent stops reading.',
      '  - No marketing language, no exclamation marks, no closing flourish.',
    ]),
    section('OUTPUT', [
      'Return JSON matching the supplied schema and nothing else.',
      `  - headline: one line a parent reads first. Name ${studentName} and the period or the number of works.`,
      '  - summary: two or three short paragraphs, separated by a blank line. What was worked on, what changed, what did not.',
      '  - improved: one entry per dimension that actually rose, at most five. Each note explains the change in a parent\'s words and gives the numbers.',
      '  - focus: at most three dimensions the studio will work on next, with a plain reason.',
      '  - next_steps: 1 to 4 concrete things happening in the studio next term, in the parent\'s language.',
      'If a section has nothing honest to put in it, return it empty rather than filling it.',
    ]),
  ]

  return blocks.filter((b): b is string => b !== null).join('\n\n')
}
