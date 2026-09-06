import { cn } from '@/lib/utils/cn'

/**
 * A small hand-drawn icon set.
 *
 * Nothing here came from a generic icon pack. The shapes are drawn from the
 * things on a studio table — a sheet, a pin, a rule, a pencil — at a single
 * stroke weight, with square caps, so they read as drafting marks rather than
 * as app furniture.
 */

type IconProps = {
  size?: number
  className?: string
  title?: string
}

function Svg({
  size = 16,
  className,
  title,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={cn('shrink-0', className)}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** A sheet of paper with a guideline across it. Capture. */
export function IconSheet(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="1.5" width="11" height="13" />
      <line x1="4.8" y1="10.5" x2="11.2" y2="10.5" strokeDasharray="2 1.6" />
      <path d="M5 7.5l2-2.4 2 2.8 2-1.6" />
    </Svg>
  )
}

/** Rising marks. Trajectory. */
export function IconTrajectory(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.5 12.5L5 9l3 2.2L14.5 3.5" />
      <line x1="1.5" y1="14.5" x2="14.5" y2="14.5" />
    </Svg>
  )
}

/** Ruled rows. The cohort. */
export function IconCohort(p: IconProps) {
  return (
    <Svg {...p}>
      <line x1="2" y1="3.5" x2="14" y2="3.5" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12.5" x2="14" y2="12.5" />
      <rect x="2" y="2.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
      <rect x="2" y="11.4" width="2.2" height="2.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** An exercise brief: a sheet with steps. */
export function IconBrief(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="1.5" width="11" height="13" />
      <line x1="5" y1="5" x2="11" y2="5" />
      <line x1="5" y1="8" x2="11" y2="8" />
      <line x1="5" y1="11" x2="9" y2="11" />
    </Svg>
  )
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 8.5l3.6 3.6L13.5 4" />
    </Svg>
  )
}

export function IconChevron({
  dir = 'right',
  ...p
}: IconProps & { dir?: 'right' | 'left' | 'down' | 'up' }) {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir]
  return (
    <Svg {...p} className={cn(p.className)}>
      <g transform={`rotate(${rot} 8 8)`}>
        <path d="M6 3l5 5-5 5" />
      </g>
    </Svg>
  )
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.4" y1="10.4" x2="14.5" y2="14.5" />
    </Svg>
  )
}

export function IconUpload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 11V2.5" />
      <path d="M4.6 5.6L8 2.2l3.4 3.4" />
      <path d="M2.5 10.5v3h11v-3" />
    </Svg>
  )
}

