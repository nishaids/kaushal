'use server'

import { db } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import { deriveAlerts } from '@/lib/analytics/alerts'
import type { Alert } from '@/lib/types'

/**
 * Alerts are derived, not authored.
 *
 * Nothing here decides anything on its own: it runs deriveAlerts, the same pure
 * detector the cohort screen calls on read, and writes the result. Re-running it
 * is safe and produces no duplicates - an alert that no longer holds is resolved
 * rather than left to rot in the list.
 */

export async function refreshAlertsFor(
  academyId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<Alert[]> {
  const driver = await db()
  const student = await driver.getStudent(academyId, studentId)
  if (!student) return []

  const works = await driver.listScoredWorks(academyId, { studentId })
  return driver.syncAlerts(academyId, studentId, deriveAlerts(studentId, works, now))
}

/** Runs the detectors across the whole cohort and stores what they find. */
export async function refreshCohortAlerts(): Promise<{ flagged: number }> {
  const session = await requireSession()
  const driver = await db()
  const students = await driver.listStudents(session.academy.id, { status: 'active' })
  const now = new Date()

  let flagged = 0
  for (const s of students) {
    const alerts = await refreshAlertsFor(session.academy.id, s.id, now)
    if (alerts.some((a) => a.resolved_at === null)) flagged += 1
  }
  return { flagged }
}

export async function resolveAlertAction(alertId: string): Promise<{ ok: boolean }> {
  try {
    const session = await requireSession()
    const driver = await db()
    await driver.resolveAlert(session.academy.id, alertId, new Date().toISOString())
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
