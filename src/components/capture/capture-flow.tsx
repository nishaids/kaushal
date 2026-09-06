'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Assignment, ScoredWork, Student } from '@/lib/types'
import type { Dimension } from '@/lib/rubric'
import { DIMENSION_LIST } from '@/lib/rubric'
import {
  ImageCompressionError,
  compressImage,
  isSupportedImage,
  type CompressResult,
} from '@/lib/utils/compress'
import { createWorkAndScore, confirmScoreAction, confirmAllScoresAction } from '@/lib/actions/scores'
import { assessQuality, type QualityReport } from '@/lib/metrics/quality-gate'
import { kb } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field, Textarea, Select } from '@/components/ui/field'
import { Plate, Rule } from '@/components/ui/plate'
import { ErrorState, SkeletonBlock } from '@/components/ui/states'
import { ScoreReview } from '@/components/score/score-review'
import { Dropzone } from './dropzone'
import { QualityNotice } from './quality-notice'
import { StudentPicker } from './student-picker'

/**
 * Photograph to five confirmed scores, on one screen, in under thirty seconds.
 *
 * There is no wizard here on purpose. An instructor with thirty drawings on a
 * table will not click through steps; they pick a name, drop a photo, glance at
 * five numbers and confirm.
 */

type Stage = 'idle' | 'compressing' | 'checking' | 'scoring' | 'review' | 'failed'

/** After this long the model has effectively failed, whatever it is doing. */
const PATIENCE_MS = 25_000

export function CaptureFlow({
  students,
  assignments,
  initialStudentId,
}: {
  students: Student[]
  assignments: Assignment[]
  initialStudentId?: string | null
}) {
  const router = useRouter()
  const reduce = useReducedMotion()

  const [studentId, setStudentId] = useState<string | null>(initialStudentId ?? null)
  const [assignmentId, setAssignmentId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [image, setImage] = useState<CompressResult | null>(null)
  const [quality, setQuality] = useState<QualityReport | null>(null)
  const [work, setWork] = useState<ScoredWork | null>(null)
  const [degraded, setDegraded] = useState<string | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)
  const patience = useRef<number | null>(null)

  const student = students.find((s) => s.id === studentId) ?? null
  const openAssignments = assignments.filter(
    (a) => a.student_id === studentId && a.issued_at !== null && !a.completed,
  )

  const reset = useCallback((keepStudent: boolean) => {
    if (patience.current) window.clearTimeout(patience.current)
    setStage('idle')
    setImage(null)
    setQuality(null)
    setWork(null)
    setDegraded(null)
    setSubject(null)
    setSlow(false)
    setError(null)
    setNotes('')
    setAssignmentId('')
    if (!keepStudent) setStudentId(null)
  }, [])

  const score = useCallback(
    async (compressed: CompressResult, report: QualityReport) => {
      if (!studentId) return
      setStage('scoring')
      patience.current = window.setTimeout(() => setSlow(true), PATIENCE_MS)

      const res = await createWorkAndScore({
        studentId,
        imageUrl: compressed.dataUrl,
        thumbUrl: compressed.thumbDataUrl,
        metrics: compressed.metrics,
        imageBase64: compressed.dataUrl,
        mimeType: 'image/jpeg',
        notes: notes.trim() || null,
        assignmentId: assignmentId || null,
        quality: {
          verdict: report.verdict,
          score: report.score,
          assessable: report.assessable,
          issues: report.issues.map((i) => ({
            code: i.code,
            severity: i.severity,
            message: i.message,
          })),
        },
      })

      if (patience.current) window.clearTimeout(patience.current)
      setSlow(false)

      if (res.ok) {
        setWork(res.data.work)
        setDegraded(res.data.degradedNote)
        setSubject(res.data.subject)
        setStage('review')
        router.refresh()
      } else {
        setStage('failed')
        setError({ message: res.error, hint: res.hint })
      }
    },
    [studentId, notes, assignmentId, router],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setSlow(false)

      if (!studentId) {
        setError({
          message: 'Pick the student first.',
          hint: 'KAUSHAL needs to know whose trajectory this work belongs to.',
        })
        return
      }

      if (!isSupportedImage(file)) {
        setError({
          message: 'That file is not one this browser can read as an image.',
          hint: 'Export it as JPEG or PNG and try again.',
        })
        return
      }

      setStage('compressing')
      let compressed: CompressResult
      try {
        compressed = await compressImage(file)
        setImage(compressed)
      } catch (err) {
        setStage('failed')
        if (err instanceof ImageCompressionError) {
          setError({ message: err.message, hint: err.hint })
        } else {
          setError({
            message: 'That image could not be prepared for upload.',
            hint: 'Try a different photo, or export this one as a JPEG first.',
          })
        }
        return
      }

      // The gate runs on measurements the compression step already produced.
      // A blocked photo stops here: it is still uploaded and still scoreable by
      // hand, it just does not get a proposal built on evidence we have already
      // measured as unreliable.
      const report = assessQuality(compressed.metrics)
      setQuality(report)
      if (!report.assessable) {
        setStage('checking')
        return
      }

      await score(compressed, report)
    },
    [studentId, score],
  )

  const busy = stage === 'compressing' || stage === 'scoring'
  const blocked = stage === 'checking' && quality !== null
  const confirmedCount =
    work?.scores.filter((s) => s.confirmed_score !== null).length ?? 0
  const allConfirmed = work !== null && confirmedCount === 5

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8">
      {/* ---- left: what is being recorded ---- */}
      <div className="space-y-6">
        <Plate className="p-5">
          <StudentPicker
            students={students}
            value={studentId}
            onChange={setStudentId}
            autoFocus
          />

          {openAssignments.length > 0 ? (
            <div className="mt-5">
              <Field label="Against an assignment" htmlFor="capture-assignment">
                <Select
                  id="capture-assignment"
                  value={assignmentId}
                  onChange={(e) => setAssignmentId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Not linked to one</option>
                  {openAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.brief.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          <div className="mt-5">
            <Field
              label="Note"
              htmlFor="capture-notes"
              hint="What the exercise was, how long they had. Optional, and it goes into the scoring prompt."
            >
              <Textarea
                id="capture-notes"
                value={notes}
                maxLength={500}
                rows={3}
                placeholder="Cast study under a single lamp, 90 minutes."
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </Field>
          </div>
        </Plate>

        {stage === 'idle' || stage === 'failed' ? (
          <Dropzone onFile={handleFile} disabled={!studentId} />
        ) : image ? (
          <Plate className="p-3">
            <img
              src={image.dataUrl}
              alt="The work being recorded"
              className="w-full border border-v3 object-contain"
            />
            <dl className="mt-3 grid grid-cols-3 gap-3 text-2xs">
              <div>
                <dt className="text-v5">Original</dt>
                <dd className="numeral mt-0.5 text-v7">{kb(image.originalBytes)}</dd>
              </div>
              <div>
                <dt className="text-v5">Uploaded</dt>
                <dd className="numeral mt-0.5 text-v9">{kb(image.bytes)}</dd>
              </div>
              <div>
                <dt className="text-v5">Size</dt>
                <dd className="numeral mt-0.5 text-v7">
                  {image.width}×{image.height}
                </dd>
              </div>
            </dl>
          </Plate>
        ) : null}

        {quality && stage !== 'idle' ? (
          <QualityNotice
            report={quality}
            onRetake={blocked ? () => reset(true) : undefined}
            onUseAnyway={
              blocked && image
                ? () => {
                    void score(image, { ...quality, assessable: false })
                  }
                : undefined
            }
          />
        ) : null}

        {!studentId ? (
          <p className="text-xs text-v5">
            Pick a student and the upload opens.
          </p>
        ) : null}
      </div>

      {/* ---- right: the scores ---- */}
      <div className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          {stage === 'idle' ? (
            <motion.div
              key="waiting"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              <Plate tone="recessed" className="p-6 sm:p-8">
                <h2 className="text-lg text-v9">Nothing loaded yet</h2>
                <p className="font-language mt-2 max-w-[54ch] text-base text-v6">
                  When you add a photo, KAUSHAL proposes a score and a reason for
                  each of the five dimensions. You confirm them, or change one and
                  confirm. Nothing reaches the student’s trajectory until you do.
                </p>
                <ul className="mt-5 space-y-2">
                  {DIMENSION_LIST.map((spec) => (
                    <li key={spec.id} className="flex items-center gap-3">
                      <span
                        className="inline-block h-[2px] w-6 shrink-0"
                        style={{ backgroundColor: spec.ink }}
                        aria-hidden="true"
                      />
                      <span className="text-xs text-v6">{spec.longLabel}</span>
                    </li>
                  ))}
                </ul>
              </Plate>
            </motion.div>
          ) : busy ? (
            <motion.div
              key="working"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              <Plate className="p-5 sm:p-6">
                <p className="text-sm text-v9">
                  {stage === 'compressing'
                    ? 'Measuring the image on this device'
                    : 'Proposing five scores'}
                </p>
                <p className="mt-1.5 max-w-[54ch] text-xs text-v6">
                  {stage === 'compressing'
                    ? 'Value spread, ink coverage, edge variance and mass distribution are read off the pixels here, before anything is uploaded.'
                    : 'Those measurements go to the model with your academy’s own calibration anchors.'}
                </p>

                <div className="mt-5 space-y-3">
                  {DIMENSION_LIST.map((spec, i) => (
                    <div key={spec.id} className="flex items-center gap-4">
                      <SkeletonBlock className="h-10 w-10 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-v6">{spec.longLabel}</p>
                        <motion.span
                          className="mt-1.5 block h-px bg-v3"
                          initial={{ scaleX: reduce ? 1 : 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{
                            duration: reduce ? 0 : 0.9,
                            delay: reduce ? 0 : i * 0.12,
                            ease: [0.65, 0, 0.35, 1],
                          }}
                          style={{ transformOrigin: 'left' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {slow ? (
                  <div className="mt-5 border-t border-v3 pt-4">
                    <p className="text-xs text-v9">
                      The model is taking longer than it should.
                    </p>
                    <p className="mt-1 max-w-[54ch] text-xs text-v6">
                      The work itself is saved. You can wait, or set the five
                      scores yourself — they will be recorded as yours either way.
                    </p>
                  </div>
                ) : null}
              </Plate>
            </motion.div>
          ) : blocked ? (
            <motion.div
              key="blocked"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              <Plate tone="recessed" className="p-6 sm:p-8">
                <h2 className="text-lg text-v9">Nothing scored from this photo</h2>
                <p className="font-language mt-2 max-w-[54ch] text-base text-v6">
                  The checks on the left would make any proposal unreliable, so
                  KAUSHAL has not made one. Take the photo again and it will score
                  normally — or keep this one and set the five scores yourself,
                  which records them as yours the same as any confirmed score.
                </p>
              </Plate>
            </motion.div>
          ) : stage === 'failed' ? (
            <motion.div
              key="failed"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              <ErrorState
                body={error?.message ?? 'That did not go through.'}
                hint={error?.hint}
                action={
                  <Button variant="outline" onClick={() => reset(true)}>
                    Try another photo
                  </Button>
                }
              />
            </motion.div>
          ) : work ? (
            <motion.div
              key="review"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
              className="space-y-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg text-v9">
                  {student ? student.name : 'This work'}
                </h2>
                <p className="text-xs text-v6">
                  <span className="numeral text-v9">{confirmedCount}</span> of five
                  confirmed
                </p>
              </div>

              <ScoreReview
                workId={work.id}
                scores={work.scores}
                subject={subject}
                degradedNote={degraded}
                onConfirm={async (input) => {
                  const res = await confirmScoreAction({
                    workId: input.workId,
                    dimension: input.dimension as Dimension,
                    score: input.score,
                  })
                  if (res.ok) {
                    setWork((w) =>
                      w
                        ? {
                            ...w,
                            scores: w.scores.map((s) =>
                              s.dimension === input.dimension
                                ? {
                                    ...s,
                                    confirmed_score: input.score,
                                    confirmed_at: new Date().toISOString(),
                                  }
                                : s,
                            ),
                          }
                        : w,
                    )
                  }
                  return res.ok ? { ok: true } : { ok: false, error: res.error }
                }}
                onConfirmAll={async (workId) => {
                  const res = await confirmAllScoresAction(workId)
                  if (res.ok) {
                    setWork((w) =>
                      w
                        ? {
                            ...w,
                            scores: w.scores.map((s) =>
                              s.confirmed_score === null
                                ? {
                                    ...s,
                                    confirmed_score: s.ai_score,
                                    confirmed_at: new Date().toISOString(),
                                  }
                                : s,
                            ),
                          }
                        : w,
                    )
                    router.refresh()
                  }
                  return res.ok ? { ok: true } : { ok: false, error: res.error }
                }}
              />

              <AnimatePresence>
                {allConfirmed ? (
                  <motion.div
                    key="done"
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.24 }}
                  >
                    <Rule className="my-5" />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="ink"
                        onClick={() => {
                          reset(false)
                          window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
                        }}
                      >
                        Next student
                      </Button>
                      {studentId ? (
                        <ButtonLink
                          href={`/studio/students/${studentId}`}
                          variant="outline"
                        >
                          Open the trajectory
                        </ButtonLink>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => reset(true)}
                        className={cn(
                          'rounded-[2px] px-2 py-1 text-xs text-v6 underline underline-offset-2 hover:text-v9',
                        )}
                      >
                        Another work for {student ? firstName(student.name) : 'them'}
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {stage !== 'failed' && error ? (
          <p role="alert" className="mt-4 text-xs text-v9">
            {error.message}
            {error.hint ? <span className="block text-v6">{error.hint}</span> : null}
          </p>
        ) : null}

        {students.length === 0 ? (
          <p className="mt-4 text-xs text-v6">
            There are no students on the roster yet.{' '}
            <Link href="/studio" className="underline underline-offset-2">
              Add one first
            </Link>
            .
          </p>
        ) : null}
      </div>
    </div>
  )
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}
