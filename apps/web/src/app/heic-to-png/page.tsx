import type { Metadata } from 'next';
import ToolClient from './client';
export const metadata: Metadata = { title: '<em>HEIC to PNG</em> Converter — Free Bulk Converter', description: 'Convert iPhone HEIC photos to PNG with transparency support.' };
export default function Page() { return <ToolClient />; }
