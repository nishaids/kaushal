import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSession } from '@/lib/session'
import { enterDemo } from '@/lib/auth-actions'
import { DEMO, DEMO_COHORT_SIZE } from '@/lib/constants'
import { Wordmark } from '@/components/ui/value-scale'
import { Button } from '@/components/ui/button'
import { Plate, Rule } from '@/components/ui/plate'
import { ErrorState } from '@/components/ui/states'
import { SignInForm } from '@/components/auth/sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const session = await getSession()
  if (session) redirect('/studio')

  return (
    <div className="tooth relative flex min-h-dvh flex-col bg-v1">
      <header className="border-b border-v3 px-5 py-4 sm:px-8">
        <Link href="/" className="inline-block rounded-[2px]" aria-label="KAUSHAL home">
          <Wordmark size={17} />
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-lg">
          <h1 className="text-2xl text-v9">Sign in</h1>
          <p className="font-language mt-3 max-w-[52ch] text-base text-v6">
            KAUSHAL is one instructor per academy. Sign in with the address your
            academy is registered to, or open the seeded demo and look around
            first.
          </p>

          {error === 'demo-unavailable' ? (
            <div className="mt-6">
              <ErrorState
                title="The demo could not be prepared"
                body="The seeded academy did not build. Nothing is broken in your own data."
                hint="Try again in a moment, or sign in with an email address instead."
              />
            </div>
          ) : null}

          <Plate className="mt-7 p-6">
            <h2 className="text-lg text-v9">Open the demo</h2>
            <p className="font-language mt-2 max-w-[48ch] text-base text-v6">
              A seeded academy with {DEMO_COHORT_SIZE} students. One of them,{' '}
              {DEMO.featuredStudentName}, has six works across three months and a
              dimension that genuinely stopped moving at week seven. Nothing you
              press can break it — it resets in one click.
            </p>
            <form action={enterDemo} className="mt-5">
              <Button type="submit" variant="ink" size="lg">
                Enter the demo academy
              </Button>
            </form>
          </Plate>

          <div className="my-8 flex items-center gap-4">
            <Rule />
            <span className="shrink-0 text-2xs text-v5">or sign in</span>
            <Rule />
          </div>

          <SignInForm />

          <p className="mt-8 text-xs text-v6">
            New academy?{' '}
            <Link
              href="/onboarding"
              className="underline underline-offset-4 hover:text-v9"
            >
              Set one up
            </Link>
            . It takes a name, a discipline and ten works you have already
            scored.
          </p>
        </div>
      </main>
    </div>
  )
}
