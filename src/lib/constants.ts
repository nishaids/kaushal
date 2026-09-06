/**
 * Fixed identifiers for the seeded demo academy.
 *
 * These are hard-coded on purpose and identical in the local driver, in
 * supabase/seed.sql, and in the /demo reset. A demo that resets to a known
 * state is a demo that cannot break on stage.
 */

export const DEMO = {
  academyId: '00000000-0000-4000-a000-000000000001',
  instructorId: '00000000-0000-4000-a000-000000000002',
  ownerId: '00000000-0000-4000-a000-000000000002',
  email: 'demo@kaushal.app',
  instructorName: 'K. Ramesh',
  academyName: 'Krishna Art Academy',
  /** The student the three-minute demo follows. */
  featuredStudentId: '00000000-0000-4000-a000-000000000010',
  featuredStudentName: 'Aarav Krishnan',
} as const

/** Cohort size the product is designed against. Never demo with three rows. */
export const DEMO_COHORT_SIZE = 62

export const APP_NAME = 'KAUSHAL'
export const APP_TAGLINE = 'The measurement layer for learning that cannot be typed.'

/** Session cookie the local driver uses when Supabase auth is not configured. */
export const LOCAL_SESSION_COOKIE = 'kaushal_session'

/** Client-side compression target. Free-tier storage is finite. */
export const IMAGE_TARGET_BYTES = 480_000
export const IMAGE_MAX_EDGE = 1600
export const THUMB_MAX_EDGE = 224

/**
 * Plateau detection parameters. Every one of these is surfaced in the UI
 * copy, because a threshold a judge cannot see is a threshold they cannot
 * trust.
 */
export const PLATEAU = {
  /** Works in the rolling window. */
  window: 4,
  /** Below this many points/week a dimension counts as flat. */
  flatSlope: 0.06,
  /** Peers must be climbing at least this fast for the flag to mean anything. */
  peerSlope: 0.12,
  /** Minimum weeks of flatness before we say anything at all. */
  minWeeks: 3,
  /** Works needed before detection runs at all. */
  minWorks: 4,
} as const

/** Days without a submitted work before a student is flagged dormant. */
export const DORMANT_DAYS = 21

/** How many past works an instructor scores at onboarding. */
export const CALIBRATION_TARGET = 10

/** Fewest anchors KAUSHAL will start proposing against. */
export const CALIBRATION_MINIMUM = 3

/**
 * Calibration works belong to the academy rather than to a student, so they
 * hang off one hidden roster entry under this name. It is filtered out of every
 * cohort, roster and trajectory in the product.
 */
export const CALIBRATION_HOLDER_NAME = 'Calibration set'
