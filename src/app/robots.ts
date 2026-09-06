import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/demo'],
        // The studio is an instructor's own record of their students. It is
        // behind a session anyway; there is no reason for it to be crawled.
        disallow: ['/studio/', '/calibrate', '/onboarding', '/login', '/api/'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
