// ─── Conversion Types ───────────────────────────────────────────────
export type ImageFormat =
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'heic'
  | 'gif'
  | 'bmp'
  | 'svg'
  | 'ico'
  | 'tif'
  | 'tiff'
  | 'psd';
export type CanonicalImageInputFormat = Exclude<ImageFormat, 'jpeg' | 'tif'>;
export type ImageOutputFormat = 'jpg' | 'png' | 'webp' | 'gif' | 'avif' | 'svg';

export interface ImageInputFormatDefinition {
  format: CanonicalImageInputFormat;
  label: string;
  extensions: readonly `.${string}`[];
}
export type VideoFormat =
  | 'mp4'
  | 'mov'
  | 'webm'
  | 'mkv'
  | 'avi'
  | 'flv'
  | 'mpeg'
  | 'mpg'
  | 'm4v'
  | '3gp'
  | 'ts'
  | 'mts'
  | 'm2ts'
  | 'ogv'
  | 'ogg'
  | 'wmv';
export type VideoOutputFormat = 'mp4' | 'mov' | 'webm' | 'mkv' | 'avi' | 'gif';
export interface VideoInputFormatDefinition {
  format: VideoFormat;
  label: string;
  extensions: readonly `.${string}`[];
}
export type AudioFormat =
  'mp3' | 'wav' | 'aac' | 'm4a' | 'flac' | 'ogg' | 'opus' | 'wma' | 'aif' | 'aiff';
export type AudioOutputFormat = Exclude<AudioFormat, 'wma' | 'aif' | 'aiff'>;
export interface AudioInputFormatDefinition {
  format: AudioFormat;
  label: string;
  extensions: readonly `.${string}`[];
}
export type Model3dFormat = 'fbx' | 'obj' | 'gltf' | 'glb' | 'vrm' | 'stl' | 'ply' | 'dae' | '3ds';
export type Model3dOutputFormat = 'glb' | 'gltf' | 'obj' | 'stl';
export interface Model3dInputFormatDefinition {
  format: Model3dFormat;
  label: string;
  extensions: readonly `.${string}`[];
}
export type DocumentFormat = 'pdf';
export type OutputFormat = ImageFormat | VideoFormat | AudioFormat | Model3dFormat | DocumentFormat;
export type InputFormat = ImageFormat | VideoFormat | AudioFormat | Model3dFormat | DocumentFormat;

export type ConversionType = 'image' | 'video' | 'audio' | 'model3d' | 'document' | 'exif';

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

export interface AudioConvertOptions {
  bitrate?: number;
  sampleRate?: number;
}

export interface Model3dConvertOptions {
  auxiliaryFiles?: File[];
}

export interface ConversionOptions {
  image?: ImageConvertOptions;
  video?: VideoConvertOptions;
  audio?: AudioConvertOptions;
  model3d?: Model3dConvertOptions;
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
    ogg: 'audio/ogg',
    wmv: 'video/x-ms-wmv',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    opus: 'audio/opus',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
    fbx: 'application/octet-stream',
    obj: 'text/plain',
    gltf: 'model/gltf+json',
    glb: 'model/gltf-binary',
    vrm: 'model/gltf-binary',
    stl: 'model/stl',
    ply: 'application/octet-stream',
    dae: 'model/vnd.collada+xml',
    '3ds': 'application/x-3ds',
    pdf: 'application/pdf',
  };
  return map[format] ?? 'application/octet-stream';
}

export function guessFormat(filename: string): InputFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const valid: InputFormat[] = [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'avif',
    'heic',
    'gif',
    'bmp',
    'svg',
    'ico',
    'tif',
    'tiff',
    'psd',
    'mp4',
    'mov',
    'webm',
    'mkv',
    'avi',
    'flv',
    'mpeg',
    'mpg',
    'm4v',
    '3gp',
    'ts',
    'mts',
    'm2ts',
    'ogv',
    'ogg',
    'wmv',
    'mp3',
    'wav',
    'aac',
    'm4a',
    'flac',
    'opus',
    'aif',
    'aiff',
    'fbx',
    'obj',
    'gltf',
    'glb',
    'vrm',
    'stl',
    'ply',
    'dae',
    '3ds',
    'pdf',
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
const DECODE_ONLY_IMAGE_FORMATS: ImageFormat[] = ['heic', 'bmp', 'ico', 'tif', 'tiff', 'psd'];

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
export const VIDEO_INPUT_EXTENSIONS = VIDEO_INPUT_FORMATS.flatMap(({ extensions }) => [
  ...extensions,
]);
export const VIDEO_OUTPUT_FORMATS = [
  'mp4',
  'mov',
  'webm',
  'mkv',
  'avi',
  'gif',
] as const satisfies readonly VideoOutputFormat[];

function buildVideoRoutes(): Array<{ from: InputFormat; to: OutputFormat; type: ConversionType }> {
  return VIDEO_INPUT_FORMATS.flatMap(({ extensions, format }) => {
    const inputs = extensions.map((extension) => extension.slice(1) as InputFormat);
    if (!inputs.includes(format)) inputs.push(format);
    return inputs.flatMap((from) =>
      VIDEO_OUTPUT_FORMATS.filter((to) => from !== to).map((to) => ({
        from,
        to,
        type: 'video' as const,
      })),
    );
  });
}

export const AUDIO_INPUT_FORMATS = [
  { format: 'mp3', label: 'MP3', extensions: ['.mp3'] },
  { format: 'wav', label: 'WAV', extensions: ['.wav'] },
  { format: 'aac', label: 'AAC', extensions: ['.aac'] },
  { format: 'm4a', label: 'M4A', extensions: ['.m4a'] },
  { format: 'flac', label: 'FLAC', extensions: ['.flac'] },
  { format: 'ogg', label: 'OGG', extensions: ['.ogg'] },
  { format: 'opus', label: 'OPUS', extensions: ['.opus'] },
  { format: 'wma', label: 'WMA', extensions: ['.wma'] },
  { format: 'aiff', label: 'AIFF', extensions: ['.aif', '.aiff'] },
] as const satisfies readonly AudioInputFormatDefinition[];

export const AUDIO_INPUT_FORMAT_LABELS = AUDIO_INPUT_FORMATS.map(({ label }) => label);
export const AUDIO_INPUT_EXTENSIONS = AUDIO_INPUT_FORMATS.flatMap(({ extensions }) => [
  ...extensions,
]);
export const AUDIO_OUTPUT_FORMATS = [
  'mp3',
  'wav',
  'aac',
  'm4a',
  'flac',
  'ogg',
  'opus',
] as const satisfies readonly AudioOutputFormat[];

function buildAudioRoutes(): Array<{ from: InputFormat; to: OutputFormat; type: ConversionType }> {
  return AUDIO_INPUT_FORMATS.flatMap(({ extensions, format }) => {
    const inputs = extensions.map((extension) => extension.slice(1) as InputFormat);
    if (!inputs.includes(format)) inputs.push(format);
    return inputs.flatMap((from) =>
      AUDIO_OUTPUT_FORMATS.filter((to) => from !== to).map((to) => ({
        from,
        to,
        type: 'audio' as const,
      })),
    );
  });
}

export const MODEL3D_INPUT_FORMATS = [
  { format: 'fbx', label: 'FBX', extensions: ['.fbx'] },
  { format: 'obj', label: 'OBJ/MTL', extensions: ['.obj'] },
  { format: 'gltf', label: 'glTF', extensions: ['.gltf'] },
  { format: 'glb', label: 'GLB', extensions: ['.glb'] },
  { format: 'vrm', label: 'VRM', extensions: ['.vrm'] },
  { format: 'stl', label: 'STL', extensions: ['.stl'] },
  { format: 'ply', label: 'PLY', extensions: ['.ply'] },
  { format: 'dae', label: 'DAE', extensions: ['.dae'] },
  { format: '3ds', label: '3DS', extensions: ['.3ds'] },
] as const satisfies readonly Model3dInputFormatDefinition[];

export const MODEL3D_INPUT_FORMAT_LABELS = MODEL3D_INPUT_FORMATS.map(({ label }) => label);
export const MODEL3D_INPUT_EXTENSIONS = MODEL3D_INPUT_FORMATS.flatMap(({ extensions }) => [
  ...extensions,
]);
export const MODEL3D_AUXILIARY_EXTENSIONS = [
  '.mtl',
  '.bin',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tga',
  '.dds',
  '.ktx2',
] as const;
export const MODEL3D_OUTPUT_FORMATS = [
  'glb',
  'gltf',
  'obj',
  'stl',
] as const satisfies readonly Model3dOutputFormat[];

function buildModel3dRoutes(): Array<{
  from: InputFormat;
  to: OutputFormat;
  type: ConversionType;
}> {
  return MODEL3D_INPUT_FORMATS.flatMap(({ format }) =>
    MODEL3D_OUTPUT_FORMATS.filter((to) => format !== to).map((to) => ({
      from: format,
      to,
      type: 'model3d' as const,
    })),
  );
}

export const SUPPORTED_CONVERSIONS: Array<{
  from: InputFormat;
  to: OutputFormat;
  type: ConversionType;
}> = [
  // Image ↔ Image (all pairwise combinations, see buildImageRoutes)
  ...buildImageRoutes(),
  // Video
  ...buildVideoRoutes(),
  ...buildAudioRoutes(),
  ...buildModel3dRoutes(),
  // Document
  { from: 'jpg', to: 'pdf', type: 'document' },
  { from: 'jpeg', to: 'pdf', type: 'document' },
  { from: 'png', to: 'pdf', type: 'document' },
  { from: 'pdf', to: 'jpg', type: 'document' },
];

export function canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
  return SUPPORTED_CONVERSIONS.some((c) => c.from === inputFormat && c.to === outputFormat);
}

export const IMAGE_OUTPUT_FORMATS = [
  'jpg',
  'png',
  'webp',
  'gif',
  'avif',
  'svg',
] as const satisfies readonly ImageOutputFormat[];
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
export const IMAGE_INPUT_EXTENSIONS = IMAGE_INPUT_FORMATS.flatMap(({ extensions }) => [
  ...extensions,
]);
