import 'server-only'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase clients.
 *
 * Two of them, and the difference matters:
 *
 *   createSupabaseServerClient()  — the signed-in instructor. Carries their
 *     session cookie, so every query is filtered by row level security.
 *     This is the client the whole app uses.
 *
 *   createSupabaseServiceClient() — the service role. Bypasses row level
 *     security entirely. Used by exactly one caller, the demo reset, because
 *     rebuilding a fixed demo academy means writing rows no session owns.
 *
 * The module is 'server-only': importing it from a client component is a build
 * error, which is the guard that keeps the service key out of the browser.
 */

function requireUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set. KAUSHAL falls back to the local driver when it is absent.')
  }
  return url
}

function requireAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. KAUSHAL falls back to the local driver when it is absent.')
  }
  return key
}

/**
 * A request-scoped client bound to the caller's session cookies.
 *
 * Must be created per request — never cached across requests, or one
 * instructor would inherit another's session. cookies() is awaited because
 * this is Next 15.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const store = await cookies()

  return createServerClient(requireUrl(), requireAnonKey(), {
    cookies: {
      getAll() {
        return store.getAll().map(({ name, value }) => ({ name, value }))
      },
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options)
          }
        } catch {
          // Server Components cannot write cookies. The refreshed session is
          // written by the route handler or middleware that owns the response.
        }
      },
    },
  })
}

/**
 * The service-role client. Bypasses row level security.
 *
 * Only the demo reset may call this. It throws rather than silently degrading,
 * because a reset that half-worked is worse than one that refused.
 */
export function createSupabaseServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. The demo reset needs it to rebuild rows no session owns.')
  }
  return createClient(requireUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

