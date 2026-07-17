import type { Metadata } from 'next';
import ToolClient from './client';
export const metadata: Metadata = { title: '<em>PNG to JPG</em> Converter — Free Bulk Converter', description: 'Compress PNG files to smaller JPEG format. Batch convert entire folders at once.' };
export default function Page() { return <ToolClient />; }
