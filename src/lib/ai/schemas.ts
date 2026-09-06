import { z } from 'zod'
import { DIMENSIONS, type Dimension } from '../rubric'

/**
 * Every model call in KAUSHAL is schema-forced and Zod-validated. A response
 * that does not parse is retried exactly once with the parse error appended to
 * the prompt; a second failure falls through to the deterministic scorer. No
 * call is allowed to hang the UI or return prose we then regex at.
 *
 * The score schemas are built per rubric rather than declared once. Dimensions
 * are academy-defined now, so the only correct enum is the one belonging to the
 * rubric the work is actually being assessed against — and constraining the
 * model to exactly those keys is what stops it inventing a sixth dimension or
 * quietly answering with the drawing keys it saw more of in training.
 */

/* ------------------------------------------------------------------ *
 * Scoring — built from a rubric
 * ------------------------------------------------------------------ */

export interface ScoreSchemaSpec {
  /** The keys the model is allowed to answer with, in rubric order. */
  keys: Dimension[]
  /** Scale bounds. A rubric may use 1–4 or 0–100 rather than 1–10. */
  min: number
  max: number
}

/**
 * A proposal carries its own uncertainty, not just a number.
 *
 * `evidence` is what the model claims to have seen, `ambiguity` is the reading
 * under which its own score would be wrong. Requiring the second one is the
 * cheapest honesty mechanism available: a model that cannot name a competing
 * interpretation is usually one that has not looked hard enough.
 */
export function buildScoreProposalSchema(spec: ScoreSchemaSpec) {
  const keys = spec.keys.length > 0 ? spec.keys : DIMENSIONS
  const dimensionEnum = z.enum(keys as [string, ...string[]])
  return z.object({
    dimension: dimensionEnum,
    score: z.number().min(spec.min).max(spec.max),
    rationale: z
      .string()
      .min(12)
      .max(280)
      .describe('One sentence about what is actually present in this submission.'),
    evidence: z
      .string()
      .max(280)
      .optional()
      .describe('The specific thing in the work that supports the score.'),
    ambiguity: z
      .string()
      .max(280)
      .optional()
      .describe('A reading of the work under which this score would be wrong.'),
    confidence: z.number().min(0).max(1),
  })
}

export function buildScoreResponseSchema(spec: ScoreSchemaSpec) {
  const keys = spec.keys.length > 0 ? spec.keys : DIMENSIONS
  return z.object({
    scores: z.array(buildScoreProposalSchema(spec)).min(1).max(keys.length),
    subject: z
      .string()
      .min(2)
      .max(160)
      .describe('What the model believes it is looking at. Shown to the instructor.'),
  })
}

/** The JSON Schema mirror handed to the provider, built from the same spec. */
export function buildScoreJsonSchema(spec: ScoreSchemaSpec) {
  const keys = spec.keys.length > 0 ? spec.keys : DIMENSIONS
  return {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      scores: {
        type: 'array',
        minItems: 1,
        maxItems: keys.length,
        items: {
          type: 'object',
          properties: {
            dimension: { type: 'string', enum: keys },
            score: { type: 'number', minimum: spec.min, maximum: spec.max },
            rationale: { type: 'string' },
            evidence: { type: 'string' },
            ambiguity: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['dimension', 'score', 'rationale', 'confidence'],
        },
      },
    },
    required: ['subject', 'scores'],
  } as const
}

export type ScoreProposal = z.infer<ReturnType<typeof buildScoreProposalSchema>>
export type ScoreResponse = z.infer<ReturnType<typeof buildScoreResponseSchema>>

/**
 * The default-rubric schemas, for call sites that have not been handed a rubric
 * yet. These assume the drawing scale.
 */
export const scoreResponseSchema = buildScoreResponseSchema({
  keys: DIMENSIONS,
  min: 1,
  max: 10,
})
export const scoreJsonSchema = buildScoreJsonSchema({
  keys: DIMENSIONS,
  min: 1,
  max: 10,
})

/* ------------------------------------------------------------------ *
 * Assignments and reports — dimension keys are free strings, validated
 * by the caller against the rubric it is working with.
 * ------------------------------------------------------------------ */

const dimensionKey = z.string().min(1).max(64)

export const assignmentResponseSchema = z.object({
  title: z.string().min(4).max(90),
  rationale: z.string().min(20).max(400),
  steps: z.array(z.string().min(8).max(300)).min(3).max(7),
  materials: z.array(z.string().min(2).max(80)).min(1).max(8),
  duration_minutes: z.number().int().min(10).max(180),
  success_criteria: z.array(z.string().min(8).max(200)).min(2).max(5),
})

export type AssignmentResponse = z.infer<typeof assignmentResponseSchema>

export const reportResponseSchema = z.object({
  headline: z.string().min(8).max(120),
  summary: z.string().min(60).max(1400),
  improved: z
    .array(z.object({ dimension: dimensionKey, note: z.string().min(10).max(280) }))
    .max(8),
  focus: z
    .array(z.object({ dimension: dimensionKey, note: z.string().min(10).max(280) }))
    .max(4),
  next_steps: z.array(z.string().min(8).max(220)).min(1).max(4),
})

export type ReportResponse = z.infer<typeof reportResponseSchema>

export const assignmentJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    rationale: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 7 },
    materials: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
    duration_minutes: { type: 'integer' },
    success_criteria: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 5,
    },
  },
  required: [
    'title',
    'rationale',
    'steps',
    'materials',
    'duration_minutes',
    'success_criteria',
  ],
} as const

export const reportJsonSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    improved: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['dimension', 'note'],
      },
    },
    focus: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['dimension', 'note'],
      },
    },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'improved', 'focus', 'next_steps'],
} as const
