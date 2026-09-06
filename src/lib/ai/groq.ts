import 'server-only'

import type { ZodType } from 'zod'
import { AiError } from './gemini'

/**
 * Groq adapter for the two text calls: the assignment brief and the parent
 * report. Plain fetch against the OpenAI-compatible endpoint, no SDK, key read
 * from the environment on every call and never returned to a caller.
 *
 * Structured output is requested with json_schema and strict mode. Some
 * deployments and some model versions reject that; when they do we drop once
 * to json_object and restate the schema in the system message, which is worse
 * but still parseable. Everything after that follows the same discipline as
 * the Gemini adapter: one correction retry, a 20 second ceiling on the whole
 * call, then an AiError the orchestrator turns into the deterministic path.
 */

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

/** The provider requires a name for the schema. It is not surfaced anywhere. */
const SCHEMA_NAME = 'kaushal_response'

/** Whole-call budget, shared by the schema downgrade and the correction retry. */
const BUDGET_MS = 20_000

/** Below this there is no point starting another attempt. */
const MIN_RETRY_MS = 1_500

const DEFAULT_MAX_TOKENS = 1_400

const DEFAULT_SYSTEM =
  'You work inside a tool used by an art instructor. You answer with a single JSON object and nothing else: no preamble, no explanation after it, no code fence.'

/** True when a Groq key is present. Callers use this to skip straight to the fallback. */
export function groqAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim())
}

type ResponseMode = 'json_schema' | 'json_object'

type Attempt<T> = { ok: true; value: T } | { ok: false; problem: string }

interface GroqBody {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string; code?: string }
}

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

function stripFence(raw: string): string {
  const text = raw.trim()
  if (!text.startsWith('```')) return text
  const opened = text.replace(/^```[a-zA-Z]*[ \t]*\r?\n?/, '')
  const close = opened.lastIndexOf('```')
  return (close === -1 ? opened : opened.slice(0, close)).trim()
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
    'Your previous answer was rejected. The problem was:',
    problem,
    'Answer again in the same JSON shape, corrected, respecting every minimum and maximum length in the schema. Return a single JSON object and nothing else.',
  ].join('\n')
}

/** The provider answered and objected to the response_format itself, rather than to the prompt. */
function rejectsJsonSchema(status: number, detail: string): boolean {
  if (status !== 400 && status !== 422 && status !== 404) return false
  return /json_schema|response_format|structured output|schema/i.test(detail)
}

async function requestJson<T>(
  input: {
    prompt: string
    schema: ZodType<T>
    jsonSchema: object
    system: string
    maxTokens: number
    mode: ResponseMode
  },
  apiKey: string,
  signal: AbortSignal,
  timedOut: () => boolean,
): Promise<Attempt<T>> {
  const system =
    input.mode === 'json_schema'
      ? input.system
      : `${input.system}\n\nReturn JSON only, matching exactly this JSON Schema:\n${JSON.stringify(input.jsonSchema)}`

  const body = {
    model: GROQ_MODEL,
    temperature: 0.3,
    max_tokens: input.maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input.prompt },
    ],
    response_format:
      input.mode === 'json_schema'
        ? {
            type: 'json_schema',
            json_schema: { name: SCHEMA_NAME, strict: true, schema: input.jsonSchema },
          }
        : { type: 'json_object' },
  }

  let res: Response
  try {
    res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    })
  } catch (err) {
    if (timedOut()) {
      throw new AiError('timeout', 'Groq did not answer within 20 seconds.')
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AiError('network', 'The request was cancelled before Groq answered.')
    }
    throw new AiError(
      'network',
      err instanceof Error ? err.message : 'Groq could not be reached.',
    )
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new AiError(
      'http',
      `Groq refused the request with HTTP ${res.status}. ${detail}`.trim(),
      res.status,
    )
  }

  let payload: GroqBody
  try {
    payload = (await res.json()) as GroqBody
  } catch {
    throw new AiError('invalid_json', 'Groq returned a body that was not JSON.')
  }

  const text = payload.choices?.[0]?.message?.content ?? ''
  if (!text.trim()) {
    return { ok: false, problem: 'The answer was empty.' }
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

  const parsed = input.schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, problem: describeZodIssues(parsed.error) }
  }

  return { ok: true, value: parsed.data }
}

/**
 * Ask Groq for one JSON object and return it validated.
 *
 * `schema` is the Zod that decides whether the answer is usable; `jsonSchema`
 * is the same shape in the form the provider wants. They live side by side in
 * ./schemas so they cannot drift.
 */
export async function groqJson<T>(input: {
  prompt: string
  schema: ZodType<T>
  jsonSchema: object
  system?: string
  maxTokens?: number
  signal?: AbortSignal
}): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    throw new AiError('no_key', 'GROQ_API_KEY is not set on this deployment.')
  }

  const base = {
    prompt: input.prompt,
    schema: input.schema,
    jsonSchema: input.jsonSchema,
    system: input.system ?? DEFAULT_SYSTEM,
    maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
  }

  const budget = startBudget(input.signal)
  let mode: ResponseMode = 'json_schema'

  try {
    let first: Attempt<T>
    try {
      first = await requestJson({ ...base, mode }, apiKey, budget.signal, budget.timedOut)
    } catch (err) {
      // The provider objected to strict json_schema rather than to the prompt.
      // Drop to json_object once. This does not consume the correction retry.
      if (
        err instanceof AiError &&
        err.code === 'http' &&
        typeof err.status === 'number' &&
        rejectsJsonSchema(err.status, err.message) &&
        budget.remainingMs() >= MIN_RETRY_MS
      ) {
        mode = 'json_object'
        first = await requestJson({ ...base, mode }, apiKey, budget.signal, budget.timedOut)
      } else {
        throw err
      }
    }

    if (first.ok) return first.value

    if (budget.remainingMs() < MIN_RETRY_MS) {
      throw new AiError('timeout', `Groq answered too slowly to correct. ${first.problem}`)
    }

    const second = await requestJson(
      { ...base, prompt: base.prompt + correctionBlock(first.problem), mode },
      apiKey,
      budget.signal,
      budget.timedOut,
    )
    if (second.ok) return second.value

    throw new AiError(
      'invalid_json',
      `Groq returned a response that did not match the schema, twice. ${second.problem}`,
    )
  } finally {
    budget.release()
  }
}
