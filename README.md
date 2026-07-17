# ConvertMate

Batch file conversion platform. Images, videos, documents — all processed in the browser. No uploads.

## Architecture

```
convertmate/
├── apps/
│   ├── web/        Next.js 15 SSG → Cloudflare Pages
│   └── cli/        Node.js CLI (spiritual successor to image-processing-utility-cli)
└── packages/
    ├── shared/     Types, interfaces, conversion route map
    ├── core/       ConversionQueue (platform-agnostic)
    ├── image/      BrowserImageEngine (Canvas + heic2any)
    ├── video/      BrowserVideoEngine (ffmpeg.wasm)
    └── exif/       EXIF reader (exifreader)
```

## Video conversion setup (ffmpeg.wasm)

Video conversion runs FFmpeg compiled to WebAssembly, entirely in the browser.
This requires two things to actually work:

1. **Self-hosted core files** — `pnpm install` runs `apps/web/scripts/copy-ffmpeg-core.mjs`
   automatically, which copies `ffmpeg-core.js`/`.wasm` from `@ffmpeg/core` into
   `apps/web/public/ffmpeg/`. Loading these from a CDN (e.g. unpkg) breaks under
   the COEP header required below, so they must be served same-origin.
2. **COOP/COEP headers** — required for `SharedArrayBuffer`, which ffmpeg.wasm
   needs. Since the site is statically exported (`output: 'export'`), Next.js's
   `headers()` config has no effect on the deployed site — Cloudflare Pages reads
   `apps/web/public/_headers` directly instead. If deploying elsewhere (Vercel,
   a custom Node server, etc.), configure equivalent headers on your host.

If video conversion fails, check the browser console for `[ffmpeg]` logs and
confirm `typeof SharedArrayBuffer !== 'undefined'` in devtools — if it's
`undefined`, the COOP/COEP headers aren't reaching the browser.

## Quick Start

```bash
# Web
pnpm install
pnpm dev

# CLI
cd apps/cli
pnpm dev convert -i photo.webp -f jpg
pnpm dev bulk-convert -i ./photos --if webp -f jpg -o ./out -z --concurrency 6

# Deploy
pnpm build
wrangler pages deploy apps/web/out --project-name=convertmate
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `cm convert -i file.webp -f jpg` | Single file conversion |
| `cm bulk-convert -i ./dir --if webp -f jpg -z` | Batch + ZIP output |
| `cm export-exif -i photo.jpg` | EXIF to stdout |
| `cm bulk-export-exif -i ./dir --if jpg -z` | Bulk EXIF + ZIP |
| `cm list` | All supported conversions |

## Supported Conversions

**Images:** WebP↔JPG, WebP↔PNG, HEIC→JPG/PNG, AVIF→JPG/PNG, PNG↔JPG  
**Video:** MOV↔MP4, MP4→GIF  
**Documents:** JPG/PNG→PDF, PDF→JPG  
**Metadata:** EXIF export (JSON)

## SEO Routes

Each conversion has a dedicated SSG route optimised for search:
`/webp-to-jpg` `/heic-to-jpg` `/mov-to-mp4` `/export-exif` etc.

## Platform Expansion

- **Android/iOS:** Replace `BrowserImageEngine` with a React Native engine using `react-native-image-manipulator`
- **Electron:** CLI engine runs directly (Node.js sharp already works)
- **Ad slots:** `<div class="adSlot">` placeholders exist on every tool page, ready for AdSense script injection
