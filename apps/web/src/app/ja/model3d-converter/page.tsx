import Model3dConverterClient from '../../model3d-converter/client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('model3d', 'ja');

export default function JapaneseModel3dConverterPage() {
  return (
    <>
      <ToolStructuredData tool="model3d" locale="ja" />
      <Model3dConverterClient />
    </>
  );
}
