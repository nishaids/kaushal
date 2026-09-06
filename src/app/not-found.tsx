import Link from 'next/link'
import { Wordmark } from '@/components/ui/value-scale'

export default function NotFound() {
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
        <div className="max-w-md">
          {/* A blank sheet with one guideline on it. Nothing was drawn here. */}
          <svg width="72" height="86" viewBox="0 0 72 86" fill="none" aria-hidden="true">
            <rect
              x="0.5"
              y="0.5"
              width="71"
              height="85"
              fill="var(--color-v0)"
              stroke="var(--color-v4)"
            />
            <line
              x1="10"
              y1="56"
              x2="62"
              y2="56"
              stroke="var(--color-blue)"
              strokeWidth="1.6"
              strokeDasharray="4 3"
            />
            <line
              x1="24"
              y1="12"
              x2="24"
              y2="74"
              stroke="var(--color-blue)"
              strokeWidth="1.6"
              strokeDasharray="4 3"
              opacity="0.7"
            />
          </svg>

          <h1 className="mt-6 text-2xl text-v9">Nothing is drawn here</h1>
          <p className="font-language mt-3 max-w-[46ch] text-base text-v6">
            That page does not exist. It may have been a student or a work that
            has since been removed.
          </p>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/studio" className="text-v9 underline underline-offset-4">
              Go to the cohort
            </Link>
            <Link href="/" className="text-v6 underline underline-offset-4 hover:text-v9">
              Back to the front page
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
