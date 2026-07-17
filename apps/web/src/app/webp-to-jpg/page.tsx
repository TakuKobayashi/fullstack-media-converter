import type { Metadata } from 'next';
import WebpToJpgClient from './client';

export const metadata: Metadata = {
  title: 'WebP to JPG Converter — Bulk, Free, In-Browser',
  description: 'Convert hundreds of WebP images to JPG instantly in your browser. No upload required. Free bulk WebP to JPEG converter with ZIP download.',
  keywords: ['webp to jpg', 'webp to jpeg', 'bulk webp converter', 'convert webp online free'],
};

export default function WebpToJpgPage() {
  return <WebpToJpgClient />;
}
