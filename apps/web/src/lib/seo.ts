import type { Metadata } from 'next';
import { createElement } from 'react';
import {
  AUDIO_INPUT_FORMAT_LABELS,
  AUDIO_OUTPUT_FORMATS,
  IMAGE_INPUT_FORMAT_LABELS,
  MODEL3D_INPUT_FORMAT_LABELS,
  MODEL3D_OUTPUT_FORMATS,
  VIDEO_INPUT_FORMAT_LABELS,
  VIDEO_OUTPUT_FORMATS,
} from '@convertmate/shared';

const imageFormatsEn = IMAGE_INPUT_FORMAT_LABELS.join(', ');
const imageFormatsJa = IMAGE_INPUT_FORMAT_LABELS.join('、');
const videoInputsEn = VIDEO_INPUT_FORMAT_LABELS.join(', ');
const videoInputsJa = VIDEO_INPUT_FORMAT_LABELS.join('、');
const videoOutputsEn = VIDEO_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join(', ');
const videoOutputsJa = VIDEO_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join('・');
const audioInputsEn = AUDIO_INPUT_FORMAT_LABELS.join(', ');
const audioInputsJa = AUDIO_INPUT_FORMAT_LABELS.join('、');
const audioOutputsEn = AUDIO_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join(', ');
const audioOutputsJa = AUDIO_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join('・');
const model3dInputsEn = MODEL3D_INPUT_FORMAT_LABELS.join(', ');
const model3dInputsJa = MODEL3D_INPUT_FORMAT_LABELS.join('、');
const model3dOutputsEn = MODEL3D_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join(', ');
const model3dOutputsJa = MODEL3D_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join('・');

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
      description: `Convert ${imageFormatsEn} images in bulk. Private, local browser processing.`,
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
      title: `無料画像変換ツール｜HEIC・TIFF・PSDなど${IMAGE_INPUT_FORMAT_LABELS.length}形式に対応`,
      description: `${imageFormatsJa}画像を無料で一括変換。アップロード不要で安全に処理します。`,
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
      description: `Convert ${videoInputsEn} videos to ${videoOutputsEn} with FFmpeg WebAssembly. Private browser processing with no uploads.`,
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
      title: `無料動画変換ツール｜MP4・WebM・MKVなど${VIDEO_INPUT_FORMAT_LABELS.length}形式に対応`,
      description: `${videoInputsJa}を${videoOutputsJa}へ無料で変換。動画をアップロードせず、ブラウザ内のFFmpegで処理します。`,
      imageAlt: '複数の動画フレームを別形式へ変換するイメージ',
      keywords: ['動画変換', '動画変換 無料', 'MOV MP4 変換', 'WebM MKV 変換', '動画 一括変換'],
    },
  },
  audio: {
    path: '/audio-converter',
    image: '/og/video-converter.png',
    en: {
      title: 'Free Audio Converter — MP3, WAV, FLAC, AAC & More',
      description: `Convert ${audioInputsEn} audio to ${audioOutputsEn} privately in your browser with FFmpeg WebAssembly.`,
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
      title: `無料音声変換ツール｜MP3・WAV・FLACなど${AUDIO_INPUT_FORMAT_LABELS.length}形式に対応`,
      description: `${audioInputsJa}を${audioOutputsJa}へ無料で一括変換。アップロード不要でブラウザ内処理します。`,
      imageAlt: '音声波形を別のファイル形式へ変換するイメージ',
      keywords: ['音声変換', 'MP3 変換', 'WAV FLAC 変換', '音声 一括変換', '音声変換 無料'],
    },
  },
  model3d: {
    path: '/model3d-converter',
    image: '/og/home.png',
    en: {
      title: 'Free Static 3D Model Converter — FBX, OBJ, GLB & More',
      description: `Convert ${model3dInputsEn} static models to ${model3dOutputsEn} privately in your browser. Animation and bones are removed.`,
      imageAlt: 'Static 3D models being converted between file formats',
      keywords: [
        '3D model converter',
        'FBX to GLB',
        'OBJ to GLB',
        'static model converter',
        'Three.js converter',
      ],
    },
    ja: {
      title: '無料3Dモデル変換ツール｜FBX・OBJ・GLBなどに対応',
      description: `${model3dInputsJa}の静的モデルを${model3dOutputsJa}へ無料変換。アニメーションとボーンを除外し、ブラウザ内で処理します。`,
      imageAlt: '静的3Dモデルを別のファイル形式へ変換するイメージ',
      keywords: ['3Dモデル変換', 'FBX GLB 変換', 'OBJ GLB 変換', '静的モデル変換', 'Three.js 変換'],
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
  const canonical = routeFor(tool, locale);
  const imageUrl = url(tools[tool].image);
  return {
    title: content.title,
    description: content.description,
    keywords: [...content.keywords],
    alternates: {
      canonical: url(canonical),
      languages: {
        'en-US': url(routeFor(tool, 'en')),
        'ja-JP': url(routeFor(tool, 'ja')),
        'x-default': url(routeFor(tool, 'en')),
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

const faq = {
  image: {
    en: [
      ['Are files uploaded to a server?', 'No. Image conversion runs entirely in your browser.'],
      ['Which image formats are supported?', `${imageFormatsEn} input files are supported.`],
      [
        'Can I convert multiple images at once?',
        'Yes. Add mixed image formats and convert the whole batch to one output format.',
      ],
    ],
    ja: [
      [
        '画像はサーバーへアップロードされますか？',
        'いいえ。画像変換はすべてブラウザ内で実行されます。',
      ],
      ['どの画像形式に対応していますか？', `${imageFormatsJa}の入力に対応しています。`],
      [
        '複数の画像を一括変換できますか？',
        'はい。異なる画像形式をまとめて追加し、指定した形式へ一括変換できます。',
      ],
    ],
  },
  video: {
    en: [
      ['Are videos uploaded?', 'No. FFmpeg WebAssembly processes videos locally in your browser.'],
      [
        'Which conversions are supported?',
        `${videoInputsEn} input is supported, with ${videoOutputsEn} output.`,
      ],
      [
        'Why is the first conversion slower?',
        'The browser downloads and initializes FFmpeg before the first conversion.',
      ],
    ],
    ja: [
      [
        '動画はアップロードされますか？',
        'いいえ。WebAssembly版FFmpegがブラウザ内で動画を処理します。',
      ],
      [
        'どの動画変換に対応していますか？',
        `${videoInputsJa}の入力と、${videoOutputsJa}の出力に対応しています。`,
      ],
      [
        '初回の変換に時間がかかるのはなぜですか？',
        '最初の変換前にブラウザがFFmpegを読み込み、初期化するためです。',
      ],
    ],
  },
  audio: {
    en: [
      [
        'Are audio files uploaded?',
        'No. FFmpeg WebAssembly processes audio locally in your browser.',
      ],
      [
        'Which formats are supported?',
        `${audioInputsEn} input and ${audioOutputsEn} output are supported.`,
      ],
      [
        'Can I convert multiple files?',
        'Yes. Mixed audio formats can be converted together and downloaded as a ZIP.',
      ],
    ],
    ja: [
      [
        '音声ファイルはアップロードされますか？',
        'いいえ。WebAssembly版FFmpegがブラウザ内で音声を処理します。',
      ],
      [
        'どの形式に対応していますか？',
        `${audioInputsJa}の入力と${audioOutputsJa}の出力に対応しています。`,
      ],
      [
        '複数ファイルを変換できますか？',
        'はい。異なる音声形式をまとめて変換し、ZIPで保存できます。',
      ],
    ],
  },
  model3d: {
    en: [
      ['Are models uploaded?', 'No. Three.js processes models locally in your browser.'],
      [
        'Which data is removed?',
        'Animations, bones, and skinning data are removed. Skinned geometry is baked into its current static pose.',
      ],
      [
        'Which formats are supported?',
        `${model3dInputsEn} input and ${model3dOutputsEn} output are supported.`,
      ],
    ],
    ja: [
      [
        '3Dモデルはアップロードされますか？',
        'いいえ。Three.jsがブラウザ内で3Dモデルを処理します。',
      ],
      [
        'どの情報が除外されますか？',
        'アニメーション、ボーン、スキニング情報を除外し、形状を現在の静的な姿勢へ焼き込みます。',
      ],
      [
        'どの形式に対応していますか？',
        `${model3dInputsJa}の入力と${model3dOutputsJa}の出力に対応しています。`,
      ],
    ],
  },
  exif: {
    en: [
      [
        'What EXIF data can I view?',
        'Available camera, lens, exposure, timestamp and GPS metadata can be extracted.',
      ],
      [
        'Can I export multiple files?',
        'Yes. Metadata from multiple images can be exported as JSON files.',
      ],
      ['Are photos uploaded?', 'No. EXIF extraction runs locally in your browser.'],
    ],
    ja: [
      [
        'どのEXIF情報を確認できますか？',
        'ファイルに含まれるカメラ、レンズ、露出、撮影日時、GPSなどの情報を抽出できます。',
      ],
      [
        '複数ファイルを一括書き出しできますか？',
        'はい。複数画像のメタデータをJSONファイルとして書き出せます。',
      ],
      ['写真はアップロードされますか？', 'いいえ。EXIF抽出はブラウザ内で実行されます。'],
    ],
  },
} as const;

export function ToolStructuredData({ tool, locale }: { tool: ToolName; locale: SeoLocale }) {
  const content = tools[tool][locale];
  const pageUrl = routeFor(tool, locale);
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: content.title,
        description: content.description,
        applicationCategory: tool === 'image' ? 'MultimediaApplication' : 'UtilitiesApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        url: url(pageUrl),
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq[tool][locale].map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };
  return createElement('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, '\\u003c') },
  });
}
