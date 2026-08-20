'use client';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next, useTranslation as useReactI18next } from 'react-i18next';
import { messages } from '@/i18n/messages';

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: messages.en },
        ja: { translation: messages.ja },
      },
      supportedLngs: ['en', 'ja'],
      fallbackLng: 'en',
      lng: 'en',
      load: 'languageOnly',
      interpolation: { escapeValue: false },
      detection: {
        order: ['navigator'],
        caches: [],
      },
      react: { useSuspense: false },
    });
}

export function useTranslation() {
  const translation = useReactI18next();
  const locale = translation.i18n.resolvedLanguage === 'ja' ? 'ja' : 'en';
  return { ...translation, locale } as const;
}

export { i18n };
