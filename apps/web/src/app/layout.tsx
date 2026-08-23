import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import SwRegister from '@/components/SwRegister';
import LocaleDocument from '@/components/LocaleDocument';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Free Browser File Converter — Image, Video, Audio & 3D',
    template: '%s | Fullstack Media Converter',
  },
  description:
    'Convert images, videos, audio, and 3D models in your browser without uploading files to a server. No registration or watermarks.',
  keywords: [
    'bulk image converter',
    'video converter',
    'batch convert',
    'audio converter',
    '3D model converter',
    'private file converter',
    'free converter',
  ],
  alternates: {
    canonical: `${SITE_URL}/`,
    languages: { 'en-US': `${SITE_URL}/`, 'ja-JP': `${SITE_URL}/ja/`, 'x-default': `${SITE_URL}/` },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: `${SITE_URL}/`,
    siteName: 'Fullstack Media Converter',
    title: 'Free Browser File Converter — Image, Video, Audio & 3D',
    description:
      'Convert images, videos, audio, and 3D models in your browser without uploading files to a server.',
    images: [
      {
        url: `${SITE_URL}/og/home.png`,
        width: 1536,
        height: 864,
        alt: 'Image, video, audio, and 3D model conversion in the browser',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Browser File Converter — Image, Video, Audio & 3D',
    description:
      'Convert images, videos, audio, and 3D models without uploading files to a server.',
    images: [`${SITE_URL}/og/home.png`],
  },
  manifest: '/manifest.json',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
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
