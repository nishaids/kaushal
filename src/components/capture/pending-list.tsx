'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ScoredWork } from '@/lib/types'
import { relativeDays } from '@/lib/utils/format'
import { EmptyState } from '@/components/ui/states'
import { WorkPanel } from '@/components/student/work-panel'

/**
 * The confirmation queue.
 *
 * Work that has been photographed but whose scores nobody has inked yet. It is
 * deliberately visible on the capture screen rather than hidden in a menu,
 * because an unconfirmed score is the one thing in KAUSHAL that is genuinely
 * incomplete.
 */
export function PendingList({
  works,
  names,
}: {
  works: ScoredWork[]
  names: Map<string, string>
}) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = works.find((w) => w.id === openId) ?? null

  if (works.length === 0) {
    return (
      <section aria-label="Waiting on you">
        <h2 className="text-base text-v9">Waiting on you</h2>
        <div className="mt-4">
          <EmptyState
            compact
            title="Nothing is waiting"
            body="Every score on every work has been confirmed by you. That means every line on every trajectory in this academy is one you agreed to."
          />
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Waiting on you">
      <h2 className="text-base text-v9">Waiting on you</h2>
      <p className="mt-1 max-w-[62ch] text-xs text-v6">
        These works have proposals nobody has confirmed. They do not count
        towards a trajectory until you do.
      </p>

      <ul className="mt-4 grid gap-px border border-v3 bg-v3 sm:grid-cols-2 xl:grid-cols-3">
        {works.map((w) => {
          const remaining = w.scores.filter((s) => s.confirmed_score === null).length
          return (
            <li key={w.id} className="bg-v0">
              <button
                type="button"
                onClick={() => setOpenId(w.id)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-v1"
              >
                <span className="h-14 w-14 shrink-0 overflow-hidden border border-dashed border-blue-ink">
                  {w.thumb_url || w.image_url ? (
                    <img
                      src={w.thumb_url ?? w.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-v9">
                    {names.get(w.student_id) ?? 'Unknown student'}
                  </span>
                  <span className="mt-0.5 block text-2xs text-v5">
                    {relativeDays(w.captured_at)}
                  </span>
                  <span className="mt-1 block text-2xs text-blue-deep">
                    {remaining} of five to confirm
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <WorkPanel
        work={open}
        studentName={open ? (names.get(open.student_id) ?? '') : ''}
        open={open !== null}
        onClose={() => setOpenId(null)}
        onChanged={() => router.refresh()}
      />
    </section>
  )
}
