import { RUBRIC_PRESETS, findPreset } from './presets'
import {
  DEFAULT_SCALE,
  clampToScale,
  materialiseDimension,
  type Dimension,
  type Rubric,
  type RubricDimension,
} from './types'
import { ORPHAN_VISUAL, visualsFor, type DimensionVisual } from './visuals'

export * from './types'
export * from './presets'
export * from './visuals'

/**
 * The rubric a screen is rendering against, with its visual assignment already
 * resolved. Components take one of these rather than reaching for a module-level
 * constant, which is what makes the same trajectory chart draw a drawing rubric,
 * a music rubric or a nine-dimension vocational rubric without knowing anything
 * about any of them.
 */
export interface RubricView {
  rubric: Rubric
  dimensions: RubricDimension[]
  visual: (key: Dimension) => DimensionVisual
  find: (key: Dimension) => RubricDimension | undefined
  keys: Dimension[]
}

export function toRubricView(rubric: Rubric): RubricView {
  const keys = rubric.dimensions.map((d) => d.key)
  const visuals = visualsFor(keys)
  const byKey = new Map(rubric.dimensions.map((d) => [d.key, d]))
  return {
    rubric,
    dimensions: rubric.dimensions,
    keys,
    find: (key) => byKey.get(key),
    visual: (key) => visuals.get(key) ?? { ...ORPHAN_VISUAL, key },
  }
}

/** Build a rubric for an academy from one of the shipped presets. */
export function rubricFromPreset(input: {
  presetId: string
  academyId: string
  id?: string
  version?: number
  now?: string
}): Rubric {
  const preset = findPreset(input.presetId) ?? RUBRIC_PRESETS[0]
  const now = input.now ?? new Date().toISOString()
  return {
    id: input.id ?? `rubric_${input.presetId}`,
    academy_id: input.academyId,
    version: input.version ?? 1,
    name: preset.name,
    discipline: preset.discipline,
    description: preset.description,
    dimensions: preset.dimensions.map(materialiseDimension),
    published_at: now,
    created_at: now,
  }
}

/* ------------------------------------------------------------------ *
 * The drawing rubric, as the product's default.
 *
 * KAUSHAL was built inside a drawing academy, so drawing is the rubric a new
 * academy gets before it picks anything else, and it is what the seeded demo
 * runs on. It is no longer privileged in the type system — it is one preset
 * among ten.
 * ------------------------------------------------------------------ */

export const DEFAULT_RUBRIC: Rubric = rubricFromPreset({
  presetId: 'drawing',
  academyId: '',
  id: 'rubric_drawing_default',
  now: '2026-01-01T00:00:00.000Z',
})

export const DEFAULT_RUBRIC_VIEW: RubricView = toRubricView(DEFAULT_RUBRIC)

/* ------------------------------------------------------------------ *
 * Compatibility surface.
 *
 * The five drawing keys used to be a closed union that 41 files imported. These
 * exports keep that call sites working against the default rubric while the
 * product migrates to passing a RubricView explicitly. New code should take a
 * RubricView; anything still importing DIMENSIONS is, by definition, assuming
 * a drawing academy.
 * ------------------------------------------------------------------ */

/** @deprecated Assumes the drawing rubric. Take a RubricView instead. */
export const DIMENSIONS: Dimension[] = DEFAULT_RUBRIC.dimensions.map((d) => d.key)

export interface LegacyDimensionSpec extends RubricDimension {
  /** Alias kept so existing components can keep reading `.id`. */
  id: Dimension
  ink: string
  dash: string | undefined
  /** Flattened level descriptors, as the calibration UI still expects. */
  anchors: { low: string; mid: string; high: string }
}

function toLegacySpec(d: RubricDimension): LegacyDimensionSpec {
  const v = DEFAULT_RUBRIC_VIEW.visual(d.key)
  const band = (from: number, to: number) =>
    d.levels.find((l) => l.from >= from && l.to <= to)?.descriptor ?? ''
  return {
    ...d,
    id: d.key,
    ink: v.ink,
    dash: v.dash,
    anchors: {
      low: band(1, 3),
      mid: band(4, 7),
      high: band(8, 10),
    },
  }
}

/** @deprecated Assumes the drawing rubric. Take a RubricView instead. */
export const DIMENSION_LIST: LegacyDimensionSpec[] =
  DEFAULT_RUBRIC.dimensions.map(toLegacySpec)

/** @deprecated Assumes the drawing rubric. Take a RubricView instead. */
export const RUBRIC: Record<Dimension, LegacyDimensionSpec> = Object.fromEntries(
  DIMENSION_LIST.map((d) => [d.key, d]),
)

/** Scale bounds of the default rubric, for call sites not yet rubric-aware. */
export const SCORE_MIN = DEFAULT_SCALE.min
export const SCORE_MAX = DEFAULT_SCALE.max

/** Clamp onto the default 1–10 scale. Prefer clampToScale with a real scale. */
export function clampScore(n: number): number {
  return clampToScale(n, DEFAULT_SCALE)
}

/**
 * Whether a string is a dimension key.
 *
 * Dimension keys are academy-defined, so this can only check the shape: a
 * non-empty, reasonably short, snake_case-ish identifier. Validating against a
 * fixed list would reintroduce exactly the closed union this module removed.
 */
export function isDimension(v: string): v is Dimension {
  return typeof v === 'string' && /^[a-z][a-z0-9_]{1,48}$/.test(v)
}

/** Whether a key belongs to a specific rubric. */
export function isDimensionOf(rubric: Pick<Rubric, 'dimensions'>, v: string): boolean {
  return rubric.dimensions.some((d) => d.key === v)
}
