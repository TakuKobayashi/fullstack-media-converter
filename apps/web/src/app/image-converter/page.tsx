import type { Metadata } from 'next';
import ImageConverterClient from './client';

export const metadata: Metadata = {
  title: 'Universal Image Converter — Bulk Convert Any Format',
  description: 'Convert JPG, PNG, WebP, HEIC, AVIF and GIF images in bulk on one page. Auto-detects each file\'s format, pick one output format, convert everything at once. No uploads.',
  keywords: ['image converter', 'bulk image converter', 'universal converter', 'jpg png webp heic converter', 'batch image conversion'],
};

export default function ImageConverterPage() {
  return <ImageConverterClient />;
}
