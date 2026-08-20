import type { MetadataRoute } from 'next';
import { SITE_URL, routeFor, type ToolName } from '@/lib/seo';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const tools: ToolName[] = ['image', 'video', 'audio', 'exif'];
  const pages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: 'monthly',
      priority: 1,
      alternates: { languages: { en: SITE_URL, ja: `${SITE_URL}/ja/` } },
    },
    {
      url: `${SITE_URL}/ja/`,
      changeFrequency: 'monthly',
      priority: 1,
      alternates: { languages: { en: SITE_URL, ja: `${SITE_URL}/ja/` } },
    },
  ];

  for (const tool of tools) {
    const en = `${SITE_URL}${routeFor(tool, 'en')}/`;
    const ja = `${SITE_URL}${routeFor(tool, 'ja')}/`;
    pages.push(
      { url: en, changeFrequency: 'monthly', priority: 0.9, alternates: { languages: { en, ja } } },
      { url: ja, changeFrequency: 'monthly', priority: 0.9, alternates: { languages: { en, ja } } },
    );
  }
  return pages;
}
