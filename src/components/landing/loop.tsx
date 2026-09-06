'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ScoreMark } from '@/components/ui/score-mark'
import { StudySwatch } from './study-swatch'

/**
 * The loop, in three beats.
 *
 * The motion here is not decoration and it is not a fade-up: a line is drawn
 * from beat to beat and then curves back to the start, because the argument of
 * this section is that the thing is a loop. If the line did not close, the
 * section would be making a weaker claim than the product does.
 */

const BEATS = [
  {
    n: 1,
    title: 'Photograph the work',
    body:
      'At the end of the class, one photo per student. Under ten seconds each. It compresses on the phone before it uploads.',
  },
  {
    n: 2,
    title: 'Confirm five numbers',
    body:
      'KAUSHAL proposes a score and a reason for each of the five dimensions. You confirm, or you change one and confirm. Nothing is recorded until you do.',
  },
  {
    n: 3,
    title: 'Watch the line move',
    body:
      'Every confirmed score lands on that student’s trajectory. When one dimension stops moving while the rest climb, KAUSHAL says so and writes the exercise that targets it.',
  },
]

export function Loop() {
  const ref = useRef<HTMLDivElement>(null)
  const [drawn, setDrawn] = useState(false)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (reduce) {
      setDrawn(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setDrawn(true)
          io.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduce])

  return (
    <div ref={ref} className="relative">
      {/* the connector, drawn once, closing back on itself */}
      <svg
        viewBox="0 0 1000 60"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 -bottom-8 hidden h-16 w-full lg:block"
        aria-hidden="true"
      >
        <motion.path
          d="M 166 6 L 500 6 M 500 6 L 834 6 M 834 6 C 960 6 985 52 860 52 L 140 52 C 20 52 34 12 150 12"
          fill="none"
          stroke="var(--color-blue-ink)"
          strokeWidth="1.2"
          strokeDasharray="5 4"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: drawn ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 1.5, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>

      <ol className="grid gap-px border border-v3 bg-v3 lg:grid-cols-3">
        {BEATS.map((b) => (
          <li key={b.n} className="flex flex-col bg-v1 p-6 sm:p-8">
            <span className="numeral text-2xs text-v5">Beat {b.n}</span>
            <h3 className="mt-3 text-lg text-v9">{b.title}</h3>
            <p className="font-language mt-2.5 max-w-[42ch] flex-1 text-base text-v6">
              {b.body}
            </p>
            <div className="mt-6">
              <BeatFigure n={b.n} drawn={drawn} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function BeatFigure({ n, drawn }: { n: number; drawn: boolean }) {
  const reduce = useReducedMotion()

  if (n === 1) {
    return (
      <div className="flex items-end gap-3">
        <StudySwatch seed={12} value={6} size={84} />
        <span className="pb-1 text-2xs text-v5">
          under 500 KB
          <br />
          before it leaves the phone
        </span>
      </div>
    )
  }

  if (n === 2) {
    return (
      <div className="flex items-center gap-2.5">
        <ScoreMark value={7} state="confirmed" size="md" />
        <ScoreMark value={6} state="confirmed" size="md" />
        <ScoreMark value={5} state="proposed" confidence={0.42} size="md" />
        <ScoreMark value={6} state="confirmed" size="md" />
        <ScoreMark value={7} state="confirmed" size="md" />
        <span className="ml-1 max-w-[10rem] text-2xs text-v5">
          four inked, one still a guideline
        </span>
      </div>
    )
  }

  return (
    <svg viewBox="0 0 200 72" className="w-full max-w-[15rem]" aria-hidden="true">
      <rect
        x="118"
        y="4"
        width="78"
        height="64"
        fill="var(--color-blue-wash)"
        opacity="0.9"
      />
      <motion.path
        d="M 6 60 C 40 56, 60 40, 90 30 C 116 22, 150 16, 194 12"
        fill="none"
        stroke="var(--color-v9)"
        strokeWidth="1.8"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: drawn ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.3 }}
      />
      <motion.path
        d="M 6 52 C 40 46, 70 40, 118 38 L 194 38"
        fill="none"
        stroke="var(--color-dim-3)"
        strokeWidth="2.2"
        strokeDasharray="1 3"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: drawn ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.45 }}
      />
      <line
        x1="118"
        y1="4"
        x2="118"
        y2="68"
        stroke="var(--color-blue-ink)"
        strokeDasharray="3 3"
      />
    </svg>
  )
}
