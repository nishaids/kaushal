'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import type {
  Alert,
  Assignment,
  PlateauFinding,
  ScoredWork,
  Student,
  TrajectoryAnalysis,
} from '@/lib/types'
import { DIMENSION_LIST, type Dimension } from '@/lib/rubric'
import { linearSlopePerWeek, toTrajectoryPoints } from '@/lib/analytics/trajectory'
import { PLATEAU_METHOD_SENTENCE } from '@/lib/analytics/plateau'
import { PLATEAU } from '@/lib/constants'
import { slope as fmtSlope } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { TrajectoryChart } from '@/components/chart/trajectory-chart'
import { ScoreMark } from '@/components/ui/score-mark'
import { Plate, Rule } from '@/components/ui/plate'
import { resolveAlertAction } from '@/lib/actions/alerts'
import { PlateauCard } from './plateau-card'
import { WorkStrip } from './work-strip'
import { WorkPanel } from './work-panel'

/**
 * The screen the product is really for.
 *
 * Everything an instructor teaching sixty students cannot hold in their head:
 * every score they have ever confirmed for this student, per dimension, over
 * time — and the one dimension that stopped moving while the rest kept going.
 */

export function TrajectoryPanel({
  student,
  works,
  analysis,
  plateaus,
  alerts,
  assignments,
}: {
  student: Student
  works: ScoredWork[]
  analysis: TrajectoryAnalysis
  plateaus: PlateauFinding[]
  alerts: Alert[]
  assignments: Assignment[]
}) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [focus, setFocus] = useState<Dimension | null>(null)
  const [openWorkId, setOpenWorkId] = useState<string | null>(null)
  const [resolving, startResolve] = useTransition()
  const [dismissed, setDismissed] = useState<string[]>([])

  const points = useMemo(() => toTrajectoryPoints(works), [works])

  /**
   * The rate over the last few works, not over the whole record.
   *
   * These cards sit beside a flag that says a dimension has stopped, so they
   * have to be measuring the same stretch the flag measured. A whole-record
   * slope would print "+0.22 a week" next to "has not moved in 6 weeks" and the
   * screen would be arguing with itself.
   */
  const recentSlopes = useMemo(() => {
    const window = points.slice(-PLATEAU.window)
    const out: Partial<Record<Dimension, number>> = {}
    for (const spec of DIMENSION_LIST) {
      const series = window
        .filter((p) => typeof p.values[spec.id] === 'number')
        .map((p) => ({ t: p.t, v: p.values[spec.id] as number }))
      if (series.length >= 2) out[spec.id] = linearSlopePerWeek(series)
    }
    return out
  }, [points])
  const flaggedDimensions = plateaus.map((p) => p.dimension)
  const openWork = works.find((w) => w.id === openWorkId) ?? null

  const enoughForDetection = points.length >= PLATEAU.minWorks
  const otherAlerts = alerts.filter(
    (a) => a.type !== 'plateau' && !dismissed.includes(a.id),
  )

  return (
    // overflow-x-clip so a transform mid-animation can never hand the page a
    // horizontal scrollbar. Nothing here should ever scroll sideways.
    <div className="space-y-8 overflow-x-clip">
      <section aria-label="Trajectory">
        <Plate className="p-4 sm:p-6">
          <TrajectoryChart
            points={points}
            plateaus={plateaus}
            focus={focus}
            onFocusChange={setFocus}
            onPointSelect={setOpenWorkId}
            height={400}
          />
          <p className="mt-4 max-w-[76ch] border-t border-v3 pt-3 text-2xs leading-relaxed text-v5">
            {enoughForDetection ? (
              PLATEAU_METHOD_SENTENCE
            ) : (
              <>
                {PLATEAU_METHOD_SENTENCE} With {points.length} of the{' '}
                {PLATEAU.minWorks} works that needs, KAUSHAL is not making that
                call yet.
              </>
            )}
          </p>
        </Plate>
      </section>

      <section aria-label="Where the student stands">
        <h2 className="text-base text-v9">Where {firstName(student.name)} stands</h2>
        <p className="mt-1 max-w-[62ch] text-xs text-v6">
          The latest value on each dimension, and how fast it has moved across
          the last {Math.min(points.length, PLATEAU.window)} works — the same
          stretch the plateau check reads. Select one to see its line on its own.
        </p>

        <div className="mt-4 grid gap-px border border-v3 bg-v3 sm:grid-cols-2 lg:grid-cols-5">
          {DIMENSION_LIST.map((spec) => {
            const latest = analysis.latest[spec.id]
            const s = recentSlopes[spec.id] ?? analysis.slopes[spec.id]
            const active = focus === spec.id
            const flagged = flaggedDimensions.includes(spec.id)
            const isWeakest = analysis.weakest?.dimension === spec.id
            const confirmed = latestConfirmed(works, spec.id)

            return (
              <button
                key={spec.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFocus(active ? null : spec.id)}
                className={cn(
                  'group flex flex-col items-start gap-3 p-4 text-left transition-colors',
                  active ? 'bg-v9' : 'bg-v0 hover:bg-v1',
                )}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span
                    className={cn(
                      'text-xs',
                      active ? 'text-v1' : 'text-v6 group-hover:text-v9',
                    )}
                  >
                    {spec.longLabel}
                  </span>
                  <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true">
                    <line
                      x1="0"
                      y1="4"
                      x2="20"
                      y2="4"
                      stroke={active ? 'var(--color-v1)' : spec.ink}
                      strokeWidth="2.2"
                      strokeDasharray={spec.dash}
                    />
                  </svg>
                </span>

                <span className="flex items-end gap-3">
                  {typeof latest === 'number' ? (
                    <ScoreMark
                      value={latest}
                      state={confirmed ? 'confirmed' : 'proposed'}
                      size="md"
                    />
                  ) : (
                    <ScoreMark value={null} state="empty" size="md" />
                  )}
                  <span
                    className={cn(
                      'numeral pb-1 text-xs',
                      active ? 'text-v3' : 'text-v6',
                    )}
                  >
                    {typeof s === 'number' ? (
                      <>
                        {fmtSlope(s)}
                        <span className="ml-1 text-2xs">/wk</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </span>

                <span
                  className={cn(
                    'text-2xs',
                    flagged
                      ? active
                        ? 'text-blue'
                        : 'text-blue-deep'
                      : active
                        ? 'text-v3'
                        : 'text-v5',
                  )}
                >
                  {flagged
                    ? 'Flagged as stalled'
                    : isWeakest
                      ? 'Lowest right now'
                      : typeof s === 'number' && s > 0.05
                        ? 'Climbing'
                        : 'Steady'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {plateaus.length > 0 ? (
        <section aria-label="Plateau">
          {plateaus.map((p, i) => (
            <motion.div
              key={p.dimension}
              /*
                The pin is a scale, not a fade. The most important element on
                this screen must never depend on an animation completing to be
                readable — if the tab is throttled or motion is interrupted, a
                card that started at opacity 0 would simply never arrive.
              */
              initial={reduce ? false : { scale: 1.06, y: -8 }}
              animate={{ scale: 1, y: 0 }}
              style={{ transformOrigin: 'left top' }}
              transition={{
                duration: reduce ? 0 : 0.42,
                delay: reduce ? 0 : 1.2 + i * 0.12,
                ease: [0.2, 0.9, 0.25, 1.08],
              }}
              className={i > 0 ? 'mt-3' : undefined}
            >
              <PlateauCard
                finding={p}
                studentId={student.id}
                onFocus={() => setFocus(p.dimension)}
                alreadyAssigned={assignments.some(
                  (a) => a.target_dimension === p.dimension && a.issued_at !== null,
                )}
              />
            </motion.div>
          ))}
        </section>
      ) : (
        <section aria-label="Plateau">
          <Plate tone="recessed" className="p-5">
            <p className="text-sm text-v9">
              {enoughForDetection
                ? 'Nothing has stalled.'
                : 'Not enough works yet to look for a plateau.'}
            </p>
            <p className="font-language mt-1.5 max-w-[62ch] text-base text-v6">
              {enoughForDetection
                ? `Every dimension is either climbing or holding while the others climb. That is worth saying out loud — it means ${firstName(student.name)} is moving on all five.`
                : `KAUSHAL waits for ${PLATEAU.minWorks} works before it will claim a dimension has stopped. ${firstName(student.name)} has ${points.length}.`}
            </p>
          </Plate>
        </section>
      )}

      {otherAlerts.length > 0 ? (
        <section aria-label="Other flags">
          <h2 className="text-base text-v9">Other things worth knowing</h2>
          <ul className="mt-3 border border-v3 bg-v0">
            {otherAlerts.map((a, i) => (
              <li key={a.id}>
                {i > 0 ? <Rule /> : null}
                <div className="flex flex-wrap items-start justify-between gap-4 p-4">
                  <p className="font-language max-w-[62ch] text-base text-v7">
                    {a.message}
                  </p>
                  {/* A derived alert has no stored row to resolve yet. */}
                  {a.id.startsWith('derived:') ? null : (
                    <button
                      type="button"
                      disabled={resolving}
                      onClick={() =>
                        startResolve(async () => {
                          const res = await resolveAlertAction(a.id)
                          if (res.ok) {
                            setDismissed((d) => [...d, a.id])
                            router.refresh()
                          }
                        })
                      }
                      className="shrink-0 text-xs text-v6 underline underline-offset-2 transition-colors hover:text-v9 disabled:opacity-40"
                    >
                      I have dealt with this
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Every recorded work">
        <h2 className="text-base text-v9">Every work, oldest first</h2>
        <p className="mt-1 max-w-[62ch] text-xs text-v6">
          The first and the latest are marked, because that pair is the whole
          argument a parent report makes.
        </p>
        <div className="mt-4">
          <WorkStrip works={works} onSelect={setOpenWorkId} focus={focus} />
        </div>
      </section>

      <WorkPanel
        work={openWork}
        studentName={student.name}
        open={openWork !== null}
        onClose={() => setOpenWorkId(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  )
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/** Whether the newest score for this dimension is inked or still a guideline. */
function latestConfirmed(works: ScoredWork[], d: Dimension): boolean {
  for (let i = works.length - 1; i >= 0; i -= 1) {
    const row = works[i].scores.find((s) => s.dimension === d)
    if (!row) continue
    if (row.confirmed_score !== null) return true
    if (row.ai_score !== null) return false
  }
  return false
}
