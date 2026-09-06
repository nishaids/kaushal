'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { CalibrationAnchor } from '@/lib/dal'
import type { Dimension } from '@/lib/rubric'
import {
  addCalibrationWork,
  finishCalibration,
  saveCalibrationAnchor,
} from '@/lib/actions/calibration'
import { CALIBRATION_MINIMUM, CALIBRATION_TARGET } from '@/lib/constants'
import {
  ImageCompressionError,
  compressImage,
  type CompressResult,
} from '@/lib/utils/compress'
import { kb, shortDate } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Plate } from '@/components/ui/plate'
import { ErrorState } from '@/components/ui/states'
import { Dropzone } from '@/components/capture/dropzone'
import { AnchorCard } from './anchor-card'
import { CalibrationProgress } from './calibration-progress'

/**
 * Calibration.
 *
 * Ten past works, scored by the instructor, injected as few-shot references
 * into every future scoring call. This is the part of KAUSHAL that is hard to
 * copy, so the screen is built to make the value of each anchor visible as it
 * is added rather than to get the form filled in as fast as possible.
 */

export function CalibrationWizard({
  academyName,
  existing,
  alreadyCalibrated,
}: {
  academyName: string
  existing: CalibrationAnchor[]
  alreadyCalibrated: boolean
}) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [pending, startTransition] = useTransition()

  const [pendingImage, setPendingImage] = useState<CompressResult | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [editing, setEditing] = useState<CalibrationAnchor | null>(null)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  const anchored = existing.length

  const spread = useMemo(() => {
    const all = existing.flatMap((a) =>
      Object.values(a.scores).filter((n): n is number => typeof n === 'number'),
    )
    if (all.length === 0) return null
    return { low: Math.min(...all), high: Math.max(...all) }
  }, [existing])

  async function handleFile(file: File) {
    setError(null)
    setCompressing(true)
    try {
      const result = await compressImage(file)
      setPendingImage(result)
      setEditing(null)
    } catch (err) {
      if (err instanceof ImageCompressionError) {
        setError({ message: err.message, hint: err.hint })
      } else {
        setError({
          message: 'That image could not be prepared.',
          hint: 'Try a different photo, or export this one as a JPEG first.',
        })
      }
    } finally {
      setCompressing(false)
    }
  }

  function saveNewAnchor(scores: Record<Dimension, number>) {
    if (!pendingImage) return
    setError(null)
    startTransition(async () => {
      const created = await addCalibrationWork({
        imageUrl: pendingImage.dataUrl,
        thumbUrl: pendingImage.thumbDataUrl,
        metrics: pendingImage.metrics,
      })
      if (!created.ok) {
        setError({ message: created.error, hint: created.hint })
        return
      }
      const saved = await saveCalibrationAnchor({
        workId: created.data.workId,
        scores,
      })
      if (!saved.ok) {
        setError({ message: saved.error, hint: saved.hint })
        return
      }
      setPendingImage(null)
      router.refresh()
    })
  }

  function updateAnchor(workId: string, scores: Record<Dimension, number>) {
    setError(null)
    startTransition(async () => {
      const saved = await saveCalibrationAnchor({ workId, scores })
      if (!saved.ok) {
        setError({ message: saved.error, hint: saved.hint })
        return
      }
      setEditing(null)
      router.refresh()
    })
  }

  function finish() {
    setError(null)
    startTransition(async () => {
      const res = await finishCalibration()
      if (res.ok) {
        router.push('/studio')
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  return (
    <div className="space-y-8">
      <CalibrationProgress anchored={anchored} spread={spread} />

      {error ? (
        <ErrorState body={error.message} hint={error.hint} />
      ) : null}

      {/* Adding one */}
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.section
            key={`edit-${editing.work.id}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
            aria-label="Change an anchor"
          >
            <h2 className="mb-3 text-base text-v9">Change this anchor</h2>
            <AnchorCard
              imageUrl={editing.work.thumb_url ?? editing.work.image_url}
              initial={editing.scores}
              busy={pending}
              savedLabel={`Anchored on ${shortDate(editing.work.created_at)}`}
              onSave={(scores) => updateAnchor(editing.work.id, scores)}
              onDiscard={() => setEditing(null)}
            />
          </motion.section>
        ) : pendingImage ? (
          <motion.section
            key="new"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
            aria-label="Score this work"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base text-v9">
                Anchor {Math.min(anchored + 1, CALIBRATION_TARGET)}
              </h2>
              <p className="numeral text-2xs text-v5">
                {kb(pendingImage.originalBytes)} to {kb(pendingImage.bytes)},{' '}
                {pendingImage.width}×{pendingImage.height}
              </p>
            </div>
            <AnchorCard
              imageUrl={pendingImage.dataUrl}
              busy={pending}
              onSave={saveNewAnchor}
              onDiscard={() => setPendingImage(null)}
            />
          </motion.section>
        ) : (
          <motion.section
            key="drop"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            aria-label="Add a work"
          >
            <Dropzone onFile={handleFile} disabled={compressing || pending} />
            {compressing ? (
              <p className="mt-3 text-xs text-v6">
                Measuring the image on this device.
              </p>
            ) : null}
          </motion.section>
        )}
      </AnimatePresence>

      {/* What has been anchored */}
      {anchored > 0 ? (
        <section aria-label="Anchors so far">
          <h2 className="text-base text-v9">
            {academyName}’s anchors
          </h2>
          <p className="mt-1 max-w-[62ch] text-xs text-v6">
            These go into every scoring prompt from here. Select one to change
            the numbers you gave it.
          </p>
          <ul className="mt-4 grid gap-px border border-v3 bg-v3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {existing.map((a) => {
              const values = Object.values(a.scores).filter(
                (n): n is number => typeof n === 'number',
              )
              const low = values.length ? Math.min(...values) : null
              const high = values.length ? Math.max(...values) : null
              return (
                <li key={a.work.id} className="bg-v0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(a)
                      setPendingImage(null)
                    }}
                    className="block w-full p-3 text-left transition-colors hover:bg-v1"
                  >
                    <span className="block aspect-square w-full overflow-hidden border border-v3 bg-v1">
                      <img
                        src={a.work.thumb_url ?? a.work.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </span>
                    <span className="numeral mt-2 block text-xs text-v9">
                      {low !== null && high !== null ? `${low} to ${high}` : '—'}
                    </span>
                    <span className="mt-0.5 block text-2xs text-v5">
                      across five dimensions
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* Finishing */}
      <Plate tone={anchored >= CALIBRATION_MINIMUM ? 'raised' : 'recessed'} className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base text-v9">
              {alreadyCalibrated ? 'Calibration is on' : 'Finish calibration'}
            </h2>
            <p className="font-language mt-1.5 max-w-[54ch] text-base text-v6">
              {anchored >= CALIBRATION_TARGET
                ? 'Ten anchors. Every proposal from here is made against your standard.'
                : anchored >= CALIBRATION_MINIMUM
                  ? `You can start now with ${anchored}. Fewer anchors means KAUSHAL proposes with visibly lower confidence, which is the honest outcome rather than a hidden one.`
                  : `KAUSHAL needs at least ${CALIBRATION_MINIMUM} anchors before it will propose anything against your standard. You have ${anchored}.`}
            </p>
          </div>
          <Button
            variant="ink"
            size="lg"
            disabled={anchored < CALIBRATION_MINIMUM || pending}
            busy={pending}
            busyLabel="Saving"
            onClick={finish}
            className="shrink-0"
          >
            {alreadyCalibrated ? 'Back to the studio' : 'Start using KAUSHAL'}
          </Button>
        </div>
      </Plate>
    </div>
  )
}
