import type { ReactNode } from 'react';
import I18nProvider from '@/components/I18nProvider';

export default function JapaneseLayout({ children }: { children: ReactNode }) {
  return <I18nProvider locale="ja">{children}</I18nProvider>;
}
