import type { MetadataRoute } from 'next'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — progress tracking for skill-based teaching`,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: '/studio',
    display: 'standalone',
    background_color: '#e9e4d9',
    theme_color: '#e9e4d9',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
