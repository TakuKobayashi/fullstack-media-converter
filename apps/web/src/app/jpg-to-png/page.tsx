import type { Metadata } from 'next';
import ToolClient from './client';
export const metadata: Metadata = { title: '<em>JPG to PNG</em> Converter — Free Bulk Converter', description: 'Convert JPEG photos to lossless PNG. Entire folders, nothing uploaded.' };
export default function Page() { return <ToolClient />; }
