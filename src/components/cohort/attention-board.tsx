import Link from 'next/link'
import type { AttentionBoard } from '@/lib/analytics/attention'
import { BAND_LABELS, BAND_MEANING } from '@/lib/analytics/attention'
import { evidenceLabel } from '@/lib/analytics/signals'
import { Plate } from '@/components/ui/plate'
import { cn } from '@/lib/utils/cn'

/**
 * The teacher's first screen.
 *
 * A sorted table answers "how is everyone doing" and leaves the teacher to do
 * the reduction themselves, sixty rows at a time. This answers "where do I
 * start" — a short list of things to do, each naming the students it concerns
 * and the reason it was raised.
 *
 * Nothing here is invented. Every item traces to a signal, a missing
 * submission, or work waiting on a confirmation, and the reason is printed
 * beside it so the instructor can disagree.
 */
export function AttentionBoardView({
  board,
  instructorName,
  now = new Date(),
}: {
  board: AttentionBoard
  instructorName: string
  now?: Date
}) {
  const { actions, counts } = board
  const firstName = instructorName.trim().split(/\s+/)[0] ?? instructorName

  return (
    <section aria-label="What needs your attention" className="space-y-6">
      <div>
        <h2 className="text-xl text-v9">
          {greeting(now)}, {firstName}.
        </h2>
        <p className="font-language mt-2 max-w-[62ch] text-lg text-v7">
          {summarise(counts)}
        </p>
      </div>

      {actions.length > 0 ? (
        <ol className="grid gap-px border border-v3 bg-v3">
          {actions.map((action, i) => (
            <li key={action.id} className="bg-v0">
              <Link
                href={action.href}
                className="flex flex-col gap-3 p-5 transition-colors hover:bg-v1 sm:flex-row sm:items-start sm:gap-5"
              >
                <span
                  className="numeral mt-0.5 w-5 shrink-0 text-2xs text-v5"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-base text-v9">{action.title}</span>
                  <span className="font-language mt-1.5 block max-w-[64ch] text-base text-v6">
                    {action.reason}
                  </span>

                  {action.students.length > 0 ? (
                    <span className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                      {action.students.slice(0, 6).map((s) => (
                        <span key={s.id} className="text-2xs text-v5">
                          {s.name}
                        </span>
                      ))}
                      {action.students.length > 6 ? (
                        <span className="text-2xs text-v5">
                          and {action.students.length - 6} more
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <Plate tone="recessed" className="p-6">
          <h3 className="text-base text-v9">Nothing is waiting on you</h3>
          <p className="font-language mt-2 max-w-[58ch] text-base text-v6">
            Every score is confirmed, nobody has gone quiet, and no dimension has
            stalled. That is worth stating plainly rather than filling the screen
            with numbers to look busy.
          </p>
        </Plate>
      )}

      <Queues board={board} />
    </section>
  )
}

function Queues({ board }: { board: AttentionBoard }) {
  const bands = (['urgent', 'attention', 'thriving'] as const).filter(
    (b) => board.bands[b].length > 0,
  )
  if (bands.length === 0) return null

  return (
    <div className="grid gap-px border border-v3 bg-v3 sm:grid-cols-3">
      {bands.map((band) => (
        <div key={band} className="bg-v0 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm text-v9">{BAND_LABELS[band]}</h3>
            <span className="numeral text-sm text-v9">
              {board.bands[band].length}
            </span>
          </div>
          <p className="mt-1 max-w-[34ch] text-2xs text-v5">{BAND_MEANING[band]}</p>

          <ul className="mt-3 space-y-2.5">
            {board.bands[band].slice(0, 5).map((entry) => (
              <li key={entry.student.id}>
                <Link
                  href={`/studio/students/${entry.student.id}`}
                  className="group block"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-block h-3 w-1 shrink-0',
                        band === 'urgent'
                          ? 'bg-v9'
                          : band === 'attention'
                            ? 'bg-v6'
                            : 'bg-v4',
                      )}
                    />
                    <span className="truncate text-xs text-v7 group-hover:text-v9">
                      {entry.student.name}
                    </span>
                  </span>
                  {entry.lead ? (
                    <span className="mt-0.5 block pl-3 text-2xs leading-relaxed text-v6">
                      {entry.lead.message}
                      <span className="mt-0.5 block text-v5">
                        {evidenceLabel(entry.lead.evidence)} — from{' '}
                        {entry.lead.observations} submissions
                      </span>
                    </span>
                  ) : entry.daysSinceLastWork !== null ? (
                    <span className="mt-0.5 block pl-3 text-2xs text-v6">
                      No work for {entry.daysSinceLastWork} days.
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          {board.bands[band].length > 5 ? (
            <p className="mt-3 text-2xs text-v5">
              and {board.bands[band].length - 5} more
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function summarise(counts: AttentionBoard['counts']): string {
  const parts: string[] = []
  if (counts.unconfirmedWorks > 0) {
    parts.push(
      `${counts.unconfirmedWorks} ${counts.unconfirmedWorks === 1 ? 'score is' : 'scores are'} waiting on you`,
    )
  }
  if (counts.urgent > 0) {
    parts.push(
      `${counts.urgent} ${counts.urgent === 1 ? 'needs' : 'need'} attention now`,
    )
  }
  if (counts.dormant > 0) {
    parts.push(`${counts.dormant} ${counts.dormant === 1 ? 'has' : 'have'} gone quiet`)
  }
  if (counts.thriving > 0) {
    parts.push(
      `${counts.thriving} ${counts.thriving === 1 ? 'is' : 'are'} ready for more`,
    )
  }

  if (parts.length === 0) {
    return `All ${counts.students} students are up to date and nothing has stalled.`
  }

  const last = parts.pop()
  return parts.length > 0
    ? `Across ${counts.students} students: ${parts.join(', ')} and ${last}.`
    : `Across ${counts.students} students: ${last}.`
}
