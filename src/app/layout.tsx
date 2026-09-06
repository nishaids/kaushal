import type { Metadata, Viewport } from 'next'
import { Archivo, Newsreader } from 'next/font/google'
import './globals.css'
import { APP_NAME, APP_TAGLINE } from '@/lib/constants'
import { siteUrl } from '@/lib/site'

/**
 * Two families, each with a job.
 *
 * Archivo is the instrument: numbers, labels, navigation, actions. It has a
 * width axis, which lets the display sizes get wider rather than merely bigger.
 * Newsreader is the language: rationales, briefs, parent reports, prose. When
 * you are reading a measurement you are reading Archivo; when you are reading a
 * judgement you are reading Newsreader. The distinction is load-bearing.
 */
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-newsreader',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: '/' },
  title: {
    default: `${APP_NAME} — progress tracking for skill-based teaching`,
    template: `%s — ${APP_NAME}`,
  },
  description:
    'KAUSHAL tracks how a student in an art, craft or vocational programme is actually improving, one photographed work at a time. The instructor confirms every score.',
  applicationName: APP_NAME,
  openGraph: {
    title: `${APP_NAME} — progress tracking for skill-based teaching`,
    description: APP_TAGLINE,
    type: 'website',
    siteName: APP_NAME,
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — progress tracking for skill-based teaching`,
    description: APP_TAGLINE,
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#e9e4d9',
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-IN" className={`${archivo.variable} ${newsreader.variable}`}>
      <body className="min-h-dvh bg-v1 text-v7 antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
