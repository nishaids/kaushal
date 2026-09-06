'use client'

import type {
  PlateauFinding,
  Report,
  ScoredWork,
  Student,
  TrajectoryPoint,
} from '@/lib/types'
import { RUBRIC } from '@/lib/rubric'
import { longDate } from '@/lib/utils/format'
import { TrajectoryChart } from '@/components/chart/trajectory-chart'
import { Rule } from '@/components/ui/plate'
import { Wordmark } from '@/components/ui/value-scale'
import { BeforeAfter } from './before-after'

/**
 * The report as a document, not a dashboard.
 *
 * A parent reads sentences and pictures. The numbers are here because they are
 * the evidence, but they are never the argument on their own.
 */
export function ReportView({
  report,
  student,
  academyName,
  instructorName,
  works,
  points,
  plateaus,
}: {
  report: Report
  student: Student
  academyName: string
  instructorName: string
  works: ScoredWork[]
  points: TrajectoryPoint[]
  plateaus: PlateauFinding[]
}) {
  const { content } = report
  const approved = report.approved_at != null

  const first = works.find((w) => w.id === content.first_work_id) ?? null
  const latest = works.find((w) => w.id === content.latest_work_id) ?? null

  const periodPoints = points.filter((p) => {
    const t = p.t
    return (
      t >= new Date(report.period_start).getTime() &&
      t <= new Date(report.period_end).getTime()
    )
  })

  return (
    <article className="border border-v3 bg-v0">
      {!approved ? (
        <p className="no-print border-b border-dashed border-blue-ink bg-blue-wash/60 px-6 py-2.5 text-xs text-blue-deep">
          Draft — not approved yet. Nobody outside this screen can see it.
        </p>
      ) : null}

      <div className="p-6 sm:p-10">
        {/* masthead */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Wordmark size={15} />
            <p className="mt-3 text-sm text-v9">{academyName}</p>
            <p className="mt-0.5 text-xs text-v6">{instructorName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-v6">Progress report</p>
            <p className="mt-1 text-sm text-v9">{student.name}</p>
            <p className="mt-0.5 text-xs text-v6">
              {longDate(report.period_start)} to {longDate(report.period_end)}
            </p>
            <p className="numeral mt-0.5 text-2xs text-v5">
              {content.works_in_period}{' '}
              {content.works_in_period === 1 ? 'work' : 'works'} in this period
            </p>
          </div>
        </header>

        <Rule className="my-8" />

        {/* the headline and the summary */}
        <h2 className="max-w-[24ch] text-xl text-v9 sm:text-2xl">
          {content.headline}
        </h2>
        <div className="font-language mt-5 max-w-[66ch] space-y-4 text-lg leading-relaxed text-v7">
          {content.summary
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((para, i) => (
              <p key={i}>{para.trim()}</p>
            ))}
        </div>

        <Rule className="my-8" />

        {/* the pair */}
        <section aria-label="First and latest work">
          <h3 className="text-base text-v9">
            {first && latest && first.id !== latest.id
              ? 'The first piece in this period, and the most recent'
              : 'The work in this period'}
          </h3>
          <div className="mt-4">
            <BeforeAfter first={first} latest={latest} deltas={content.deltas} />
          </div>
        </section>

        {periodPoints.length > 1 ? (
          <>
            <Rule className="my-8" />
            <section aria-label="Trajectory over the period">
              <h3 className="text-base text-v9">Every session, plotted</h3>
              <p className="mt-1 max-w-[62ch] text-xs text-v6">
                Each line is one skill, each point one piece of work. Higher is
                better; the scale runs from 1 to 10.
              </p>
              <div className="mt-4">
                <TrajectoryChart
                  points={periodPoints}
                  plateaus={plateaus}
                  height={300}
                  compact
                />
              </div>
            </section>
          </>
        ) : null}

        {content.improved.length > 0 ? (
          <>
            <Rule className="my-8" />
            <section aria-label="What improved">
              <h3 className="text-base text-v9">What improved</h3>
              <ul className="mt-4 space-y-4">
                {content.improved.map((note) => (
                  <li key={note.dimension}>
                    <p className="text-sm text-v9">
                      {RUBRIC[note.dimension].longLabel}{' '}
                      <span className="numeral text-v6">
                        {Math.round(note.from)} to {Math.round(note.to)}
                      </span>
                    </p>
                    <p className="font-language mt-1 max-w-[64ch] text-base text-v7">
                      {note.note}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {content.focus.length > 0 ? (
          <>
            <Rule className="my-8" />
            <section aria-label="What we are working on next">
              <h3 className="text-base text-v9">What we are working on next</h3>
              <ul className="mt-4 space-y-4">
                {content.focus.map((note) => (
                  <li key={note.dimension}>
                    <p className="text-sm text-v9">
                      {RUBRIC[note.dimension].longLabel}
                    </p>
                    <p className="font-language mt-1 max-w-[64ch] text-base text-v7">
                      {note.note}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {content.next_steps.length > 0 ? (
          <>
            <Rule className="my-8" />
            <section aria-label="Next steps">
              <h3 className="text-base text-v9">At home and in class</h3>
              <ul className="mt-4 space-y-2.5">
                {content.next_steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="mt-2.5 inline-block h-1.5 w-1.5 shrink-0 bg-v5"
                      aria-hidden="true"
                    />
                    <span className="font-language max-w-[64ch] text-base text-v7">
                      {step}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        <Rule className="my-8" />

        <footer className="text-xs text-v6">
          {approved ? (
            <p>
              Approved by {instructorName} on {longDate(report.approved_at!)}.
              Every score in this report was confirmed by the instructor.
            </p>
          ) : (
            <p>
              Not approved yet. {instructorName} reviews and confirms every score
              in KAUSHAL before a report is shared.
            </p>
          )}
          <p className="mt-2 max-w-[66ch]">
            Scores describe specific, visible qualities of the work — proportion,
            line, value, edges and composition. They are not a judgement of
            talent, and they are set by the instructor rather than by software.
          </p>
        </footer>
      </div>
    </article>
  )
}
