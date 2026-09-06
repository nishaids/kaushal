'use client'

import { useEffect, useState, useTransition } from 'react'
import type { ScoredWork } from '@/lib/types'
import type { Dimension } from '@/lib/rubric'
import { longDate } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Rule } from '@/components/ui/plate'
import { Measurements } from '@/components/score/measurements'
import { ScoreReview } from '@/components/score/score-review'
import {
  confirmAllScoresAction,
  confirmScoreAction,
  rescoreWork,
} from '@/lib/actions/scores'

/**
 * One work, opened from the chart or the strip.
 *
 * The same review component the capture flow uses, so confirming a score
 * months later behaves exactly like confirming it on the day.
 */
export function WorkPanel({
  work,
  studentName,
  open,
  onClose,
  onChanged,
}: {
  work: ScoredWork | null
  studentName: string
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [rescoreError, setRescoreError] = useState<string | null>(null)

  // Keep the last work around through the closing animation, or the panel
  // empties itself mid-transition.
  const [shown, setShown] = useState(work)
  useEffect(() => {
    if (work) setShown(work)
  }, [work])

  const w = work ?? shown
  const source = w?.scores.find((s) => s.source)?.source ?? null
  // A work whose numbers came from the pixels, or which has none at all, can be
  // put back to the model — but only the scores nobody has confirmed change.
  const canRescore =
    w !== null && (source === 'measured' || source === 'manual')
  const unconfirmed = w?.scores.filter((s) => s.confirmed_score === null).length ?? 0

  return (
    <Panel
      open={open}
      onClose={onClose}
      title={w ? longDate(w.captured_at) : 'Work'}
      description={
        w
          ? `${studentName}. ${w.scores.filter((s) => s.confirmed_score !== null).length} of five confirmed by you.`
          : undefined
      }
      width="xl"
    >
      {w ? (
        <div className="space-y-6">
          <div className="border border-v3 bg-v1 p-2">
            <img
              src={w.image_url}
              alt={`Work recorded on ${longDate(w.captured_at)}`}
              className="mx-auto max-h-[46vh] w-auto object-contain"
            />
          </div>

          {w.notes ? (
            <p className="font-language max-w-[62ch] text-base text-v7">
              {w.notes}
            </p>
          ) : null}

          {canRescore && unconfirmed > 0 ? (
            <div>
              <Rule className="mb-4" />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="guide"
                  size="sm"
                  busy={pending}
                  busyLabel="Asking"
                  onClick={() =>
                    startTransition(async () => {
                      setRescoreError(null)
                      const res = await rescoreWork(w.id)
                      if (res.ok) onChanged()
                      else setRescoreError(res.error)
                    })
                  }
                >
                  Ask the model again
                </Button>
                <span className="max-w-[42ch] text-2xs text-v5">
                  Only the {unconfirmed} score
                  {unconfirmed === 1 ? '' : 's'} you have not confirmed can
                  change. Anything you have inked in stays as it is.
                </span>
              </div>
              {rescoreError ? (
                <p role="alert" className="mt-2 text-xs text-v9">
                  {rescoreError}
                </p>
              ) : null}
            </div>
          ) : null}

          <ScoreReview
            workId={w.id}
            scores={w.scores}
            subject={null}
            degradedNote={
              source === 'measured'
                ? 'These numbers were derived from measurements taken off the pixels rather than from a model looking at the work. Read each rationale before you confirm it.'
                : null
            }
            onConfirm={async (input) => {
              const res = await confirmScoreAction({
                workId: input.workId,
                dimension: input.dimension as Dimension,
                score: input.score,
              })
              if (res.ok) onChanged()
              return res.ok ? { ok: true } : { ok: false, error: res.error }
            }}
            onConfirmAll={async (workId) => {
              const res = await confirmAllScoresAction(workId)
              if (res.ok) onChanged()
              return res.ok ? { ok: true } : { ok: false, error: res.error }
            }}
          />

          <Measurements metrics={w.metrics} />
        </div>
      ) : null}
    </Panel>
  )
}
