import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export for Cloudflare Pages
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // NOTE: `headers()` only applies to `next dev` / a Node.js server runtime.
  // It is silently ignored under `output: 'export'` (static export has no
  // server to run this middleware), so it does NOT affect the deployed
  // Cloudflare Pages site. It's kept here purely so `pnpm dev` also gets
  // cross-origin isolation for local video-conversion testing.
  // The production headers that actually matter live in `public/_headers`,
  // which Cloudflare Pages reads directly.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
