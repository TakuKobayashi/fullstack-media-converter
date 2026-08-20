import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import SwRegister from '@/components/SwRegister';
import LocaleDocument from '@/components/LocaleDocument';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Fullstack Media Converter — Private Image & Video Converter', template: '%s | Fullstack Media Converter' },
  description: 'Convert images and videos in bulk — entirely in your browser. No uploads, no server, 100% private.',
  keywords: ['bulk image converter', 'video converter', 'batch convert', 'private file converter', 'free converter'],
  openGraph: {
    type: 'website',
    siteName: 'Fullstack Media Converter',
    title: 'Fullstack Media Converter — Private Image & Video Converter',
    description: 'Convert image and video batches locally. Works offline. No uploads.',
    images: [{ url: `${SITE_URL}/og/home.png`, width: 1536, height: 864, alt: 'Image, video and metadata conversion in one private browser tool', type: 'image/png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fullstack Media Converter — Private Image & Video Converter',
    description: 'Convert image and video batches locally. Works offline. No uploads.',
    images: [`${SITE_URL}/og/home.png`],
  },
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0D1117',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        <LocaleDocument />
        {children}
      </body>
    </html>
  );
}
