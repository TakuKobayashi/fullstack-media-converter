import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export — deployed as a plain static site via Cloudflare Workers Assets.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
