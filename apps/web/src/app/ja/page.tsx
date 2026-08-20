import type { Metadata } from 'next';
import HomePage from '../page';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: '画像・動画を無料で一括変換｜アップロード不要',
  description: '画像と動画をアップロードせずブラウザ内で無料変換。JPG、PNG、WebP、HEIC、AVIF、MOV、MP4、GIFに対応しています。',
  alternates: {
    canonical: `${SITE_URL}/ja`,
    languages: { 'en-US': SITE_URL, 'ja-JP': `${SITE_URL}/ja`, 'x-default': SITE_URL },
  },
};

export default HomePage;
