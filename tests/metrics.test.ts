import { describe, expect, it } from 'vitest'
import { measureImageData, summariseMetrics } from '@/lib/metrics/image-metrics'
import type { ImageMetrics } from '@/lib/types'

/**
 * The pixel measurements are the product's honest floor: they ground the
 * scoring prompt, and when no model can be reached they are the score. So they
 * are tested against images whose answers are known by construction.
 */

const W = 128
const H = 128

type Paint = (x: number, y: number) => [number, number, number]

/** Build an ImageData-shaped object. The measurement code only reads these. */
function image(paint: Paint, width = W, height = H): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData
}

const white = (): [number, number, number] => [255, 255, 255]
const black = (): [number, number, number] => [0, 0, 0]

function finite(m: ImageMetrics): boolean {
  const numbers = [
    m.darkest,
    m.lightest,
    m.valueSpread,
    m.contrastSd,
    m.inkCoverage,
    m.edgeDensity,
    m.edgeVariance,
    m.borderEnergy,
    m.emptyShare,
    m.strokeCoherence,
    m.massCenter.x,
    m.massCenter.y,
    ...m.histogram,
  ]
  return numbers.every((n) => Number.isFinite(n))
}

describe('measureImageData', () => {
  it('returns finite numbers for a blank sheet rather than dividing by zero', () => {
    const m = measureImageData(image(white))
    expect(finite(m)).toBe(true)
    expect(m.valueSpread).toBeLessThan(0.05)
    expect(m.inkCoverage).toBe(0)
    expect(m.emptyShare).toBeCloseTo(1, 1)
  })

  it('returns finite numbers for a sheet that is entirely black', () => {
    const m = measureImageData(image(black))
    expect(finite(m)).toBe(true)
    expect(m.inkCoverage).toBeCloseTo(1, 1)
  })

  it('normalises the histogram to one', () => {
    const m = measureImageData(
      image((x, y) => {
        const v = ((x + y) % 256) as number
        return [v, v, v]
      }),
    )
    expect(m.histogram).toHaveLength(16)
    const total = m.histogram.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 4)
  })

  it('measures a wide value range as wider than a narrow one', () => {
    const full = measureImageData(
      image((x) => (x < W / 2 ? black() : white())),
    )
    const narrow = measureImageData(
      image((x) => (x < W / 2 ? [120, 120, 120] : [150, 150, 150])),
    )
    expect(full.valueSpread).toBeGreaterThan(0.8)
    expect(narrow.valueSpread).toBeLessThan(0.3)
    expect(full.contrastSd).toBeGreaterThan(narrow.contrastSd)
  })

  it('ignores a single stray speck when reporting the darkest dark', () => {
    // One black pixel on white paper is dust, not a drawing. Percentiles are
    // used precisely so that one pixel cannot decide a value-range score.
    const speck = measureImageData(
      image((x, y) => (x === 3 && y === 3 ? black() : white())),
    )
    expect(speck.darkest).toBeGreaterThan(0.8)
    expect(speck.valueSpread).toBeLessThan(0.2)
  })

  it('puts the centre of mass where the marks actually are', () => {
    const leftHeavy = measureImageData(
      image((x, y) =>
        x > 10 && x < 40 && y > 40 && y < 88 ? black() : white(),
      ),
    )
    expect(leftHeavy.massCenter.x).toBeLessThan(0.45)
    expect(leftHeavy.massCenter.y).toBeGreaterThan(0.3)
    expect(leftHeavy.massCenter.y).toBeLessThan(0.7)
  })

  it('reports more empty sheet for a small mark than a large one', () => {
    const small = measureImageData(
      image((x, y) => (x > 60 && x < 68 && y > 60 && y < 68 ? black() : white())),
    )
    const large = measureImageData(
      image((x, y) => (x > 20 && x < 108 && y > 20 && y < 108 ? black() : white())),
    )
    expect(small.emptyShare).toBeGreaterThan(large.emptyShare)
  })

  it('scores parallel decisive strokes as more coherent than a scribble', () => {
    const parallel = measureImageData(
      image((x, y) => (y % 8 === 0 ? black() : white())),
    )
    const scribble = measureImageData(
      image((x, y) => {
        // A deterministic hash: no ordering to the marks at all.
        const n = (x * 7919 + y * 104729) % 97
        return n < 12 ? black() : white()
      }),
    )
    expect(parallel.strokeCoherence).toBeGreaterThan(scribble.strokeCoherence)
  })

  it('finds more edge energy at the border when the marks sit at the border', () => {
    const crowded = measureImageData(
      image((x, y) =>
        x < 8 || x > W - 8 || y < 8 || y > H - 8 ? black() : white(),
      ),
    )
    const centred = measureImageData(
      image((x, y) =>
        x > 48 && x < 80 && y > 48 && y < 80 ? black() : white(),
      ),
    )
    expect(crowded.borderEnergy).toBeGreaterThan(centred.borderEnergy)
  })

  it('records the dimensions it was handed', () => {
    const m = measureImageData(image(white, 64, 32))
    expect(m.width).toBe(64)
    expect(m.height).toBe(32)
  })

  it('summarises itself in one readable line', () => {
    const m = measureImageData(image((x) => (x < W / 2 ? black() : white())))
    const line = summariseMetrics(m)
    expect(line.length).toBeGreaterThan(40)
    expect(line).not.toContain('NaN')
    expect(line).not.toContain('undefined')
  })

  it('keeps every value inside its documented range', () => {
    const cases = [
      image(white),
      image(black),
      image((x, y) => (x < W / 2 ? black() : white())),
      image((x, y) => [(x * 2) % 256, (y * 2) % 256, 128]),
    ]
    for (const img of cases) {
      const m = measureImageData(img)
      for (const key of [
        'darkest',
        'lightest',
        'valueSpread',
        'inkCoverage',
        'borderEnergy',
        'emptyShare',
        'strokeCoherence',
      ] as const) {
        expect(m[key]).toBeGreaterThanOrEqual(0)
        expect(m[key]).toBeLessThanOrEqual(1)
      }
      expect(m.massCenter.x).toBeGreaterThanOrEqual(0)
      expect(m.massCenter.x).toBeLessThanOrEqual(1)
      expect(m.lightest).toBeGreaterThanOrEqual(m.darkest)
    }
  })
})
