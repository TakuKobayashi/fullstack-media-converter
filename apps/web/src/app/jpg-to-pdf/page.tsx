import type { Metadata } from 'next';
import ToolClient from './client';
export const metadata: Metadata = { title: '<em>JPG to PDF</em> Converter — Free Bulk Converter', description: 'Combine or convert JPG images into PDF documents in your browser.' };
export default function Page() { return <ToolClient />; }
