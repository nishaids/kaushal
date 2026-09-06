'use client'

import { useState } from 'react'
import type { ImageMetrics } from '@/lib/types'
import { BORDER_BAND_EVEN_SHARE, summariseMetrics } from '@/lib/metrics/image-metrics'
import { pct } from '@/lib/utils/format'
import { Rule } from '@/components/ui/plate'

/**
 * What was actually measured off the pixels.
 *
 * The product claims its proposals are grounded in measurements rather than
 * vibes, so the measurements are here to be read. They are the same numbers
 * that go into the scoring prompt as evidence, and the same ones that produce
 * the score when no model is reachable.
 *
 * Folded away by default: an instructor confirming a work does not need this,
 * and an instructor arguing with a score needs it very much.
 */
export function Measurements({ metrics }: { metrics: ImageMetrics | null }) {
  const [open, setOpen] = useState(false)

  if (!metrics) return null

  const centre = Math.hypot(metrics.massCenter.x - 0.5, metrics.massCenter.y - 0.5)

  const rows: Array<{ label: string; value: string; note: string }> = [
    {
      label: 'Value spread',
      value: pct(metrics.valueSpread),
      note: `Darkest ${pct(metrics.darkest)}, lightest ${pct(metrics.lightest)} of full range`,
    },
    {
      label: 'Ink coverage',
      value: pct(metrics.inkCoverage),
      note: 'Share of the sheet below mid-tone',
    },
    {
      label: 'Edge variance',
      value: metrics.edgeVariance.toFixed(3),
      note: 'High means hard and soft edges coexist',
    },
    {
      label: 'Stroke coherence',
      value: pct(metrics.strokeCoherence),
      note: 'Directional consistency of the mark-making',
    },
    {
      label: 'Empty sheet',
      value: pct(metrics.emptyShare),
      note: 'Tiles carrying neither edges nor tone',
    },
    {
      label: 'Mass centre',
      value: `${metrics.massCenter.x.toFixed(2)}, ${metrics.massCenter.y.toFixed(2)}`,
      note: `${centre.toFixed(2)} from the centre of the sheet`,
    },
    {
      label: 'Border energy',
      value: pct(metrics.borderEnergy),
      note:
        metrics.borderEnergy > BORDER_BAND_EVEN_SHARE
          ? `Above the ${pct(BORDER_BAND_EVEN_SHARE)} an even spread would give — the work crowds its edges`
          : `Below the ${pct(BORDER_BAND_EVEN_SHARE)} an even spread would give`,
    },
  ]

  return (
    <div>
      <Rule className="mb-3" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs text-v6 underline underline-offset-2 transition-colors hover:text-v9"
      >
        {open
          ? 'Hide what was measured'
          : 'What was measured off this image'}
      </button>

      {open ? (
        <div className="mt-3">
          <p className="max-w-[64ch] text-2xs leading-relaxed text-v5">
            {summariseMetrics(metrics)}
          </p>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-v3 pb-1.5">
                <dt className="text-2xs text-v6">{r.label}</dt>
                <dd className="text-right">
                  <span className="numeral text-xs text-v9">{r.value}</span>
                  <span className="ml-2 hidden text-2xs text-v5 sm:inline">
                    {r.note}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 max-w-[64ch] text-2xs text-v5">
            These are measured in the browser before anything is uploaded. They
            go into the scoring prompt as evidence, and when no model can be
            reached they are what produces the score.
          </p>
        </div>
      ) : null}
    </div>
  )
}
