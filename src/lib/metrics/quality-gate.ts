import type { ImageMetrics } from '../types'

/**
 * The media quality gate.
 *
 * KAUSHAL already measured everything needed to know whether a photograph is
 * worth assessing — and then assessed it anyway. That is the single most
 * dishonest thing the product did: a blurred, glared, badly-cropped phone photo
 * produced a confident-looking score with no indication that the evidence
 * underneath it was rubbish.
 *
 * This runs before assessment, in the browser, on the metrics the compression
 * step already computes. Nothing extra is decoded and nothing extra is uploaded.
 *
 * The thresholds below are deliberately conservative. A false "retake this" is
 * a small annoyance; a false "this is fine" silently corrupts a student's
 * trajectory for months.
 */

export type QualityVerdict = 'good' | 'usable' | 'retake'

export type QualityIssueCode =
  | 'blurred'
  | 'low_resolution'
  | 'glare'
  | 'underexposed'
  | 'low_contrast'
  | 'crowded_frame'
  | 'mostly_empty'
  | 'off_centre'

export interface QualityIssue {
  code: QualityIssueCode
  /** How much this issue alone should stop the work being assessed. */
  severity: 'blocking' | 'warning'
  /** What is wrong, in the instructor's language. */
  message: string
  /** What to physically do about it. */
  fix: string
}

export interface QualityReport {
  verdict: QualityVerdict
  /** 0..1. Not shown as a percentage — used to order issues and gate the model. */
  score: number
  issues: QualityIssue[]
  /** One line summarising the verdict, safe to render as-is. */
  summary: string
  /**
   * Whether this media should be sent for a proposal at all. False means the
   * work is still saved and still scoreable by hand — it just does not get a
   * machine opinion built on evidence we already know is poor.
   */
  assessable: boolean
}

/* ------------------------------------------------------------------ *
 * Thresholds. Each one is a measurement, not a vibe, and each is
 * paired with the physical action that fixes it.
 * ------------------------------------------------------------------ */

/** Below this mean gradient the image has no crisp edges anywhere. */
const BLUR_EDGE_DENSITY = 0.012
const BLUR_EDGE_DENSITY_WARN = 0.022

/** Long edge, in pixels, of the stored image. */
const MIN_LONG_EDGE = 640
const WARN_LONG_EDGE = 900

/** Share of the frame at or near pure white — a specular hotspot. */
const GLARE_SHARE = 0.12
const GLARE_WARN_SHARE = 0.06

/** Almost nothing above mid-grey: shot in the dark or badly underexposed. */
const DARK_LIGHTEST = 0.45

/** The whole image sits in one narrow tonal band. */
const FLAT_CONTRAST_SD = 0.045

/** Share of gradient energy in the outer frame band. */
const CROWDED_BORDER = 0.72

/** Share of the sheet with no marks at all. */
const MOSTLY_EMPTY = 0.93

/** Distance of the ink centroid from the middle of the frame. */
const OFF_CENTRE = 0.28

/**
 * Top of the luminance histogram. The metrics module returns 16 normalised
 * buckets, so the last bucket is everything above ~94% brightness.
 */
function brightestShare(m: ImageMetrics): number {
  const h = m.histogram
  if (!Array.isArray(h) || h.length === 0) return 0
  return h[h.length - 1] ?? 0
}

export function assessQuality(
  metrics: ImageMetrics | null | undefined,
): QualityReport {
  if (!metrics) {
    return {
      verdict: 'usable',
      score: 0.5,
      issues: [],
      summary: 'This file was not measured, so its quality is unknown.',
      assessable: true,
    }
  }

  const issues: QualityIssue[] = []
  const longEdge = Math.max(metrics.width || 0, metrics.height || 0)
  const glare = brightestShare(metrics)

  if (metrics.edgeDensity < BLUR_EDGE_DENSITY) {
    issues.push({
      code: 'blurred',
      severity: 'blocking',
      message: 'Nothing in this photo has a crisp edge.',
      fix: 'Hold the phone still, tap the work to focus, and take it again.',
    })
  } else if (metrics.edgeDensity < BLUR_EDGE_DENSITY_WARN) {
    issues.push({
      code: 'blurred',
      severity: 'warning',
      message: 'The photo is soft — detail may be lost.',
      fix: 'Tap the work to focus before the shot.',
    })
  }

  if (longEdge > 0 && longEdge < MIN_LONG_EDGE) {
    issues.push({
      code: 'low_resolution',
      severity: 'blocking',
      message: `This image is only ${longEdge}px on its longest side.`,
      fix: 'Send the original photo rather than a screenshot or a forwarded copy.',
    })
  } else if (longEdge > 0 && longEdge < WARN_LONG_EDGE) {
    issues.push({
      code: 'low_resolution',
      severity: 'warning',
      message: 'This image is smaller than usual.',
      fix: 'Move closer so the work fills more of the frame.',
    })
  }

  if (glare > GLARE_SHARE) {
    issues.push({
      code: 'glare',
      severity: 'blocking',
      message: 'A large part of the frame is blown out to white.',
      fix: 'Turn off the flash and move out of direct light or reflection.',
    })
  } else if (glare > GLARE_WARN_SHARE) {
    issues.push({
      code: 'glare',
      severity: 'warning',
      message: 'There is a bright hotspot on the work.',
      fix: 'Angle the work away from the lamp or window.',
    })
  }

  if (metrics.lightest < DARK_LIGHTEST) {
    issues.push({
      code: 'underexposed',
      severity: 'blocking',
      message: 'The whole photo is dark — nothing reaches a clean light.',
      fix: 'Shoot near a window in daylight rather than under a ceiling lamp.',
    })
  }

  if (metrics.contrastSd < FLAT_CONTRAST_SD && metrics.emptyShare < MOSTLY_EMPTY) {
    issues.push({
      code: 'low_contrast',
      severity: 'warning',
      message: 'The image sits in one narrow tonal band.',
      fix: 'Even, indirect light on a flat surface will separate the tones.',
    })
  }

  if (metrics.borderEnergy > CROWDED_BORDER) {
    issues.push({
      code: 'crowded_frame',
      severity: 'warning',
      message: 'The work runs off the edges of the frame.',
      fix: 'Step back so all four corners of the work are inside the photo.',
    })
  }

  if (metrics.emptyShare > MOSTLY_EMPTY) {
    issues.push({
      code: 'mostly_empty',
      severity: 'warning',
      message: 'Almost the whole frame is blank.',
      fix: 'Fill the frame with the work, or check the right photo was chosen.',
    })
  }

  const offCentre = Math.hypot(
    (metrics.massCenter?.x ?? 0.5) - 0.5,
    (metrics.massCenter?.y ?? 0.5) - 0.5,
  )
  if (offCentre > OFF_CENTRE) {
    issues.push({
      code: 'off_centre',
      severity: 'warning',
      message: 'The work sits well off to one side of the frame.',
      fix: 'Centre the work and shoot square-on rather than at an angle.',
    })
  }

  const blocking = issues.filter((i) => i.severity === 'blocking')
  const warnings = issues.filter((i) => i.severity === 'warning')

  const score = Math.max(
    0,
    Math.min(1, 1 - blocking.length * 0.4 - warnings.length * 0.12),
  )

  const verdict: QualityVerdict =
    blocking.length > 0 ? 'retake' : warnings.length > 1 ? 'usable' : 'good'

  return {
    verdict,
    score: Math.round(score * 100) / 100,
    issues: [...blocking, ...warnings],
    summary: summarise(verdict, blocking, warnings),
    // A blocked photo is still stored and still scoreable by the instructor.
    // What it does not get is a machine opinion resting on evidence we have
    // already measured as unreliable.
    assessable: blocking.length === 0,
  }
}

function summarise(
  verdict: QualityVerdict,
  blocking: QualityIssue[],
  warnings: QualityIssue[],
): string {
  if (verdict === 'retake') {
    return blocking.length === 1
      ? `${blocking[0].message} ${blocking[0].fix}`
      : 'This photo has a few problems that would make any score unreliable.'
  }
  if (verdict === 'usable') {
    return `Usable, with ${warnings.length} things worth fixing next time.`
  }
  return warnings.length === 1
    ? `Good photo. ${warnings[0].message}`
    : 'Good photo — sharp, evenly lit and fully in frame.'
}

/** Short label for the capture UI. */
export function verdictLabel(v: QualityVerdict): string {
  return v === 'good' ? 'Good photo' : v === 'usable' ? 'Usable' : 'Retake recommended'
}
