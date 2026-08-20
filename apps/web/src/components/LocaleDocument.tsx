'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n';

const TITLE_KEYS: Record<string, string> = { '/': 'titles.home', '/image-converter': 'titles.image', '/video-converter': 'titles.video', '/export-exif': 'titles.exif' };

export default function LocaleDocument() {
  const { i18n, t } = useTranslation();
  const pathname = usePathname().replace(/\/$/, '') || '/';

  useEffect(() => {
    const detected = i18n.services.languageDetector?.detect();
    const preferredLanguage = Array.isArray(detected) ? detected[0] : detected;
    if (preferredLanguage) void i18n.changeLanguage(preferredLanguage);
  }, [i18n]);

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage === 'ja' ? 'ja' : 'en';
    document.title = t(TITLE_KEYS[pathname] ?? TITLE_KEYS['/']);
  }, [i18n.resolvedLanguage, pathname, t]);

  return null;
}
