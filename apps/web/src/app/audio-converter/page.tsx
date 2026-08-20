import AudioConverterClient from './client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('audio', 'en');

export default function AudioConverterPage() {
  return (
    <>
      <ToolStructuredData tool="audio" locale="en" />
      <AudioConverterClient />
    </>
  );
}
