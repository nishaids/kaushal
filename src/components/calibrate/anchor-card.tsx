'use client'

import { useState } from 'react'
import { DIMENSION_LIST, type Dimension } from '@/lib/rubric'
import { Button } from '@/components/ui/button'
import { ValueTicks } from '@/components/ui/score-mark'
import { Rule } from '@/components/ui/plate'

/**
 * One anchor: a work, and the five numbers this academy would give it.
 *
 * The rubric's own low, middle and high descriptions sit beside the dimension
 * being set. Without them ten instructors would produce ten incompatible
 * scales, and the anchors would be noise rather than a standard.
 */
export function AnchorCard({
  imageUrl,
  initial,
  onSave,
  onDiscard,
  busy,
  savedLabel,
}: {
  imageUrl: string
  initial?: Partial<Record<Dimension, number>>
  onSave: (scores: Record<Dimension, number>) => void
  onDiscard?: () => void
  busy?: boolean
  savedLabel?: string
}) {
  const [scores, setScores] = useState<Partial<Record<Dimension, number>>>(
    initial ?? {},
  )
  const complete = DIMENSION_LIST.every(
    (spec) => typeof scores[spec.id] === 'number',
  )
  const setCount = DIMENSION_LIST.filter(
    (spec) => typeof scores[spec.id] === 'number',
  ).length

  return (
    <div className="grid gap-px border border-v3 bg-v3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="bg-v1 p-4">
        <img
          src={imageUrl}
          alt="The work being anchored"
          className="w-full border border-v3 bg-v0 object-contain"
        />
        {savedLabel ? (
          <p className="mt-3 text-2xs text-v6">{savedLabel}</p>
        ) : (
          <p className="mt-3 text-2xs text-v5">
            Score it the way you would have scored it on the day.
          </p>
        )}
      </div>

      <div className="bg-v0 p-5">
        {DIMENSION_LIST.map((spec, i) => (
          <div key={spec.id}>
            {i > 0 ? <Rule className="my-4" /> : null}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`anchor-${spec.id}`} className="text-sm text-v9">
                {spec.longLabel}
              </h3>
              <span className="numeral text-xs text-v6">
                {scores[spec.id] ?? '—'}
              </span>
            </div>
            <p className="mt-1 max-w-[58ch] text-2xs text-v5">{spec.question}</p>

            <div className="mt-3">
              <ValueTicks
                value={scores[spec.id] ?? null}
                labelledBy={`anchor-${spec.id}`}
                disabled={busy}
                onChange={(n) => setScores((s) => ({ ...s, [spec.id]: n }))}
              />
            </div>

            <dl className="mt-3 grid gap-1 text-2xs text-v6 sm:grid-cols-3 sm:gap-4">
              <div>
                <dt className="numeral text-v9">1–3</dt>
                <dd className="mt-0.5 max-w-[28ch]">{spec.anchors.low}</dd>
              </div>
              <div>
                <dt className="numeral text-v9">4–7</dt>
                <dd className="mt-0.5 max-w-[28ch]">{spec.anchors.mid}</dd>
              </div>
              <div>
                <dt className="numeral text-v9">8–10</dt>
                <dd className="mt-0.5 max-w-[28ch]">{spec.anchors.high}</dd>
              </div>
            </dl>
          </div>
        ))}

        <Rule className="my-5" />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ink"
            disabled={!complete || busy}
            busy={busy}
            busyLabel="Saving"
            onClick={() => {
              if (complete) onSave(scores as Record<Dimension, number>)
            }}
          >
            Save this anchor
          </Button>
          {onDiscard ? (
            <button
              type="button"
              onClick={onDiscard}
              disabled={busy}
              className="text-xs text-v6 underline underline-offset-2 hover:text-v9"
            >
              Use a different work
            </button>
          ) : null}
          {!complete ? (
            <span className="text-2xs text-v5">
              {setCount} of five set. An anchor is only a reference point when
              all five are.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
