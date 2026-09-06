import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { DEMO, LOCAL_SESSION_COOKIE } from '@/lib/constants'
import { db, isSupabaseConfigured } from '@/lib/dal'
import type { Academy, Instructor } from '@/lib/types'

/**
 * Who is asking, and which academy they own.
 *
 * KAUSHAL is one instructor per academy, so a session is a single pair. There
 * are two ways to establish it and the rest of the app cannot tell them apart:
 * a Supabase auth user when credentials are configured, and a cookie holding
 * the instructor id when they are not. The second path is what lets the whole
 * product run — and be demoed — with no auth provider at all.
 */

export interface Session {
  instructor: Instructor
  academy: Academy
  driver: 'supabase' | 'local'
}

/**
 * A Supabase client bound to this request's cookies, or null when Supabase is
 * not configured. Shared with the auth actions so sign-in, sign-out and the
 * session read all see the same cookie jar.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!isSupabaseConfigured() || !url || !key) return null

  const jar = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list: Array<{ name: string; value: string; options: CookieOptions }>) => {
        try {
          for (const { name, value, options } of list) {
            jar.set(name, value, options)
          }
        } catch {
          // A Server Component cannot write cookies. The middleware already
          // refreshed them on this request, so there is nothing left to do.
        }
      },
    },
  })
}

/** The instructor id carried by the local session cookie, if there is one. */
async function readLocalSessionId(): Promise<string | null> {
  const jar = await cookies()
  const value = jar.get(LOCAL_SESSION_COOKIE)?.value?.trim()
  return value ? value : null
}

/**
 * One lookup per request, however many times a page asks. React's cache keys
 * on the request, so three components calling requireSession cost one round
 * trip to Supabase and one driver read.
 */
const loadSession = cache(async (): Promise<Session | null> => {
  try {
    const driver = await db()
    let instructor: Instructor | null = null

    if (driver.name === 'supabase') {
      const supabase = await getSupabaseServerClient()
      const user = supabase ? (await supabase.auth.getUser()).data.user : null

      if (user) {
        // Onboarding writes the instructor row with the auth user id, so the
        // id lookup is the fast path. Email covers rows seeded before auth.
        instructor =
          (await driver.getInstructor(user.id)) ??
          (user.email
            ? await driver.getInstructorByEmail(user.email.trim().toLowerCase())
            : null)
      }

      if (!instructor) {
        // The seeded demo instructor has no Supabase auth user, so entering
        // the demo sets the local cookie instead. Only the fixed demo id is
        // honoured here: the cookie can never stand in for a real account.
        const cookieId = await readLocalSessionId()
        if (cookieId === DEMO.instructorId) {
          instructor = await driver.getInstructor(DEMO.instructorId)
        }
      }
    } else {
      const cookieId = await readLocalSessionId()
      if (cookieId) instructor = await driver.getInstructor(cookieId)
    }

    if (!instructor) return null

    const academy =
      (await driver.getAcademy(instructor.academy_id)) ??
      (await driver.getAcademyForOwner(instructor.id))
    if (!academy) return null

    return { instructor, academy, driver: driver.name }
  } catch {
    // A session lookup that cannot complete is treated as no session: the
    // visitor lands on the sign-in screen instead of a 500. Every path that
    // needs to report a failure to the user does so through ActionResult.
    return null
  }
})

/** The current session, or null when nobody is signed in. */
export async function getSession(): Promise<Session | null> {
  return loadSession()
}

/** The current session, or a redirect to /login. Use this in any private page. */
export async function requireSession(): Promise<Session> {
  const session = await loadSession()
  if (!session) redirect('/login')
  return session
}

/**
 * A session whose academy has been calibrated. Scoring anything before the ten
 * anchors are set would produce numbers with no shared meaning, so this sends
 * the instructor to finish calibration first.
 */
export async function requireCalibrated(): Promise<Session> {
  const session = await requireSession()
  if (!session.academy.calibrated_at) redirect('/calibrate')
  return session
}
