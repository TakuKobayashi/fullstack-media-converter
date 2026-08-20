'use client';

import { useState, type ReactNode } from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { messages } from '@/i18n/messages';

export default function I18nProvider({
  locale,
  children,
}: {
  locale: 'en' | 'ja';
  children: ReactNode;
}) {
  const [instance] = useState(() => {
    const nextInstance = createInstance();
    void nextInstance.use(initReactI18next).init({
      resources: { en: { translation: messages.en }, ja: { translation: messages.ja } },
      supportedLngs: ['en', 'ja'],
      fallbackLng: 'en',
      lng: locale,
      initAsync: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    return nextInstance;
  });

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
