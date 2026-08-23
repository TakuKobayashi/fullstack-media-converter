import type { Metadata } from 'next';
import { createElement } from 'react';

export type ToolName = 'image' | 'video' | 'audio' | 'model3d' | 'exif';
export type SeoLocale = 'en' | 'ja';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fullstack-media-converter.taptappun.workers.dev'
).replace(/\/$/, '');

const tools = {
  image: {
    path: '/image-converter',
    image: '/og/image-converter.png',
    en: {
      title: 'Free Image Converter — JPG, HEIC, TIFF, PSD & More',
      description:
        'Convert JPG, PNG, WebP, HEIC, TIFF, PSD, and other image formats in bulk. Files are processed in your browser without server uploads.',
      imageAlt: 'Abstract image files transforming between formats',
      keywords: [
        'free image converter',
        'bulk image converter',
        'JPG PNG WebP converter',
        'HEIC converter',
        'TIFF PSD converter',
      ],
    },
    ja: {
      title: '無料画像変換ツール｜JPG・PNG・HEIC・PSDなどを一括変換',
      description:
        'JPG、PNG、WebP、HEIC、TIFF、PSDなどの画像を無料で一括変換。サーバーへアップロードせず、ブラウザ内で処理します。',
      imageAlt: '複数の画像ファイルを別形式へ変換するイメージ',
      keywords: [
        '画像変換',
        '画像変換 無料',
        '画像 一括変換',
        'WebP JPG 変換',
        'HEIC TIFF PSD 変換',
      ],
    },
  },
  video: {
    path: '/video-converter',
    image: '/og/video-converter.png',
    en: {
      title: 'Free Video Converter — MP4, WebM, MKV, AVI & More',
      description:
        'Convert MP4, MOV, WebM, MKV, AVI, and other videos with FFmpeg WebAssembly. Files are processed in your browser without server uploads.',
      imageAlt: 'Abstract video frames transforming into a playback file',
      keywords: [
        'free video converter',
        'MOV to MP4',
        'WebM MKV converter',
        'MP4 to GIF',
        'bulk video converter',
      ],
    },
    ja: {
      title: '無料動画変換ツール｜MP4・MOV・WebM・MKVなどに対応',
      description:
        'MP4、MOV、WebM、MKV、AVIなどの動画を無料変換。サーバーへアップロードせず、ブラウザ内のFFmpegで処理します。',
      imageAlt: '複数の動画フレームを別形式へ変換するイメージ',
      keywords: ['動画変換', '動画変換 無料', 'MOV MP4 変換', 'WebM MKV 変換', '動画 一括変換'],
    },
  },
  audio: {
    path: '/audio-converter',
    image: '/og/video-converter.png',
    en: {
      title: 'Free Audio Converter — MP3, WAV, FLAC, AAC & More',
      description:
        'Convert MP3, WAV, FLAC, AAC, and other audio formats in bulk with FFmpeg WebAssembly. Files are processed without server uploads.',
      imageAlt: 'Audio waveforms being converted between file formats',
      keywords: [
        'free audio converter',
        'MP3 converter',
        'WAV FLAC converter',
        'audio batch converter',
        'private audio converter',
      ],
    },
    ja: {
      title: '無料音声変換ツール｜MP3・WAV・FLAC・AACなどに対応',
      description:
        'MP3、WAV、FLAC、AACなどの音声を無料で一括変換。サーバーへアップロードせず、ブラウザ内のFFmpegで処理します。',
      imageAlt: '音声波形を別のファイル形式へ変換するイメージ',
      keywords: ['音声変換', 'MP3 変換', 'WAV FLAC 変換', '音声 一括変換', '音声変換 無料'],
    },
  },
  model3d: {
    path: '/model3d-converter',
    image: '/og/home.png',
    en: {
      title: 'Free 3D Model Converter — FBX, OBJ, GLB, VRM & More',
      description:
        'Convert FBX, OBJ, GLB, glTF, VRM, PMX, and other 3D models in your browser, with preview and related-file support. No server upload required.',
      imageAlt: '3D models being converted between file formats',
      keywords: [
        '3D model converter',
        'FBX to GLB',
        'OBJ to GLB',
        'VRM converter',
        'Three.js converter',
      ],
    },
    ja: {
      title: '無料3Dモデル変換ツール｜FBX・OBJ・GLBなどに対応',
      description:
        'FBX、OBJ、GLB、glTF、VRM、PMXなどの3Dモデルを無料変換。プレビューと関連ファイルに対応し、サーバーへアップロードせず処理します。',
      imageAlt: '3Dモデルを別のファイル形式へ変換するイメージ',
      keywords: ['3Dモデル変換', 'FBX GLB 変換', 'OBJ GLB 変換', 'VRM 変換', 'Three.js 変換'],
    },
  },
  exif: {
    path: '/export-exif',
    image: '/og/exif-export.png',
    en: {
      title: 'Free EXIF Viewer & Bulk Metadata Export',
      description:
        'View EXIF metadata from JPG, PNG, WebP, HEIC and AVIF photos and export multiple records as JSON. No upload required.',
      imageAlt: 'Photo metadata being extracted into organized data fields',
      keywords: [
        'EXIF viewer',
        'EXIF extractor',
        'photo metadata viewer',
        'bulk EXIF export',
        'EXIF JSON',
      ],
    },
    ja: {
      title: 'EXIF情報確認・一括抽出ツール｜JSON書き出し無料',
      description:
        'JPG、PNG、WebP、HEIC、AVIF画像のEXIF情報を確認し、複数ファイルのメタデータをJSONへ無料で一括書き出しできます。',
      imageAlt: '写真からEXIFメタデータを抽出するイメージ',
      keywords: ['EXIF 確認', 'EXIF 抽出', '画像 メタデータ', 'EXIF JSON', 'EXIF 一括'],
    },
  },
} as const;

export function routeFor(tool: ToolName, locale: SeoLocale) {
  return `${locale === 'ja' ? '/ja' : ''}${tools[tool].path}`;
}

function url(path: string) {
  return `${SITE_URL}${path}`;
}

export function createToolMetadata(tool: ToolName, locale: SeoLocale): Metadata {
  const content = tools[tool][locale];
  const canonical = `${routeFor(tool, locale)}/`;
  const imageUrl = url(tools[tool].image);
  return {
    title: content.title,
    description: content.description,
    keywords: [...content.keywords],
    alternates: {
      canonical: url(canonical),
      languages: {
        'en-US': url(`${routeFor(tool, 'en')}/`),
        'ja-JP': url(`${routeFor(tool, 'ja')}/`),
        'x-default': url(`${routeFor(tool, 'en')}/`),
      },
    },
    openGraph: {
      type: 'website',
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
      url: url(canonical),
      title: content.title,
      description: content.description,
      siteName: 'Fullstack Media Converter',
      images: [
        { url: imageUrl, width: 1536, height: 864, alt: content.imageAlt, type: 'image/png' },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: content.title,
      description: content.description,
      images: [imageUrl],
    },
  };
}

export function ToolStructuredData({ tool, locale }: { tool: ToolName; locale: SeoLocale }) {
  const content = tools[tool][locale];
  const pageUrl = `${routeFor(tool, locale)}/`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: content.title,
    description: content.description,
    applicationCategory: tool === 'image' ? 'MultimediaApplication' : 'UtilitiesApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    url: url(pageUrl),
  };
  return createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, '\\u003c') },
  });
}
