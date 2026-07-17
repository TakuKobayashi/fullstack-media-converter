// Copies @ffmpeg/core's single-thread WASM build into /public/ffmpeg
// so it can be served same-origin. Required because COEP: require-corp
// (needed for SharedArrayBuffer / ffmpeg.wasm) blocks cross-origin
// resources unless they explicitly opt in with CORP/CORS headers —
// unpkg.com does not, so loading ffmpeg-core from a CDN silently
// fails every video conversion in the browser.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'ffmpeg');

function resolveCoreDist() {
  try {
    const pkgJson = require.resolve('@ffmpeg/core/package.json', { paths: [join(__dirname, '..')] });
    return join(dirname(pkgJson), 'dist', 'esm');
  } catch {
    return null;
  }
}

// Fallback for pure ESM contexts
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const srcDir = resolveCoreDist();
if (!srcDir || !existsSync(srcDir)) {
  console.warn('[copy-ffmpeg-core] @ffmpeg/core not found — skipping (video conversion may not work).');
  console.warn('  Run: pnpm add @ffmpeg/core --filter @convertmate/web');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
for (const file of files) {
  const src = join(srcDir, file);
  const dest = join(outDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`[copy-ffmpeg-core] Copied ${file} → public/ffmpeg/`);
  } else {
    console.warn(`[copy-ffmpeg-core] Missing ${src}`);
  }
}
