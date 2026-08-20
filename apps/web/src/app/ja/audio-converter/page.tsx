import AudioConverterClient from '../../audio-converter/client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('audio', 'ja');

export default function JapaneseAudioConverterPage() {
  return <><ToolStructuredData tool="audio" locale="ja" /><AudioConverterClient /></>;
}
