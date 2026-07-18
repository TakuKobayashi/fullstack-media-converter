/**
 * copy-ffmpeg-core.ts
 *
 * Copies @ffmpeg/core's single-thread WASM build into apps/web/public/ffmpeg
 * so it can be served same-origin. This is required because the app sets
 * Cross-Origin-Embedder-Policy: require-corp (needed for the
 * SharedArrayBuffer that ffmpeg.wasm depends on). Under COEP, cross-origin
 * resources are blocked unless they send matching CORP/CORS headers — CDNs
 * like unpkg do not — so loading ffmpeg-core from a CDN silently breaks
 * every video conversion in the browser. Self-hosting avoids this.
 *
 * Run via: pnpm run postinstall  (wired up automatically by pnpm install)
 * Manually: pnpm exec tsx scripts/copy-ffmpeg-core.ts
 */
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = join(__dirname, '..');
const outDir = join(webRoot, 'public', 'ffmpeg');

// `require` must exist BEFORE it's used by resolveCoreDist() below.
// (The previous .mjs version defined this constant after the function
// that called it — a harmless-looking ordering bug in a script, but a
// real one in a script with no build step: resolveCoreDist() threw
// "require is not defined" on every run, was swallowed by its own
// try/catch, and silently fell through to the "not found" branch.
// That's why `pnpm run postinstall` reported "@ffmpeg/core not found"
// even when the package was correctly listed as a dependency.)
const require = createRequire(import.meta.url);

/**
 * Resolve the @ffmpeg/core dist directory. Tries multiple strategies
 * because pnpm's node_modules layout (content-addressable store +
 * symlinks) can differ from npm/yarn, and workspace hoisting behavior
 * varies by pnpm version and lockfile settings.
 */
function resolveCoreDist(): string | null {
  const candidates: Array<() => string | null> = [
    // 1. Standard Node resolution from apps/web — works if @ffmpeg/core
    //    is hoisted to apps/web/node_modules or the workspace root.
    () => {
      try {
        const pkgJsonPath = require.resolve('@ffmpeg/core/package.json', {
          paths: [webRoot],
        });
        return join(dirname(pkgJsonPath), 'dist', 'esm');
      } catch {
        return null;
      }
    },
    // 2. Resolve from the monorepo root, in case pnpm hoisted it there
    //    instead of into apps/web/node_modules.
    () => {
      try {
        const monorepoRoot = join(webRoot, '..', '..');
        const pkgJsonPath = require.resolve('@ffmpeg/core/package.json', {
          paths: [monorepoRoot],
        });
        return join(dirname(pkgJsonPath), 'dist', 'esm');
      } catch {
        return null;
      }
    },
    // 3. Direct path guess for pnpm's flat node_modules/.pnpm store,
    //    in case require.resolve's paths option doesn't see it due to
    //    how postinstall scripts are invoked (cwd can vary by pnpm
    //    version, e.g. run from the workspace root vs. the package dir).
    () => {
      const direct = join(webRoot, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
      return existsSync(direct) ? direct : null;
    },
    () => {
      const direct = join(webRoot, '..', '..', 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
      return existsSync(direct) ? direct : null;
    },
  ];

  for (const attempt of candidates) {
    const result = attempt();
    if (result && existsSync(result)) return result;
  }
  return null;
}

function main() {
  const srcDir = resolveCoreDist();

  if (!srcDir) {
    console.warn('[copy-ffmpeg-core] Could not locate @ffmpeg/core/dist/esm.');
    console.warn('[copy-ffmpeg-core] Video conversion (MOV/MP4/GIF) will not work until this is fixed.');
    console.warn('[copy-ffmpeg-core] Things to check:');
    console.warn('  1. Confirm it installed: ls node_modules/@ffmpeg/core  (run from apps/web)');
    console.warn('  2. If missing, run: pnpm add @ffmpeg/core --filter @convertmate/web');
    console.warn('  3. Then re-run: pnpm --filter @convertmate/web run postinstall');
    process.exitCode = 0; // don't fail the whole install over this
    return;
  }

  mkdirSync(outDir, { recursive: true });

  const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
  let copiedCount = 0;

  for (const file of files) {
    const src = join(srcDir, file);
    const dest = join(outDir, file);
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`[copy-ffmpeg-core] Copied ${file} → public/ffmpeg/${file}`);
      copiedCount++;
    } else {
      console.warn(`[copy-ffmpeg-core] Expected file missing: ${src}`);
    }
  }

  if (copiedCount === files.length) {
    console.log('[copy-ffmpeg-core] Done — video conversion is ready.');
  } else {
    console.warn(`[copy-ffmpeg-core] Only copied ${copiedCount}/${files.length} files — video conversion may still fail.`);
  }
}

main();
