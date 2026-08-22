# Fullstack Media Converter

画像、動画、音声、3Dモデルの一括変換とEXIF情報の抽出を、ブラウザ内で実行するメディア変換ツールです。通常の変換処理ではファイルをサーバーへアップロードしません。

## 公開サイト

**https://fullstack-media-converter.taptappun.workers.dev/**

英語版と日本語版を提供しています。日本語版は `/ja/` 以下から利用できます。

## 主な機能

- 複数ファイルのドラッグ＆ドロップ、一括変換、個別ダウンロード、ZIPダウンロード
- 画像、動画、音声、3Dモデルの形式変換
- JPG、PNGなどからのEXIF情報抽出
- 3Dモデルの関連ファイル（テクスチャー、MTL、BINなど）の自動照合とモデル単位の追加
- 3Dモデルとアニメーションを分けた変換・管理
- 3Dプレビューでのアニメーション再生、表情切り替え、ボーン表示・選択
- 英語・日本語表示と、各機能用の静的SEOページ

変換は原則としてブラウザ内で完結します。動画・音声変換用のFFmpeg Wasm本体は、初回利用時にCDNから読み込まれます。

## 対応形式

### 画像

- 入力: JPG/JPEG、PNG、WebP、HEIC、AVIF、GIF、BMP、SVG、ICO、TIFF、PSD
- 出力: JPG、PNG、WebP、GIF、AVIF、SVG

JPG/JPEG、PNG、WebP、GIF、AVIF、SVGは相互変換に対応しています。HEIC、BMP、ICO、TIFF、PSDは入力専用です。

### 動画

- 入力: MP4、MOV、WebM、MKV、AVI、FLV、MPEG/MPG、M4V、3GP、TS/MTS/M2TS、OGV/OGG、WMV
- 出力: MP4、MOV、WebM、MKV、AVI、GIF

### 音声

- 入力: MP3、WAV、AAC、M4A、FLAC、OGG、OPUS、WMA、AIFF
- 出力: MP3、WAV、AAC、M4A、FLAC、OGG、OPUS

### 3Dモデル・アニメーション（ベータ）

- 入力: FBX、OBJ/MTL、glTF、GLB、VRM、VRMA、STL、PLY、DAE、3DS、PMX、PMD、VMD
- 3Dモデル出力: GLB、glTF、OBJ、STL、VRM
- アニメーション出力: GLB、glTF、VRMA、three.js JSON

FBX、glTF、GLBなどに複数のアニメーションクリップが含まれる場合は、モデルと各アニメーションを分離して一覧に表示し、個別に変換します。VRMAとVMDのようなアニメーション専用ファイルは、3Dモデルを生成せずアニメーションとして扱います。追加したアニメーションは全モデルの関連アニメーションとしてプレビューできますが、モデル変換とアニメーション変換は独立しています。

ボーン、アニメーション、表情を保持できない出力形式を選んだ場合、該当情報は警告を表示したうえで変換対象から除外されます。形式間の仕様差により、すべてのリグ、マテリアル、表情、物理演算を完全に再現できるとは限りません。

OBJのMTL、glTFのBIN、および各形式が参照するテクスチャーは、モデルと一緒にドロップするか、各モデルの「関連ファイルを追加」領域へ追加してください。実際に参照され、読み込まれているファイルがモデルごとの一覧に表示されます。

PMX・PMDからGLB・glTFへ変換する際は、MMDの基本テクスチャー、トゥーン、スフィアマップなどの見た目をテクスチャーへベイクします。ただし、視点依存の反射、アウトライン、セルフシャドウなどは変換先で完全には再現されません。

### ドキュメント・メタデータ

- JPG/JPEG/PNG → PDF
- PDF → JPG
- EXIF → JSON

## 開発環境

- Node.js 24（CIと同じバージョンを推奨）
- pnpm 9

```bash
pnpm install
pnpm dev
```

Webアプリは既定でNext.js開発サーバーとして起動します。

```bash
pnpm build
pnpm format:check
```

## CLI

CLIは画像変換とEXIF操作を提供します。

```bash
pnpm --filter @convertmate/cli dev -- convert -i photo.webp -f jpg
pnpm --filter @convertmate/cli dev -- bulk-convert -i ./photos --if webp -f jpg -o ./out -z --concurrency 6
pnpm --filter @convertmate/cli dev -- export-exif -i photo.jpg
pnpm --filter @convertmate/cli dev -- bulk-export-exif -i ./photos --if jpg -z
pnpm --filter @convertmate/cli dev -- list
```

## 構成

```text
fullstack-media-converter/
├── apps/
│   ├── web/        Next.js 15の静的Webアプリ
│   └── cli/        Node.js CLI
└── packages/
    ├── shared/     共通型、対応形式、変換ルート
    ├── core/       プラットフォーム非依存の変換キュー
    ├── image/      ブラウザ画像変換
    ├── video/      FFmpeg Wasmによる動画・音声変換
    ├── model3d/    Three.jsベースの3Dモデル・アニメーション変換
    └── exif/       EXIF読み取り
```

WebアプリはNext.jsの静的エクスポートとして生成し、Cloudflare Workers Static Assetsで配信します。

## ビルドとデプロイ

```bash
pnpm --filter @convertmate/web build
pnpm --dir apps/web deploy
```

`main`ブランチへのpush時はGitHub Actionsがビルドし、Cloudflare Workersへ自動デプロイします。デプロイにはリポジトリのSecretsとして`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`が必要です。

## Webルート

| 機能 | 英語 | 日本語 |
| --- | --- | --- |
| トップ | `/` | `/ja/` |
| 画像変換 | `/image-converter/` | `/ja/image-converter/` |
| 動画変換 | `/video-converter/` | `/ja/video-converter/` |
| 音声変換 | `/audio-converter/` | `/ja/audio-converter/` |
| 3Dモデル変換 | `/model3d-converter/` | `/ja/model3d-converter/` |
| EXIF抽出 | `/export-exif/` | `/ja/export-exif/` |

canonical、`hreflang`、Open Graph、FAQ構造化データ、`robots.txt`、`sitemap.xml`を生成します。公開URLを変更する場合は、ビルド時に`NEXT_PUBLIC_SITE_URL`を指定してください。
