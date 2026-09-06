import type { Alert, ScoredWork, Student } from '../types'
import type { Dimension } from '../rubric'
import { detectSignals, type LearningSignal } from './signals'
import { DORMANT_DAYS } from '../constants'
import { daysBetween } from '../utils/format'

/**
 * "What needs my attention?"
 *
 * The cohort table answers "how is everyone doing". It does not answer the
 * question a teacher actually opens the product with on a Monday morning, which
 * is "where do I start". A sorted table makes the teacher do that reduction
 * themselves, sixty rows at a time.
 *
 * This turns the whole academy into a small number of recommended actions, each
 * one naming the students it concerns and the reason it was raised. Nothing here
 * invents a priority: every item traces back to a signal, a missing submission,
 * or work waiting on a confirmation.
 */

export type QueueBand = 'urgent' | 'attention' | 'on_track' | 'thriving'

export interface StudentAttention {
  student: Student
  band: QueueBand
  /** Highest-ranked signal for this student, if any. */
  lead: LearningSignal | null
  signals: LearningSignal[]
  unconfirmed: number
  daysSinceLastWork: number | null
  worksCount: number
}

export interface AttentionAction {
  id: string
  /** The instruction, phrased as something to do. */
  title: string
  /** Why it is being suggested, with the real counts in it. */
  reason: string
  students: Student[]
  /** Where the action is carried out. */
  href: string
  priority: number
  kind: 'review' | 'intervene' | 'reconnect' | 'challenge' | 'celebrate'
}

export interface AttentionBoard {
  actions: AttentionAction[]
  bands: Record<QueueBand, StudentAttention[]>
  counts: {
    students: number
    unconfirmedWorks: number
    urgent: number
    attention: number
    thriving: number
    dormant: number
    noWorkYet: number
  }
}

const BAND_ORDER: QueueBand[] = ['urgent', 'attention', 'on_track', 'thriving']

export const BAND_LABELS: Record<QueueBand, string> = {
  urgent: 'Urgent',
  attention: 'Needs attention',
  on_track: 'On track',
  thriving: 'Thriving',
}

export const BAND_MEANING: Record<QueueBand, string> = {
  urgent: 'A strong signal that something has gone wrong, or a long silence.',
  attention: 'Something worth looking at this week.',
  on_track: 'Working steadily. Nothing needs a decision.',
  thriving: 'Climbing fast, or ready for harder work.',
}

function bandFor(a: {
  signals: LearningSignal[]
  daysSinceLastWork: number | null
  worksCount: number
}): QueueBand {
  const concerns = a.signals.filter((s) => s.tone === 'concern')
  const high = concerns.filter((s) => s.severity === 'high')
  const dormant =
    a.daysSinceLastWork !== null && a.daysSinceLastWork > DORMANT_DAYS * 2

  if (high.length > 0 || dormant) return 'urgent'
  if (concerns.length > 0) return 'attention'
  if (
    a.daysSinceLastWork !== null &&
    a.daysSinceLastWork > DORMANT_DAYS &&
    a.worksCount > 0
  ) {
    return 'attention'
  }

  const positives = a.signals.filter((s) => s.tone === 'positive')
  const readyForMore = a.signals.some((s) => s.kind === 'under_challenged')
  if (positives.length > 0 || readyForMore) return 'thriving'

  return 'on_track'
}

export function buildAttentionBoard(input: {
  students: Student[]
  worksByStudent: Map<string, ScoredWork[]>
  alertsByStudent?: Map<string, Alert[]>
  /** Resolves a dimension key to the academy's label for it. */
  label?: (d: Dimension) => string
  now?: Date
}): AttentionBoard {
  const now = input.now ?? new Date()
  const label = input.label

  const perStudent: StudentAttention[] = input.students.map((student) => {
    const works = input.worksByStudent.get(student.id) ?? []
    const signals = detectSignals(works, { now, label })

    const last = works.length > 0 ? works[works.length - 1] : null
    const daysSinceLastWork = last ? daysBetween(last.captured_at, now) : null

    const unconfirmed = works.reduce(
      (total, w) => total + w.scores.filter((s) => s.confirmed_score === null).length,
      0,
    )

    const entry: StudentAttention = {
      student,
      signals,
      lead: signals[0] ?? null,
      unconfirmed,
      daysSinceLastWork,
      worksCount: works.length,
      band: 'on_track',
    }
    entry.band = bandFor(entry)
    return entry
  })

  const bands: Record<QueueBand, StudentAttention[]> = {
    urgent: [],
    attention: [],
    on_track: [],
    thriving: [],
  }
  for (const s of perStudent) bands[s.band].push(s)
  for (const band of BAND_ORDER) {
    bands[band].sort((a, b) => a.student.name.localeCompare(b.student.name))
  }

  /* ---- the actions ---- */

  const actions: AttentionAction[] = []

  const waiting = perStudent.filter((s) => s.unconfirmed > 0)
  const unconfirmedWorks = waiting.reduce((t, s) => t + s.unconfirmed, 0)
  if (waiting.length > 0) {
    actions.push({
      id: 'confirm',
      kind: 'review',
      title: `Confirm ${unconfirmedWorks} scores waiting on you`,
      reason: `${waiting.length === 1 ? 'One student has' : `${waiting.length} students have`} work recorded that nobody has confirmed. None of it counts towards a trajectory until you do.`,
      students: waiting.map((s) => s.student),
      href: '/studio/capture',
      priority: 90 + Math.min(9, waiting.length),
    })
  }

  const stalled = perStudent.filter((s) =>
    s.signals.some((x) => x.kind === 'plateau' || x.kind === 'decline'),
  )
  if (stalled.length > 0) {
    actions.push({
      id: 'intervene',
      kind: 'intervene',
      title: `Set an exercise for ${stalled.length === 1 ? stalled[0].student.name.split(' ')[0] : `${stalled.length} students`}`,
      reason: stalled
        .slice(0, 2)
        .map((s) => `${s.student.name.split(' ')[0]}: ${s.lead?.message ?? ''}`)
        .join(' '),
      students: stalled.map((s) => s.student),
      href: '/studio/assignments',
      priority: 80,
    })
  }

  const quiet = perStudent.filter(
    (s) =>
      s.worksCount > 0 &&
      s.daysSinceLastWork !== null &&
      s.daysSinceLastWork > DORMANT_DAYS,
  )
  if (quiet.length > 0) {
    actions.push({
      id: 'reconnect',
      kind: 'reconnect',
      title: `Check in with ${quiet.length === 1 ? quiet[0].student.name.split(' ')[0] : `${quiet.length} students`}`,
      reason: `No work recorded for over ${DORMANT_DAYS} days. Engagement has dropped; the reason is worth asking about rather than guessing at.`,
      students: quiet.map((s) => s.student),
      href: '/studio?view=dormant',
      priority: 70,
    })
  }

  const ready = perStudent.filter((s) =>
    s.signals.some((x) => x.kind === 'under_challenged' || x.kind === 'rapid_growth'),
  )
  if (ready.length > 0) {
    actions.push({
      id: 'challenge',
      kind: 'challenge',
      title: `Raise the difficulty for ${ready.length === 1 ? ready[0].student.name.split(' ')[0] : `${ready.length} students`}`,
      reason:
        'Scoring consistently high on work that has not got harder. The next score only becomes informative once the task changes.',
      students: ready.map((s) => s.student),
      href: '/studio/assignments',
      priority: 45,
    })
  }

  const breakthroughs = perStudent.filter((s) =>
    s.signals.some((x) => x.kind === 'breakthrough'),
  )
  if (breakthroughs.length > 0) {
    actions.push({
      id: 'celebrate',
      kind: 'celebrate',
      title: `Tell ${breakthroughs.length === 1 ? breakthroughs[0].student.name.split(' ')[0] : `${breakthroughs.length} students`} what changed`,
      reason:
        'A clear step up after a flat run. Finding out what they did differently is worth more than the number, and saying so is what makes it repeatable.',
      students: breakthroughs.map((s) => s.student),
      href: '/studio/students',
      priority: 30,
    })
  }

  const noWorkYet = perStudent.filter((s) => s.worksCount === 0)
  if (noWorkYet.length > 0) {
    actions.push({
      id: 'first-work',
      kind: 'review',
      title: `Record a first work for ${noWorkYet.length === 1 ? noWorkYet[0].student.name.split(' ')[0] : `${noWorkYet.length} students`}`,
      reason:
        'Nothing has been recorded for them yet, so they have no trajectory and cannot appear in any of the checks above.',
      students: noWorkYet.map((s) => s.student),
      href: '/studio/capture',
      priority: 20,
    })
  }

  actions.sort((a, b) => b.priority - a.priority)

  return {
    actions,
    bands,
    counts: {
      students: perStudent.length,
      unconfirmedWorks,
      urgent: bands.urgent.length,
      attention: bands.attention.length,
      thriving: bands.thriving.length,
      dormant: quiet.length,
      noWorkYet: noWorkYet.length,
    },
  }
}
