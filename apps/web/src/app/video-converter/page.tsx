import type { Metadata } from 'next';
import VideoConverterClient from './client';

export const metadata: Metadata = {
  title: 'Universal Video Converter — Bulk MOV/MP4/GIF Converter',
  description: 'Convert MOV and MP4 videos in bulk on one page. Pick MP4, MOV, or GIF as the target and convert every file at once. Powered by FFmpeg WebAssembly — no uploads.',
  keywords: ['video converter', 'mov to mp4', 'mp4 to gif', 'bulk video converter', 'ffmpeg wasm'],
};

export default function VideoConverterPage() {
  return <VideoConverterClient />;
}
