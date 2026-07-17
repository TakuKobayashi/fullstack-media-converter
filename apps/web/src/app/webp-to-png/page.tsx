import type { Metadata } from 'next';
import ToolClient from './client';
export const metadata: Metadata = { title: '<em>WebP to PNG</em> Converter — Free Bulk Converter', description: 'Convert WebP images to lossless PNG in bulk — perfect for images that need transparency.' };
export default function Page() { return <ToolClient />; }
