import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import SwRegister from '@/components/SwRegister';

export const metadata: Metadata = {
  title: { default: 'ConvertMate — Bulk File Converter', template: '%s | ConvertMate' },
  description: 'Convert hundreds of images, videos and documents at once — entirely in your browser. No uploads, no server, 100% private.',
  keywords: ['bulk image converter', 'webp to jpg', 'heic to jpg', 'mov to mp4', 'batch convert', 'free converter'],
  openGraph: {
    type: 'website',
    siteName: 'ConvertMate',
    title: 'ConvertMate — Bulk File Converter',
    description: 'Convert hundreds of files at once. Works offline. No uploads.',
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
