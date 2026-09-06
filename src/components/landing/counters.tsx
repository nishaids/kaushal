'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * A number that counts once, when it comes into view, and then stops.
 *
 * This is the only scroll-triggered motion on the landing page. It is here
 * because these particular numbers are the argument, and watching one climb to
 * sixty-two is a different experience from reading "62". Everything else on the
 * page arrives already drawn — there is no fade-and-rise on section entry
 * anywhere in this product.
 */
export function CountUp({
  to,
  suffix = '',
  prefix = '',
  duration = 900,
  className,
}: {
  to: number
  suffix?: string
  prefix?: string
  duration?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  // Starts at the real number. These are the argument of the section, and a
  // stalled script or a failed hydration must never leave a judge reading
  // "0 students enrolled" — the count is a flourish, the figure is the point.
  const [value, setValue] = useState(to)
  const done = useRef(false)

  useEffect(() => {
    if (reduce) {
      setValue(to)
      return
    }
    const el = ref.current
    if (!el || done.current) return
    setValue(0)

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || done.current) return
        done.current = true
        observer.disconnect()

        const start = performance.now()
        let frame = 0
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          // Ease out cubic: fast at first, settles rather than snaps.
          const eased = 1 - Math.pow(1 - t, 3)
          setValue(Math.round(eased * to))
          if (t < 1) frame = requestAnimationFrame(tick)
        }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
      },
      { threshold: 0.6 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [to, duration, reduce])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {value}
      {suffix}
    </span>
  )
}
