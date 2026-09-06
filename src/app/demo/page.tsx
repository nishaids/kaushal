import Link from 'next/link'
import type { Metadata } from 'next'
import { DEMO, DEMO_COHORT_SIZE, PLATEAU } from '@/lib/constants'
import { Wordmark } from '@/components/ui/value-scale'
import { Plate, Rule } from '@/components/ui/plate'
import { ResetAndEnter } from '@/components/demo/reset-and-enter'

export const metadata: Metadata = {
  title: 'The demo',
  description:
    'A seeded academy with sixty-two students and one student whose value range genuinely stopped moving at week seven.',
}

const BEATS = [
  {
    href: '/studio',
    title: 'The cohort',
    body: `All ${DEMO_COHORT_SIZE} students, sorted by who needs attention first, with the reason printed beside every number.`,
  },
  {
    href: '/studio/capture',
    title: 'Record a work',
    body: 'Upload any drawing. It is measured in your browser, five scores are proposed with reasons, and you confirm or override each one.',
  },
  {
    href: `/studio/students/${DEMO.featuredStudentId}`,
    title: `${DEMO.featuredStudentName}’s trajectory`,
    body: 'Six works over three months. Four dimensions climb. Value range stops at week seven and the plateau fires.',
  },
  {
    href: `/studio/assignments?student=${DEMO.featuredStudentId}&dimension=value_range`,
    title: 'The exercise that answers it',
    body: 'A brief aimed at the flagged dimension, editable before it is issued.',
  },
  {
    href: `/studio/students/${DEMO.featuredStudentId}/report`,
    title: 'The parent report',
    body: 'First work beside latest, what moved, what is next. The instructor approves it before it can be shared.',
  },
]

export default function DemoPage() {
  return (
    <div className="tooth relative flex min-h-dvh flex-col bg-v1">
      <header className="border-b border-v3 px-5 py-4 sm:px-8">
        <Link href="/" className="inline-block rounded-[2px]" aria-label="KAUSHAL home">
          <Wordmark size={17} />
        </Link>
      </header>

      <main id="main" className="flex-1 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-[62rem]">
          <h1 className="max-w-[20ch] text-2xl text-v9 sm:text-3xl">
            A working academy, seeded and repeatable.
          </h1>

          <div className="font-language mt-5 max-w-[64ch] space-y-4 text-lg leading-relaxed text-v7">
            <p>
              The demo signs you in as {DEMO.instructorName} at{' '}
              {DEMO.academyName} — {DEMO_COHORT_SIZE} students, several hundred
              recorded works, ten calibration anchors, and a handful of students
              carrying genuine flags.
            </p>
            <p>
              One of them is {DEMO.featuredStudentName}: six works across three
              months, four dimensions climbing steadily, and value range flat
              since week seven. Nothing about that is scripted. The detector fits
              a line through the last {PLATEAU.window} works and finds it the same
              way it would find it in your own academy.
            </p>
            <p className="text-v9">
              Press anything you like. Reset puts it back exactly as it was.
            </p>
          </div>

          <div className="mt-8">
            <ResetAndEnter />
          </div>

          <Rule className="my-10" />

          <h2 className="text-base text-v9">Where to go once you are in</h2>
          <ol className="mt-4 grid gap-px border border-v3 bg-v3 sm:grid-cols-2 lg:grid-cols-3">
            {BEATS.map((b, i) => (
              <li key={b.href} className="bg-v0">
                <Link
                  href={b.href}
                  className="block h-full p-5 transition-colors hover:bg-v1"
                >
                  <span className="numeral text-2xs text-v5">{i + 1}</span>
                  <span className="mt-2 block text-sm text-v9">{b.title}</span>
                  <span className="font-language mt-1.5 block max-w-[38ch] text-base text-v6">
                    {b.body}
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <Plate tone="recessed" className="mt-8 p-5">
            <h2 className="text-sm text-v9">What is real and what is seeded</h2>
            <p className="font-language mt-2 max-w-[64ch] text-base text-v6">
              The students and their works are generated, because real student
              drawings are not ours to publish. Everything the product does with
              them is the real thing: the same scoring path, the same calibration
              anchors in the prompt, the same plateau arithmetic, the same
              confirm-and-override rules. If you upload one of your own drawings
              on the capture screen, it goes through exactly the pipeline these
              seeded works went through.
            </p>
          </Plate>
        </div>
      </main>
    </div>
  )
}
