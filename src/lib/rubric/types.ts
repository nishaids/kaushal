/**
 * The rubric engine.
 *
 * KAUSHAL used to hard-code five drawing dimensions as a closed TypeScript
 * union. That single decision made the product an art grader by construction:
 * a music teacher could not describe rhythm, a coding teacher could not
 * describe debugging, and no academy could disagree with us about what was
 * worth measuring.
 *
 * A dimension is now data. It has a key, a scale, a weight, level descriptors
 * and a mastery rule, and it belongs to a versioned rubric owned by one
 * academy. The product no longer has an opinion about what quality is — it has
 * an opinion about how evidence for quality should be recorded.
 */

/**
 * A dimension key. Deliberately a plain string: it is chosen by the academy,
 * not by us. Keys are lowercase snake_case and stable — renaming a *label* must
 * never orphan the scores recorded against a key.
 */
export type Dimension = string

/** What a submission for this dimension actually is. */
export type EvidenceKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'code'
  | 'document'
  | 'observation'

/**
 * How far along a learner is on one dimension. Mastery is never inferred from a
 * single submission — see MasteryRule.
 */
export const MASTERY_LEVELS = [
  'not_started',
  'emerging',
  'developing',
  'competent',
  'strong',
  'mastered',
] as const

export type MasteryLevel = (typeof MASTERY_LEVELS)[number]

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  not_started: 'Not started',
  emerging: 'Emerging',
  developing: 'Developing',
  competent: 'Competent',
  strong: 'Strong',
  mastered: 'Mastered',
}

/** The scoring scale. Most academies want 1–10; some want 1–4 or 0–100. */
export interface Scale {
  min: number
  max: number
  /** Smallest meaningful increment. 1 for a rung-based scale. */
  step: number
}

export const DEFAULT_SCALE: Scale = { min: 1, max: 10, step: 1 }

/**
 * A band of the scale with a written description. This is what makes a rubric
 * teachable rather than a number line: an instructor and a model can both read
 * "what a 7 looks like here".
 */
export interface LevelDescriptor {
  /** Inclusive lower bound on the scale. */
  from: number
  /** Inclusive upper bound. */
  to: number
  descriptor: string
}

/** When a dimension may be called mastered. Never on one submission. */
export interface MasteryRule {
  /** Score at or above this counts as evidence toward mastery. */
  threshold: number
  /** How many separate submissions must clear it. */
  evidenceCount: number
  /** Across at least this many distinct sessions/days. */
  minDistinctDays?: number
}

export const DEFAULT_MASTERY: MasteryRule = {
  threshold: 8,
  evidenceCount: 3,
  minDistinctDays: 14,
}

export interface RubricDimension {
  /** Stable identifier. Scores are recorded against this, never against label. */
  key: Dimension
  /** Short label for charts and dense tables. */
  label: string
  /** Full label for prose, reports and anything a parent reads. */
  longLabel: string
  /** What the instructor is actually looking at. One sentence, concrete. */
  question: string
  /**
   * Relative importance when rolling several dimensions into one figure.
   * Defaults to 1. A weight of 0 keeps a dimension tracked but out of summaries.
   */
  weight: number
  scale: Scale
  /** Ordered low to high. May be empty; the UI degrades to the scale alone. */
  levels: LevelDescriptor[]
  /** What a submission for this dimension consists of. */
  evidence: EvidenceKind[]
  mastery: MasteryRule
  /**
   * Whether a model can meaningfully judge this from the submitted media. A
   * dimension marked false is tracked and scored by humans only, and is never
   * sent for a proposal — which is the honest treatment for things like
   * "rehearsal discipline" that no image contains.
   */
  aiAssessable: boolean
  /** Optional curriculum objective this dimension serves. */
  objective?: string
  /** Rough learner stage this dimension starts to apply. */
  appliesFromLevel?: number
}

/**
 * A rubric belongs to one academy and is versioned. Scores reference the
 * version they were given under, so changing a rubric never silently rewrites
 * the meaning of last term's numbers.
 */
export interface Rubric {
  id: string
  academy_id: string
  /** Increments on every published change. Scores pin to this. */
  version: number
  name: string
  discipline: string
  /** Free text shown at the top of the calibration screen. */
  description: string
  dimensions: RubricDimension[]
  /** Null while a draft; set when it becomes the academy's live rubric. */
  published_at: string | null
  created_at: string
}

/** A rubric preset: the starting point an academy forks and then edits. */
export interface RubricPreset {
  id: string
  discipline: string
  name: string
  description: string
  /** One line shown in the discipline picker at onboarding. */
  tagline: string
  dimensions: Array<
    Omit<RubricDimension, 'weight' | 'scale' | 'mastery' | 'levels' | 'evidence' | 'aiAssessable'> &
      Partial<Pick<RubricDimension, 'weight' | 'scale' | 'mastery' | 'levels' | 'evidence' | 'aiAssessable'>>
  >
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Fill a preset's optional fields with the defaults. */
export function materialiseDimension(
  d: RubricPreset['dimensions'][number],
): RubricDimension {
  return {
    key: d.key,
    label: d.label,
    longLabel: d.longLabel,
    question: d.question,
    weight: d.weight ?? 1,
    scale: d.scale ?? DEFAULT_SCALE,
    levels: d.levels ?? [],
    evidence: d.evidence ?? ['image'],
    mastery: d.mastery ?? DEFAULT_MASTERY,
    aiAssessable: d.aiAssessable ?? true,
    objective: d.objective,
    appliesFromLevel: d.appliesFromLevel,
  }
}

/** Look a dimension up by key. Returns undefined rather than throwing. */
export function findDimension(
  rubric: Pick<Rubric, 'dimensions'>,
  key: Dimension,
): RubricDimension | undefined {
  return rubric.dimensions.find((d) => d.key === key)
}

/**
 * A readable label for a key that is not in the rubric.
 *
 * Old scores outlive rubric edits, so the UI must be able to render a key it no
 * longer recognises. Showing "value_range" as "Value range" is better than
 * showing nothing and far better than crashing.
 */
export function humaniseKey(key: Dimension): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** The label to print for a key, whether or not the rubric still has it. */
export function dimensionLabel(
  rubric: Pick<Rubric, 'dimensions'> | null | undefined,
  key: Dimension,
): string {
  const found = rubric ? findDimension(rubric, key) : undefined
  return found?.label ?? humaniseKey(key)
}

export function dimensionLongLabel(
  rubric: Pick<Rubric, 'dimensions'> | null | undefined,
  key: Dimension,
): string {
  const found = rubric ? findDimension(rubric, key) : undefined
  return found?.longLabel ?? humaniseKey(key)
}

/** The scale for a key, falling back to the product default. */
export function dimensionScale(
  rubric: Pick<Rubric, 'dimensions'> | null | undefined,
  key: Dimension,
): Scale {
  const found = rubric ? findDimension(rubric, key) : undefined
  return found?.scale ?? DEFAULT_SCALE
}

/** Clamp a raw number onto a dimension's scale, respecting its step. */
export function clampToScale(value: number, scale: Scale = DEFAULT_SCALE): number {
  if (!Number.isFinite(value)) return scale.min
  const stepped =
    scale.step > 0
      ? Math.round((value - scale.min) / scale.step) * scale.step + scale.min
      : value
  return Math.min(scale.max, Math.max(scale.min, stepped))
}

/** Every step on a scale, for tick-style controls. */
export function scaleSteps(scale: Scale = DEFAULT_SCALE): number[] {
  const out: number[] = []
  const step = scale.step > 0 ? scale.step : 1
  for (let v = scale.min; v <= scale.max + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000)
  }
  return out
}

/** Normalise a score to 0..1 so dimensions on different scales can be compared. */
export function normalise(value: number, scale: Scale = DEFAULT_SCALE): number {
  const span = scale.max - scale.min
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (value - scale.min) / span))
}

/** The written descriptor covering a score, if the rubric defines one. */
export function descriptorFor(
  dimension: RubricDimension | undefined,
  value: number,
): string | null {
  if (!dimension) return null
  const band = dimension.levels.find((l) => value >= l.from && value <= l.to)
  return band?.descriptor ?? null
}

/** The keys a model may be asked about. Human-only dimensions are excluded. */
export function aiAssessableKeys(rubric: Pick<Rubric, 'dimensions'>): Dimension[] {
  return rubric.dimensions.filter((d) => d.aiAssessable).map((d) => d.key)
}
