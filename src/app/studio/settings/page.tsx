import Link from 'next/link'
import type { Metadata } from 'next'
import { db, driverName } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import { signOut } from '@/lib/auth-actions'
import { geminiAvailable } from '@/lib/ai/gemini'
import { groqAvailable } from '@/lib/ai/groq'
import { CALIBRATION_TARGET } from '@/lib/constants'
import { longDate } from '@/lib/utils/format'
import { PageHeader, Plate, Rule } from '@/components/ui/plate'
import { Button, ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const session = await requireSession()
  const driver = await db()
  const [driver_, anchors] = await Promise.all([
    driverName(),
    driver.listCalibrationAnchors(session.academy.id),
  ])

  const vision = geminiAvailable()
  const text = groqAvailable()

  const values = anchors.flatMap((a) =>
    Object.values(a.scores).filter((n): n is number => typeof n === 'number'),
  )
  const spread = values.length
    ? { low: Math.min(...values), high: Math.max(...values) }
    : null

  return (
    <>
      <PageHeader
        title="Settings"
        meta={<span>What KAUSHAL is running on right now</span>}
      />

      <div className="max-w-[62rem] px-5 py-6 sm:px-8">
        <div className="space-y-6">
          <Plate className="p-5">
            <h2 className="text-base text-v9">The academy</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row term="Name" detail={session.academy.name} />
              <Row term="Discipline" detail={session.academy.discipline} />
              <Row term="Instructor" detail={session.instructor.name} />
              <Row term="Sign-in address" detail={session.instructor.email} />
            </dl>
            <Rule className="my-5" />
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </Plate>

          <Plate className="p-5">
            <h2 className="text-base text-v9">Calibration</h2>
            <p className="font-language mt-2 max-w-[62ch] text-base text-v6">
              {anchors.length === 0
                ? 'No anchors yet. Until there are at least three, proposals are made against a generic rubric rather than yours, and their confidence is capped to say so.'
                : `${anchors.length} of ${CALIBRATION_TARGET} anchors, spanning ${spread ? `${spread.low} to ${spread.high}` : 'a single value'} on the scale. These go into every scoring prompt this academy makes.`}
            </p>
            {session.academy.calibrated_at ? (
              <p className="mt-2 text-xs text-v6">
                Calibrated on {longDate(session.academy.calibrated_at)}.
              </p>
            ) : null}
            <div className="mt-4">
              <ButtonLink href="/calibrate" variant="outline" size="sm">
                {anchors.length >= CALIBRATION_TARGET
                  ? 'Review the anchors'
                  : 'Add more anchors'}
              </ButtonLink>
            </div>
          </Plate>

          <Plate className="p-5">
            <h2 className="text-base text-v9">What is running</h2>
            <p className="mt-1.5 max-w-[62ch] text-xs text-v6">
              KAUSHAL states this rather than hiding it, because what produced a
              number changes how much weight it deserves.
            </p>

            <dl className="mt-5 space-y-5">
              <Capability
                term="Data"
                on={driver_ === 'supabase'}
                onLabel="Postgres via Supabase"
                offLabel="The built-in local store"
                detail={
                  driver_ === 'supabase'
                    ? 'Rows live in Postgres with row level security, so an instructor reaches only their own academy.'
                    : 'Everything works, and everything is kept on this machine. Add Supabase credentials to move it to Postgres — nothing above the data layer changes.'
                }
              />
              <Capability
                term="Vision scoring"
                on={vision}
                onLabel="Gemini 2.5 Flash"
                offLabel="Pixel measurements only"
                detail={
                  vision
                    ? 'Proposals come from the model, grounded with measurements taken from the image and with this academy’s anchors.'
                    : 'No vision model is configured. Proposals are derived from measurements taken off the pixels in the browser — value spread, ink coverage, edge variance, mass distribution — and are labelled as measured, with confidence capped low.'
                }
              />
              <Capability
                term="Written briefs and reports"
                on={text}
                onLabel="Llama 3.3 70B on Groq"
                offLabel="The built-in exercise library"
                detail={
                  text
                    ? 'Assignment briefs and parent reports are drafted by the model against the student’s own numbers, then edited by you.'
                    : 'No text model is configured. Briefs come from a hand-written exercise library and reports are assembled from the student’s own numbers. Both are real and both are marked as coming from the fallback.'
                }
              />
            </dl>

            <p className="mt-6 max-w-[62ch] text-xs text-v6">
              No key is ever shown on this page or sent to the browser. Every
              model call happens on the server.
            </p>
          </Plate>

          <p className="text-xs text-v6">
            Something wrong here?{' '}
            <Link href="/demo" className="underline underline-offset-2 hover:text-v9">
              The demo page
            </Link>{' '}
            can rebuild the seeded academy from scratch.
          </p>
        </div>
      </div>
    </>
  )
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4">
      <dt className="w-40 shrink-0 text-xs text-v5">{term}</dt>
      <dd className="text-sm text-v9">{detail}</dd>
    </div>
  )
}

function Capability({
  term,
  on,
  onLabel,
  offLabel,
  detail,
}: {
  term: string
  on: boolean
  onLabel: string
  offLabel: string
  detail: string
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <dt className="w-40 shrink-0 text-xs text-v5">{term}</dt>
        <dd className="flex items-center gap-2">
          <span
            className={
              'inline-block h-2.5 w-2.5 border ' +
              (on ? 'border-v9 bg-v9' : 'border-dashed border-blue-ink bg-blue-wash')
            }
            aria-hidden="true"
          />
          <span className="text-sm text-v9">{on ? onLabel : offLabel}</span>
        </dd>
      </div>
      <p className="font-language mt-1.5 max-w-[62ch] text-base text-v6 sm:ml-44">
        {detail}
      </p>
    </div>
  )
}
