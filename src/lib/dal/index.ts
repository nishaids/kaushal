import 'server-only'
import type { DataDriver } from './types'

export type { DataDriver, ProposedScoreInput, CalibrationAnchor } from './types'

/**
 * Driver selection.
 *
 * KAUSHAL runs on Supabase when it is configured and on an equivalent local
 * driver when it is not. This is not a stub: the local driver implements the
 * whole contract, including alert sync semantics and the demo reset. It is the
 * reason the product can be cloned and run — or demoed on a bad conference
 * wifi — without a single credential.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

let cached: DataDriver | null = null

export async function db(): Promise<DataDriver> {
  if (cached) return cached
  if (isSupabaseConfigured()) {
    const { createSupabaseDriver } = await import('./supabase')
    cached = createSupabaseDriver()
  } else {
    const { createLocalDriver } = await import('./local')
    cached = createLocalDriver()
  }
  return cached
}

/** Which driver is live. Rendered in the settings screen, never hidden. */
export async function driverName(): Promise<'supabase' | 'local'> {
  return (await db()).name
}
