/**
 * Deterministic pixel measurement for a piece of student work.
 *
 * Every number here is measured off real pixels with no model call and no
 * network. That buys two things. It gives the vision prompt evidence to argue
 * against, so the model cannot invent a value range the paper does not have.
 * And when the model is unreachable, these numbers are the fallback score.
 *
 * This module is deliberately NOT marked 'use client'. It holds no React and
 * touches no browser global at module scope, so the same code can summarise
 * metrics inside a Server Action while measureImage runs in the browser.
 * measureImage needs a DOM or worker canvas at call time; measureImageData and
 * summariseMetrics are pure and run on either side.
 */

import type { ImageMetrics } from '@/lib/types'
import { pct } from '@/lib/utils/format'

/** Long edge the analysis runs at. Wide enough to resolve pencil, cheap enough to be instant. */
const WORK_EDGE = 512

/** Histogram resolution. Matches ImageMetrics.histogram in lib/types.ts. */
const HIST_BUCKETS = 16

/**
 * Resolution the percentiles are read at. The reported histogram stays at 16
 * buckets because that is the contract, but darkest and lightest come off a
 * finer count of the same pixels: at 16 buckets the interpolation inside a
 * bucket alone puts a floor of 0.06 on valueSpread, and valueSpread is the
 * direct evidence for a student's value_range score. An exact multiple of
 * HIST_BUCKETS, so the coarse histogram folds out of the fine one.
 */
const PERCENTILE_BUCKETS = 256

/** Below this luminance a pixel counts as ink rather than paper. */
const INK_LUMA = 0.35

/** Tile edge for the empty-space and stroke-coherence passes. */
const TILE = 16

/** Width of the outer frame band, as a share of each edge. */
const BORDER_BAND = 0.15

/**
 * Share of the frame the outer band occupies. Gradient energy spread perfectly
 * evenly over the sheet lands on exactly this number, so borderEnergy above it
 * means the work crowds its edges and below it means the work sits inboard.
 * Exported because the fallback scorer and the prompt both need the reference.
 */
export const BORDER_BAND_EVEN_SHARE = 1 - (1 - 2 * BORDER_BAND) ** 2

/** Orientation bins across 180 degrees. Fifteen degrees per bin. */
const ORIENTATION_BINS = 12

/**
 * A 16x16 tile whose mean gradient falls below this carries no readable mark.
 * Set above the residual gradient of JPEG-compressed blank paper (about 0.005)
 * and below a tile crossed by a single faint pencil line (about 0.012).
 */
const EMPTY_TILE_GRADIENT = 0.012

/**
 * A tile also has to be near paper tone to count as empty. Gradient alone would
 * call a smoothly blended shadow empty, because a wash has no edges in it, and
 * a charcoal drawing is mostly wash. This is the distance below the sheet's own
 * lightest value at which a tile stops being bare paper.
 */
const EMPTY_TILE_TONE = 0.1

/** Sobel magnitude of a black-to-white step in both axes. Normalises magnitude to 0..1. */
const SOBEL_MAX = 4 * Math.SQRT2

/** Cosine and sine of each orientation bin centre, doubled. Orientation is mod 180 degrees. */
const BIN_COS = new Float64Array(ORIENTATION_BINS)
const BIN_SIN = new Float64Array(ORIENTATION_BINS)
for (let k = 0; k < ORIENTATION_BINS; k++) {
  const doubled = 2 * ((k + 0.5) * (Math.PI / ORIENTATION_BINS))
  BIN_COS[k] = Math.cos(doubled)
  BIN_SIN[k] = Math.sin(doubled)
}

/** Anything that can be drawn into a canvas and measured. */
export type MeasurableImage =
  | HTMLImageElement
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas

type AnalysisCanvas = HTMLCanvasElement | OffscreenCanvas

/**
 * The slice of the 2D context this module uses, declared structurally so the
 * document canvas and the offscreen canvas share one code path without
 * TypeScript having to reconcile two sets of overloads.
 */
interface Context2D {
  fillStyle: string | CanvasGradient | CanvasPattern
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality
  fillRect(x: number, y: number, w: number, h: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Measure an image. The analysis runs on a downsample of at most WORK_EDGE on
 * the long edge for speed; the width and height returned are the source's own,
 * not the downsample's.
 */
export async function measureImage(source: MeasurableImage): Promise<ImageMetrics> {
  const { width, height } = intrinsicSize(source)
  if (width < 1 || height < 1) {
    throw new Error(
      'The image reports no pixels. If it is an img element, wait for it to load before measuring it.',
    )
  }

  const scale = Math.min(1, WORK_EDGE / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = createAnalysisCanvas(w, h)
  const ctx = context2d(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Paper, not black, behind anything with an alpha channel. A transparent PNG
  // of a drawing means a white sheet, and compositing over black would report a
  // value range the student never made.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)

  const measured = measureImageData(ctx.getImageData(0, 0, w, h))
  return { ...measured, width, height }
}

/**
 * Measure raw pixels. Reports the dimensions of the data it was handed, so a
 * caller working from a downsample must overwrite width and height itself.
 */
export function measureImageData(data: ImageData): ImageMetrics {
  const w = data.width
  const h = data.height
  const n = w * h
  if (n < 1) return blankSheet(w, h)

  const px = data.data
  const luma = new Float32Array(n)
  const fineCounts = new Float64Array(PERCENTILE_BUCKETS)
  let lumaSum = 0
  let lumaSqSum = 0
  let inkCount = 0

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // Composite over white before measuring, for the reason given above.
    const a = px[p + 3] / 255
    const paper = 255 * (1 - a)
    const r = (px[p] * a + paper) / 255
    const g = (px[p + 1] * a + paper) / 255
    const b = (px[p + 2] * a + paper) / 255
    // Rec. 709 luma on sRGB values. Not linearised: the instructor judges the
    // print in front of them, and the print is what the sensor recorded.
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    luma[i] = l
    lumaSum += l
    lumaSqSum += l * l
    if (l < INK_LUMA) inkCount++
    let bucket = (l * PERCENTILE_BUCKETS) | 0
    if (bucket < 0) bucket = 0
    else if (bucket > PERCENTILE_BUCKETS - 1) bucket = PERCENTILE_BUCKETS - 1
    fineCounts[bucket]++
  }

  const histogram = normalisedHistogram(fineCounts, n)
  const darkest = percentile(fineCounts, n, 0.01)
  const lightest = percentile(fineCounts, n, 0.99)
  const mean = lumaSum / n
  const contrastSd = Math.sqrt(Math.max(0, lumaSqSum / n - mean * mean))

  /* Sobel pass. Border pixels sample a clamped neighbourhood rather than being
     skipped, so the gradient plane stays the same size as the image and the
     frame band below covers real pixels instead of a hole. */
  const mag = new Float32Array(n)
  const bins = new Uint8Array(n)
  const bandX0 = BORDER_BAND * w
  const bandX1 = w - BORDER_BAND * w
  const bandY0 = BORDER_BAND * h
  const bandY1 = h - BORDER_BAND * h
  let magSum = 0
  let magSqSum = 0
  let borderSum = 0
  let cxSum = 0
  let cySum = 0

  for (let y = 0; y < h; y++) {
    const rowAbove = (y > 0 ? y - 1 : 0) * w
    const row = y * w
    const rowBelow = (y < h - 1 ? y + 1 : h - 1) * w
    const outsideY = y < bandY0 || y >= bandY1
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : 0
      const xr = x < w - 1 ? x + 1 : w - 1
      const tl = luma[rowAbove + xl]
      const tc = luma[rowAbove + x]
      const tr = luma[rowAbove + xr]
      const ml = luma[row + xl]
      const mr = luma[row + xr]
      const bl = luma[rowBelow + xl]
      const bc = luma[rowBelow + x]
      const br = luma[rowBelow + xr]

      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl)
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr)
      const m = Math.sqrt(gx * gx + gy * gy) / SOBEL_MAX
      const i = row + x
      mag[i] = m
      magSum += m
      magSqSum += m * m
      cxSum += m * x
      cySum += m * y
      if (outsideY || x < bandX0 || x >= bandX1) borderSum += m

      if (m > 1e-6) {
        // Fold the gradient direction into 0..pi. A stroke produces opposing
        // gradients on its two sides and they describe one stroke, not two.
        let angle = Math.atan2(gy, gx)
        if (angle < 0) angle += Math.PI
        if (angle >= Math.PI) angle -= Math.PI
        let bin = ((angle / Math.PI) * ORIENTATION_BINS) | 0
        if (bin > ORIENTATION_BINS - 1) bin = ORIENTATION_BINS - 1
        else if (bin < 0) bin = 0
        bins[i] = bin
      }
    }
  }

  const edgeDensity = magSum / n
  const edgeVariance = Math.sqrt(Math.max(0, magSqSum / n - edgeDensity * edgeDensity))
  const borderEnergy = magSum > 0 ? borderSum / magSum : 0
  const massCenterX = magSum > 0 && w > 1 ? clamp01(cxSum / magSum / (w - 1)) : 0.5
  const massCenterY = magSum > 0 && h > 1 ? clamp01(cySum / magSum / (h - 1)) : 0.5

  /* Tile pass. Empty share and stroke coherence share a grid because both
     questions are local ones: is there a mark here, and if there is, does it
     point one way. */
  const tilesX = Math.ceil(w / TILE)
  const tilesY = Math.ceil(h / TILE)
  const binWeights = new Float64Array(ORIENTATION_BINS)
  let emptyTiles = 0
  let coherenceSum = 0
  let coherenceWeight = 0

  for (let ty = 0; ty < tilesY; ty++) {
    const yStart = ty * TILE
    const yEnd = Math.min(h, yStart + TILE)
    for (let tx = 0; tx < tilesX; tx++) {
      const xStart = tx * TILE
      const xEnd = Math.min(w, xStart + TILE)
      binWeights.fill(0)
      let tileSum = 0
      let tileLuma = 0
      let pixels = 0
      for (let y = yStart; y < yEnd; y++) {
        const row = y * w
        for (let x = xStart; x < xEnd; x++) {
          const i = row + x
          const m = mag[i]
          tileSum += m
          tileLuma += luma[i]
          binWeights[bins[i]] += m
          pixels++
        }
      }
      if (pixels < 1) continue
      // Nothing drawn here means no edges and no tone. Either one on its own
      // would misread: a wash has no edges, a flat grey ground has no marks.
      const noEdges = tileSum / pixels < EMPTY_TILE_GRADIENT
      const barePaper = tileLuma / pixels > lightest - EMPTY_TILE_TONE
      if (noEdges && barePaper) emptyTiles++
      if (tileSum <= 0) continue

      // Circular variance over doubled angles. The resultant length of the
      // magnitude-weighted bin centres is exactly 1 minus that variance, which
      // is the number we want: one decisive direction in this tile reads high,
      // a searching scribble spreads across the bins and reads low.
      let sx = 0
      let sy = 0
      for (let k = 0; k < ORIENTATION_BINS; k++) {
        sx += binWeights[k] * BIN_COS[k]
        sy += binWeights[k] * BIN_SIN[k]
      }
      const resultant = Math.sqrt(sx * sx + sy * sy) / tileSum
      coherenceSum += resultant * tileSum
      coherenceWeight += tileSum
    }
  }

  const tileCount = tilesX * tilesY
  const emptyShare = tileCount > 0 ? emptyTiles / tileCount : 1
  // Weighted by tile energy so blank paper never votes, and 0 when nothing was
  // drawn at all rather than a division by zero.
  const strokeCoherence = coherenceWeight > 0 ? clamp01(coherenceSum / coherenceWeight) : 0

  return {
    histogram,
    darkest: round(darkest, 4),
    lightest: round(lightest, 4),
    valueSpread: round(Math.max(0, lightest - darkest), 4),
    contrastSd: round(contrastSd, 4),
    inkCoverage: round(inkCount / n, 4),
    edgeDensity: round(edgeDensity, 5),
    edgeVariance: round(edgeVariance, 5),
    borderEnergy: round(borderEnergy, 4),
    massCenter: { x: round(massCenterX, 4), y: round(massCenterY, 4) },
    emptyShare: round(emptyShare, 4),
    strokeCoherence: round(strokeCoherence, 4),
    width: w,
    height: h,
  }
}

/**
 * One line of evidence for the vision prompt and for the metrics row under a
 * work. It reads as a sentence because a person has to check it against paper.
 */
export function summariseMetrics(m: ImageMetrics): string {
  return [
    `${m.width}x${m.height} px`,
    `values run ${f2(m.darkest)} to ${f2(m.lightest)} (spread ${f2(m.valueSpread)}, SD ${f2(m.contrastSd)})`,
    `ink covers ${pct(m.inkCoverage)} of the sheet`,
    `edge density ${f3(m.edgeDensity)}, edge variance ${f3(m.edgeVariance)}`,
    `stroke coherence ${f2(m.strokeCoherence)}`,
    `${pct(m.borderEnergy)} of the edge energy sits in the outer 15% band, where ${pct(
      BORDER_BAND_EVEN_SHARE,
    )} would be even`,
    `the marks centre ${pct(m.massCenter.x)} across and ${pct(m.massCenter.y)} down`,
    `${pct(m.emptyShare)} of the sheet carries no marks`,
  ].join('; ')
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

/**
 * Luminance at a percentile, read off the cumulative distribution with linear
 * interpolation inside the bucket. Percentiles rather than min and max, because
 * one dust speck or one blown highlight must not decide a student's value range.
 */
function percentile(counts: Float64Array, total: number, p: number): number {
  const target = p * total
  let cumulative = 0
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i]
    if (count > 0 && cumulative + count >= target) {
      const within = clamp01((target - cumulative) / count)
      return clamp01((i + within) / counts.length)
    }
    cumulative += count
  }
  return 1
}

/**
 * Fold the fine counts down to HIST_BUCKETS shares, rounded for storage, with
 * the rounding residual absorbed by the tallest bucket so the array still sums
 * to 1 as ImageMetrics promises.
 */
function normalisedHistogram(fineCounts: Float64Array, total: number): number[] {
  const perBucket = fineCounts.length / HIST_BUCKETS
  const out = new Array<number>(HIST_BUCKETS)
  const coarse = new Float64Array(HIST_BUCKETS)
  let tallest = 0
  let sum = 0
  for (let i = 0; i < HIST_BUCKETS; i++) {
    let count = 0
    for (let j = i * perBucket; j < (i + 1) * perBucket; j++) count += fineCounts[j]
    coarse[i] = count
    const share = round(count / total, 5)
    out[i] = share
    sum += share
    if (count > coarse[tallest]) tallest = i
  }
  out[tallest] = round(out[tallest] + (1 - sum), 5)
  return out
}

/** What a sheet with no pixels to measure looks like. Every field stays finite. */
function blankSheet(width: number, height: number): ImageMetrics {
  const histogram = new Array<number>(HIST_BUCKETS).fill(0)
  histogram[HIST_BUCKETS - 1] = 1
  return {
    histogram,
    darkest: 1,
    lightest: 1,
    valueSpread: 0,
    contrastSd: 0,
    inkCoverage: 0,
    edgeDensity: 0,
    edgeVariance: 0,
    borderEnergy: 0,
    massCenter: { x: 0.5, y: 0.5 },
    emptyShare: 1,
    strokeCoherence: 0,
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  }
}

function intrinsicSize(source: MeasurableImage): { width: number; height: number } {
  if ('naturalWidth' in source) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    }
  }
  return { width: source.width, height: source.height }
}

function createAnalysisCanvas(width: number, height: number): AnalysisCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  if (typeof document === 'undefined') {
    throw new Error('measureImage needs a canvas. Call it from the browser, not from the server.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(canvas: AnalysisCanvas): Context2D {
  // The analysis reads the whole buffer back exactly once, which is the case
  // willReadFrequently exists for.
  const ctx: Context2D | null = isOffscreen(canvas)
    ? canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    : canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!ctx) {
    throw new Error('This browser refused a 2D canvas context, so the image cannot be measured.')
  }
  return ctx
}

function isOffscreen(canvas: AnalysisCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function round(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function f2(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function f3(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : '—'
}
