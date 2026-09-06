'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DIMENSION_LIST, RUBRIC, SCORE_MAX, SCORE_MIN, type Dimension } from '@/lib/rubric'
import type { PlateauFinding, TrajectoryPoint } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import { monthYear, shortDate } from '@/lib/utils/format'
import { valueForStep } from '@/components/ui/value-scale'

/**
 * The trajectory.
 *
 * Five dimensions over every session ever recorded, drawn in five graphite
 * values rather than five colours — because the one accent in this product is
 * spent on the single thing that matters most on the screen, and on this screen
 * that is the plateau.
 *
 * Reading the chart:
 *   a solid graphite dot   the instructor confirmed this score
 *   an open blue circle    the model proposed it and nobody has inked it yet
 *   the blue band          a dimension that stopped moving while the rest rose
 *
 * The y-axis is a real value scale, the printed strip an art student is handed
 * on their first day, because that is the unit the whole product is denominated
 * in.
 */

const AXIS_W = 46

export interface TrajectoryChartProps {
  points: TrajectoryPoint[]
  plateaus?: PlateauFinding[]
  height?: number
  /** Suppresses the legend and the method line for small embedded uses. */
  compact?: boolean
  /** Starts every dimension dimmed except this one. */
  initialFocus?: Dimension | null
  /** Controlled focus. Pass both to drive the chart from outside its legend. */
  focus?: Dimension | null
  onFocusChange?: (d: Dimension | null) => void
  onPointSelect?: (workId: string) => void
  className?: string
}

interface Row {
  t: number
  label: string
  workId: string
  thumb: string | null
  values: Partial<Record<Dimension, number>>
  confirmed: Partial<Record<Dimension, boolean>>
}

export function TrajectoryChart({
  points,
  plateaus = [],
  height = 380,
  compact = false,
  initialFocus = null,
  focus: focusProp,
  onFocusChange,
  onPointSelect,
  className,
}: TrajectoryChartProps) {
  const reduce = useReducedMotion()
  const [ownFocus, setOwnFocus] = useState<Dimension | null>(initialFocus)
  const controlled = focusProp !== undefined
  const focus = controlled ? focusProp : ownFocus
  const setFocus = (d: Dimension | null) => {
    if (!controlled) setOwnFocus(d)
    onFocusChange?.(d)
  }

  const rows = useMemo<Row[]>(
    () =>
      points.map((p) => ({
        t: p.t,
        label: shortDate(p.captured_at),
        workId: p.work_id,
        thumb: p.thumb_url,
        values: p.values,
        confirmed: p.confirmed,
      })),
    [points],
  )

  const domain = useMemo(() => {
    if (rows.length === 0) return [0, 1] as [number, number]
    const min = rows[0].t
    const max = rows[rows.length - 1].t
    const pad = Math.max((max - min) * 0.04, 86_400_000)
    return [min - pad, max + pad] as [number, number]
  }, [rows])

  const ticks = useMemo(() => {
    if (rows.length === 0) return []
    const seen = new Set<string>()
    const out: number[] = []
    for (const r of rows) {
      const key = monthYear(new Date(r.t))
      if (!seen.has(key)) {
        seen.add(key)
        out.push(r.t)
      }
    }
    return out
  }, [rows])

  /**
   * Month names alone. "Jun 26" reads as the twenty-sixth of June to anybody
   * who has ever seen a date, so the year goes on the first tick only, and
   * again wherever the record crosses into a new one.
   */
  const tickLabel = useMemo(() => {
    let lastYear: number | null = null
    const labels = new Map<number, string>()
    for (const t of ticks) {
      const d = new Date(t)
      const year = d.getFullYear()
      const month = d.toLocaleDateString('en-IN', { month: 'short' })
      labels.set(t, year === lastYear ? month : `${month} ${year}`)
      lastYear = year
    }
    return labels
  }, [ticks])

  if (rows.length === 0) return null

  return (
    <div className={cn('w-full', className)}>
      {/*
        On a phone a fourteen-week, five-line chart cannot be squeezed into 340
        pixels and stay readable, so it scrolls inside its own container against
        a sensible minimum width. The page itself never scrolls sideways, which
        is the part that would actually feel broken.
      */}
      <div className="w-full overflow-x-auto">
        <div className="flex min-w-[34rem]" style={{ height }}>
        {/* The axis is the value scale itself, printed down the left edge. */}
        <ValueAxis height={height} />

        <div className="relative min-w-0 flex-1">
          <ResponsiveContainer width="100%" height={height}>
            <LineChart
              data={rows}
              margin={{ top: 14, right: 18, bottom: 26, left: 0 }}
              onClick={(e) => {
                const row = e?.activePayload?.[0]?.payload as Row | undefined
                if (row && onPointSelect) onPointSelect(row.workId)
              }}
            >
              <CartesianGrid
                stroke="var(--color-v3)"
                strokeWidth={1}
                vertical={false}
                strokeDasharray="0"
                opacity={0.7}
              />
              <XAxis
                dataKey="t"
                type="number"
                domain={domain}
                ticks={ticks}
                tickFormatter={(v: number) => tickLabel.get(v) ?? monthYear(new Date(v))}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-v5)' }}
                tick={{ fill: 'var(--color-v6)', fontSize: 11 }}
                dy={8}
              />
              <YAxis
                domain={[SCORE_MIN - 0.4, SCORE_MAX + 0.4]}
                hide
                type="number"
              />

              {/* The plateau: the one place the accent is spent. */}
              {plateaus.map((p) => {
                const from = new Date(p.since).getTime()
                const to = rows[rows.length - 1].t
                return (
                  <ReferenceArea
                    key={`${p.dimension}-band`}
                    x1={from}
                    x2={to}
                    y1={SCORE_MIN - 0.4}
                    y2={SCORE_MAX + 0.4}
                    fill="var(--color-blue-wash)"
                    fillOpacity={0.85}
                    stroke="var(--color-blue)"
                    strokeDasharray="3 3"
                    ifOverflow="extendDomain"
                  />
                )
              })}

              <Tooltip
                cursor={{ stroke: 'var(--color-v5)', strokeDasharray: '2 3' }}
                content={<WorkTooltip focus={focus} />}
                isAnimationActive={false}
                wrapperStyle={{ outline: 'none', zIndex: 20 }}
              />

              {DIMENSION_LIST.map((spec) => {
                const dimmed = focus !== null && focus !== spec.id
                return (
                  <Line
                    key={spec.id}
                    type="monotone"
                    dataKey={(r: Row) => r.values[spec.id] ?? null}
                    name={spec.label}
                    stroke={dimmed ? 'var(--color-v3)' : spec.ink}
                    strokeWidth={focus === spec.id ? 2.4 : dimmed ? 1 : 1.6}
                    strokeDasharray={spec.dash}
                    connectNulls
                    dot={(props) => (
                      <WorkDot
                        key={`${spec.id}-${props.index}`}
                        {...props}
                        dimension={spec.id}
                        dimmed={dimmed}
                        ink={spec.ink}
                      />
                    )}
                    activeDot={{
                      r: 4.5,
                      fill: 'var(--color-v0)',
                      stroke: dimmed ? 'var(--color-v5)' : spec.ink,
                      strokeWidth: 1.6,
                    }}
                    isAnimationActive={false}
                    style={{ transition: 'stroke 200ms ease-out' }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>

          {/*
            The reveal.

            Recharts animates a line by driving strokeDasharray, which fights
            every dash pattern used to keep five graphite lines apart — the
            dashed dimensions simply never arrive. So the lines render at once
            and a sheet of paper slides off them instead, left to right. It also
            reads better: one sheet being drawn back, rather than five pencils
            racing. The overlay is positioned, so it cannot disturb the width
            ResponsiveContainer measures.
          */}
          {!reduce ? (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-v0"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 1.05, ease: [0.65, 0, 0.35, 1] }}
              style={{ transformOrigin: 'right center' }}
            />
          ) : null}

          {/*
            The flag pins once the paper has come off. Its timing is a delay on
            a constant target rather than a timer flipping React state, so it
            cannot be left invisible by a tab that was throttled while the
            timeout was pending.
          */}
          <AnimatePresence>
            {plateaus.length > 0 ? (
              <motion.div
                key="flag"
                initial={reduce ? false : { scale: 1.3, y: -4 }}
                animate={{ scale: 1, y: 0 }}
                transition={{
                  duration: reduce ? 0 : 0.36,
                  delay: reduce ? 0 : 1.25,
                  ease: [0.2, 0.9, 0.25, 1.08],
                }}
                className="pointer-events-none absolute right-4 top-3 max-w-[16rem]"
              >
                <span className="inline-flex items-center gap-2 border border-blue-ink bg-v0 px-2.5 py-1.5 text-2xs text-blue-deep">
                  <span className="inline-block h-2 w-2 bg-blue" aria-hidden="true" />
                  {plateaus.length === 1
                    ? `${RUBRIC[plateaus[0].dimension].longLabel} has stalled`
                    : `${plateaus.length} dimensions have stalled`}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
          </div>
        </div>
      </div>

      {!compact ? (
        <TrajectoryLegend
          focus={focus}
          onFocus={setFocus}
          plateauDimensions={plateaus.map((p) => p.dimension)}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ValueAxis({ height }: { height: number }) {
  const steps = Array.from({ length: SCORE_MAX }, (_, i) => i + 1)
  return (
    <div
      className="relative flex shrink-0 flex-col-reverse pb-[26px] pt-[14px]"
      style={{ width: AXIS_W, height }}
      aria-hidden="true"
    >
      {steps.map((s) => (
        <div key={s} className="relative flex flex-1 items-center gap-1.5">
          <span className="numeral w-4 text-right text-2xs text-v5">{s}</span>
          <span
            className="h-full w-3 border-l border-v1"
            style={{ backgroundColor: valueForStep(s) }}
          />
        </div>
      ))}
    </div>
  )
}

interface DotProps {
  cx?: number
  cy?: number
  index?: number
  payload?: Row
  dimension: Dimension
  dimmed: boolean
  ink: string
}

/**
 * A point is either inked or it is a guideline. Solid graphite means the
 * instructor confirmed it; an open blue circle means the model proposed it and
 * it is still waiting for a human.
 */
function WorkDot({ cx, cy, payload, dimension, dimmed, ink }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null
  const confirmed = payload.confirmed?.[dimension] === true
  if (dimmed) {
    return <circle cx={cx} cy={cy} r={1.6} fill="var(--color-v4)" />
  }
  return confirmed ? (
    <circle cx={cx} cy={cy} r={3} fill={ink} />
  ) : (
    <circle
      cx={cx}
      cy={cy}
      r={3.4}
      fill="var(--color-v0)"
      stroke="var(--color-blue-ink)"
      strokeWidth={1.4}
      strokeDasharray="2 1.6"
    />
  )
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: Row }>
  focus: Dimension | null
}

/** Hovering a point brings up the actual work. That is the whole point. */
function WorkTooltip({ active, payload, focus }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="w-64 border border-v9 bg-v0 p-3">
      <div className="flex gap-3">
        {row.thumb ? (
          <img
            src={row.thumb}
            alt=""
            className="h-16 w-16 shrink-0 border border-v3 object-cover"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 border border-dashed border-v4" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-v9">{row.label}</p>
          <p className="mt-0.5 text-2xs text-v5">
            {Object.values(row.confirmed).filter(Boolean).length} of 5 confirmed
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {DIMENSION_LIST.map((spec) => {
          const v = row.values[spec.id]
          if (v === undefined) return null
          const isConfirmed = row.confirmed[spec.id] === true
          return (
            <div
              key={spec.id}
              className={cn(
                'flex items-center justify-between gap-3 text-2xs',
                focus && focus !== spec.id && 'opacity-45',
              )}
            >
              <span className="flex items-center gap-1.5 text-v6">
                <span
                  className="inline-block h-[2px] w-3.5"
                  style={{ backgroundColor: spec.ink }}
                />
                {spec.label}
              </span>
              <span
                className={cn(
                  'numeral px-1',
                  isConfirmed
                    ? 'text-v9'
                    : 'border border-dashed border-blue-ink text-blue-deep',
                )}
              >
                {Math.round(v)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The legend doubles as the focus control. Clicking a dimension pushes the
 * other four back to hairlines so a single line can be read against the grid.
 */
export function TrajectoryLegend({
  focus,
  onFocus,
  plateauDimensions = [],
}: {
  focus: Dimension | null
  onFocus: (d: Dimension | null) => void
  plateauDimensions?: Dimension[]
}) {
  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1"
      role="group"
      aria-label="Show one dimension at a time"
    >
      {DIMENSION_LIST.map((spec) => {
        const active = focus === spec.id
        const flagged = plateauDimensions.includes(spec.id)
        return (
          <button
            key={spec.id}
            type="button"
            aria-pressed={active}
            onClick={() => onFocus(active ? null : spec.id)}
            className={cn(
              'group inline-flex items-center gap-2 rounded-[2px] border px-2.5 py-1.5 text-xs transition-colors',
              active
                ? 'border-v9 bg-v9 text-v0'
                : 'border-transparent text-v6 hover:border-v3 hover:bg-v0 hover:text-v9',
            )}
          >
            <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                stroke={active ? 'var(--color-v0)' : spec.ink}
                strokeWidth="2"
                strokeDasharray={spec.dash}
              />
            </svg>
            <span>{spec.label}</span>
            {flagged ? (
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5',
                  active ? 'bg-blue' : 'bg-blue-ink',
                )}
                aria-label="flagged as stalled"
              />
            ) : null}
          </button>
        )
      })}
      {focus ? (
        <button
          type="button"
          onClick={() => onFocus(null)}
          className="ml-1 rounded-[2px] px-2 py-1.5 text-xs text-v5 underline underline-offset-2 hover:text-v9"
        >
          Show all five
        </button>
      ) : null}
    </div>
  )
}
