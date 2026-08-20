'use client';

import { usePathname } from 'next/navigation';

export function useLocalizedPath() {
  const isJapanese = usePathname().startsWith('/ja');
  return (path: string) => (isJapanese ? `/ja${path === '/' ? '' : path}` : path);
}
