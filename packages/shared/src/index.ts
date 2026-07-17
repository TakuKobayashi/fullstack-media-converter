// ─── Conversion Types ───────────────────────────────────────────────
export type ImageFormat = 'jpg' | 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'gif';
export type VideoFormat = 'mp4' | 'mov' | 'gif';
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
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    pdf: 'application/pdf',
  };
  return map[format] ?? 'application/octet-stream';
}

export function guessFormat(filename: string): InputFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const valid: InputFormat[] = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif', 'mp4', 'mov', 'pdf'];
  return (valid.includes(ext as InputFormat) ? ext : null) as InputFormat | null;
}

// ─── Conversion route map ────────────────────────────────────────────
// Image formats convertible via Canvas/ImageDecoder — treated as fully
// interchangeable (any → any, excluding same-format) for the universal
// image converter. Individual SEO landing pages still only advertise
// their specific route, but the underlying capability is symmetric.
const CANVAS_IMAGE_FORMATS: ImageFormat[] = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
// Formats the engine can *decode* but browsers generally can't *encode*
// back out via Canvas — these are one-directional inputs only.
const DECODE_ONLY_IMAGE_FORMATS: ImageFormat[] = ['heic', 'avif'];

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

export const SUPPORTED_CONVERSIONS: Array<{ from: InputFormat; to: OutputFormat; type: ConversionType }> = [
  // Image ↔ Image (all pairwise combinations, see buildImageRoutes)
  ...buildImageRoutes(),
  // Video
  { from: 'mov', to: 'mp4', type: 'video' },
  { from: 'mp4', to: 'mov', type: 'video' },
  { from: 'mov', to: 'gif', type: 'video' },
  { from: 'mp4', to: 'gif', type: 'video' },
  // Document
  { from: 'jpg', to: 'pdf', type: 'document' },
  { from: 'jpeg', to: 'pdf', type: 'document' },
  { from: 'png', to: 'pdf', type: 'document' },
  { from: 'pdf', to: 'jpg', type: 'document' },
];

export function canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
  return SUPPORTED_CONVERSIONS.some(c => c.from === inputFormat && c.to === outputFormat);
}

export const IMAGE_OUTPUT_FORMATS: ImageFormat[] = ['jpg', 'png', 'webp', 'gif'];
export const IMAGE_INPUT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.HEIC', '.avif', '.gif'];
