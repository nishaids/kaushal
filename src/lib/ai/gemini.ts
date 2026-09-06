import 'server-only'

import { DIMENSIONS } from '../rubric'
import type { ScoreResponse } from './schemas'
import { scoreJsonSchema, scoreResponseSchema } from './schemas'

/**
 * Gemini adapter for image scoring. Plain fetch against the REST endpoint, no
 * SDK, key read from the environment on every call and never returned in any
 * object this module produces.
 *
 * Two rules hold everywhere in here. The call is bounded at 20 seconds total,
 * including the correction retry, so the interface can never be left spinning.
 * And a response that does not satisfy the Zod schema is retried exactly once
 * with the validation error handed back to the model; a second failure throws
 * and the orchestrator falls through to the deterministic scorer.
 */

export type AiErrorCode = 'no_key' | 'timeout' | 'invalid_json' | 'http' | 'network'

/**
 * The single error type every AI call throws.
 *
 * It is declared here rather than in ./index because both providers need the
 * class at runtime and index imports both; putting it in the leaf keeps the
 * module graph acyclic. `./index` re-exports it, so callers import AiError
 * from '@/lib/ai' and instanceof holds across the whole app.
 */
export class AiError extends Error {
  readonly code: AiErrorCode
  /** HTTP status when the provider answered and refused. */
  readonly status?: number

  constructor(code: AiErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'AiError'
    this.code = code
    this.status = status
  }
}

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/** Whole-call budget, shared by the first attempt and the correction retry. */
const BUDGET_MS = 20_000

/** Below this there is no point starting the retry; fail now rather than at 20s. */
const MIN_RETRY_MS = 1_500

/** True when a Gemini key is present. Callers use this to skip straight to the fallback. */
export function geminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

interface GeminiPart {
  text?: string
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

/** A validation-shaped failure. Transport failures throw instead. */
type Attempt =
  | { ok: true; value: ScoreResponse }
  | { ok: false; problem: string }

/**
 * One abort budget for the whole call, combining our 20 second ceiling with
 * any signal the caller passed. `timedOut` separates our own ceiling from a
 * caller cancelling, because those two deserve different messages.
 */
function startBudget(external?: AbortSignal): {
  signal: AbortSignal
  timedOut: () => boolean
  remainingMs: () => number
  release: () => void
} {
  const controller = new AbortController()
  const startedAt = Date.now()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, BUDGET_MS)

  const onExternalAbort = (): void => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    remainingMs: () => Math.max(0, BUDGET_MS - (Date.now() - startedAt)),
    release: () => {
      clearTimeout(timer)
      if (external) external.removeEventListener('abort', onExternalAbort)
    },
  }
}

/** Models sometimes wrap JSON in a fence even when asked for raw JSON. Take it off before parsing. */
function stripFence(raw: string): string {
  const text = raw.trim()
  if (!text.startsWith('```')) return text
  const opened = text.replace(/^```[a-zA-Z]*[ \t]*\r?\n?/, '')
  const close = opened.lastIndexOf('```')
  return (close === -1 ? opened : opened.slice(0, close)).trim()
}

/** Accepts either raw base64 or a full data URL, so the caller can pass whichever it already has. */
function stripDataUrl(value: string): string {
  const marker = value.indexOf('base64,')
  return (marker === -1 ? value : value.slice(marker + 'base64,'.length)).trim()
}

function describeZodIssues(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown[] }).issues)
  ) {
    const issues = (error as {
      issues: Array<{ path?: Array<string | number>; message?: string }>
    }).issues
    return issues
      .slice(0, 8)
      .map((i) => `${i.path?.join('.') || '(root)'}: ${i.message ?? 'invalid'}`)
      .join('; ')
      .slice(0, 500)
  }
  return error instanceof Error ? error.message.slice(0, 500) : 'unknown validation error'
}

function correctionBlock(problem: string): string {
  return [
    '',
    '',
    'CORRECTION',
    'Your previous answer was rejected before it reached the instructor. The problem was:',
    problem,
    `Answer again in the same JSON shape, corrected. Exactly five entries in scores, one each for ${DIMENSIONS.join(', ')}, with no duplicates and none missing. Each score is an integer from 1 to 10, each rationale is between 12 and 240 characters and points at something in this image, and each confidence is between 0 and 1. Return JSON only, with no fence around it.`,
  ].join('\n')
}

/** Every dimension present exactly once. A duplicate means one is silently missing. */
function missingDimensions(response: ScoreResponse): string[] {
  const seen = new Set(response.scores.map((s) => s.dimension))
  return DIMENSIONS.filter((d) => !seen.has(d))
}

async function requestScores(
  promptText: string,
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  signal: AbortSignal,
  timedOut: () => boolean,
): Promise<Attempt> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: scoreJsonSchema,
      temperature: 0.2,
    },
  }

  let res: Response
  try {
    res = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    })
  } catch (err) {
    if (timedOut()) {
      throw new AiError('timeout', 'Gemini did not answer within 20 seconds.')
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AiError('network', 'The request was cancelled before Gemini answered.')
    }
    throw new AiError(
      'network',
      err instanceof Error ? err.message : 'Gemini could not be reached.',
    )
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new AiError(
      'http',
      `Gemini refused the request with HTTP ${res.status}. ${detail}`.trim(),
      res.status,
    )
  }

  let payload: GeminiResponse
  try {
    payload = (await res.json()) as GeminiResponse
  } catch {
    throw new AiError('invalid_json', 'Gemini returned a body that was not JSON.')
  }

  const blocked = payload.promptFeedback?.blockReason
  if (blocked) {
    throw new AiError('http', `Gemini blocked the request (${blocked}).`, res.status)
  }

  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')

  if (!text.trim()) {
    const reason = payload.candidates?.[0]?.finishReason ?? 'no content'
    return { ok: false, problem: `The answer was empty (${reason}).` }
  }

  let raw: unknown
  try {
    raw = JSON.parse(stripFence(text))
  } catch {
    return {
      ok: false,
      problem: 'The answer was not parseable JSON. Return a single JSON object and nothing else.',
    }
  }

  const parsed = scoreResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, problem: describeZodIssues(parsed.error) }
  }

  const missing = missingDimensions(parsed.data)
  if (missing.length > 0) {
    return {
      ok: false,
      problem: `These dimensions were missing or duplicated: ${missing.join(', ')}. Return exactly one entry per dimension.`,
    }
  }

  return { ok: true, value: parsed.data }
}

/**
 * Score one image. Throws AiError on every failure path; the orchestrator in
 * ./index catches it and falls through to the deterministic scorer.
 */
export async function geminiScore(input: {
  imageBase64: string
  mimeType: string
  prompt: string
  signal?: AbortSignal
}): Promise<ScoreResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new AiError('no_key', 'GEMINI_API_KEY is not set on this deployment.')
  }

  const image = stripDataUrl(input.imageBase64)
  if (!image) {
    throw new AiError('invalid_json', 'No image data was supplied to score.')
  }

  const budget = startBudget(input.signal)
  try {
    const first = await requestScores(
      input.prompt,
      image,
      input.mimeType,
      apiKey,
      budget.signal,
      budget.timedOut,
    )
    if (first.ok) return first.value

    if (budget.remainingMs() < MIN_RETRY_MS) {
      throw new AiError(
        'timeout',
        `Gemini answered too slowly to correct. ${first.problem}`,
      )
    }

    const second = await requestScores(
      input.prompt + correctionBlock(first.problem),
      image,
      input.mimeType,
      apiKey,
      budget.signal,
      budget.timedOut,
    )
    if (second.ok) return second.value

    throw new AiError(
      'invalid_json',
      `Gemini returned a response that did not match the score schema, twice. ${second.problem}`,
    )
  } finally {
    budget.release()
  }
}
