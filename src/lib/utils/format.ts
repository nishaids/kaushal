/** Formatting helpers. All dates render in en-IN — this product is Chennai-first. */

const DAY = 86_400_000

export function shortDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function longDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function monthYear(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

/** "3 days ago", "today". Never "0 days ago". */
export function relativeDays(iso: string | Date, now: Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return '—'
  const days = Math.floor((now.getTime() - d.getTime()) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const x = typeof a === 'string' ? new Date(a) : a
  const y = typeof b === 'string' ? new Date(b) : b
  return Math.round((y.getTime() - x.getTime()) / DAY)
}

/** Scores render as integers. A "7" is a 7, not a 7.0. */
export function score(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return String(Math.round(n))
}

/** Slopes render signed, to two decimals, with the unit implied by context. */
export function slope(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const v = Math.abs(n) < 0.005 ? 0 : n
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`
}

export function delta(from: number, to: number): string {
  const d = to - from
  if (Math.abs(d) < 0.05) return 'no change'
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Bytes for the upload UI. */
export function kb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
