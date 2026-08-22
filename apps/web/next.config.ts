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
      // @jsquash/avif dynamically chooses a threaded encoder, whose generated
      // worker uses an expression import that Webpack cannot statically analyze.
      // The single-thread encoder has identical output support and works in all
      // browsers without creating circular runtime/worker chunks.
      new webpack.NormalModuleReplacementPlugin(
        /avif_enc_mt\.js$/,
        (resource: { request: string }) => {
          resource.request = resource.request.replace(/avif_enc_mt\.js$/, 'avif_enc.js');
        },
      ),
    );
    return config;
  },
};

export default nextConfig;
