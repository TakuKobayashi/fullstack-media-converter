import type { Metadata } from 'next';
import HomePage from '../page';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: '画像・動画を無料で一括変換｜アップロード不要',
  description:
    '画像と動画をアップロードせずブラウザ内で無料変換。JPG、PNG、WebP、HEIC、AVIF、MOV、MP4、GIFに対応しています。',
  alternates: {
    canonical: `${SITE_URL}/ja`,
    languages: { 'en-US': SITE_URL, 'ja-JP': `${SITE_URL}/ja`, 'x-default': SITE_URL },
  },
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: `${SITE_URL}/ja/`,
    siteName: 'Fullstack Media Converter',
    title: '画像・動画を無料で一括変換｜アップロード不要',
    description:
      '画像と動画をアップロードせずブラウザ内で無料変換。JPG、PNG、WebP、HEIC、AVIF、MOV、MP4、GIFに対応しています。',
    images: [
      {
        url: `${SITE_URL}/og/home.png`,
        width: 1536,
        height: 864,
        alt: '画像・動画・メタデータをブラウザ内で変換するイメージ',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '画像・動画を無料で一括変換｜アップロード不要',
    description: '画像と動画をアップロードせずブラウザ内で無料変換できます。',
    images: [`${SITE_URL}/og/home.png`],
  },
};

export default HomePage;
