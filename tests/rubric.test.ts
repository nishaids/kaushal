import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RUBRIC,
  RUBRIC_PRESETS,
  aiAssessableKeys,
  clampToScale,
  descriptorFor,
  dimensionLabel,
  findPreset,
  humaniseKey,
  isDimension,
  materialiseDimension,
  normalise,
  rubricFromPreset,
  scaleSteps,
  shippedDisciplines,
  toRubricView,
} from '@/lib/rubric'
import { inkFor, visualsFor } from '@/lib/rubric/visuals'

/**
 * The rubric engine is what stops KAUSHAL being an art grader. These tests are
 * mostly about the promise it makes to every discipline that is not drawing.
 */

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '')
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    const s = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * s(r) + 0.7152 * s(g) + 0.0722 * s(bl)
  }
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

describe('discipline presets', () => {
  it('ships a rubric for every discipline the product claims to serve', () => {
    const disciplines = shippedDisciplines().map((d) => d.id)
    for (const required of [
      'drawing',
      'music',
      'dance',
      'coding',
      'photography',
      'craft',
      'sports',
      'language',
      'vocational',
      'design',
    ]) {
      expect(disciplines).toContain(required)
    }
  })

  it('gives every preset at least four observable dimensions', () => {
    for (const preset of RUBRIC_PRESETS) {
      expect(preset.dimensions.length).toBeGreaterThanOrEqual(4)
      for (const d of preset.dimensions) {
        expect(d.key).toMatch(/^[a-z][a-z0-9_]*$/)
        expect(d.question.length).toBeGreaterThan(15)
        expect(d.question.endsWith('?')).toBe(true)
      }
    }
  })

  it('never ships an unscoreable dimension', () => {
    // An unscoreable dimension discredits every scoreable one next to it, so
    // the vocabulary is banned across every preset rather than by convention.
    const banned = ['creativity', 'talent', 'potential', 'effort', 'attitude']
    for (const preset of RUBRIC_PRESETS) {
      for (const d of preset.dimensions) {
        const text = `${d.key} ${d.label} ${d.longLabel}`.toLowerCase()
        for (const word of banned) expect(text).not.toContain(word)
      }
    }
  })

  it('marks dimensions no model can see from the media as human-only', () => {
    // Safety in a workshop and projection in a dance studio are not in a
    // photograph. Claiming otherwise would be the dishonest option.
    const music = findPreset('music_instrumental')!
    const technique = music.dimensions.find((d) => d.key === 'technique')!
    expect(technique.aiAssessable).toBe(false)

    const vocational = findPreset('vocational')!
    const safety = vocational.dimensions.find((d) => d.key === 'safety')!
    expect(safety.aiAssessable).toBe(false)
  })

  it('routes non-visual disciplines to non-visual evidence', () => {
    const music = findPreset('music_instrumental')!
    const rhythm = materialiseDimension(
      music.dimensions.find((d) => d.key === 'rhythm')!,
    )
    expect(rhythm.evidence).toContain('audio')
    expect(rhythm.evidence).not.toContain('image')

    const coding = findPreset('coding')!
    const correctness = materialiseDimension(
      coding.dimensions.find((d) => d.key === 'correctness')!,
    )
    expect(correctness.evidence).toContain('code')
  })

  it('builds a usable rubric from any preset', () => {
    for (const preset of RUBRIC_PRESETS) {
      const rubric = rubricFromPreset({ presetId: preset.id, academyId: 'a1' })
      expect(rubric.dimensions.length).toBe(preset.dimensions.length)
      for (const d of rubric.dimensions) {
        expect(d.weight).toBeGreaterThan(0)
        expect(d.scale.max).toBeGreaterThan(d.scale.min)
        expect(d.mastery.evidenceCount).toBeGreaterThan(1)
      }
    }
  })

  it('never calls a skill mastered on a single submission', () => {
    for (const preset of RUBRIC_PRESETS) {
      const rubric = rubricFromPreset({ presetId: preset.id, academyId: 'a1' })
      for (const d of rubric.dimensions) {
        expect(d.mastery.evidenceCount).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('dimension keys are open, not a closed union', () => {
  it('accepts a key no preset has ever heard of', () => {
    expect(isDimension('bowing_technique')).toBe(true)
    expect(isDimension('kiln_loading')).toBe(true)
  })

  it('rejects shapes that would break storage or URLs', () => {
    expect(isDimension('')).toBe(false)
    expect(isDimension('Has Spaces')).toBe(false)
    expect(isDimension('9leading')).toBe(false)
  })

  it('renders a key the rubric no longer contains', () => {
    // Old scores outlive rubric edits and still have to draw.
    expect(humaniseKey('value_range')).toBe('Value range')
    expect(dimensionLabel(DEFAULT_RUBRIC, 'a_removed_key')).toBe('A removed key')
  })
})

describe('scales', () => {
  it('supports a scale that is not one to ten', () => {
    const four = { min: 1, max: 4, step: 1 }
    expect(clampToScale(9, four)).toBe(4)
    expect(clampToScale(0, four)).toBe(1)
    expect(scaleSteps(four)).toEqual([1, 2, 3, 4])
  })

  it('normalises different scales onto a comparable 0..1', () => {
    expect(normalise(4, { min: 1, max: 4, step: 1 })).toBeCloseTo(1, 6)
    expect(normalise(10, { min: 1, max: 10, step: 1 })).toBeCloseTo(1, 6)
    expect(normalise(50, { min: 0, max: 100, step: 1 })).toBeCloseTo(0.5, 6)
  })

  it('reads back the written descriptor for a score', () => {
    const view = toRubricView(rubricFromPreset({ presetId: 'drawing', academyId: 'a' }))
    const value = view.find('value_range')
    expect(descriptorFor(value, 2)).toContain('narrow mid-grey')
    expect(descriptorFor(value, 9)).toContain('Full scale')
    expect(descriptorFor(undefined, 5)).toBeNull()
  })
})

describe('visual assignment for N dimensions', () => {
  it('keeps every line legible against the paper and the plateau band', () => {
    // The design system separates dimensions by value, so the lightest line
    // still has to clear the 3:1 floor for a graphic you are meant to read.
    for (const total of [3, 4, 5, 6, 7, 8]) {
      for (let i = 0; i < total; i++) {
        const ink = inkFor(i, total)
        expect(contrast(ink, '#f5f2eb')).toBeGreaterThanOrEqual(3)
        expect(contrast(ink, '#d8eef6')).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('gives adjacent dimensions distinguishable inks', () => {
    for (const total of [4, 5, 6]) {
      for (let i = 0; i < total - 1; i++) {
        expect(contrast(inkFor(i, total), inkFor(i + 1, total))).toBeGreaterThan(1.2)
      }
    }
  })

  it('assigns a stroke pattern to every dimension of any rubric', () => {
    const coding = toRubricView(rubricFromPreset({ presetId: 'coding', academyId: 'a' }))
    const visuals = visualsFor(coding.keys)
    expect(visuals.size).toBe(coding.keys.length)
    for (const key of coding.keys) expect(visuals.get(key)!.ink).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('still draws a key that has been removed from the rubric', () => {
    const view = toRubricView(DEFAULT_RUBRIC)
    expect(view.visual('gone_away').ink).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('the ai-assessable filter', () => {
  it('excludes human-only dimensions from what a model is asked', () => {
    const dance = rubricFromPreset({ presetId: 'dance', academyId: 'a' })
    const keys = aiAssessableKeys(dance)
    expect(keys).not.toContain('expression')
    expect(keys).toContain('alignment')
  })
})
