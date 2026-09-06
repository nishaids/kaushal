'use client'

import type { AssignmentBrief } from '@/lib/types'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Plate, Rule } from '@/components/ui/plate'

/**
 * The brief as an editable document.
 *
 * The moment a brief is drafted it stops being the model's and becomes the
 * instructor's, so every part of it can be rewritten — including after it has
 * been saved as a draft. Steps can be added, removed and reordered, because a
 * generated exercise nobody adjusted is worth less than nothing.
 */
export function BriefEditor({
  brief,
  onChange,
  disabled,
}: {
  brief: AssignmentBrief
  onChange: (b: AssignmentBrief) => void
  disabled?: boolean
}) {
  function patch(p: Partial<AssignmentBrief>) {
    onChange({ ...brief, ...p })
  }

  return (
    <Plate className="p-5 sm:p-6">
      <Field label="Title" htmlFor="brief-title">
        <Input
          id="brief-title"
          value={brief.title}
          maxLength={90}
          disabled={disabled}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Field>

      <div className="mt-5">
        <Field
          label="Why this exercise"
          htmlFor="brief-rationale"
          hint="What it is fixing, in the words you would use with the student."
        >
          <Textarea
            id="brief-rationale"
            value={brief.rationale}
            rows={3}
            maxLength={400}
            disabled={disabled}
            onChange={(e) => patch({ rationale: e.target.value })}
          />
        </Field>
      </div>

      <Rule className="my-5" />

      <ListEditor
        label="Steps"
        hint="The substance of the brief. What the student actually does, in order."
        items={brief.steps}
        onChange={(steps) => patch({ steps })}
        disabled={disabled}
        max={7}
        multiline
        addLabel="Add a step"
      />

      <Rule className="my-5" />

      <ListEditor
        label="Materials"
        items={brief.materials}
        onChange={(materials) => patch({ materials })}
        disabled={disabled}
        max={8}
        addLabel="Add a material"
      />

      <Rule className="my-5" />

      <div className="max-w-[12rem]">
        <Field label="How long" htmlFor="brief-duration" hint="Minutes.">
          <Input
            id="brief-duration"
            type="number"
            min={10}
            max={180}
            step={5}
            value={brief.duration_minutes}
            disabled={disabled}
            onChange={(e) =>
              patch({ duration_minutes: Number(e.target.value) || 60 })
            }
          />
        </Field>
      </div>

      <Rule className="my-5" />

      <ListEditor
        label="What to look for when it comes back"
        hint="Things you can check by looking at the work."
        items={brief.success_criteria}
        onChange={(success_criteria) => patch({ success_criteria })}
        disabled={disabled}
        max={5}
        multiline
        addLabel="Add a check"
      />
    </Plate>
  )
}

function ListEditor({
  label,
  hint,
  items,
  onChange,
  disabled,
  max,
  multiline,
  addLabel,
}: {
  label: string
  hint?: string
  items: string[]
  onChange: (items: string[]) => void
  disabled?: boolean
  max: number
  multiline?: boolean
  addLabel: string
}) {
  return (
    <div>
      <p className="text-xs font-medium text-v7">{label}</p>
      {hint ? <p className="mt-1 text-2xs text-v5">{hint}</p> : null}

      <ol className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="numeral mt-2.5 w-4 shrink-0 text-2xs text-v5">
              {i + 1}
            </span>
            {multiline ? (
              <Textarea
                value={item}
                rows={2}
                disabled={disabled}
                aria-label={`${label} ${i + 1}`}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = e.target.value
                  onChange(next)
                }}
              />
            ) : (
              <Input
                value={item}
                disabled={disabled}
                aria-label={`${label} ${i + 1}`}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = e.target.value
                  onChange(next)
                }}
              />
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="mt-2 shrink-0 rounded-[2px] p-1 text-v5 transition-colors hover:bg-v2 hover:text-v9"
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
          </li>
        ))}
      </ol>

      {items.length < max ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...items, ''])}
          className="mt-3 text-xs text-v6 underline underline-offset-2 transition-colors hover:text-v9"
        >
          {addLabel}
        </button>
      ) : null}
    </div>
  )
}
