'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/i18n';

export default function LocaleDocument() {
  const { i18n } = useTranslation();
  const pathname = usePathname().replace(/\/$/, '') || '/';

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
  }, [i18n.resolvedLanguage]);

  return null;
}
