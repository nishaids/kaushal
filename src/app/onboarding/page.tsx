import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSession } from '@/lib/session'
import { Wordmark } from '@/components/ui/value-scale'
import { OnboardingForm } from '@/components/auth/onboarding-form'

export const metadata: Metadata = { title: 'Set up your academy' }

export default async function OnboardingPage() {
  const session = await getSession()
  // An instructor who already has an academy belongs in calibration, not here.
  if (session) redirect(session.academy.calibrated_at ? '/studio' : '/calibrate')

  return (
    <div className="tooth relative flex min-h-dvh flex-col bg-v1">
      <header className="border-b border-v3 px-5 py-4 sm:px-8">
        <Link href="/" className="inline-block rounded-[2px]" aria-label="KAUSHAL home">
          <Wordmark size={17} />
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-lg">
          <h1 className="text-2xl text-v9">Set up your academy</h1>
          <p className="font-language mt-3 max-w-[52ch] text-base text-v6">
            Two answers, then ten works you have already scored. Those ten are
            what teach KAUSHAL your standard rather than a generic one, so they
            are worth doing properly.
          </p>

          <div className="mt-8">
            <OnboardingForm />
          </div>

          <p className="mt-8 text-xs text-v6">
            Already set up?{' '}
            <Link href="/login" className="underline underline-offset-4 hover:text-v9">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
