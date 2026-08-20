// ─── Conversion Types ───────────────────────────────────────────────
export type ImageFormat =
  | 'jpg' | 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'gif'
  | 'bmp' | 'svg' | 'ico' | 'tif' | 'tiff' | 'psd';
export type CanonicalImageInputFormat = Exclude<ImageFormat, 'jpeg' | 'tif'>;
export type ImageOutputFormat = 'jpg' | 'png' | 'webp' | 'gif' | 'avif' | 'svg';

export interface ImageInputFormatDefinition {
  format: CanonicalImageInputFormat;
  label: string;
  extensions: readonly `.${string}`[];
}
export type VideoFormat =
  | 'mp4' | 'mov' | 'webm' | 'mkv' | 'avi' | 'flv'
  | 'mpeg' | 'mpg' | 'm4v' | '3gp'
  | 'ts' | 'mts' | 'm2ts' | 'ogv' | 'ogg' | 'wmv';
export type VideoOutputFormat = 'mp4' | 'mov' | 'webm' | 'mkv' | 'avi' | 'gif';
export interface VideoInputFormatDefinition {
  format: VideoFormat;
  label: string;
  extensions: readonly `.${string}`[];
}
export type DocumentFormat = 'pdf';
export type OutputFormat = ImageFormat | VideoFormat | DocumentFormat;
export type InputFormat = ImageFormat | VideoFormat | DocumentFormat;

export type ConversionType =
  | 'image'
  | 'video'
  | 'document'
  | 'exif';

// ─── Job / Queue Types ───────────────────────────────────────────────
export type JobStatus = 'pending' | 'processing' | 'done' | 'error';

export interface ConversionFile {
  id: string;
  name: string;
  size: number;
  /** browser: File | ArrayBuffer; node: string (filepath) */
  source: File | ArrayBuffer | string;
}

export interface ConversionJob {
  id: string;
  file: ConversionFile;
  inputFormat: InputFormat;
  outputFormat: OutputFormat;
  status: JobStatus;
  progress: number; // 0–100
  error?: string;
  resultUrl?: string; // object URL (browser) or filepath (node)
}

export interface BatchJob {
  id: string;
  jobs: ConversionJob[];
  concurrency: number;
  createdAt: Date;
}

// ─── Conversion Options ──────────────────────────────────────────────
export interface ImageConvertOptions {
  quality?: number; // 1–100
  keepExif?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

export interface VideoConvertOptions {
  fps?: number;
  scale?: number; // 0.1–1.0 (for GIF)
}

export interface ConversionOptions {
  image?: ImageConvertOptions;
  video?: VideoConvertOptions;
  /** Runtime progress hook used by queues and interactive clients. */
  onProgress?: (progress: number) => void;
}

// ─── Engine Interface (platform-agnostic) ────────────────────────────
export interface ConversionEngine {
  convert(job: ConversionJob, options?: ConversionOptions): Promise<ConversionJob>;
  canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean;
}

// ─── Result ──────────────────────────────────────────────────────────
export interface ConversionResult {
  job: ConversionJob;
  data: ArrayBuffer | Buffer | null;
  mimeType: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getMimeType(format: OutputFormat): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    heic: 'image/heic',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    psd: 'image/vnd.adobe.photoshop',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    flv: 'video/x-flv',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    m4v: 'video/x-m4v',
    '3gp': 'video/3gpp',
    ts: 'video/mp2t',
    mts: 'video/mp2t',
    m2ts: 'video/mp2t',
    ogv: 'video/ogg',
    ogg: 'video/ogg',
    wmv: 'video/x-ms-wmv',
    pdf: 'application/pdf',
  };
  return map[format] ?? 'application/octet-stream';
}

export function guessFormat(filename: string): InputFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const valid: InputFormat[] = [
    'jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif',
    'bmp', 'svg', 'ico', 'tif', 'tiff', 'psd',
    'mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'mpeg', 'mpg', 'm4v', '3gp',
    'ts', 'mts', 'm2ts', 'ogv', 'ogg', 'wmv', 'pdf',
  ];
  return (valid.includes(ext as InputFormat) ? ext : null) as InputFormat | null;
}

// ─── Conversion route map ────────────────────────────────────────────
// Image formats convertible via Canvas/ImageDecoder — treated as fully
// interchangeable (any → any, excluding same-format) for the universal
// image converter. Individual SEO landing pages still only advertise
// their specific route, but the underlying capability is symmetric.
const CANVAS_IMAGE_FORMATS: ImageFormat[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'];
// Formats the engine can *decode* but browsers generally can't *encode*
// back out via Canvas — these are one-directional inputs only.
const DECODE_ONLY_IMAGE_FORMATS: ImageFormat[] = [
  'heic', 'bmp', 'ico', 'tif', 'tiff', 'psd',
];

function buildImageRoutes(): Array<{ from: InputFormat; to: OutputFormat; type: ConversionType }> {
  const routes: Array<{ from: InputFormat; to: OutputFormat; type: ConversionType }> = [];
  for (const from of CANVAS_IMAGE_FORMATS) {
    for (const to of CANVAS_IMAGE_FORMATS) {
      if (from === to) continue;
      routes.push({ from, to, type: 'image' });
    }
  }
  for (const from of DECODE_ONLY_IMAGE_FORMATS) {
    for (const to of CANVAS_IMAGE_FORMATS) {
      routes.push({ from, to, type: 'image' });
    }
  }
  return routes;
}

/** Single source of truth for video inputs accepted by the FFmpeg engine. */
export const VIDEO_INPUT_FORMATS = [
  { format: 'mp4', label: 'MP4', extensions: ['.mp4'] },
  { format: 'mov', label: 'MOV', extensions: ['.mov'] },
  { format: 'webm', label: 'WebM', extensions: ['.webm'] },
  { format: 'mkv', label: 'MKV', extensions: ['.mkv'] },
  { format: 'avi', label: 'AVI', extensions: ['.avi'] },
  { format: 'flv', label: 'FLV', extensions: ['.flv'] },
  { format: 'mpeg', label: 'MPEG', extensions: ['.mpeg', '.mpg'] },
  { format: 'm4v', label: 'M4V', extensions: ['.m4v'] },
  { format: '3gp', label: '3GP', extensions: ['.3gp'] },
  { format: 'ts', label: 'TS', extensions: ['.ts', '.mts', '.m2ts'] },
  { format: 'ogv', label: 'OGV/OGG', extensions: ['.ogv', '.ogg'] },
  { format: 'wmv', label: 'WMV', extensions: ['.wmv'] },
] as const satisfies readonly VideoInputFormatDefinition[];

export const VIDEO_INPUT_FORMAT_LABELS = VIDEO_INPUT_FORMATS.map(({ label }) => label);
export const VIDEO_INPUT_EXTENSIONS = VIDEO_INPUT_FORMATS.flatMap(({ extensions }) => [...extensions]);
export const VIDEO_OUTPUT_FORMATS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'gif'] as const satisfies readonly VideoOutputFormat[];

function buildVideoRoutes(): Array<{ from: InputFormat; to: OutputFormat; type: ConversionType }> {
  return VIDEO_INPUT_FORMATS.flatMap(({ extensions, format }) => {
    const inputs = extensions.map(extension => extension.slice(1) as InputFormat);
    if (!inputs.includes(format)) inputs.push(format);
    return inputs.flatMap(from => VIDEO_OUTPUT_FORMATS
      .filter(to => from !== to)
      .map(to => ({ from, to, type: 'video' as const })));
  });
}

export const SUPPORTED_CONVERSIONS: Array<{ from: InputFormat; to: OutputFormat; type: ConversionType }> = [
  // Image ↔ Image (all pairwise combinations, see buildImageRoutes)
  ...buildImageRoutes(),
  // Video
  ...buildVideoRoutes(),
  // Document
  { from: 'jpg', to: 'pdf', type: 'document' },
  { from: 'jpeg', to: 'pdf', type: 'document' },
  { from: 'png', to: 'pdf', type: 'document' },
  { from: 'pdf', to: 'jpg', type: 'document' },
];

export function canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
  return SUPPORTED_CONVERSIONS.some(c => c.from === inputFormat && c.to === outputFormat);
}

export const IMAGE_OUTPUT_FORMATS = ['jpg', 'png', 'webp', 'gif', 'avif', 'svg'] as const satisfies readonly ImageOutputFormat[];
/** Single source of truth for accepted image inputs and their UI labels. */
export const IMAGE_INPUT_FORMATS = [
  { format: 'jpg', label: 'JPG', extensions: ['.jpg', '.jpeg'] },
  { format: 'png', label: 'PNG', extensions: ['.png'] },
  { format: 'webp', label: 'WebP', extensions: ['.webp'] },
  { format: 'heic', label: 'HEIC', extensions: ['.heic'] },
  { format: 'avif', label: 'AVIF', extensions: ['.avif'] },
  { format: 'gif', label: 'GIF', extensions: ['.gif'] },
  { format: 'bmp', label: 'BMP', extensions: ['.bmp'] },
  { format: 'svg', label: 'SVG', extensions: ['.svg'] },
  { format: 'ico', label: 'ICO', extensions: ['.ico'] },
  { format: 'tiff', label: 'TIFF', extensions: ['.tif', '.tiff'] },
  { format: 'psd', label: 'PSD', extensions: ['.psd'] },
] as const satisfies readonly ImageInputFormatDefinition[];

export const IMAGE_INPUT_FORMAT_LABELS = IMAGE_INPUT_FORMATS.map(({ label }) => label);
export const IMAGE_INPUT_EXTENSIONS = IMAGE_INPUT_FORMATS.flatMap(({ extensions }) => [...extensions]);
