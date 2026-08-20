import VideoConverterClient from '../../video-converter/client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('video', 'ja');

export default function JapaneseVideoConverterPage() {
  return (
    <>
      <ToolStructuredData tool="video" locale="ja" />
      <VideoConverterClient />
    </>
  );
}
