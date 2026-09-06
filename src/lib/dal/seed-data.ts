/**
 * The seeded demo cohort.
 *
 * Everything here is generated deterministically from a single build date, so
 * the demo is always "the last fourteen months" whenever it is run, and always
 * the same cohort. The numbers are not decoration: the featured student's
 * value_range record is built so that detectPlateaus() finds a real, high
 * severity plateau from the data alone. There is no special case for the demo
 * anywhere in the analytics.
 */

import { DEMO, DEMO_COHORT_SIZE } from '../constants'
import { DIMENSIONS } from '../rubric'
import type { Dimension } from '../rubric'
import type {
  Academy,
  Assignment,
  AssignmentBrief,
  Calibration,
  ImageMetrics,
  Instructor,
  Report,
  ReportContent,
  ReportDimensionNote,
  Score,
  ScoreSource,
  Student,
  Work,
} from '../types'

/**
 * Bump this whenever the shape or the content of the seed changes. The local
 * driver compares it against the version stamped into .data/kaushal.json and
 * rebuilds silently when they differ.
 */
export const SEED_VERSION = 'kaushal-seed-3'

export interface SeedBundle {
  academy: Academy
  instructor: Instructor
  students: Student[]
  works: Work[]
  scores: Score[]
  calibrations: Calibration[]
  assignments: Assignment[]
  reports: Report[]
}

/* ------------------------------------------------------------------ *
 * Small deterministic utilities
 * ------------------------------------------------------------------ */

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** ISO timestamp `days` before the build date, shifted by `hours`. */
function at(now: Date, days: number, hours = 0): string {
  return new Date(now.getTime() - days * DAY_MS + hours * HOUR_MS).toISOString()
}

/** mulberry32. Same seed, same cohort, on every machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * UUID-shaped identifiers that stay identical across rebuilds, so a demo reset
 * returns to exactly the state a bookmarked URL was pointing at.
 */
function seedId(bucket: number, index: number): string {
  const hi = (bucket & 0xffff).toString(16).padStart(4, '0')
  const lo = (index >>> 0).toString(16).padStart(8, '0')
  return `${lo}-${hi}-4000-b000-${hi}${lo}`
}

const BUCKET = {
  student: 1,
  work: 2,
  score: 3,
  calibration: 4,
  assignment: 5,
  report: 6,
} as const

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

/**
 * Every score in KAUSHAL is a whole number from 1 to 10. The rubric has ten
 * rungs and no half rungs, the confirm action validates for an integer, and a
 * seeded 6.2 would render as a 6 on a score mark and as 6.2 on the chart - the
 * same score disagreeing with itself. So the seed rounds where the product does.
 */
function scoreInt(n: number): number {
  return Math.round(clamp(n, 1, 10))
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function initialsOf(name: string): string {
  const parts = name.split(' ').filter(Boolean)
  const first = parts[0]?.[0] ?? 'K'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

/* ------------------------------------------------------------------ *
 * The study card.
 *
 * There are no photographs in a seeded demo, so every work carries a
 * small drawn card instead: the student's initials, the date, and an
 * abstract value composition whose actual darkness tracks that work's
 * value_range score. A flat value_range looks flat on the wall.
 * ------------------------------------------------------------------ */

const RAMP = [
  '#f5f2eb',
  '#e9e4d9',
  '#ded8ca',
  '#c9c2b3',
  '#a89f90',
  '#8a8377',
  '#5c564c',
  '#3a352f',
  '#23201c',
  '#0e0c0b',
]

function toDataUrl(svg: string): string {
  const b64 =
    typeof btoa === 'function' ? btoa(svg) : Buffer.from(svg, 'binary').toString('base64')
  return `data:image/svg+xml;base64,${b64}`
}

/**
 * A graphite study card as an SVG data URL.
 *
 * There are no photographs in a seeded academy, so each work gets a small drawn
 * study instead. It is not a grey box pretending to be a drawing: the actual
 * values in it are driven by that work's scores, so a student whose value range
 * is stuck really does produce six studies that stay in the same tonal band
 * while their edges and composition improve around it. That matters, because
 * the parent report puts the first study beside the latest and asks a person to
 * see the difference.
 *
 * Four setups, chosen by the work's own index, so a filmstrip of six reads as
 * six different sessions rather than one drawing rendered six times. Under 3KB,
 * deterministic, and legible at 96px.
 */
function studyCard(input: {
  initials: string
  label: string
  values: Record<Dimension, number>
  variant: number
  rand: () => number
}): string {
  const { initials, label, values, rand } = input
  const setup = Math.abs(Math.round(input.variant)) % 4

  // Value range decides how far the study reaches into the ramp. A 3 sits in a
  // narrow band of greys; a 9 runs from paper white to a true dark.
  const reach = clamp(values.value_range, 1, 10)
  const darkIdx = Math.round(clamp(3 + reach * 0.66, 4, 9))
  const lightIdx = Math.round(clamp(4 - reach * 0.32, 0, 3))
  const dark = RAMP[darkIdx]
  const mid = RAMP[Math.max(3, darkIdx - 3)]
  const half = RAMP[Math.max(2, darkIdx - 5)]
  const light = RAMP[lightIdx]

  // Weak composition drifts off centre; a strong one sits where it should.
  const drift = (10 - clamp(values.composition, 1, 10)) * 2.4
  const ox = Math.round((rand() - 0.5) * drift * 2)
  const oy = Math.round((rand() - 0.5) * drift)

  // Line control decides how many hatch strokes are laid down and how straight
  // they run. A searching line is drawn twice and wanders.
  const control = clamp(values.line_control, 1, 10)
  const strokes = Math.round(3 + control * 0.7)
  const wobble = (10 - control) * 0.9

  // Edge quality decides whether anything is softened at all.
  const soft = clamp(values.edge_quality, 1, 10) >= 6

  const body: string[] = []

  // The ground line every setup sits on.
  body.push(line(18, 150 + oy, 270, 144 + oy, RAMP[4]))

  if (setup === 0) {
    // A bottle and a sphere, lit from the left.
    const cx = 108 + ox
    body.push(
      path(
        `M${cx - 26} ${150 + oy} L${cx - 26} ${74 + oy} Q${cx - 26} ${54 + oy} ${cx - 8} ${46 + oy} L${cx + 8} ${46 + oy} Q${cx + 26} ${54 + oy} ${cx + 26} ${74 + oy} L${cx + 26} ${150 + oy} Z`,
        mid,
      ),
      path(
        `M${cx + 2} ${150 + oy} L${cx + 2} ${48 + oy} Q${cx + 24} ${56 + oy} ${cx + 26} ${76 + oy} L${cx + 26} ${150 + oy} Z`,
        dark,
      ),
      circle(182 + ox, 124 + oy, 26, half),
      path(
        `M${182 + ox} ${98 + oy} a26 26 0 0 1 0 52 a18 26 0 0 0 0 -52`,
        dark,
        0.85,
      ),
      ellipse(196 + ox, 152 + oy, 38, 7, dark, soft ? 0.3 : 0.6),
    )
  } else if (setup === 1) {
    // Drapery: folds as bands running off the table edge.
    for (let i = 0; i < 5; i++) {
      const x = 52 + i * 34 + ox
      body.push(
        path(
          `M${x} ${52 + oy} Q${x + 14} ${100 + oy} ${x + 4} ${148 + oy} L${x + 26} ${148 + oy} Q${x + 34} ${100 + oy} ${x + 22} ${52 + oy} Z`,
          i % 2 === 0 ? mid : dark,
          soft && i % 2 === 1 ? 0.72 : 1,
        ),
      )
    }
    body.push(line(46, 52 + oy, 242, 52 + oy, RAMP[5]))
  } else if (setup === 2) {
    // A cube and a sphere: the proportion study.
    const px = 78 + ox
    const py = 70 + oy
    const w = Math.round(62 + (10 - clamp(values.proportion, 1, 10)) * 3)
    body.push(
      path(
        `M${px} ${py + 18} L${px + w} ${py} L${px + w * 2} ${py + 18} L${px + w} ${py + 36} Z`,
        light,
      ),
      path(
        `M${px} ${py + 18} L${px} ${py + 78} L${px + w} ${py + 96} L${px + w} ${py + 36} Z`,
        mid,
      ),
      path(
        `M${px + w} ${py + 36} L${px + w} ${py + 96} L${px + w * 2} ${py + 78} L${px + w * 2} ${py + 18} Z`,
        dark,
      ),
      circle(218 + ox, 128 + oy, 22, half),
    )
  } else {
    // A cast: an oval with the plane break down one side.
    const cx = 140 + ox
    const cy = 96 + oy
    body.push(
      ellipse(cx, cy, 46, 58, mid, 1),
      path(`M${cx} ${cy - 58} a46 58 0 0 1 0 116 a30 58 0 0 0 0 -116`, dark),
      ellipse(cx - 16, cy - 14, 14, 9, light, 0.8),
      stroked(`M${cx - 46} ${cy + 46} q46 22 92 0`, RAMP[5]),
    )
  }

  // The hatching. Density and straightness come from line control.
  const hatch: string[] = []
  for (let i = 0; i < strokes; i++) {
    const y = 62 + i * Math.round(90 / strokes) + oy
    const jitter = Math.round((rand() - 0.5) * wobble * 2)
    hatch.push(`M${34 + ox} ${y}L${104 + ox} ${y - 8 + jitter}`)
  }

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 288 216" width="288" height="216">`,
    rect(0, 0, 288, 216, RAMP[0]),
    `<rect x="6.5" y="6.5" width="275" height="203" fill="none" stroke="${RAMP[3]}" />`,
    ...body,
    `<path d="${hatch.join('')}" stroke="${dark}" stroke-width="1" fill="none" opacity="0.3" />`,
    `<text x="18" y="30" font-family="Georgia,serif" font-size="14" letter-spacing="3" fill="${RAMP[8]}">${initials}</text>`,
    `<text x="270" y="198" text-anchor="end" font-family="Georgia,serif" font-size="9" fill="${RAMP[5]}">${label}</text>`,
    `</svg>`,
  ]

  return parts.join('')
}

/* ------------------------------------------------------------------ *
 * SVG tag helpers.
 *
 * These exist so no template literal in this file ever ends with a quote
 * immediately followed by a self-closing slash. That exact sequence was being
 * mangled during bundling, which silently produced malformed SVG in the built
 * app while the same source rendered correctly under plain Node. Building each
 * tag in one place, with a space before the slash, removes the whole class of
 * problem and is easier to read besides.
 * ------------------------------------------------------------------ */

function rect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" />`
}

function circle(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`
}

function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  opacity = 1,
): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${opacity}" />`
}

function path(d: string, fill: string, opacity = 1): string {
  return `<path d="${d}" fill="${fill}" opacity="${opacity}" />`
}

function stroked(d: string, stroke: string): string {
  return `<path d="${d}" stroke="${stroke}" stroke-width="1" fill="none" />`
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
): string {
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${stroke}" stroke-width="1" fill="none" />`
}

/* ------------------------------------------------------------------ *
 * Deterministic pixel statistics that agree with the scores, so the
 * fallback scorer and the trajectory hover both have real data.
 * ------------------------------------------------------------------ */

function buildMetrics(values: Record<Dimension, number>, rand: () => number): ImageMetrics {
  const vr = values.value_range
  const line = values.line_control
  const edge = values.edge_quality
  const comp = values.composition

  const darkest = round4(clamp(0.44 - vr * 0.038 + (rand() - 0.5) * 0.02, 0.02, 0.42))
  const valueSpread = round4(clamp(0.26 + vr * 0.063 + (rand() - 0.5) * 0.03, 0.14, 0.97))
  const lightest = round4(clamp(darkest + valueSpread, 0.2, 0.995))
  const contrastSd = round4(clamp(0.055 + vr * 0.019 + (rand() - 0.5) * 0.012, 0.03, 0.34))
  const inkCoverage = round4(clamp(0.11 + vr * 0.021 + (rand() - 0.5) * 0.04, 0.04, 0.55))
  const edgeDensity = round4(clamp(0.045 + line * 0.013 + (rand() - 0.5) * 0.02, 0.02, 0.4))
  const edgeVariance = round4(clamp(0.018 + edge * 0.011 + (rand() - 0.5) * 0.012, 0.005, 0.28))
  const borderEnergy = round4(clamp(0.31 - comp * 0.019 + (rand() - 0.5) * 0.03, 0.04, 0.45))

  // Off-centre mass is the pixel evidence for a weak composition score.
  const offset = (0.17 - comp * 0.015) * (rand() - 0.5) * 2
  const massCenter = {
    x: round4(clamp(0.5 + offset, 0.24, 0.76)),
    y: round4(clamp(0.5 + offset * 0.7 + (rand() - 0.5) * 0.03, 0.24, 0.76)),
  }

  const emptyShare = round4(clamp(0.56 - comp * 0.026 + (rand() - 0.5) * 0.05, 0.08, 0.72))
  const strokeCoherence = round4(clamp(0.29 + line * 0.056 + (rand() - 0.5) * 0.05, 0.1, 0.97))

  return {
    histogram: buildHistogram(darkest, lightest, inkCoverage),
    darkest,
    lightest,
    valueSpread,
    contrastSd,
    inkCoverage,
    edgeDensity,
    edgeVariance,
    borderEnergy,
    massCenter,
    emptyShare,
    strokeCoherence,
    width: 1600,
    height: 1200,
  }
}

/** Sixteen buckets, a dark lobe and a light lobe, summing to exactly 1. */
function buildHistogram(darkest: number, lightest: number, ink: number): number[] {
  const darkCentre = clamp(darkest + 0.07, 0.03, 0.6)
  const lightCentre = clamp(lightest - 0.06, 0.4, 0.97)
  const raw: number[] = []
  for (let i = 0; i < 16; i++) {
    const x = (i + 0.5) / 16
    const d = Math.exp(-((x - darkCentre) ** 2) / (2 * 0.09 ** 2)) * ink
    const l = Math.exp(-((x - lightCentre) ** 2) / (2 * 0.11 ** 2)) * (1 - ink)
    const m = Math.exp(-((x - 0.5) ** 2) / (2 * 0.22 ** 2)) * 0.22
    raw.push(d + l + m)
  }
  const total = raw.reduce((a, b) => a + b, 0)
  const out = raw.map((v) => round4(v / total))
  const sum = out.reduce((a, b) => a + b, 0)
  let peak = 0
  for (let i = 1; i < out.length; i++) if (out[i] > out[peak]) peak = i
  out[peak] = round4(out[peak] + (1 - sum))
  return out
}

/* ------------------------------------------------------------------ *
 * Rationales. Three bands per dimension, two phrasings each, so the
 * score column does not read as one sentence repeated four hundred times.
 * ------------------------------------------------------------------ */

const RATIONALES: Record<Dimension, [string[], string[], string[]]> = {
  proportion: [
    [
      'Head-to-body relationships drift and the whole sits low on the sheet.',
      'Each part is measured on its own, so the construction does not hold together.',
    ],
    [
      'The major relationships hold; the smaller shapes still slip against them.',
      'Placement is sound, though two or three internal proportions run short.',
    ],
    [
      'Relationships and placement read as measured across the whole sheet.',
      'The construction holds at every scale, including the small forms.',
    ],
  ],
  line_control: [
    [
      'The line searches — three or four strokes where one would do.',
      'Marks are hesitant and hold the same weight from end to end.',
    ],
    [
      'The main contours commit; the detail work goes back to sketching.',
      'Weight varies in places, but not yet as a decision.',
    ],
    [
      'Single decisive strokes, with weight used to describe the form.',
      'The mark-making is confident and the pressure changes on purpose.',
    ],
  ],
  value_range: [
    [
      'Everything sits in a narrow mid-grey band; there is no true dark anywhere.',
      'The darks stop well short of full and the lights are not left clean.',
    ],
    [
      'A range is present, but the darkest dark is still a mid-tone.',
      'Values separate the planes; the bottom of the scale is unused.',
    ],
    [
      'The full scale is in play, from clean paper to a genuine darkest dark.',
      'The darks read as dark and the lights stay clean beside them.',
    ],
  ],
  edge_quality: [
    [
      'Every edge is drawn the same way, a hard outline all the way round.',
      'Edges are uniform, so nothing sits in front of anything else.',
    ],
    [
      'Some softening appears, though it does not yet direct the eye.',
      'Hard and soft edges coexist but are not placed deliberately.',
    ],
    [
      'Hard, soft and lost edges are chosen, and together they build depth.',
      'The edge decisions carry attention to where it is wanted.',
    ],
  ],
  composition: [
    [
      'The subject floats and large areas of the sheet are doing nothing.',
      'The image crowds one corner and the margins fight it.',
    ],
    [
      'Placement is reasonable; the negative space is uneven.',
      'The subject sits well but the sheet is not fully in play.',
    ],
    [
      'The whole sheet is in play and the placement carries the picture.',
      'Negative space is shaped as deliberately as the subject is.',
    ],
  ],
}

function rationale(dimension: Dimension, value: number, rand: () => number): string {
  const band = value <= 4.5 ? 0 : value <= 7.2 ? 1 : 2
  const options = RATIONALES[dimension][band]
  return options[Math.floor(rand() * options.length) % options.length]
}

/* ------------------------------------------------------------------ *
 * The cohort
 * ------------------------------------------------------------------ */

const NAMES = [
  DEMO.featuredStudentName,
  'Meenakshi Subramanian',
  'Rohan Malhotra',
  'Divya Raghavan',
  'Ishaan Kapoor',
  'Kavya Natarajan',
  'Aditya Sinha',
  'Janani Venkatesan',
  'Tanvi Bansal',
  'Vignesh Ramaswamy',
  'Sneha Chauhan',
  'Preethi Anbarasan',
  'Kabir Sethi',
  'Nithya Chandrasekar',
  'Harshit Saxena',
  'Sowmya Ganesan',
  'Anaya Verma',
  'Gowtham Selvaraj',
  'Ridhima Joshi',
  'Keerthana Murugan',
  'Devansh Rathore',
  'Malini Thirumalai',
  'Aryan Chopra',
  'Abirami Pillai',
  'Yash Trivedi',
  'Krithika Vasudevan',
  'Simran Grewal',
  'Sathish Kumaravel',
  'Neha Khurana',
  'Yazhini Devanathan',
  'Vikram Mehra',
  'Revathi Arumugam',
  'Pooja Ahuja',
  'Ashwin Balasubramanian',
  'Meher Bedi',
  'Poornima Sundaram',
  'Kunal Bhatt',
  'Deepa Rajendran',
  'Siddharth Gupta',
  'Varsha Iyer',
  'Nikita Sharma',
  'Hariharan Elango',
  'Diya Malhotra',
  'Kalaiselvi Muthuraman',
  'Manav Ahluwalia',
  'Bharathi Selvam',
  'Shreya Nanda',
  'Aravind Ilango',
  'Ananya Bhargava',
  'Swathi Ramanathan',
  'Gaurav Sood',
  'Anitha Sivakumar',
  'Rajat Khanna',
  'Nandini Palaniappan',
  'Myra Dhillon',
  'Karthikeyan Vairavan',
  'Aisha Qureshi',
  'Dhanush Marimuthu',
  'Priya Chidambaram',
  'Vihaan Rastogi',
  'Lakshmi Annadurai',
  'Manoj Thangavelu',
]

const SUBJECTS = [
  'Still life, three objects',
  'Cast head, side light',
  'Drapery study',
  'Hand study from life',
  'Bottle and cloth',
  'Two-value block study',
  'Portrait from life, 40 min',
  'Plant study, ink and graphite',
  'Interior corner',
  'Skull study',
  'Folded paper',
  'Egg and cylinder',
  'Seated figure, 20 min',
  'Onion and knife',
]

/** Which group a student belongs to. The group decides the shape of the record. */
type Group = 'featured' | 'plateau' | 'dormant' | 'new' | 'paused' | 'active'

interface StudentPlan {
  index: number
  id: string
  name: string
  group: Group
  joinedDaysAgo: number
  level: number
  status: Student['status']
  worksCount: number
  lastWorkDaysAgo: number
}

/**
 * The deliberate outliers. Exactly three students besides the featured one
 * carry an open flag, and the cohort screen can say so honestly.
 */
const DORMANT_INDEXES = [1, 2, 3]
const NEW_INDEXES = [4, 5, 6, 7, 8]
const PAUSED_INDEXES = [9, 10, 11, 12]

/**
 * Two more students whose records contain a real plateau, in dimensions other
 * than the featured student's, so the cohort screen can honestly say three
 * students are flagged rather than one. Like the featured student these are
 * hand-written series that the detector finds on its own.
 */
const PLATEAU_INDEXES = [13, 14]

const PLATEAU_DAYS_AGO = [93, 68, 44, 30, 16, 2]

const PLATEAU_SERIES: Array<Record<Dimension, number[]>> = [
  {
    // Line control stuck at 5 while everything else keeps climbing.
    proportion: [3, 4, 5, 6, 7, 8],
    line_control: [4, 5, 5, 5, 5, 5],
    value_range: [3, 4, 5, 6, 7, 7],
    edge_quality: [3, 4, 5, 6, 6, 7],
    composition: [4, 5, 6, 6, 7, 8],
  },
  {
    // Edge quality stopped at 6 from week 7 - the same shape as the featured
    // student's plateau, in a different dimension and at a different level.
    proportion: [5, 6, 7, 7, 8, 9],
    line_control: [4, 5, 6, 7, 8, 8],
    value_range: [5, 6, 6, 7, 8, 8],
    edge_quality: [4, 5, 6, 6, 6, 6],
    composition: [5, 5, 6, 7, 7, 8],
  },
]

function planStudents(): StudentPlan[] {
  const plans: StudentPlan[] = []
  const names = NAMES.slice(0, DEMO_COHORT_SIZE)

  for (let i = 0; i < names.length; i++) {
    const rand = rng(0x5eed0000 + i * 7919)
    const name = names[i]
    const id = i === 0 ? DEMO.featuredStudentId : seedId(BUCKET.student, i)

    if (i === 0) {
      plans.push({
        index: i,
        id,
        name,
        group: 'featured',
        joinedDaysAgo: 98,
        level: 2,
        status: 'active',
        worksCount: FEATURED_DAYS_AGO.length,
        lastWorkDaysAgo: FEATURED_DAYS_AGO[FEATURED_DAYS_AGO.length - 1],
      })
      continue
    }

    if (PLATEAU_INDEXES.includes(i)) {
      plans.push({
        index: i,
        id,
        name,
        group: 'plateau',
        joinedDaysAgo: PLATEAU_DAYS_AGO[0] + 14,
        level: 2,
        status: 'active',
        worksCount: PLATEAU_DAYS_AGO.length,
        lastWorkDaysAgo: PLATEAU_DAYS_AGO[PLATEAU_DAYS_AGO.length - 1],
      })
      continue
    }

    if (DORMANT_INDEXES.includes(i)) {
      const slot = DORMANT_INDEXES.indexOf(i)
      const joined = [240, 310, 180][slot]
      plans.push({
        index: i,
        id,
        name,
        group: 'dormant',
        joinedDaysAgo: joined,
        level: joined > 260 ? 3 : 2,
        status: 'active',
        worksCount: [7, 9, 6][slot],
        lastWorkDaysAgo: [27, 34, 39][slot],
      })
      continue
    }

    if (NEW_INDEXES.includes(i)) {
      const slot = NEW_INDEXES.indexOf(i)
      plans.push({
        index: i,
        id,
        name,
        group: 'new',
        joinedDaysAgo: [6, 11, 18, 22, 26][slot],
        level: 1,
        status: 'active',
        worksCount: [0, 0, 1, 1, 1][slot],
        lastWorkDaysAgo: [0, 0, 5, 7, 4][slot],
      })
      continue
    }

    if (PAUSED_INDEXES.includes(i)) {
      const slot = PAUSED_INDEXES.indexOf(i)
      const joined = [150, 200, 95, 260][slot]
      plans.push({
        index: i,
        id,
        name,
        group: 'paused',
        joinedDaysAgo: joined,
        level: joined > 180 ? 3 : 2,
        status: 'paused',
        worksCount: [4, 6, 2, 5][slot],
        lastWorkDaysAgo: [12, 17, 9, 14][slot],
      })
      continue
    }

    // Everyone else joined somewhere across the last fourteen months.
    const k = i - 15
    const joined = Math.round(34 + k * 7.9 + (rand() - 0.5) * 9)
    plans.push({
      index: i,
      id,
      name,
      group: 'active',
      joinedDaysAgo: joined,
      level: Math.round(clamp(1 + Math.floor(joined / 115), 1, 4)),
      status: 'active',
      worksCount: Math.round(
        clamp(4 + Math.floor(joined / 55) + Math.floor(rand() * 3), 5, 13),
      ),
      lastWorkDaysAgo: 3 + Math.floor(rand() * 15),
    })
  }

  return plans
}

/* ------------------------------------------------------------------ *
 * The featured student, written out by hand because the plateau has to be
 * arithmetically real rather than approximately real. Nothing in the detector
 * is special-cased for the demo; these numbers simply are a plateau, and
 * detectPlateaus() finds them the way it finds any other.
 *
 * The six works sit 93, 68, 44, 30, 16 and 2 days before the build date, which
 * puts them at weeks 0, 3.57, 7.00, 9.00, 11.00 and 13.00 from the first --
 * six works across three months.
 *
 * value_range reads 3, 5, 6, 6, 6, 6. It climbs for the first three works and
 * stops dead at the third, which is week 7. Over the trailing four-work window
 * (PLATEAU.window = 4) the ordinary least squares slope of value_range is
 * exactly 0.00 points a week against a peer mean of +0.46:
 *
 *   flat        0.00       <  flatSlope 0.06     yes
 *   peers       0.46       >  peerSlope 0.12     yes
 *   duration    6.0 weeks  >= minWeeks 3         yes
 *   evidence    4 works    >= minWorks 4         yes
 *   severity    6 weeks and peers over 0.20      high
 *
 * The walk-back in plateau.ts stops at week 7 rather than running further,
 * because the work before it reads 5 and sits a full point below the level of
 * the run, outside FLAT_BAND. So the flag says week 7, which is where the
 * student actually stopped.
 * ------------------------------------------------------------------ */

const FEATURED_DAYS_AGO = [93, 68, 44, 30, 16, 2]

const FEATURED_VALUES: Record<Dimension, number[]> = {
  proportion: [4, 5, 6, 7, 8, 9],
  line_control: [4, 4, 5, 6, 7, 8],
  value_range: [3, 5, 6, 6, 6, 6],
  edge_quality: [3, 4, 5, 6, 7, 8],
  composition: [4, 5, 6, 7, 8, 8],
}

const FEATURED_NOTES = [
  'First assessed piece. Still life, three objects, 90 minutes.',
  'Cast study under a single lamp.',
  'Drapery, two hours. Asked for more time on the darks.',
  'Bottle and cloth. Worked from a value thumbnail first.',
  'Skull study. The construction is holding now.',
  'Interior corner, 100 minutes. Same tonal band as the last three.',
]

/** The places where the model's number and the instructor's number differ. */
const FEATURED_AI_OVERRIDES: Array<{ work: number; dimension: Dimension; ai: number }> = [
  // The model read the drapery study as darker than it is and proposed a 7.
  // The instructor pulled it back to a 6, and that override is the reason the
  // plateau is visible at all.
  { work: 3, dimension: 'value_range', ai: 7 },
  { work: 1, dimension: 'line_control', ai: 5 },
  { work: 4, dimension: 'composition', ai: 9 },
]

/* ------------------------------------------------------------------ *
 * Calibration anchors: ten works scored by the instructor, spanning the
 * range. A calibration set made of sevens teaches the model nothing.
 * ------------------------------------------------------------------ */

const CALIBRATION_ANCHORS: number[][] = [
  [2, 2, 3, 2, 3],
  [3, 2, 2, 3, 4],
  [4, 3, 3, 4, 4],
  [4, 5, 4, 3, 5],
  [5, 5, 5, 5, 5],
  [6, 5, 6, 5, 6],
  [6, 7, 5, 6, 7],
  [7, 7, 7, 6, 7],
  [8, 8, 7, 8, 8],
  [9, 8, 9, 9, 8],
]

const CALIBRATED_DAYS_AGO = 132

/* ------------------------------------------------------------------ *
 * Assignment briefs
 * ------------------------------------------------------------------ */

const BRIEFS: Record<Dimension, AssignmentBrief> = {
  value_range: {
    title: 'Five-value block study',
    rationale:
      'Value range has not moved in seven weeks while every other dimension has climbed. The problem is not seeing the darks, it is committing to them.',
    steps: [
      'Cut a five-step value strip in graphite, 9H to 6B, and keep it beside the drawing.',
      'Set two blocks under a single lamp with the room lights off.',
      'Block in the darkest shape first, at full pressure, before any mid-tone.',
      'Match every remaining area to a step on the strip. No values between steps.',
    ],
    materials: ['6B and 2B pencils', 'A3 cartridge paper', 'Desk lamp', 'Two wooden blocks'],
    duration_minutes: 90,
    success_criteria: [
      'The darkest area is as dark as the 6B end of the strip.',
      'Paper white is left untouched somewhere in the drawing.',
      'Every value in the drawing can be named as one of the five steps.',
    ],
  },
  edge_quality: {
    title: 'Edges against a lit background',
    rationale:
      'Every edge is being treated the same way, so the forms all sit on one plane. This forces a decision at each boundary.',
    steps: [
      'Light a white object against a mid-grey card.',
      'Find the three hardest edges in the setup and draw only those.',
      'Soften every edge in shadow with a stump until one is genuinely lost.',
      'Leave the drawing for ten minutes, then check where the eye goes first.',
    ],
    materials: ['2B pencil', 'Blending stump', 'Kneaded eraser', 'Grey mount card'],
    duration_minutes: 60,
    success_criteria: [
      'At least one edge is fully lost into the background.',
      'The hardest edge is on the form nearest the light.',
      'The student can say why each softened edge was softened.',
    ],
  },
  proportion: {
    title: 'Measured cast drawing',
    rationale:
      'The parts are accurate on their own but drift against each other. Measuring everything against one fixed unit fixes that.',
    steps: [
      'Choose one unit on the cast and mark it on a paper strip.',
      'Plot the four extreme points of the cast before drawing any contour.',
      'Check every major width against the unit twice before committing.',
      'Compare the finished drawing to the cast from a distance, upside down.',
    ],
    materials: ['HB pencil', 'Paper measuring strip', 'Plumb line', 'A2 cartridge paper'],
    duration_minutes: 120,
    success_criteria: [
      'The four extreme points are within a unit of the cast.',
      'No contour was drawn before the plotting was finished.',
      'The upside-down check shows no drift greater than half a unit.',
    ],
  },
  line_control: {
    title: 'One-stroke contour set',
    rationale:
      'The line is still searching. Removing the option to correct it is the fastest way to make it commit.',
    steps: [
      'Twelve contour drawings of the same object, three minutes each.',
      'One stroke per contour. No going back over a line.',
      'Change pencil pressure only where the form turns away from the light.',
      'Pin all twelve up together and pick the three that state the form.',
    ],
    materials: ['2B pencil', 'Newsprint pad', 'Timer'],
    duration_minutes: 45,
    success_criteria: [
      'No contour in the last four drawings is drawn twice.',
      'Line weight changes at least three times in each drawing.',
      'The student can point at the strongest of the twelve and say why.',
    ],
  },
  composition: {
    title: 'Thumbnail frame studies',
    rationale:
      'The subject is drawn well and then placed badly. Deciding the placement before the drawing starts is the whole fix.',
    steps: [
      'Cut a viewfinder to the proportion of the final sheet.',
      'Make nine thumbnails at 6cm wide, each a different placement of the same subject.',
      'Shade only two values in each thumbnail.',
      'Pick one and scale it up without changing a single placement decision.',
    ],
    materials: ['Card viewfinder', '4B pencil', 'Sketchbook'],
    duration_minutes: 75,
    success_criteria: [
      'Nine genuinely different placements, not nine of the same one.',
      'The chosen thumbnail and the final drawing share the same margins.',
      'No area of the final sheet is empty without a reason.',
    ],
  },
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

/**
 * Build the whole demo academy. `now` exists so a test or a Supabase seed
 * generator can pin the clock; everything else calls it with no argument
 * and gets the last fourteen months counted back from today.
 */
export function buildSeed(now: Date = new Date()): SeedBundle {
  const academy: Academy = {
    id: DEMO.academyId,
    name: DEMO.academyName,
    owner_id: DEMO.ownerId,
    discipline: 'drawing',
    calibrated_at: at(now, CALIBRATED_DAYS_AGO, 11),
    created_at: at(now, 430, 9),
  }

  const instructor: Instructor = {
    id: DEMO.instructorId,
    academy_id: academy.id,
    email: DEMO.email,
    name: DEMO.instructorName,
    created_at: academy.created_at,
  }

  const plans = planStudents()
  const students: Student[] = []
  const works: Work[] = []
  const scores: Score[] = []
  const calibrations: Calibration[] = []
  const assignments: Assignment[] = []
  const reports: Report[] = []

  /** Per student, the values actually written. Reports are built from these. */
  const records = new Map<string, { works: Work[]; values: Array<Record<Dimension, number>> }>()

  let workSeq = 0
  let scoreSeq = 0

  for (const plan of plans) {
    const joinedAt = at(now, plan.joinedDaysAgo, 10)
    students.push({
      id: plan.id,
      academy_id: academy.id,
      name: plan.name,
      joined_at: joinedAt,
      level: plan.level,
      status: plan.status,
      created_at: joinedAt,
    })

    const rand = rng(0xa170000 + plan.index * 104729)
    const studentWorks: Work[] = []
    const studentValues: Array<Record<Dimension, number>> = []

    if (plan.worksCount === 0) {
      records.set(plan.id, { works: studentWorks, values: studentValues })
      continue
    }

    const daysAgoList =
      plan.group === 'featured'
        ? FEATURED_DAYS_AGO
        : plan.group === 'plateau'
          ? PLATEAU_DAYS_AGO
          : spacedDays(plan, rand)
    const valuesByWork =
      plan.group === 'featured'
        ? handWrittenValues(FEATURED_VALUES)
        : plan.group === 'plateau'
          ? handWrittenValues(
              PLATEAU_SERIES[PLATEAU_INDEXES.indexOf(plan.index)] ?? PLATEAU_SERIES[0],
            )
          : modelledValues(plan, daysAgoList, rand)

    // What is still awaiting confirmation. In practice the queue is the newest
    // one or two pieces, not a random scatter through the record.
    const unconfirmedIndexes = new Set<number>()
    if (plan.group !== 'featured') {
      const n = daysAgoList.length
      if (rand() < 0.35) unconfirmedIndexes.add(n - 1)
      if (n > 1 && rand() < 0.12) unconfirmedIndexes.add(n - 2)
    }

    for (let i = 0; i < daysAgoList.length; i++) {
      const daysAgo = daysAgoList[i]
      const values = valuesByWork[i]
      const capturedAt = at(now, daysAgo, 11)
      const workId = seedId(BUCKET.work, ++workSeq)
      const card = studyCard({
        initials: initialsOf(plan.name),
        label: dateLabel(capturedAt),
        values,
        variant: plan.index + i,
        rand: rng(0xc0de0000 + workSeq),
      })
      const image = toDataUrl(card)

      const notes =
        plan.group === 'featured'
          ? FEATURED_NOTES[i]
          : rand() < 0.34
            ? SUBJECTS[Math.floor(rand() * SUBJECTS.length) % SUBJECTS.length]
            : null

      const work: Work = {
        id: workId,
        student_id: plan.id,
        image_url: image,
        thumb_url: image,
        captured_at: capturedAt,
        assignment_id: null,
        notes,
        is_calibration: false,
        difficulty: null,
        quality: null,
        metrics: buildMetrics(values, rng(0xfeed0000 + workSeq)),
        created_at: capturedAt,
      }
      works.push(work)
      studentWorks.push(work)
      studentValues.push(values)

      // Nearly every work carries all five. A couple of old ones, well behind
      // the current analysis window, are missing a dimension.
      const dropComposition =
        plan.group === 'active' && i < daysAgoList.length - 5 && rand() < 0.05

      for (const dimension of DIMENSIONS) {
        if (dropComposition && dimension === 'composition') continue

        let confirmed = !unconfirmedIndexes.has(i)
        let forcedAi: number | null | undefined
        let forcedSource: ScoreSource | undefined

        if (plan.group === 'featured') {
          // Everything is inked except one dimension on the newest work, so
          // the proposed/confirmed distinction is visible on the very piece
          // the demo opens.
          confirmed = !(i === FEATURED_DAYS_AGO.length - 1 && dimension === 'edge_quality')
          const override = FEATURED_AI_OVERRIDES.find(
            (o) => o.work === i && o.dimension === dimension,
          )
          forcedAi = override ? override.ai : values[dimension]
          forcedSource = 'gemini'
        }

        scores.push(
          makeScore({
            id: seedId(BUCKET.score, ++scoreSeq),
            workId,
            dimension,
            value: values[dimension],
            confirmed,
            capturedDaysAgo: daysAgo,
            now,
            rand,
            instructorId: instructor.id,
            forcedAi,
            forcedSource,
          }),
        )
      }
    }

    records.set(plan.id, { works: studentWorks, values: studentValues })
  }

  /* ---- calibration anchors ---- */

  const anchorHosts = plans
    .filter((p) => p.index !== 0 && p.joinedDaysAgo >= 170)
    .slice(0, CALIBRATION_ANCHORS.length)

  for (let i = 0; i < anchorHosts.length; i++) {
    const host = anchorHosts[i]
    const anchor = CALIBRATION_ANCHORS[i]
    const capturedAt = at(now, CALIBRATED_DAYS_AGO, 10 + i)
    const workId = seedId(BUCKET.work, ++workSeq)
    const values = toValueRecord(anchor)
    const card = studyCard({
      initials: initialsOf(host.name),
      label: dateLabel(capturedAt),
      values,
      variant: i,
      rand: rng(0xca110000 + i),
    })
    const image = toDataUrl(card)

    works.push({
      id: workId,
      student_id: host.id,
      image_url: image,
      thumb_url: image,
      captured_at: capturedAt,
      assignment_id: null,
      notes: `Calibration anchor ${i + 1} of ${CALIBRATION_ANCHORS.length}.`,
      is_calibration: true,
      difficulty: null,
      quality: null,
      metrics: buildMetrics(values, rng(0xba5e0000 + i)),
      created_at: capturedAt,
    })

    for (let d = 0; d < DIMENSIONS.length; d++) {
      const dimension = DIMENSIONS[d]
      calibrations.push({
        id: seedId(BUCKET.calibration, i * DIMENSIONS.length + d + 1),
        academy_id: academy.id,
        work_id: workId,
        dimension,
        anchor_score: anchor[d],
        created_at: capturedAt,
      })
      scores.push({
        id: seedId(BUCKET.score, ++scoreSeq),
        work_id: workId,
        dimension,
        ai_score: null,
        ai_rationale: null,
        ai_confidence: null,
        source: 'manual',
        confirmed_score: anchor[d],
        confirmed_by: instructor.id,
        confirmed_at: capturedAt,
        created_at: capturedAt,
      })
    }
  }

  /* ---- assignments ---- */

  const assignmentPlan: Array<{
    studentIndex: number
    dimension: Dimension
    issuedDaysAgo: number | null
    completed: boolean
  }> = [
    { studentIndex: 0, dimension: 'edge_quality', issuedDaysAgo: 38, completed: true },
    { studentIndex: 17, dimension: 'proportion', issuedDaysAgo: 12, completed: false },
    { studentIndex: 24, dimension: 'line_control', issuedDaysAgo: 9, completed: false },
    { studentIndex: 2, dimension: 'value_range', issuedDaysAgo: 30, completed: false },
    { studentIndex: 41, dimension: 'composition', issuedDaysAgo: null, completed: false },
  ]

  for (let i = 0; i < assignmentPlan.length; i++) {
    const spec = assignmentPlan[i]
    const target = plans[spec.studentIndex]
    if (!target) continue
    assignments.push({
      id: seedId(BUCKET.assignment, i + 1),
      student_id: target.id,
      target_dimension: spec.dimension,
      difficulty: 1,
      brief: BRIEFS[spec.dimension],
      issued_at: spec.issuedDaysAgo === null ? null : at(now, spec.issuedDaysAgo, 9),
      completed: spec.completed,
      created_at: at(now, spec.issuedDaysAgo === null ? 2 : spec.issuedDaysAgo + 1, 9),
    })
  }

  /* ---- reports ---- */

  const reportPlan: Array<{ studentIndex: number; approved: boolean }> = [
    { studentIndex: 21, approved: true },
    { studentIndex: 35, approved: true },
    { studentIndex: 49, approved: false },
  ]

  for (let i = 0; i < reportPlan.length; i++) {
    const spec = reportPlan[i]
    const target = plans[spec.studentIndex]
    if (!target) continue
    const record = records.get(target.id)
    if (!record || record.works.length < 3) continue
    reports.push({
      id: seedId(BUCKET.report, i + 1),
      student_id: target.id,
      period_start: at(now, 92, 9),
      period_end: at(now, 2, 9),
      content: buildReportContent(record.works, record.values),
      approved_at: spec.approved ? at(now, 1, 15) : null,
      approved_by: spec.approved ? instructor.id : null,
      created_at: at(now, 2, 18),
    })
  }

  return { academy, instructor, students, works, scores, calibrations, assignments, reports }
}

/* ------------------------------------------------------------------ *
 * Value modelling
 * ------------------------------------------------------------------ */

function toValueRecord(list: number[]): Record<Dimension, number> {
  const out = {} as Record<Dimension, number>
  for (let i = 0; i < DIMENSIONS.length; i++) out[DIMENSIONS[i]] = list[i]
  return out
}

/** Turns a hand-written per-dimension series into one row per work. */
function handWrittenValues(
  series: Record<Dimension, number[]>,
): Array<Record<Dimension, number>> {
  const length = series[DIMENSIONS[0]].length
  return Array.from({ length }, (_, i) => {
    const row = {} as Record<Dimension, number>
    for (const d of DIMENSIONS) row[d] = series[d][i]
    return row
  })
}

/**
 * Work dates in days-before-now, oldest first, always inside the student's
 * tenure and never two works on the same day.
 */
function spacedDays(plan: StudentPlan, rand: () => number): number[] {
  const n = plan.worksCount
  const last = Math.min(
    plan.lastWorkDaysAgo,
    Math.max(2, Math.floor(plan.joinedDaysAgo * 0.3)),
  )
  if (n <= 1) return [last]

  const span = Math.max(n - 1, plan.joinedDaysAgo - last - 3)
  const spacing = Math.min(21, span / (n - 1))
  const out: number[] = []
  for (let i = n - 1; i >= 0; i--) {
    const jitter = i === 0 || i === n - 1 ? 0 : Math.round((rand() - 0.5) * 3)
    out.push(Math.round(clamp(last + i * spacing + jitter, last, plan.joinedDaysAgo - 2)))
  }
  return out.sort((a, b) => b - a)
}

/**
 * A believable climb per dimension: a starting level set by the student's
 * level, a rate between 0.20 and 0.42 points a week, and wobble small enough
 * that no ordinary student's window slope can drop under the flat threshold by
 * accident. Only the featured student plateaus, and only because the numbers
 * say so.
 */
function modelledValues(
  plan: StudentPlan,
  daysAgoList: number[],
  rand: () => number,
): Array<Record<Dimension, number>> {
  const firstDaysAgo = daysAgoList[0]
  const weeks = daysAgoList.map((d) => (firstDaysAgo - d) / 7)
  const totalWeeks = Math.max(1, weeks[weeks.length - 1])

  const params = {} as Record<Dimension, { start: number; rate: number }>
  for (const d of DIMENSIONS) {
    const base = 2.4 + (plan.level - 1) * 0.5 + rand() * 1.2
    const ceilingRate = (9.4 - 1.6) / totalWeeks
    const rate = Math.max(0.2, Math.min(0.2 + rand() * 0.22, Math.max(0.2, ceilingRate)))
    const start = Math.max(
      1.6,
      Math.min(clamp(base + (rand() - 0.5) * 1.6, 1.6, 6.4), 9.4 - rate * totalWeeks),
    )
    params[d] = { start, rate }
  }

  return weeks.map((w) => {
    const row = {} as Record<Dimension, number>
    for (const d of DIMENSIONS) {
      const p = params[d]
      row[d] = scoreInt(p.start + p.rate * w + (rand() - 0.5) * 0.5)
    }
    return row
  })
}

/* ------------------------------------------------------------------ *
 * Score rows
 * ------------------------------------------------------------------ */

function makeScore(input: {
  id: string
  workId: string
  dimension: Dimension
  value: number
  confirmed: boolean
  capturedDaysAgo: number
  now: Date
  rand: () => number
  instructorId: string
  forcedAi?: number | null
  forcedSource?: ScoreSource
}): Score {
  const { rand, value, dimension } = input
  const createdAt = at(input.now, input.capturedDaysAgo, 12)

  const roll = rand()
  const source: ScoreSource =
    input.forcedSource ??
    (input.confirmed
      ? roll < 0.08
        ? 'manual'
        : roll < 0.2
          ? 'measured'
          : 'gemini'
      : roll < 0.85
        ? 'gemini'
        : 'measured')

  let aiScore: number | null
  if (input.forcedAi !== undefined) {
    aiScore = input.forcedAi
  } else if (source === 'manual') {
    // The instructor typed this one; there was never a proposal.
    aiScore = null
  } else if (input.confirmed) {
    // Where the model and the instructor differed. Most of the time they
    // agree; about a third of the time the instructor moved it by a point.
    const drift = rand()
    const delta = drift < 0.62 ? 0 : drift < 0.79 ? 1 : drift < 0.93 ? -1 : 2
    aiScore = scoreInt(value + delta)
  } else {
    aiScore = scoreInt(value)
  }

  const confidence =
    aiScore === null
      ? null
      : source === 'measured'
        ? round4(0.4 + rand() * 0.22)
        : round4(0.62 + rand() * 0.31)

  // Confirmation lands one to three days after the work, never in the future.
  const confirmOffset = Math.min(1 + rand() * 2, Math.max(0.5, input.capturedDaysAgo - 0.6))

  return {
    id: input.id,
    work_id: input.workId,
    dimension,
    ai_score: aiScore,
    ai_rationale: aiScore === null ? null : rationale(dimension, aiScore, rand),
    ai_confidence: confidence,
    source,
    confirmed_score: input.confirmed ? value : null,
    confirmed_by: input.confirmed ? input.instructorId : null,
    confirmed_at: input.confirmed
      ? at(input.now, input.capturedDaysAgo - confirmOffset, 6)
      : null,
    created_at: createdAt,
  }
}

/* ------------------------------------------------------------------ *
 * Reports
 * ------------------------------------------------------------------ */

function readableDimension(d: Dimension): string {
  return d.replace('_', ' ')
}

/** A term report built from the student's own numbers, not from templates. */
function buildReportContent(
  studentWorks: Work[],
  values: Array<Record<Dimension, number>>,
): ReportContent {
  const first = values[0]
  const last = values[values.length - 1]

  const deltas: Partial<Record<Dimension, { from: number; to: number }>> = {}
  const ranked: Array<{ dimension: Dimension; from: number; to: number; change: number }> = []
  for (const d of DIMENSIONS) {
    const from = round1(first[d])
    const to = round1(last[d])
    deltas[d] = { from, to }
    ranked.push({ dimension: d, from, to, change: round1(to - from) })
  }
  ranked.sort((a, b) => b.change - a.change)

  const improved: ReportDimensionNote[] = ranked.slice(0, 2).map((r) => ({
    dimension: r.dimension,
    note: `Moved from ${Math.round(r.from)} to ${Math.round(r.to)} over the period, and the gain shows most in the recent work.`,
    from: r.from,
    to: r.to,
  }))

  const weakest = [...ranked].sort((a, b) => a.to - b.to)[0]
  const focus: ReportDimensionNote[] = [
    {
      dimension: weakest.dimension,
      note: `Still the lowest of the five at ${Math.round(weakest.to)}. This is where next term's exercises go.`,
      from: weakest.from,
      to: weakest.to,
    },
  ]

  const top = ranked[0]
  return {
    headline: `Steady work across ${studentWorks.length} pieces this term`,
    summary: [
      `Across ${studentWorks.length} assessed pieces the strongest movement was in ${readableDimension(top.dimension)}, up ${Math.abs(Math.round(top.change))} points. The drawings from the last month hold together in a way the early ones did not.`,
      `The area to work on is ${readableDimension(weakest.dimension)}, which sits at ${Math.round(weakest.to)}. It has not gone backwards, it has simply not moved as fast as the rest, and a short set of targeted exercises usually shifts it.`,
    ].join('\n\n'),
    improved,
    focus,
    next_steps: [
      'Two exercises a week aimed at the lowest dimension.',
      'Bring one finished piece to each session for assessment.',
      'Review again at the end of next term.',
    ],
    first_work_id: studentWorks[0]?.id ?? null,
    latest_work_id: studentWorks[studentWorks.length - 1]?.id ?? null,
    works_in_period: studentWorks.length,
    deltas,
  }
}
