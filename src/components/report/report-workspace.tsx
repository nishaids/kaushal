'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type {
  PlateauFinding,
  Report,
  ReportContent,
  ScoredWork,
  Student,
  TrajectoryPoint,
} from '@/lib/types'
import { approveReport, draftReport, saveReportEdits } from '@/lib/actions/reports'
import { longDate } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Plate, Rule } from '@/components/ui/plate'
import { DegradedNotice, EmptyState, ErrorState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { ReportEditor } from './report-editor'
import { ReportView } from './report-view'

/**
 * Generating, reading and approving the parent report.
 *
 * A report is a claim an academy is making to a paying parent, so it does not
 * exist as something shareable until the instructor has read it and approved
 * it. Approval freezes it: a score confirmed next week does not silently
 * rewrite what a parent was shown last week.
 */
export function ReportWorkspace({
  student,
  academyName,
  instructorName,
  works,
  points,
  plateaus,
  reports,
  defaultStart,
  defaultEnd,
}: {
  student: Student
  academyName: string
  instructorName: string
  works: ScoredWork[]
  points: TrajectoryPoint[]
  plateaus: PlateauFinding[]
  reports: Report[]
  defaultStart: string
  defaultEnd: string
}) {
  const router = useRouter()
  const toast = useToast()
  const reduce = useReducedMotion()
  const [pending, startTransition] = useTransition()

  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [current, setCurrent] = useState<Report | null>(reports[0] ?? null)
  const [degraded, setDegraded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  const approved = current?.approved_at != null

  function generate() {
    setError(null)
    startTransition(async () => {
      const res = await draftReport({
        studentId: student.id,
        periodStart: new Date(start).toISOString(),
        periodEnd: new Date(`${end}T23:59:59`).toISOString(),
      })
      if (res.ok) {
        setCurrent(res.data.report)
        setDegraded(res.data.degraded)
        setEditing(false)
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  function saveEdits(content: ReportContent) {
    if (!current) return
    setError(null)
    startTransition(async () => {
      const res = await saveReportEdits({ id: current.id, content })
      if (res.ok) {
        setCurrent({ ...current, content })
        setEditing(false)
        toast.push({
          message: 'Saved.',
          detail: 'Still a draft — approve it when it reads the way you want.',
        })
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  function approve() {
    if (!current) return
    setError(null)
    startTransition(async () => {
      const res = await approveReport(current.id)
      if (res.ok) {
        setCurrent({
          ...current,
          approved_at: res.data.approvedAt,
        })
        toast.push({
          message: 'Approved.',
          detail: 'It can be printed or shown to a parent now.',
        })
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  if (works.length === 0) {
    return (
      <EmptyState
        title="There is nothing to report on yet"
        body={`A report is built from ${student.name.split(' ')[0]}’s actual work — their first piece beside their latest, and the movement between them. Record a work and this becomes possible.`}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="no-print">
        <Plate className="p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-5">
              <Field label="From" htmlFor="period-start" className="w-40">
                <Input
                  id="period-start"
                  type="date"
                  value={start}
                  max={end}
                  disabled={pending}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="To" htmlFor="period-end" className="w-40">
                <Input
                  id="period-end"
                  type="date"
                  value={end}
                  min={start}
                  disabled={pending}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={current ? 'outline' : 'ink'}
                busy={pending && !current}
                busyLabel="Writing"
                onClick={generate}
                disabled={pending}
              >
                {current ? 'Write a new one' : 'Write the report'}
              </Button>

              {current && !approved ? (
                <>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => setEditing((v) => !v)}
                  >
                    {editing ? 'Stop editing' : 'Edit the wording'}
                  </Button>
                  <Button
                    variant="ink"
                    busy={pending}
                    busyLabel="Approving"
                    onClick={approve}
                  >
                    Approve it
                  </Button>
                </>
              ) : null}

              {approved ? (
                <Button variant="outline" onClick={() => window.print()}>
                  Print or save as PDF
                </Button>
              ) : null}
            </div>
          </div>

          {current && !approved ? (
            <p className="mt-4 max-w-[64ch] text-xs text-v6">
              This is a draft. Read it before you approve it — once approved it is
              a fixed record, and a score you confirm next month will not change
              what the parent was shown.
            </p>
          ) : null}

          {reports.length > 1 ? (
            <div className="mt-5 border-t border-v3 pt-4">
              <p className="text-xs text-v7">Earlier reports</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {reports.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrent(r)
                        setDegraded(false)
                      }}
                      aria-pressed={current?.id === r.id}
                      className={
                        'rounded-[2px] border px-2.5 py-1.5 text-2xs transition-colors ' +
                        (current?.id === r.id
                          ? 'border-v9 bg-v9 text-v0'
                          : 'border-v3 bg-v0 text-v6 hover:border-v7 hover:text-v9')
                      }
                    >
                      {longDate(r.period_start)} to {longDate(r.period_end)}
                      {r.approved_at ? '' : ' — draft'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Plate>
      </div>

      {error ? (
        <div className="no-print">
          <ErrorState body={error.message} hint={error.hint} />
        </div>
      ) : null}

      {degraded && current && !approved ? (
        <div className="no-print">
          <DegradedNotice note="The wording here was assembled from this student’s own numbers rather than written by a language model, because none is configured or it could not be reached. The figures are correct; edit the sentences to sound like you before you approve it." />
        </div>
      ) : null}

      {current && editing && !approved ? (
        <div className="no-print">
          <ReportEditor
            content={current.content}
            busy={pending}
            error={error}
            onSave={saveEdits}
            onCancel={() => {
              setEditing(false)
              setError(null)
            }}
          />
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {current ? (
          <motion.div
            key={current.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <ReportView
              report={current}
              student={student}
              academyName={academyName}
              instructorName={instructorName}
              works={works}
              points={points}
              plateaus={plateaus}
            />
          </motion.div>
        ) : (
          <motion.div
            key="none"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="no-print"
          >
            <Rule />
            <div className="mt-6">
              <EmptyState
                title="No report for this period yet"
                body={`Pick the period and write it. KAUSHAL builds it from the scores you confirmed — ${student.name.split(' ')[0]}’s first work in the period beside their latest, and what moved between them.`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
