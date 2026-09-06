/**
 * The five rubric dimensions.
 *
 * Every dimension here is visually verifiable — an instructor can point at the
 * paper and say why the number is what it is. Nothing abstract ("creativity",
 * "effort") lives in this list, because an unscoreable dimension discredits
 * every scoreable one next to it.
 */

export const DIMENSIONS = [
  'proportion',
  'line_control',
  'value_range',
  'edge_quality',
  'composition',
] as const

export type Dimension = (typeof DIMENSIONS)[number]

export interface DimensionSpec {
  id: Dimension
  /** Short label for chart legends and table headers. */
  label: string
  /** Full label used in prose and reports. */
  longLabel: string
  /** What the instructor is actually looking at. One sentence. */
  question: string
  /** Graphite value this dimension is drawn in. Five values, not five colours. */
  ink: string
  /** Stroke pattern, so the five lines stay separable without a second hue. */
  dash: string | undefined
  /** Anchors read to the model and shown in the calibration wizard. */
  anchors: { low: string; mid: string; high: string }
}

export const RUBRIC: Record<Dimension, DimensionSpec> = {
  proportion: {
    id: 'proportion',
    label: 'Proportion',
    longLabel: 'Proportion & placement',
    question: 'Are the relationships between parts, and their positions, accurate?',
    ink: '#131210',
    dash: undefined,
    anchors: {
      low: 'Sizes and positions drift; parts do not relate to one another consistently.',
      mid: 'Major relationships hold; smaller parts still slip.',
      high: 'Relationships and placement read as measured throughout.',
    },
  },
  line_control: {
    id: 'line_control',
    label: 'Line',
    longLabel: 'Line control',
    question: 'Is the mark-making confident, consistent and intentional?',
    ink: '#393630',
    dash: '7 3',
    anchors: {
      low: 'Hesitant, sketchy repetition; the line searches rather than states.',
      mid: 'Lines commit in the main forms, break down in detail.',
      high: 'Single decisive strokes with deliberate weight variation.',
    },
  },
  value_range: {
    id: 'value_range',
    label: 'Value',
    longLabel: 'Value range',
    question: 'How far apart are the darkest dark and the lightest light?',
    ink: '#58524a',
    dash: '1 3',
    anchors: {
      low: 'Everything sits in a narrow mid-grey band; no true dark, no clean light.',
      mid: 'A range is present but the darks stop short of full.',
      high: 'Full scale used, from paper white to a genuine darkest dark.',
    },
  },
  edge_quality: {
    id: 'edge_quality',
    label: 'Edges',
    longLabel: 'Edge quality',
    question: 'Is there variation between hard, soft and lost edges?',
    ink: '#746d62',
    dash: '11 4 2 4',
    anchors: {
      low: 'Every edge is treated the same way, usually hard outline.',
      mid: 'Some softening appears, but it is not used to direct attention.',
      high: 'Hard, soft and lost edges are chosen deliberately and read as depth.',
    },
  },
  composition: {
    id: 'composition',
    label: 'Composition',
    longLabel: 'Composition',
    question: 'How well is the picture space used?',
    ink: '#8e8579',
    dash: '3 3',
    anchors: {
      low: 'Subject floats or crowds; large areas of the sheet do nothing.',
      mid: 'Placement is reasonable; margins and negative space are uneven.',
      high: 'The whole sheet is in play; placement carries the picture.',
    },
  },
}

export const DIMENSION_LIST: DimensionSpec[] = DIMENSIONS.map((d) => RUBRIC[d])

export function isDimension(v: string): v is Dimension {
  return (DIMENSIONS as readonly string[]).includes(v)
}

/** Score bounds. Every score in the product is an integer 1..10. */
export const SCORE_MIN = 1
export const SCORE_MAX = 10

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return SCORE_MIN
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(n)))
}
