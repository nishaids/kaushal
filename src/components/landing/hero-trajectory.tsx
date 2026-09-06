'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { DIMENSION_LIST } from '@/lib/rubric'
import { valueForStep } from '@/components/ui/value-scale'
import { cn } from '@/lib/utils/cn'

/**
 * The landing hero.
 *
 * Not an illustration of the product — the product doing its job, before a word
 * of explanation. Six works over fourteen weeks: four dimensions climbing, and
 * value range dead flat from week seven.
 *
 * The whole chart is drawn statically and a sheet of paper is pulled off it,
 * left to right. Then the flag pins. That is the entire sequence, and it runs
 * on two CSS transforms with fixed delays — no timers, no state machine, no SVG
 * geometry animation.
 *
 * All three of those were tried. pathLength on the lines silently overwrites
 * strokeDasharray and every line comes out solid, which destroys the only thing
 * separating five graphite lines. Animating a rect's width inside a clipPath
 * does not repaint reliably, and the band vanished. Sequencing with setTimeout
 * means the most important image on the page is invisible until a timer fires,
 * which is a bet this page should not be making. A transform with a delay just
 * works.
 *
 * One orchestrated moment. It runs once and then rests.
 */

const WEEKS = [0, 2, 4.5, 7, 9.5, 12]

const SERIES: Record<string, number[]> = {
  proportion: [4.0, 5.0, 6.0, 6.6, 7.4, 8.0],
  line_control: [3.4, 4.4, 5.4, 6.0, 6.9, 7.5],
  value_range: [3.0, 4.1, 5.0, 5.2, 5.1, 5.2],
  edge_quality: [3.0, 3.6, 4.6, 5.1, 6.0, 6.6],
  composition: [4.4, 5.0, 5.6, 6.4, 7.0, 7.5],
}

const W = 760
const H = 340
const PAD = { top: 26, right: 30, bottom: 44, left: 58 }

const x = (week: number) => PAD.left + (week / 12) * (W - PAD.left - PAD.right)
const y = (score: number) =>
  PAD.top + ((10 - score) / 9) * (H - PAD.top - PAD.bottom)

/** Catmull-Rom through the points, converted to cubic béziers. */
function curve(points: Array<[number, number]>): string {
  if (points.length < 2) return ''
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

const PATHS = DIMENSION_LIST.map((spec) => ({
  spec,
  d: curve(WEEKS.map((w, i) => [x(w), y(SERIES[spec.id][i])] as [number, number])),
  points: WEEKS.map((w, i) => [x(w), y(SERIES[spec.id][i])] as [number, number]),
}))

const PLATEAU_FROM = x(7)
const PLATEAU_TO = x(12)
const STEPS = Array.from({ length: 10 }, (_, i) => i + 1)

export function HeroTrajectory({ className }: { className?: string }) {
  const reduce = useReducedMotion()

  return (
    <figure className={cn('relative w-full', className)}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="One student's record over fourteen weeks. Proportion, line control, edge quality and composition all rise. Value range stops moving after week seven and is flagged."
        >
          {/* the sheet */}
          <rect
            x={PAD.left}
            y={PAD.top - 6}
            width={W - PAD.left - PAD.right}
            height={H - PAD.top - PAD.bottom + 12}
            fill="var(--color-v0)"
            stroke="var(--color-v3)"
          />

          {/* the plateau band — the only accent on this page */}
          <rect
            x={PLATEAU_FROM}
            y={PAD.top - 6}
            width={PLATEAU_TO - PLATEAU_FROM}
            height={H - PAD.top - PAD.bottom + 12}
            fill="var(--color-blue-wash)"
          />
          <line
            x1={PLATEAU_FROM}
            x2={PLATEAU_FROM}
            y1={PAD.top - 6}
            y2={H - PAD.bottom + 6}
            stroke="var(--color-blue-ink)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />

          {/* a rule at each whole score */}
          {STEPS.map((s) => (
            <line
              key={s}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(s)}
              y2={y(s)}
              stroke="var(--color-v3)"
              strokeWidth={s === 1 ? 1 : 0.6}
              opacity={0.8}
            />
          ))}

          {/* the value scale, printed down the left edge */}
          {STEPS.map((s) => (
            <rect
              key={s}
              x={PAD.left - 22}
              y={y(s) - (H - PAD.top - PAD.bottom) / 18}
              width={14}
              height={(H - PAD.top - PAD.bottom) / 9}
              fill={valueForStep(s)}
            />
          ))}
          <text
            x={PAD.left - 30}
            y={y(10) + 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--color-v5)"
            className="numeral"
          >
            10
          </text>
          <text
            x={PAD.left - 30}
            y={y(1) + 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--color-v5)"
            className="numeral"
          >
            1
          </text>

          {/* the five lines, in five pencil grades */}
          {PATHS.map(({ spec, d, points }) => (
            <g key={spec.id}>
              <path
                d={d}
                fill="none"
                stroke={spec.ink}
                strokeWidth={spec.id === 'value_range' ? 2.4 : 1.7}
                strokeDasharray={spec.dash}
              />
              {points.map(([px, py], pi) => (
                <circle
                  key={pi}
                  cx={px}
                  cy={py}
                  r={spec.id === 'value_range' ? 3.6 : 2.6}
                  fill={spec.ink}
                />
              ))}
            </g>
          ))}

          {/* week markers */}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={H - PAD.bottom + 6}
            y2={H - PAD.bottom + 6}
            stroke="var(--color-v5)"
          />
          {[0, 4.5, 9.5, 12].map((w) => (
            <text
              key={w}
              x={x(w)}
              y={H - PAD.bottom + 24}
              textAnchor="middle"
              fontSize="10.5"
              fill="var(--color-v6)"
              className="numeral"
            >
              week {w === 0 ? 1 : Math.round(w)}
            </text>
          ))}
        </svg>

        {/*
          The flag. It is drawn under the paper and revealed by the same wipe,
          so it never depends on an opacity animation completing — it pins with
          a scale once it is already on screen.
        */}
        <motion.div
            initial={reduce ? false : { scale: 1.2, y: -4 }}
            animate={{ scale: 1, y: 0 }}
            transition={{
              duration: reduce ? 0 : 0.38,
              delay: reduce ? 0 : 1.5,
              ease: [0.2, 0.9, 0.25, 1.08],
            }}
            className="pointer-events-none absolute"
            style={{
              left: `${((PLATEAU_FROM + 6) / W) * 100}%`,
              top: `${((y(5.2) - 56) / H) * 100}%`,
              transformOrigin: 'left bottom',
            }}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap border border-blue-ink bg-v0 px-2 py-1 text-[11px] leading-none text-blue-deep">
              <span className="inline-block h-2 w-2 bg-blue" aria-hidden="true" />
              Value range — flat since week 7
            </span>
          </motion.div>
        {/* The paper, pulled off to the right. */}
        {!reduce ? (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-v1"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: 1.15, delay: 0.26, ease: [0.65, 0, 0.35, 1] }}
            style={{ transformOrigin: 'right center' }}
          />
        ) : null}

      </div>

      <figcaption className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs text-v6">
        {DIMENSION_LIST.map((spec) => (
          <span key={spec.id} className="inline-flex items-center gap-1.5">
            <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="16"
                y2="3"
                stroke={spec.ink}
                strokeWidth="2"
                strokeDasharray={spec.dash}
              />
            </svg>
            {spec.label}
          </span>
        ))}
        <span className="ml-auto text-v5">
          One student, six works, fourteen weeks — the record you can open in the
          live demo.
        </span>
      </figcaption>
    </figure>
  )
}
