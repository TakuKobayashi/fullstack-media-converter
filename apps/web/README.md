# Fullstack Media Converter Web

Next.jsの静的エクスポートをCloudflare Workers Assetsで配信するWebアプリです。画像変換、動画変換、EXIF情報の抽出をブラウザ内で実行します。

## 公開URL

https://fullstack-media-converter.taptappun.workers.dev/

## SEO対象ページ

| 機能 | 英語 | 日本語 |
| --- | --- | --- |
| トップ | `/` | `/ja/` |
| 画像変換 | `/image-converter/` | `/ja/image-converter/` |
| 動画変換 | `/video-converter/` | `/ja/video-converter/` |
| EXIF抽出 | `/export-exif/` | `/ja/export-exif/` |

canonical、`hreflang`、Open Graph、FAQ構造化データ、`robots.txt`、`sitemap.xml`を生成します。公開URLを変更する場合は、ビルド時に`NEXT_PUBLIC_SITE_URL`を指定してください。

機能別のOpen Graph／Twitter Card画像は`public/og/`にあります。画像変換、動画変換、EXIF抽出、トップページで異なる画像を使用しています。

## ローカル実行

```bash
pnpm --filter @convertmate/web dev
```

## ビルドとデプロイ

```bash
pnpm --filter @convertmate/web build
pnpm --dir apps/web deploy
```
