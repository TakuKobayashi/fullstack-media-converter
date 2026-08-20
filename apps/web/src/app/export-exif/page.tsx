import ExifClient from './client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('exif', 'en');

export default function ExifPage() {
  return (
    <>
      <ToolStructuredData tool="exif" locale="en" />
      <ExifClient />
    </>
  );
}
