import Model3dConverterClient from './client';
import { createToolMetadata, ToolStructuredData } from '@/lib/seo';

export const metadata = createToolMetadata('model3d', 'en');

export default function Model3dConverterPage() {
  return (
    <>
      <ToolStructuredData tool="model3d" locale="en" />
      <Model3dConverterClient />
    </>
  );
}
