'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Assignment, AssignmentBrief } from '@/lib/types'
import { RUBRIC } from '@/lib/rubric'
import { issueAssignment, updateAssignmentBrief } from '@/lib/actions/assignments'
import { longDate, pluralise } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { BriefEditor } from './brief-editor'
import { useToast } from '@/components/ui/toast'

export function AssignmentList({
  heading,
  note,
  assignments,
  names,
  emptyBody,
}: {
  heading: string
  note: string
  assignments: Assignment[]
  names: Map<string, string>
  emptyBody: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; brief: AssignmentBrief } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function saveBrief() {
    if (!editing) return
    startTransition(async () => {
      setError(null)
      const res = await updateAssignmentBrief({ id: editing.id, brief: editing.brief })
      if (res.ok) {
        setEditing(null)
        toast.push({ message: 'Brief updated.' })
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section aria-label={heading}>
      <h2 className="text-base text-v9">{heading}</h2>
      <p className="mt-1 max-w-[62ch] text-xs text-v6">{note}</p>

      {assignments.length === 0 ? (
        <div className="mt-4">
          <EmptyState compact title="Nothing here" body={emptyBody} />
        </div>
      ) : (
        <ul className="mt-4 border border-v3 bg-v0">
          {assignments.map((a, i) => {
            const open = openId === a.id
            return (
              <li
                key={a.id}
                className={i > 0 ? 'border-t border-v3' : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm text-v9">{a.brief.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-v6">
                      <Link
                        href={`/studio/students/${a.student_id}`}
                        className="underline underline-offset-2 hover:text-v9"
                      >
                        {names.get(a.student_id) ?? 'Unknown student'}
                      </Link>
                      <span className="h-2.5 w-px bg-v3" aria-hidden="true" />
                      <span>{RUBRIC[a.target_dimension].longLabel}</span>
                      <span className="h-2.5 w-px bg-v3" aria-hidden="true" />
                      <span>{a.brief.duration_minutes} minutes</span>
                      <span className="h-2.5 w-px bg-v3" aria-hidden="true" />
                      <span>
                        {a.issued_at
                          ? `issued ${longDate(a.issued_at)}`
                          : `drafted ${longDate(a.created_at)}`}
                      </span>
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : a.id)}
                        aria-expanded={open}
                        className="text-xs text-v6 underline underline-offset-2 hover:text-v9"
                      >
                        {open
                          ? 'Hide the brief'
                          : `Read the brief — ${pluralise(a.brief.steps.length, 'step')}`}
                      </button>
                      {a.issued_at === null ? (
                        <button
                          type="button"
                          onClick={() =>
                            setEditing(
                              editing?.id === a.id
                                ? null
                                : { id: a.id, brief: a.brief },
                            )
                          }
                          className="text-xs text-v6 underline underline-offset-2 hover:text-v9"
                        >
                          {editing?.id === a.id ? 'Stop editing' : 'Edit it'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {a.issued_at === null ? (
                    <Button
                      size="sm"
                      variant="guide"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null)
                          const res = await issueAssignment(a.id)
                          if (res.ok) {
                            toast.push({
                              message: 'Issued.',
                              detail: `${names.get(a.student_id) ?? 'The student'} can be given this now.`,
                            })
                            router.refresh()
                          } else {
                            setError(res.error)
                          }
                        })
                      }
                    >
                      Issue it
                    </Button>
                  ) : (
                    <span className="shrink-0 text-2xs text-v5">issued</span>
                  )}
                </div>

                {editing?.id === a.id ? (
                  <div className="border-t border-v3 bg-v1 p-4 sm:p-5">
                    <BriefEditor
                      brief={editing.brief}
                      disabled={pending}
                      onChange={(brief) => setEditing({ id: a.id, brief })}
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button
                        variant="ink"
                        size="sm"
                        busy={pending}
                        busyLabel="Saving"
                        onClick={saveBrief}
                      >
                        Save the brief
                      </Button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-xs text-v6 underline underline-offset-2 hover:text-v9"
                      >
                        Discard the changes
                      </button>
                    </div>
                  </div>
                ) : open ? (
                  <div className="border-t border-v3 bg-v1 p-4 sm:p-5">
                    <p className="font-language max-w-[64ch] text-base text-v7">
                      {a.brief.rationale}
                    </p>

                    <ol className="mt-4 space-y-2">
                      {a.brief.steps.map((step, si) => (
                        <li key={si} className="flex gap-3">
                          <span className="numeral mt-0.5 w-4 shrink-0 text-2xs text-v5">
                            {si + 1}
                          </span>
                          <span className="font-language max-w-[62ch] text-base text-v7">
                            {step}
                          </span>
                        </li>
                      ))}
                    </ol>

                    {a.brief.materials.length > 0 ? (
                      <p className="mt-4 max-w-[62ch] text-xs text-v6">
                        <span className="text-v9">Materials.</span>{' '}
                        {a.brief.materials.join(', ')}
                      </p>
                    ) : null}

                    {a.brief.success_criteria.length > 0 ? (
                      <div className="mt-4">
                        <p className="text-xs text-v9">
                          What to look for when it comes back
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {a.brief.success_criteria.map((c, ci) => (
                            <li
                              key={ci}
                              className="font-language flex gap-3 text-base text-v7"
                            >
                              <span
                                className="mt-2 inline-block h-1.5 w-1.5 shrink-0 bg-v5"
                                aria-hidden="true"
                              />
                              <span className="max-w-[62ch]">{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-xs text-v9">
          {error}
        </p>
      ) : null}
    </section>
  )
}
