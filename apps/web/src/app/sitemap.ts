import type { MetadataRoute } from 'next';
import { SITE_URL, routeFor, type ToolName } from '@/lib/seo';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const tools: ToolName[] = ['image', 'video', 'audio', 'model3d', 'exif'];
  const pages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      alternates: {
        languages: {
          'en-US': `${SITE_URL}/`,
          'ja-JP': `${SITE_URL}/ja/`,
          'x-default': `${SITE_URL}/`,
        },
      },
    },
    {
      url: `${SITE_URL}/ja/`,
      alternates: {
        languages: {
          'en-US': `${SITE_URL}/`,
          'ja-JP': `${SITE_URL}/ja/`,
          'x-default': `${SITE_URL}/`,
        },
      },
    },
  ];

  for (const tool of tools) {
    const en = `${SITE_URL}${routeFor(tool, 'en')}/`;
    const ja = `${SITE_URL}${routeFor(tool, 'ja')}/`;
    const languages = { 'en-US': en, 'ja-JP': ja, 'x-default': en };
    pages.push({ url: en, alternates: { languages } }, { url: ja, alternates: { languages } });
  }
  return pages;
}
