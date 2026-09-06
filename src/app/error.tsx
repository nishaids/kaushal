'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/ui/value-scale'

/**
 * The last line of defence. It says what happened in one sentence, offers the
 * two things that actually help, and does not print a stack at a person who is
 * standing in a studio holding somebody's drawing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="tooth relative flex min-h-dvh flex-col bg-v1">
      <header className="border-b border-v3 px-5 py-4 sm:px-8">
        <Link href="/" className="inline-block rounded-[2px]" aria-label="KAUSHAL home">
          <Wordmark size={17} />
        </Link>
      </header>

      <main
        id="main"
        className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8"
      >
        <div className="max-w-lg border-l-2 border-v9 bg-v0 p-6" role="alert">
          <h1 className="text-xl text-v9">This screen did not load</h1>
          <p className="font-language mt-3 max-w-[52ch] text-base text-v7">
            Something failed while KAUSHAL was building this page. Nothing you
            confirmed has been lost — scores are written the moment you confirm
            them, not when a page renders.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="ink" onClick={reset}>
              Try again
            </Button>
            <Link
              href="/studio"
              className="text-sm text-v6 underline underline-offset-4 hover:text-v9"
            >
              Go to the cohort
            </Link>
          </div>

          {error.digest ? (
            <p className="numeral mt-5 text-2xs text-v5">
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  )
}
