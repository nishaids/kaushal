'use client'

import { useMemo, useOptimistic, useState, useTransition } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DIMENSION_LIST, type Dimension } from '@/lib/rubric'
import type { Score } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { ConfidenceMeter, ScoreMark, ValueTicks } from '@/components/ui/score-mark'
import { Rule } from '@/components/ui/plate'
import { DegradedNotice } from '@/components/ui/states'
import { IconCheck } from '@/components/ui/icons'
import { useToast } from '@/components/ui/toast'

/**
 * Confirm or override.
 *
 * Every number on this screen is a proposal until an instructor touches it.
 * The interface says so structurally: proposals are drawn in non-photo blue,
 * dashed, the pencil you use for guidelines. Confirming inks the line in.
 *
 * Two clicks is the target for a whole work — "Confirm all five" when the
 * proposals look right, or a tick and a confirm on the one that does not.
 */

export interface ScoreReviewProps {
  workId: string
  scores: Score[]
  /** Server action. Returns the updated row so the optimistic state settles. */
  onConfirm: (input: {
    workId: string
    dimension: Dimension
    score: number
  }) => Promise<{ ok: boolean; error?: string }>
  onConfirmAll: (workId: string) => Promise<{ ok: boolean; error?: string }>
  /** Set when the scores came from the deterministic scorer, not the model. */
  degradedNote?: string | null
  subject?: string | null
  className?: string
}

type Draft = Record<string, number>

export function ScoreReview({
  workId,
  scores,
  onConfirm,
  onConfirmAll,
  degradedNote,
  subject,
  className,
}: ScoreReviewProps) {
  const toast = useToast()
  const reduce = useReducedMotion()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [optimistic, applyOptimistic] = useOptimistic(
    scores,
    (state: Score[], patch: { dimension: Dimension; score: number }) =>
      state.map((s) =>
        s.dimension === patch.dimension
          ? {
              ...s,
              confirmed_score: patch.score,
              confirmed_at: new Date().toISOString(),
            }
          : s,
      ),
  )

  const [drafts, setDrafts] = useState<Draft>({})

  const optimisticByDimension = useMemo(() => {
    const m = new Map<Dimension, Score>()
    for (const s of optimistic) m.set(s.dimension, s)
    return m
  }, [optimistic])

  const remaining = optimistic.filter((s) => s.confirmed_score === null).length
  const allConfirmed = remaining === 0
  // Nothing was proposed at all — no key, no network, nothing measurable. There
  // is no "confirm" to press, because there is nothing to confirm; the
  // instructor sets all five and they are recorded as theirs.
  const nothingProposed = optimistic.every(
    (s) => s.ai_score === null && s.confirmed_score === null,
  )

  function confirmOne(dimension: Dimension, value: number) {
    setError(null)
    startTransition(async () => {
      applyOptimistic({ dimension, score: value })
      const res = await onConfirm({ workId, dimension, score: value })
      if (!res.ok) {
        setError(
          res.error ??
            'That score did not save. Check your connection and press confirm again.',
        )
      }
    })
  }

  function confirmAll() {
    setError(null)
    startTransition(async () => {
      for (const s of optimistic) {
        if (s.confirmed_score === null) {
          const v = drafts[s.dimension] ?? s.ai_score
          if (typeof v === 'number') {
            applyOptimistic({ dimension: s.dimension, score: v })
          }
        }
      }
      const res = await onConfirmAll(workId)
      if (res.ok) {
        toast.push({
          message: 'All five inked in.',
          detail: 'This work is now part of the student’s trajectory.',
        })
      } else {
        setError(
          res.error ??
            'Those scores did not save. Nothing was lost — press confirm again.',
        )
      }
    })
  }

  return (
    <div className={cn('space-y-4', className)}>
      {subject ? (
        <p className="text-xs text-v6">
          Reading this as <span className="text-v9">{subject}</span>. Change any
          score that does not match what you see.
        </p>
      ) : null}

      {degradedNote ? <DegradedNotice note={degradedNote} /> : null}

      <div className="border border-v3 bg-v0">
        {DIMENSION_LIST.map((spec, i) => {
          const score = optimisticByDimension.get(spec.id)
          if (!score) return null
          return (
            <div key={spec.id}>
              {i > 0 ? <Rule /> : null}
              <ScoreRow
                spec={spec}
                score={score}
                draft={drafts[spec.id]}
                busy={pending}
                onDraft={(n) =>
                  setDrafts((d) => ({ ...d, [spec.id]: n }))
                }
                onConfirm={(n) => confirmOne(spec.id, n)}
              />
            </div>
          )
        })}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-v9">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-v6">
          {allConfirmed ? (
            <span className="inline-flex items-center gap-1.5 text-v9">
              <IconCheck size={13} />
              All five confirmed by you
            </span>
          ) : nothingProposed ? (
            <>
              No scores were proposed for this work. Open each dimension and set
              it yourself — they are recorded as yours, which is what every
              confirmed score is anyway.
            </>
          ) : (
            <>
              <span className="numeral text-v9">{remaining}</span> of five still
              waiting on you. Nothing enters the trajectory until you confirm it.
            </>
          )}
        </p>

        <AnimatePresence initial={false} mode="wait">
          {!allConfirmed && !nothingProposed ? (
            <motion.div
              key="confirm-all"
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            >
              <Button
                variant="ink"
                onClick={confirmAll}
                busy={pending}
                busyLabel="Inking"
              >
                Confirm all five
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ScoreRow({
  spec,
  score,
  draft,
  busy,
  onDraft,
  onConfirm,
}: {
  spec: (typeof DIMENSION_LIST)[number]
  score: Score
  draft: number | undefined
  busy: boolean
  onDraft: (n: number) => void
  onConfirm: (n: number) => void
}) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const confirmed = score.confirmed_score !== null
  const shown = score.confirmed_score ?? draft ?? score.ai_score
  const overridden =
    confirmed &&
    score.ai_score !== null &&
    score.confirmed_score !== score.ai_score
  const uncertain =
    typeof score.ai_confidence === 'number' && score.ai_confidence < 0.55

  const labelId = `dim-${spec.id}`

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <ScoreMark
          value={shown ?? null}
          state={confirmed ? 'confirmed' : shown === null ? 'empty' : 'proposed'}
          confidence={score.ai_confidence}
          size="lg"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 id={labelId} className="text-base text-v9">
              {spec.longLabel}
            </h3>
            {overridden ? (
              <span className="text-2xs text-v5">
                you changed this from{' '}
                <span className="numeral text-v7">{score.ai_score}</span>
              </span>
            ) : null}
          </div>

          {score.ai_rationale ? (
            <p className="font-language mt-1.5 max-w-[58ch] text-base leading-relaxed text-v7">
              {score.ai_rationale}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-v6">
              No proposal for this dimension. Set it yourself below.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            {!confirmed ? (
              <ConfidenceMeter confidence={score.ai_confidence} />
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-xs text-v6 underline underline-offset-2 transition-colors hover:text-v9"
            >
              {open ? 'Close' : confirmed ? 'Change this score' : 'Set it myself'}
            </button>
            {uncertain && !confirmed ? (
              <span className="text-2xs text-blue-deep">
                The model was unsure here — worth a look.
              </span>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="ticks"
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-4 border-t border-v3 pt-4">
                  <p className="mb-2 text-2xs text-v5">{spec.question}</p>
                  <ValueTicks
                    value={draft ?? score.confirmed_score ?? null}
                    proposed={score.ai_score}
                    uncertain={uncertain}
                    labelledBy={labelId}
                    onChange={onDraft}
                    disabled={busy}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ink"
                      disabled={draft === undefined || busy}
                      onClick={() => {
                        if (draft !== undefined) {
                          onConfirm(draft)
                          setOpen(false)
                        }
                      }}
                    >
                      Ink this in
                    </Button>
                    <span className="max-w-[38ch] text-2xs text-v5">
                      At the top of this scale:{' '}
                      {spec.anchors.high.toLowerCase().replace(/\.$/, '')}.
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {!confirmed && shown !== null ? (
          <Button
            size="sm"
            variant="guide"
            disabled={busy}
            onClick={() => onConfirm(draft ?? shown)}
            className="shrink-0"
          >
            Confirm
          </Button>
        ) : null}
      </div>
    </div>
  )
}
