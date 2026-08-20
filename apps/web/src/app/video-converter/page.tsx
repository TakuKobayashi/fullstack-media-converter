import VideoConverterClient from './client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('video', 'en');

export default function VideoConverterPage() {
  return (
    <>
      <ToolStructuredData tool="video" locale="en" />
      <VideoConverterClient />
    </>
  );
}
