'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { AssignmentBrief, Student } from '@/lib/types'
import { DIMENSION_LIST, RUBRIC, type Dimension } from '@/lib/rubric'
import { draftAssignment, saveAssignment } from '@/lib/actions/assignments'
import { Button } from '@/components/ui/button'
import { Plate, Rule } from '@/components/ui/plate'
import { BriefEditor } from './brief-editor'
import { DegradedNotice, ErrorState } from '@/components/ui/states'
import { StudentPicker } from '@/components/capture/student-picker'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'

/**
 * Drafting the next exercise.
 *
 * The brief arrives as an editable document rather than a read-only card,
 * because the moment it is generated it stops being the model's and becomes the
 * instructor's. Nothing goes to a student until they press issue.
 */

const EMPTY: AssignmentBrief = {
  title: '',
  rationale: '',
  steps: ['', '', ''],
  materials: [],
  duration_minutes: 60,
  success_criteria: ['', ''],
}

export function AssignmentComposer({
  students,
  suggestions,
  initialStudentId,
  initialDimension,
  arrivedFromFlag,
}: {
  students: Student[]
  suggestions: Record<string, { dimension: Dimension; reason: string } | null>
  initialStudentId: string | null
  initialDimension: Dimension | null
  arrivedFromFlag: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const reduce = useReducedMotion()
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const [studentId, setStudentId] = useState<string | null>(initialStudentId)
  const [dimension, setDimension] = useState<Dimension | null>(initialDimension)
  const [brief, setBrief] = useState<AssignmentBrief | null>(null)
  const [degraded, setDegraded] = useState(false)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  const student = students.find((s) => s.id === studentId) ?? null
  const suggestion = studentId ? suggestions[studentId] : null

  // Arriving from a plateau flag should land the instructor on the composer
  // with the right student and dimension already chosen.
  useEffect(() => {
    if (arrivedFromFlag && ref.current) {
      ref.current.scrollIntoView({
        behavior: reduce ? 'auto' : 'smooth',
        block: 'start',
      })
    }
  }, [arrivedFromFlag, reduce])

  // When the student changes and nothing has been chosen by hand, follow the
  // flag rather than making the instructor pick.
  useEffect(() => {
    if (!studentId) return
    const s = suggestions[studentId]
    if (s && !initialDimension) setDimension(s.dimension)
  }, [studentId, suggestions, initialDimension])

  function generate() {
    if (!studentId || !dimension) return
    setError(null)
    startTransition(async () => {
      const res = await draftAssignment({ studentId, targetDimension: dimension })
      if (res.ok) {
        setBrief(res.data.brief)
        setDegraded(res.data.degraded)
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  function save(issue: boolean) {
    if (!studentId || !dimension || !brief) return
    setError(null)
    startTransition(async () => {
      const res = await saveAssignment({
        studentId,
        targetDimension: dimension,
        brief,
        issue,
      })
      if (res.ok) {
        toast.push({
          message: issue
            ? `Issued to ${student?.name ?? 'the student'}.`
            : 'Saved as a draft.',
          detail: issue
            ? 'Link their next work to it when you record it.'
            : 'It stays here until you issue it.',
        })
        setBrief(null)
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  return (
    <div ref={ref} className="scroll-mt-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8">
        {/* choose */}
        <div className="space-y-5">
          <Plate className="p-5">
            <StudentPicker
              students={students}
              value={studentId}
              onChange={setStudentId}
            />

            <fieldset className="mt-6">
              <legend className="mb-2 block text-xs font-medium text-v7">
                What to work on
              </legend>
              <div className="space-y-1">
                {DIMENSION_LIST.map((spec) => {
                  const active = dimension === spec.id
                  const suggested = suggestion?.dimension === spec.id
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setDimension(spec.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-[2px] border px-3 py-2 text-left text-sm transition-colors',
                        active
                          ? 'border-v9 bg-v9 text-v0'
                          : 'border-v3 bg-v0 text-v7 hover:border-v7',
                      )}
                    >
                      <span>{spec.longLabel}</span>
                      {suggested ? (
                        <span
                          className={cn(
                            'shrink-0 text-2xs',
                            active ? 'text-blue' : 'text-blue-deep',
                          )}
                        >
                          flagged
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {suggestion && student ? (
              <p className="font-language mt-4 max-w-[42ch] text-base text-v6">
                {suggestion.reason}
              </p>
            ) : student ? (
              <p className="mt-4 text-xs text-v6">
                Nothing is flagged for {student.name.split(' ')[0]} yet. Pick the
                dimension you want to push.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="ink"
                disabled={!studentId || !dimension || pending}
                busy={pending && !brief}
                busyLabel="Drafting"
                onClick={generate}
              >
                Draft an exercise
              </Button>
              <Button
                variant="quiet"
                disabled={!studentId || !dimension || pending}
                onClick={() => {
                  setBrief({
                    ...EMPTY,
                    title: dimension ? `${RUBRIC[dimension].longLabel} exercise` : '',
                  })
                  setDegraded(false)
                }}
              >
                Write it myself
              </Button>
            </div>
          </Plate>
        </div>

        {/* edit */}
        <div className="min-w-0">
          {error ? (
            <div className="mb-5">
              <ErrorState body={error.message} hint={error.hint} />
            </div>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            {brief ? (
              <motion.div
                key="brief"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
              >
                {degraded ? (
                  <DegradedNotice
                    note="This came from the built-in exercise library rather than from the model, because no text model is configured or it could not be reached. It is a real exercise — edit it into your own words before you issue it."
                    className="mb-4"
                  />
                ) : null}

                <BriefEditor brief={brief} onChange={setBrief} disabled={pending} />

                <Rule className="my-5" />

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="ink"
                    busy={pending}
                    busyLabel="Issuing"
                    onClick={() => save(true)}
                  >
                    Issue to {student ? student.name.split(' ')[0] : 'the student'}
                  </Button>
                  <Button variant="outline" disabled={pending} onClick={() => save(false)}>
                    Save as a draft
                  </Button>
                  <button
                    type="button"
                    onClick={() => setBrief(null)}
                    className="text-xs text-v6 underline underline-offset-2 hover:text-v9"
                  >
                    Discard
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.18 }}
              >
                <Plate tone="recessed" className="p-6 sm:p-8">
                  <h2 className="text-lg text-v9">No brief open</h2>
                  <p className="font-language mt-2 max-w-[54ch] text-base text-v6">
                    Pick a student and a dimension, then draft an exercise aimed
                    at it. What comes back is a starting point — edit the steps
                    into the way you actually teach before you issue it.
                  </p>
                </Plate>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
