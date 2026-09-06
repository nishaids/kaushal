import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * Keeps the Supabase auth cookie fresh.
 *
 * Server Components cannot write cookies, so the refreshed token has to be
 * written here or the instructor is silently signed out when it expires. That
 * is the whole job. Route protection deliberately does not happen in
 * middleware: pages call requireSession themselves, which keeps the redirect
 * next to the data it protects and keeps the demo from being one bad matcher
 * away from a redirect loop.
 *
 * The environment is read directly rather than through lib/dal so the data
 * layer never has to run in the edge runtime.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // No Supabase, no auth cookie to refresh. The local session cookie is set by
  // the auth actions and read by lib/session; nothing here has to touch it.
  if (!url || !key) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: Array<{ name: string; value: string; options: CookieOptions }>) => {
        for (const { name, value } of list) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser, not getSession: it validates the token with the auth server, and
  // the call is what triggers the refresh and the setAll above.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own static output, the favicon, and any request
     * for a file with an extension. Those never carry a session worth
     * refreshing and running on them only costs latency.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}
