import ExifClient from '../../export-exif/client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('exif', 'ja');

export default function JapaneseExifPage() {
  return <><ToolStructuredData tool="exif" locale="ja" /><ExifClient /></>;
}
