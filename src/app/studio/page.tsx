import type { Metadata } from 'next'
import { db } from '@/lib/dal'
import { requireCalibrated } from '@/lib/session'
import {
  buildCohortRows,
  cohortSummary,
  sortCohort,
  type CohortSortKey,
} from '@/lib/analytics/cohort'
import type { Alert, CohortRow, ScoredWork } from '@/lib/types'
import { asAlerts, deriveAlerts } from '@/lib/analytics/alerts'
import { buildAttentionBoard } from '@/lib/analytics/attention'
import { AttentionBoardView } from '@/components/cohort/attention-board'
import { CALIBRATION_HOLDER_NAME, DORMANT_DAYS } from '@/lib/constants'
import { PageHeader, Plate, Rule, Stat } from '@/components/ui/plate'
import { EmptyState } from '@/components/ui/states'
import { ButtonLink } from '@/components/ui/button'
import { TriageFilters } from '@/components/cohort/triage-filters'
import { TriageTable } from '@/components/cohort/triage-table'
import { AddStudent } from '@/components/cohort/add-student'
import { RecheckButton } from '@/components/cohort/recheck-button'

export const metadata: Metadata = { title: 'Cohort' }

type Search = {
  q?: string
  sort?: string
  dir?: string
  view?: string
}

const SORT_KEYS: CohortSortKey[] = [
  'attention',
  'name',
  'recent',
  'momentum',
  'mean',
  'works',
]

export default async function CohortPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const params = await searchParams
  const session = await requireCalibrated()
  const driver = await db()

  const [students, works] = await Promise.all([
    driver.listStudents(session.academy.id, { status: 'all' }),
    driver.listScoredWorks(session.academy.id, {}),
  ])

  const worksByStudent = new Map<string, ScoredWork[]>()
  for (const w of works) {
    const list = worksByStudent.get(w.student_id)
    if (list) list.push(w)
    else worksByStudent.set(w.student_id, [w])
  }

  // Detection runs on read. It is a straight-line fit over each student's last
  // four works and costs a few milliseconds across the whole cohort, so the
  // screen is honest the moment it loads rather than only after a button press.
  const now = new Date()
  const alertsByStudent = new Map<string, Alert[]>()
  for (const s of students) {
    const derived = deriveAlerts(s.id, worksByStudent.get(s.id) ?? [], now)
    if (derived.length > 0) alertsByStudent.set(s.id, asAlerts(derived))
  }

  // The calibration set is stored as a hidden roster entry. It is not a person
  // and must never appear in a cohort the instructor is triaging.
  const roster = students.filter((s) => s.name !== CALIBRATION_HOLDER_NAME)

  // The board answers "where do I start"; the table below answers "how is
  // everyone doing". Both read the same signals, so they can never disagree.
  const board = buildAttentionBoard({
    students: roster,
    worksByStudent,
    now,
  })

  const allRows = buildCohortRows({
    students: roster,
    worksByStudent,
    alertsByStudent,
  })
  const summary = cohortSummary(allRows)

  const view = params.view ?? 'all'
  const query = (params.q ?? '').trim().toLowerCase()
  const sort = (SORT_KEYS as string[]).includes(params.sort ?? '')
    ? (params.sort as CohortSortKey)
    : 'attention'
  const dir = params.dir === 'asc' ? 'asc' : 'desc'

  const filtered = sortCohort(allRows.filter((r) => matches(r, view, query)), sort, dir)

  return (
    <>
      <PageHeader
        title={session.academy.name}
        meta={
          <>
            <span className="text-v7">
              {summary.total} students on the roster
            </span>
            <span className="h-3 w-px bg-v3" aria-hidden="true" />
            <span>Sorted by who needs you first</span>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RecheckButton />
            <ButtonLink href="/studio/capture" variant="ink">
              Record a work
            </ButtonLink>
          </div>
        }
      />

      <div className="border-b border-v3 bg-v1 px-5 py-7 sm:px-8">
        <AttentionBoardView board={board} instructorName={session.instructor.name} />
      </div>

      <div className="border-b border-v3 bg-v0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 px-5 py-6 sm:px-8 lg:grid-cols-4">
          <Stat
            value={summary.flagged}
            label="students carrying an open flag"
            sub={summary.flagged === 0 ? 'Nothing is stalled right now' : 'Plateaus and falls'}
            tone={summary.flagged > 0 ? 'guide' : 'quiet'}
          />
          <Stat
            value={summary.unconfirmed}
            label="students with scores waiting on you"
            sub="Nothing enters a trajectory unconfirmed"
          />
          <Stat
            value={summary.dormant}
            label={`students with no work for ${DORMANT_DAYS} days`}
            sub="Worth a message before the next class"
          />
          <Stat
            value={summary.needsFirstWork}
            label="students with nothing recorded yet"
            sub="Their trajectory starts at their first work"
            tone="quiet"
          />
        </div>
      </div>

      <div className="px-5 py-6 sm:px-8">
        {allRows.length === 0 ? (
          <EmptyState
            title="There is nobody on the roster yet"
            body="Add the students you teach. Each one gets a trajectory the moment you record their first work, and this screen starts telling you who to focus on."
            action={<AddStudent />}
          />
        ) : (
          <>
            <TriageFilters
              view={view}
              query={params.q ?? ''}
              sort={sort}
              dir={dir}
              counts={summary}
            />

            {filtered.length === 0 ? (
              <Plate className="mt-5 p-8">
                <h3 className="text-lg text-v9">Nothing matches those filters</h3>
                <p className="font-language mt-2 max-w-[52ch] text-base text-v6">
                  {summary.total} students are on the roster. Clear the search or
                  switch back to everyone to see them.
                </p>
                <div className="mt-4">
                  <ButtonLink href="/studio" variant="outline" size="sm">
                    Show everyone
                  </ButtonLink>
                </div>
              </Plate>
            ) : (
              <div className="mt-5">
                <TriageTable rows={filtered} />
              </div>
            )}

            <Rule className="my-8" />
            <div className="max-w-xl">
              <h2 className="text-base text-v9">Add a student</h2>
              <p className="mt-1.5 max-w-[54ch] text-xs text-v6">
                A name is enough. You can set their level now or change it later
                from their trajectory.
              </p>
              <div className="mt-4">
                <AddStudent />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function matches(row: CohortRow, view: string, query: string): boolean {
  if (query && !row.student.name.toLowerCase().includes(query)) return false

  switch (view) {
    case 'flagged':
      return row.alerts.length > 0
    case 'waiting':
      return row.unconfirmedCount > 0
    case 'dormant':
      return row.daysSinceLastWork !== null && row.daysSinceLastWork > DORMANT_DAYS
    case 'new':
      return row.worksCount === 0
    case 'active':
      return row.student.status === 'active'
    default:
      return true
  }
}
