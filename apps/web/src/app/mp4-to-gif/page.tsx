import type { Metadata } from 'next';
import ToolClient from './client';
export const metadata: Metadata = { title: '<em>MP4 to GIF</em> Converter — Free Bulk Converter', description: 'Create optimised animated GIFs from MP4 video clips using FFmpeg WebAssembly.' };
export default function Page() { return <ToolClient />; }
