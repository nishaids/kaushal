'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { SCORE_MAX, SCORE_MIN, clampScore } from '@/lib/rubric'
import { ScoreMark } from '@/components/ui/score-mark'
import { StudySwatch } from './study-swatch'

/**
 * The calibration idea, made touchable.
 *
 * Two academies looking at the same drawing will not give it the same number,
 * and neither of them is wrong — a foundation class and a portfolio class are
 * measuring against different standards. So KAUSHAL does not ship one rubric.
 * The instructor scores ten past works at onboarding, those become that
 * academy's anchors, and every future proposal is made against them.
 *
 * Move the slider. The proposal on the right moves with it. That is the whole
 * mechanism, and it is the part of this product that is hard to copy.
 */

const GENERIC_ANCHOR = 7
const GENERIC_PROPOSAL = 6

export function CalibrationDemo() {
  const [anchor, setAnchor] = useState(4)
  const reduce = useReducedMotion()

  // The real system injects the anchors as few-shot references and the model
  // shifts with them. This is that relationship, stated arithmetically so the
  // page is not making a claim it cannot show.
  const calibrated = clampScore(
    GENERIC_PROPOSAL + (anchor - GENERIC_ANCHOR) * 0.8,
  )
  const shifted = calibrated !== GENERIC_PROPOSAL

  return (
    <div className="grid gap-px border border-v3 bg-v3 sm:grid-cols-2">
      {/* left: the anchor the instructor sets */}
      <div className="bg-v0 p-6 sm:p-7">
        <h3 className="text-base text-v9">A work you scored at onboarding</h3>
        <p className="font-language mt-2 max-w-[40ch] text-base text-v6">
          Ten of these. You give each one the number your academy would give it.
        </p>

        <div className="mt-6 flex items-center gap-5">
          <StudySwatch seed={3} value={5} size={104} />
          <div>
            <ScoreMark value={anchor} state="confirmed" size="lg" />
            <p className="mt-2 text-2xs text-v5">line control</p>
          </div>
        </div>

        <label
          htmlFor="anchor-slider"
          className="mt-7 block text-xs font-medium text-v7"
        >
          Your academy calls this a{' '}
          <span className="numeral text-v9">{anchor}</span>
        </label>
        <input
          id="anchor-slider"
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={1}
          value={anchor}
          onChange={(e) => setAnchor(Number(e.target.value))}
          className="mt-3 w-full accent-[var(--color-v9)]"
          aria-describedby="anchor-help"
        />
        <p id="anchor-help" className="mt-2 text-2xs text-v5">
          A foundation class and a portfolio class will not put this in the same
          place. Both are right about their own students.
        </p>
      </div>

      {/* right: what the model then proposes */}
      <div className="bg-v0 p-6 sm:p-7">
        <h3 className="text-base text-v9">The next work it scores</h3>
        <p className="font-language mt-2 max-w-[40ch] text-base text-v6">
          A different drawing, a week later. Your anchors go into the prompt with
          it.
        </p>

        <div className="mt-6 flex items-center gap-5">
          <StudySwatch seed={8} value={6} size={104} />
          <div className="flex items-end gap-5">
            <div>
              <span className="numeral inline-grid h-14 w-14 place-items-center border border-dotted border-v4 text-2xl text-v5 line-through decoration-v5">
                {GENERIC_PROPOSAL}
              </span>
              <p className="mt-2 max-w-[9rem] text-2xs text-v5">
                what a generic rubric proposes
              </p>
            </div>
            <motion.div
              key={calibrated}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.2, 0.9, 0.25, 1.08] }}
            >
              <ScoreMark value={calibrated} state="proposed" size="lg" />
              <p className="mt-2 max-w-[9rem] text-2xs text-blue-deep">
                proposed against your standard
              </p>
            </motion.div>
          </div>
        </div>

        <p
          className="mt-7 min-h-[3.5rem] max-w-[42ch] text-xs text-v6"
          aria-live="polite"
        >
          {shifted ? (
            <>
              Because you place this work at{' '}
              <span className="numeral text-v9">{anchor}</span>, the proposal
              moved from <span className="numeral text-v9">{GENERIC_PROPOSAL}</span>{' '}
              to <span className="numeral text-v9">{calibrated}</span>. The rubric
              learned your standard, not a generic one.
            </>
          ) : (
            <>
              At <span className="numeral text-v9">{anchor}</span> your standard
              happens to match the generic one, so the proposal does not move.
              Drag the slider and it will.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
