/**
 * Where this deployment lives.
 *
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL on production builds, which means
 * canonical URLs, the sitemap and the social card are right without anybody
 * remembering to set a variable. NEXT_PUBLIC_SITE_URL overrides it for a custom
 * domain, and localhost is the fallback so a local build is not lying.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`

  return 'http://localhost:3000'
}
