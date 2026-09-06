import Link from 'next/link'
import type { Metadata } from 'next'
import { db } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import { CALIBRATION_TARGET } from '@/lib/constants'
import { Wordmark } from '@/components/ui/value-scale'
import { CalibrationWizard } from '@/components/calibrate/calibration-wizard'

export const metadata: Metadata = { title: 'Calibration' }

export default async function CalibratePage() {
  // Deliberately requireSession and not requireCalibrated: this is the screen
  // that grants calibration, so gating it on calibration would lock the door
  // from the inside.
  const session = await requireSession()
  const driver = await db()
  const anchors = await driver.listCalibrationAnchors(session.academy.id)

  const done = session.academy.calibrated_at !== null

  return (
    <div className="tooth relative flex min-h-dvh flex-col bg-v1">
      <header className="flex items-center justify-between border-b border-v3 px-5 py-4 sm:px-8">
        <Link href="/" className="inline-block rounded-[2px]" aria-label="KAUSHAL home">
          <Wordmark size={17} />
        </Link>
        <span className="text-xs text-v6">{session.academy.name}</span>
        {done ? (
          <Link
            href="/studio"
            className="text-xs text-v6 underline underline-offset-4 hover:text-v9"
          >
            Back to the studio
          </Link>
        ) : (
          <span className="text-xs text-v5">Step 2 of 2</span>
        )}
      </header>

      <main id="main" className="flex-1 px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-[64rem]">
          <h1 className="max-w-[22ch] text-2xl text-v9 sm:text-3xl">
            {done
              ? 'Your standard, as KAUSHAL has it'
              : 'Teach KAUSHAL your standard'}
          </h1>
          <p className="font-language mt-4 max-w-[62ch] text-lg leading-relaxed text-v7">
            {done ? (
              <>
                These are the works your future proposals are measured against.
                Adding more anchors — especially at the ends of the scale —
                sharpens every score KAUSHAL proposes from here.
              </>
            ) : (
              <>
                Score {CALIBRATION_TARGET} works you have already marked. They
                become this academy’s anchors, and every future proposal is made
                against them rather than against a generic rubric. Two academies
                running KAUSHAL on the same drawing should get different numbers,
                because they are teaching different students.
              </>
            )}
          </p>
          <p className="mt-3 max-w-[62ch] text-xs text-v6">
            KAUSHAL proposes nothing on this screen. These numbers have to be
            yours alone — anchoring them to a model would defeat the whole point
            of anchoring.
          </p>

          <div className="mt-10">
            <CalibrationWizard
              academyName={session.academy.name}
              existing={anchors}
              alreadyCalibrated={done}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
