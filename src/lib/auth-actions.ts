'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { DEMO, LOCAL_SESSION_COOKIE } from '@/lib/constants'
import { db, isSupabaseConfigured } from '@/lib/dal'
import { getSupabaseServerClient } from '@/lib/session'
import { fail, ok } from '@/lib/types'
import type { ActionResult, Discipline } from '@/lib/types'

/**
 * Sign in, sign out, enter the demo, and set up a new academy.
 *
 * Two auth systems live behind one surface. With Supabase configured the
 * instructor gets a magic link and the auth cookie is the session. Without it
 * the local driver is the account system and a cookie holding the instructor
 * id is the session. Both return the same shapes, so no screen has to branch.
 */

/** One year. Instructors sign in on a studio laptop and stay signed in. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 365

const DISCIPLINES = [
  'drawing',
  'painting',
  'sculpture',
  'craft',
  'other',
] as const satisfies readonly Discipline[]

const FIELD_LABELS: Record<string, string> = {
  name: 'academy name',
  discipline: 'discipline',
  instructorName: 'your name',
  email: 'email',
}

const EmailSchema = z.string().trim().toLowerCase().email()

const OnboardingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'The academy needs a name of at least two characters.')
    .max(80, 'Keep the academy name under 80 characters.'),
  discipline: z.enum(DISCIPLINES, {
    errorMap: () => ({ message: 'Choose one of the listed disciplines.' }),
  }),
  instructorName: z
    .string()
    .trim()
    .min(1)
    .max(80, 'Keep your name under 80 characters.')
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('That email address does not look right.')
    .optional(),
})

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : ''
}

/** A readable instructor name from an email local part. */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local
    .split(/[._+\-\d]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  const name = words.join(' ').slice(0, 60)
  return name || 'Instructor'
}

/** Where a magic link should come back to. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1')
      ? 'http'
      : 'https')
  return `${proto}://${host}`
}

async function setSessionCookie(instructorId: string): Promise<void> {
  const jar = await cookies()
  jar.set(LOCAL_SESSION_COOKIE, instructorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/**
 * Start a session from an email address.
 *
 * `sent: true` means a magic link is on its way and the instructor should go
 * and open it. `sent: false` means there is no auth provider, the session
 * cookie is already set, and the caller should navigate into the app.
 */
export async function signInWithEmail(
  formData: FormData,
): Promise<ActionResult<{ sent: boolean }>> {
  const parsed = EmailSchema.safeParse(text(formData.get('email')))
  if (!parsed.success) {
    return fail(
      'That email address does not look right.',
      'Use the address you want the sign-in link sent to, like you@studio.in.',
      'email',
    )
  }
  const email = parsed.data

  if (isSupabaseConfigured()) {
    const supabase = await getSupabaseServerClient()
    if (!supabase) {
      return fail(
        'Sign-in is not available right now.',
        'Supabase is configured but the client could not be built. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then reload.',
        'config',
      )
    }
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
      })
      if (error) {
        return fail(
          'The sign-in link could not be sent.',
          `${error.message}. Check the address and try again in a minute.`,
          'email',
        )
      }
    } catch {
      return fail(
        'The sign-in link could not be sent.',
        'The authentication service did not respond. Check the connection and try again.',
        'email',
      )
    }
    return ok({ sent: true })
  }

  // No auth provider. The local driver is the account system: find the
  // instructor for this address, or stand up an academy for a new one, so the
  // product is usable end to end with no credentials anywhere.
  try {
    const driver = await db()
    let instructor = await driver.getInstructorByEmail(email)
    if (!instructor) {
      const name = nameFromEmail(email)
      // owner_id and the instructor id are the same value, which is what
      // getAcademyForOwner relies on. The demo constants hold the same pair.
      const ownerId = crypto.randomUUID()
      const academy = await driver.createAcademy({
        name: `${name} Academy`,
        ownerId,
        discipline: 'drawing',
      })
      instructor = await driver.createInstructor({
        academyId: academy.id,
        email,
        name,
        id: ownerId,
      })
    }
    await setSessionCookie(instructor.id)
  } catch {
    return fail(
      'The account could not be opened.',
      'The local data store could not be written. Check that the app can write to its data directory, then try again.',
      'storage',
    )
  }

  revalidatePath('/', 'layout')
  return ok({ sent: false })
}

/**
 * End the session on both paths. The page that called it re-renders, and its
 * own requireSession sends the visitor to the sign-in screen.
 */
export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient()
  if (supabase) {
    try {
      await supabase.auth.signOut()
    } catch {
      // Clearing the local cookie below ends the session either way, and the
      // auth cookie expires on its own.
    }
  }
  const jar = await cookies()
  jar.delete(LOCAL_SESSION_COOKIE)
  revalidatePath('/', 'layout')
}

/**
 * Make sure the seeded demo exists, then sign in as its instructor. Returns
 * the path to send the visitor to; the redirect happens in enterDemo, outside
 * any try block, because redirect() works by throwing.
 */
async function prepareDemo(): Promise<string> {
  try {
    const driver = await db()
    let academy = await driver.getAcademy(DEMO.academyId)
    if (!academy) {
      // Only when the demo is absent. Resetting on every entry would wipe
      // whatever a visitor just did halfway through the walkthrough.
      await driver.resetDemo()
      academy = await driver.getAcademy(DEMO.academyId)
    }
    const instructor = academy
      ? await driver.getInstructor(DEMO.instructorId)
      : null
    if (!instructor) return '/login?error=demo-unavailable'
    await setSessionCookie(instructor.id)
    return '/studio'
  } catch {
    return '/login?error=demo-unavailable'
  }
}

/** Enter the seeded demo academy as its instructor. Always redirects. */
export async function enterDemo(): Promise<never> {
  const target = await prepareDemo()
  revalidatePath('/', 'layout')
  redirect(target)
}

/**
 * Create the academy and its instructor from the onboarding form, and sign the
 * instructor in. Returns the new academy id so the caller can route straight
 * into calibration.
 */
export async function completeOnboarding(
  formData: FormData,
): Promise<ActionResult<{ academyId: string }>> {
  const instructorName = text(formData.get('instructor_name')).trim()
  const rawEmail = text(formData.get('email')).trim()

  const parsed = OnboardingSchema.safeParse({
    name: text(formData.get('name')),
    discipline: text(formData.get('discipline')),
    instructorName: instructorName || undefined,
    email: rawEmail || undefined,
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = typeof issue?.path[0] === 'string' ? issue.path[0] : undefined
    const label = field ? FIELD_LABELS[field] : undefined
    return fail(
      issue?.message ?? 'The form could not be read.',
      label
        ? `Correct the ${label} and submit again.`
        : 'Check the fields and submit again.',
      field,
    )
  }

  const supabase = await getSupabaseServerClient()
  const user = supabase ? (await supabase.auth.getUser()).data.user : null

  if (isSupabaseConfigured() && !user) {
    return fail(
      'You need to be signed in before setting up an academy.',
      'Enter your email on the sign-in screen and open the link we send; it brings you back here.',
      'email',
    )
  }

  const email = parsed.data.email ?? user?.email?.trim().toLowerCase() ?? null
  if (!email) {
    return fail(
      'An email address is needed to create the account.',
      'Add the address you teach under; it is how you sign back in.',
      'email',
    )
  }

  try {
    const driver = await db()

    if (user) {
      const existing = await driver.getInstructor(user.id)
      if (existing) {
        return fail(
          'This account already has an academy.',
          'Open the studio to continue; everything set up earlier is still there.',
          'already_onboarded',
        )
      }
    }

    // owner_id and the instructor id are the same value. With Supabase that
    // value is the auth user id, which is what makes getInstructor(user.id)
    // the session lookup.
    const ownerId = user?.id ?? crypto.randomUUID()
    const academy = await driver.createAcademy({
      name: parsed.data.name,
      ownerId,
      discipline: parsed.data.discipline,
    })
    const instructor = await driver.createInstructor({
      academyId: academy.id,
      email,
      name: parsed.data.instructorName ?? nameFromEmail(email),
      id: ownerId,
    })

    if (!user) await setSessionCookie(instructor.id)
    revalidatePath('/', 'layout')
    return ok({ academyId: academy.id })
  } catch {
    return fail(
      'The academy could not be created.',
      'Nothing was saved. Try again; if it keeps failing, the data store is unreachable.',
      'storage',
    )
  }
}
