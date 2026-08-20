import ImageConverterClient from '../../image-converter/client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('image', 'ja');

export default function JapaneseImageConverterPage() {
  return <><ToolStructuredData tool="image" locale="ja" /><ImageConverterClient /></>;
}
