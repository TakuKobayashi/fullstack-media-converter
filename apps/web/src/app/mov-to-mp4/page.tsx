import type { Metadata } from 'next';
import MovToMp4Client from './client';

export const metadata: Metadata = {
  title: 'MOV to MP4 Converter — Bulk, Free, Browser-Based',
  description: 'Convert QuickTime MOV videos to MP4 in bulk, directly in your browser using WebAssembly. No upload, no server.',
  keywords: ['mov to mp4', 'convert mov to mp4', 'bulk video converter', 'quicktime to mp4'],
};

export default function MovToMp4Page() {
  return <MovToMp4Client />;
}
