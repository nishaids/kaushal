import { NextResponse } from 'next/server'
import { db } from '@/lib/dal'

/**
 * Reset the seeded demo academy to a known state.
 *
 * The three-minute video depends on this, so it is deliberately boring: POST
 * only, rate limited, and guarded by a token in production. A failure returns a
 * typed body the demo page can read out — never a stack, never a log line.
 */

export const dynamic = 'force-dynamic'

/** One reset every ten seconds per process. A stuck button cannot hammer this. */
const COOLDOWN_MS = 10_000
let lastReset = 0

export async function POST(request: Request): Promise<NextResponse> {
  const required = process.env.DEMO_RESET_TOKEN
  if (process.env.NODE_ENV === 'production' && required) {
    const header = request.headers.get('x-demo-token')
    let bodyToken: string | null = null
    try {
      const body = (await request.clone().json()) as { token?: unknown }
      if (typeof body?.token === 'string') bodyToken = body.token
    } catch {
      // No JSON body. The header is the other way in.
    }
    if (header !== required && bodyToken !== required) {
      return NextResponse.json(
        {
          ok: false,
          error: 'This reset needs a token.',
          hint: 'Set DEMO_RESET_TOKEN and send it as the x-demo-token header.',
        },
        { status: 401 },
      )
    }
  }

  const now = Date.now()
  if (now - lastReset < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - lastReset)) / 1000)
    return NextResponse.json(
      {
        ok: false,
        error: 'The demo was just reset.',
        hint: `Give it ${wait} more ${wait === 1 ? 'second' : 'seconds'} before resetting again.`,
      },
      { status: 429 },
    )
  }
  lastReset = now

  try {
    const driver = await db()
    const result = await driver.resetDemo()
    return NextResponse.json({ ok: true, ...result })
  } catch {
    lastReset = 0
    return NextResponse.json(
      {
        ok: false,
        error: 'The demo did not rebuild.',
        hint: 'You can still enter the academy as it stands — nothing else was changed.',
      },
      { status: 500 },
    )
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, error: 'Use POST to reset the demo.' },
    { status: 405, headers: { Allow: 'POST' } },
  )
}
