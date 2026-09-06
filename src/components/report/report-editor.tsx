'use client'

import { useState } from 'react'
import type { ReportContent } from '@/lib/types'
import { RUBRIC } from '@/lib/rubric'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Plate, Rule } from '@/components/ui/plate'

/**
 * Editing the draft before it is approved.
 *
 * A drafted report is a starting point, not a statement the academy has made.
 * The numbers are fixed — they are the instructor's own confirmed scores — but
 * every sentence around them belongs to the person who is going to be asked
 * about it at the door on Saturday morning, so every sentence is editable.
 */
export function ReportEditor({
  content,
  onSave,
  onCancel,
  busy,
  error,
}: {
  content: ReportContent
  onSave: (next: ReportContent) => void
  onCancel: () => void
  busy?: boolean
  error?: { message: string; hint?: string } | null
}) {
  const [draft, setDraft] = useState<ReportContent>(content)

  function patch(p: Partial<ReportContent>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  return (
    <Plate className="p-5 sm:p-6">
      <h2 className="text-lg text-v9">Edit the report</h2>
      <p className="mt-1.5 max-w-[62ch] text-xs text-v6">
        The scores and the two works are fixed — they are what you already
        confirmed. Everything written around them is yours to change.
      </p>

      <div className="mt-6 space-y-6">
        <Field label="Headline" htmlFor="report-headline">
          <Input
            id="report-headline"
            value={draft.headline}
            maxLength={120}
            disabled={busy}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </Field>

        <Field
          label="Summary"
          htmlFor="report-summary"
          hint="Two or three short paragraphs. Leave a blank line between them."
        >
          <Textarea
            id="report-summary"
            value={draft.summary}
            rows={8}
            maxLength={1400}
            disabled={busy}
            onChange={(e) => patch({ summary: e.target.value })}
          />
        </Field>

        {draft.improved.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-v7">What improved</p>
            <div className="mt-3 space-y-3">
              {draft.improved.map((note, i) => (
                <div key={note.dimension}>
                  <label
                    htmlFor={`improved-${note.dimension}`}
                    className="text-2xs text-v5"
                  >
                    {RUBRIC[note.dimension].longLabel}{' '}
                    <span className="numeral">
                      {Math.round(note.from)} to {Math.round(note.to)}
                    </span>
                  </label>
                  <Textarea
                    id={`improved-${note.dimension}`}
                    value={note.note}
                    rows={2}
                    maxLength={280}
                    disabled={busy}
                    onChange={(e) => {
                      const next = [...draft.improved]
                      next[i] = { ...note, note: e.target.value }
                      patch({ improved: next })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {draft.focus.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-v7">
              What we are working on next
            </p>
            <div className="mt-3 space-y-3">
              {draft.focus.map((note, i) => (
                <div key={note.dimension}>
                  <label
                    htmlFor={`focus-${note.dimension}`}
                    className="text-2xs text-v5"
                  >
                    {RUBRIC[note.dimension].longLabel}
                  </label>
                  <Textarea
                    id={`focus-${note.dimension}`}
                    value={note.note}
                    rows={2}
                    maxLength={280}
                    disabled={busy}
                    onChange={(e) => {
                      const next = [...draft.focus]
                      next[i] = { ...note, note: e.target.value }
                      patch({ focus: next })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-medium text-v7">At home and in class</p>
          <ol className="mt-3 space-y-2">
            {draft.next_steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="numeral mt-2.5 w-4 shrink-0 text-2xs text-v5">
                  {i + 1}
                </span>
                <Textarea
                  value={step}
                  rows={2}
                  maxLength={220}
                  disabled={busy}
                  aria-label={`Next step ${i + 1}`}
                  onChange={(e) => {
                    const next = [...draft.next_steps]
                    next[i] = e.target.value
                    patch({ next_steps: next })
                  }}
                />
                <button
                  type="button"
                  disabled={busy || draft.next_steps.length <= 1}
                  onClick={() =>
                    patch({ next_steps: draft.next_steps.filter((_, j) => j !== i) })
                  }
                  className="mt-2 shrink-0 rounded-[2px] p-1 text-v5 transition-colors hover:bg-v2 hover:text-v9 disabled:opacity-30"
                  aria-label={`Remove next step ${i + 1}`}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                    <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
          {draft.next_steps.length < 4 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ next_steps: [...draft.next_steps, ''] })}
              className="mt-3 text-xs text-v6 underline underline-offset-2 hover:text-v9"
            >
              Add a step
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-5">
          <p className="text-sm text-v9">{error.message}</p>
          {error.hint ? <p className="mt-1 text-xs text-v6">{error.hint}</p> : null}
        </div>
      ) : null}

      <Rule className="my-5" />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ink"
          busy={busy}
          busyLabel="Saving"
          onClick={() =>
            onSave({
              ...draft,
              headline: draft.headline.trim(),
              summary: draft.summary.trim(),
              next_steps: draft.next_steps
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            })
          }
        >
          Save the changes
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-xs text-v6 underline underline-offset-2 hover:text-v9"
        >
          Discard them
        </button>
      </div>
    </Plate>
  )
}
