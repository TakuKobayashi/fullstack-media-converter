import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Static export — deployed as a plain static site via Cloudflare Workers Assets.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  webpack(config, { webpack }) {
    // The MMD parser conditionally imports these modules only in Node.js.
    // Replacing them keeps its browser WASM branch bundleable by Webpack 5.
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^node:(?:fs\/promises|url)$/,
        (resource: { request: string }) => {
          resource.request = path.resolve(__dirname, 'src/lib/node-only-browser-stub.ts');
        },
      ),
    );
    return config;
  },
};

export default nextConfig;
