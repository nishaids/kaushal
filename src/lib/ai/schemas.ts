import { z } from 'zod'
import { DIMENSIONS, SCORE_MAX, SCORE_MIN } from '../rubric'

/**
 * Every model call in KAUSHAL is schema-forced and Zod-validated. A response
 * that does not parse is retried exactly once with the parse error appended to
 * the prompt; a second failure falls through to the deterministic scorer. No
 * call is allowed to hang the UI or return prose we then regex at.
 */

const dimensionEnum = z.enum(DIMENSIONS)

export const scoreProposalSchema = z.object({
  dimension: dimensionEnum,
  score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
  rationale: z
    .string()
    .min(12)
    .max(240)
    .describe('One sentence about what is visible in this image.'),
  confidence: z.number().min(0).max(1),
})

export const scoreResponseSchema = z.object({
  scores: z.array(scoreProposalSchema).length(DIMENSIONS.length),
  /** What the model believes it is looking at. Shown to the instructor. */
  subject: z.string().min(2).max(120),
})

export type ScoreResponse = z.infer<typeof scoreResponseSchema>
export type ScoreProposal = z.infer<typeof scoreProposalSchema>

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
    .array(z.object({ dimension: dimensionEnum, note: z.string().min(10).max(280) }))
    .max(5),
  focus: z
    .array(z.object({ dimension: dimensionEnum, note: z.string().min(10).max(280) }))
    .max(3),
  next_steps: z.array(z.string().min(8).max(220)).min(1).max(4),
})

export type ReportResponse = z.infer<typeof reportResponseSchema>

/* ------------------------------------------------------------------ *
 * JSON Schema mirrors handed to the providers. Gemini takes
 * responseSchema, Groq takes json_schema in response_format. Kept beside
 * the Zod so the two can never drift silently.
 * ------------------------------------------------------------------ */

export const scoreJsonSchema = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    scores: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: [...DIMENSIONS] },
          score: { type: 'integer', minimum: SCORE_MIN, maximum: SCORE_MAX },
          rationale: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['dimension', 'score', 'rationale', 'confidence'],
      },
    },
  },
  required: ['subject', 'scores'],
} as const

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
          dimension: { type: 'string', enum: [...DIMENSIONS] },
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
          dimension: { type: 'string', enum: [...DIMENSIONS] },
          note: { type: 'string' },
        },
        required: ['dimension', 'note'],
      },
    },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'improved', 'focus', 'next_steps'],
} as const
