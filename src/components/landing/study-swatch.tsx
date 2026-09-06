import { valueForStep } from '@/components/ui/value-scale'

/**
 * A stand-in for a photographed work.
 *
 * Real student drawings are not ours to publish, so where the landing page and
 * the seeded record need an image, they get an honest abstract: a small tonal
 * study whose actual darkness tracks the value-range score it represents. It is
 * a placeholder that says what it is standing in for, rather than a grey box.
 */

function rng(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export function StudySwatch({
  seed = 1,
  value = 5,
  size = 96,
  className,
}: {
  seed?: number
  /** 1..10. Drives how far the study pushes toward a true dark. */
  value?: number
  size?: number
  className?: string
}) {
  const r = rng(seed)
  const darkest = Math.max(2, Math.min(10, Math.round(value)))
  const shapes = Array.from({ length: 4 }, (_, i) => ({
    x: 6 + r() * 34,
    y: 8 + r() * 40,
    w: 20 + r() * 44,
    h: 14 + r() * 40,
    step: Math.max(2, Math.round(darkest - i * (darkest / 5))),
    rot: -10 + r() * 20,
  }))
  const hatchY = 58 + r() * 20

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Tonal study, value range ${darkest} out of 10`}
    >
      <rect width="96" height="96" fill="var(--color-v0)" />
      {shapes.map((s, i) => (
        <rect
          key={i}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          fill={valueForStep(s.step)}
          opacity={0.92}
          transform={`rotate(${s.rot.toFixed(1)} ${(s.x + s.w / 2).toFixed(1)} ${(s.y + s.h / 2).toFixed(1)})`}
        />
      ))}
      {/* hatching, the way a study is actually built up */}
      <g stroke={valueForStep(Math.max(3, darkest - 2))} strokeWidth="1" opacity="0.55">
        {Array.from({ length: 9 }, (_, i) => (
          <line
            key={i}
            x1={10 + i * 8}
            y1={hatchY}
            x2={10 + i * 8 + 10}
            y2={hatchY + 22}
          />
        ))}
      </g>
      <rect
        x="0.5"
        y="0.5"
        width="95"
        height="95"
        fill="none"
        stroke="var(--color-v3)"
      />
    </svg>
  )
}
