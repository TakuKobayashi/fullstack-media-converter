'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n';

const TITLE_KEYS: Record<string, string> = {
  '/': 'titles.home',
  '/image-converter': 'titles.image',
  '/video-converter': 'titles.video',
  '/export-exif': 'titles.exif',
};

export default function LocaleDocument() {
  const { i18n, t } = useTranslation();
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const canonicalPath = pathname.replace(/^\/ja(?=\/|$)/, '') || '/';

  useEffect(() => {
    if (pathname === '/ja' || pathname.startsWith('/ja/')) {
      void i18n.changeLanguage('ja');
      return;
    }
    const detected = i18n.services.languageDetector?.detect();
    const preferredLanguage = Array.isArray(detected) ? detected[0] : detected;
    if (preferredLanguage) void i18n.changeLanguage(preferredLanguage);
  }, [i18n, pathname]);

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage === 'ja' ? 'ja' : 'en';
    document.title = t(TITLE_KEYS[canonicalPath] ?? TITLE_KEYS['/']);
  }, [canonicalPath, i18n.resolvedLanguage, t]);

  return null;
}
