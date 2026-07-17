import type { Metadata } from 'next';
import ExifClient from './client';

export const metadata: Metadata = {
  title: 'EXIF Data Viewer & Bulk Export — Free Online Tool',
  description: 'View and export EXIF metadata from photos in bulk. Download as JSON. Works for JPG, PNG, WebP, HEIC. No upload required.',
  keywords: ['exif viewer', 'exif export', 'bulk exif', 'photo metadata', 'exif to json'],
};

export default function ExifPage() {
  return <ExifClient />;
}
