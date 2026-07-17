import type { Metadata } from 'next';
import ToolClient from './client';
export const metadata: Metadata = { title: '<em>AVIF to JPG</em> Converter — Free Bulk Converter', description: 'Convert modern AVIF images to widely-supported JPEG in bulk.' };
export default function Page() { return <ToolClient />; }
