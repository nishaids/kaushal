import type { Dimension } from './types'

/**
 * Drawing N dimensions in graphite.
 *
 * The design system spends its one accent on "not yet inked", so dimensions are
 * separated by value and stroke pattern rather than by hue. That was fine while
 * there were exactly five hard-coded dimensions with five hand-picked greys. Now
 * an academy can define three dimensions or nine, so the values have to be
 * generated — and generated inside a band that stays legible.
 *
 * The band is bounded by measurement, not taste: the lightest ink is held at
 * 3:1 against both the paper and the plateau band, which is the floor WCAG sets
 * for a graphic you are expected to read. Above about eight dimensions no set of
 * greys stays separable, so the pattern cycle carries the difference and the UI
 * should prefer showing fewer lines at once.
 */

/** Perceptual lightness bounds, chosen so the lightest still clears 3:1. */
const DARKEST_L = 0.07
const LIGHTEST_L = 0.5166

/** The warm graphite hue the whole ramp is built on. */
const HUE = 0.0972
const SAT = 0.086

/**
 * Stroke patterns, in order of application. Solid first so the most important
 * line is the cleanest; the rest are distinguishable at 1.5px on a phone.
 */
const DASH_CYCLE: Array<string | undefined> = [
  undefined,
  '7 3',
  '1 3',
  '11 4 2 4',
  '3 3',
  '9 3 1 3',
  '5 2',
  '2 2 6 2',
]

function hlsToHex(h: number, l: number, s: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (h * 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v + m) * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/**
 * The ink for dimension `index` of `total`.
 *
 * Spacing is eased so the dark end spreads out more than the light end, which
 * is where the eye can actually tell two greys apart.
 */
export function inkFor(index: number, total: number): string {
  if (total <= 1) return hlsToHex(HUE, DARKEST_L, SAT)
  const t = Math.min(1, Math.max(0, index / (total - 1)))
  const eased = Math.pow(t, 0.85)
  return hlsToHex(HUE, DARKEST_L + (LIGHTEST_L - DARKEST_L) * eased, SAT)
}

export function dashFor(index: number): string | undefined {
  return DASH_CYCLE[index % DASH_CYCLE.length]
}

export interface DimensionVisual {
  key: Dimension
  ink: string
  dash: string | undefined
}

/** Assign a stable ink and stroke pattern to every key, in rubric order. */
export function visualsFor(keys: Dimension[]): Map<Dimension, DimensionVisual> {
  const map = new Map<Dimension, DimensionVisual>()
  keys.forEach((key, i) => {
    map.set(key, { key, ink: inkFor(i, keys.length), dash: dashFor(i) })
  })
  return map
}

/**
 * A visual for a key that is no longer in the rubric.
 *
 * Old scores outlive rubric edits and still have to be drawable, so an unknown
 * key gets a mid-grey rather than nothing at all.
 */
export const ORPHAN_VISUAL: DimensionVisual = {
  key: '',
  ink: '#746d62',
  dash: '2 4',
}
