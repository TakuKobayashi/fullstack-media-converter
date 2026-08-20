import ImageConverterClient from './client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('image', 'en');

export default function ImageConverterPage() {
  return <><ToolStructuredData tool="image" locale="en" /><ImageConverterClient /></>;
}
