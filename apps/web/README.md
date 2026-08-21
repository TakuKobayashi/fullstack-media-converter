# Fullstack Media Converter Web

Next.js の静的エクスポートを Cloudflare Workers Assets で配信するWebアプリです。画像・動画・音声・3Dモデルの変換とEXIF情報の抽出をブラウザ内で実行します。

## 公開URL

https://fullstack-media-converter.taptappun.workers.dev/

## SEO対象ページ

| 機能         | 英語                  | 日本語                   |
| ------------ | --------------------- | ------------------------ |
| トップ       | `/`                   | `/ja/`                   |
| 画像変換     | `/image-converter/`   | `/ja/image-converter/`   |
| 動画変換     | `/video-converter/`   | `/ja/video-converter/`   |
| 音声変換     | `/audio-converter/`   | `/ja/audio-converter/`   |
| 3Dモデル変換 | `/model3d-converter/` | `/ja/model3d-converter/` |
| EXIF抽出     | `/export-exif/`       | `/ja/export-exif/`       |

canonical、`hreflang`、Open Graph、FAQ構造化データ、`robots.txt`、`sitemap.xml`を生成します。公開URLを変更する場合は、ビルド時に`NEXT_PUBLIC_SITE_URL`を指定してください。

機能別のOpen Graph・Twitter Card画像は`public/og/`にあります。3Dモデル変換ページでは現在トップページ用画像を共有しています。

## 3Dモデル変換の範囲

FBX、OBJ、glTF、GLB、VRM、STL、PLY、DAE、3DS、MMDモデル（PMX・PMD）を読み込み、GLB、glTF、OBJ、STLへ変換できます。アニメーション、ボーン、モーフは出力せず、スキンメッシュは現在の姿勢を静的メッシュへ焼き付けます。VMDモーションは入力対象外です。OBJのMTL、glTFのBIN、参照テクスチャなどは元モデルと同時に選択してください。

PMX・PMD内のテクスチャーパスは、同時に追加された画像、トゥーン、スフィアマップの相対パスと照合します。フォルダー構造を取得できない場合はファイル名でも照合します。同名ファイルが複数フォルダーに存在するモデルでは、フォルダー構造を保って追加してください。OBJ、glTF、FBX、DAE、3DSの外部関連ファイルも同じ入力欄へ追加できます。

PMX・PMDからGLB・glTFへ変換する場合は、UV三角形上で頂点法線を補間し、MMDの拡散色、環境色、基本テクスチャー、トゥーン、SPH・SPAをピクセルごとに評価して、MMD既定照明の静的な外観へベイクします。UVが重なる部分は複数面の結果を平均し、glTFのUnlitマテリアルとして出力します。視点依存の反射、スペキュラ、アウトライン、セルフシャドウを完全には再現できませんが、変換先ビューアーの照明差による見た目の変化を抑えます。

## ローカル実行

```bash
pnpm --filter @convertmate/web dev
```

## ビルドとデプロイ

```bash
pnpm --filter @convertmate/web build
pnpm --dir apps/web deploy
```
