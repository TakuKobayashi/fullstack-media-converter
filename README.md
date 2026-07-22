# ConvertMate

**Repository:** `fullstack-media-converter`

Batch file conversion platform. Images, videos, documents — all processed in the browser. No uploads.

## Architecture

```
convertmate/
├── apps/
│   ├── web/        Next.js 15 SSG → Cloudflare Workers Assets
│   └── cli/        Node.js CLI (spiritual successor to image-processing-utility-cli)
└── packages/
    ├── shared/     Types, interfaces, conversion route map
    ├── core/       ConversionQueue (platform-agnostic)
    ├── image/      BrowserImageEngine (Canvas + heic2any)
    ├── video/      BrowserVideoEngine (ffmpeg.wasm)
    └── exif/       EXIF reader (exifreader)
```

## Video conversion (ffmpeg.wasm)

Video conversion runs FFmpeg compiled to WebAssembly, entirely in the browser
— no upload, no server. It loads the single-thread `@ffmpeg/core` build from
a CDN (unpkg) at runtime. The single-thread build doesn't need
`SharedArrayBuffer`, so it works with zero special hosting requirements —
no COOP/COEP headers, no self-hosting the wasm binary. This matches how the
site is deployed: a plain static export served as-is via Cloudflare Workers
Assets, with no control over (or need for) custom response headers.

The tradeoff is that the engine downloads (~25MB) on first use each session,
so the first conversion takes a few seconds longer while it loads. That's
expected and fine — see `packages/video/src/browser-engine.ts`.

If video conversion fails, check the browser console for `[ffmpeg]` logs
and confirm the CDN request to `unpkg.com` isn't being blocked (ad blockers,
corporate proxies, or offline use can prevent it from loading).

## Quick Start

```bash
# Web
pnpm install
pnpm dev

# CLI
cd apps/cli
pnpm dev convert -i photo.webp -f jpg
pnpm dev bulk-convert -i ./photos --if webp -f jpg -o ./out -z --concurrency 6

# Deploy (static site via Cloudflare Workers Assets)
pnpm build
cd apps/web && wrangler deploy
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
