import type { Metadata } from 'next';
import HeicToJpgClient from './client';

export const metadata: Metadata = {
  title: 'HEIC to JPG Converter — Bulk iPhone Photo Converter',
  description: 'Convert iPhone HEIC photos to JPG in bulk, free, entirely in your browser. No upload. Supports hundreds of files at once.',
  keywords: ['heic to jpg', 'heic to jpeg', 'iphone photo converter', 'bulk heic converter', 'convert heic online'],
};

export default function HeicToJpgPage() {
  return <HeicToJpgClient />;
}
