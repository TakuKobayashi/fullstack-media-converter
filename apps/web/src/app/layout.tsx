import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import SwRegister from '@/components/SwRegister';

export const metadata: Metadata = {
  title: { default: 'Fullstack Media Converter — Private Image & Video Converter', template: '%s | Fullstack Media Converter' },
  description: 'Convert images and videos in bulk — entirely in your browser. No uploads, no server, 100% private.',
  keywords: ['bulk image converter', 'video converter', 'batch convert', 'private file converter', 'free converter'],
  openGraph: {
    type: 'website',
    siteName: 'Fullstack Media Converter',
    title: 'Fullstack Media Converter — Private Image & Video Converter',
    description: 'Convert image and video batches locally. Works offline. No uploads.',
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
        {children}
      </body>
    </html>
  );
}
