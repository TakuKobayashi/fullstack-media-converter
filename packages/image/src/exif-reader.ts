/**
 * Lightweight EXIF reader for browser.
 * Returns a flat key→value map from the first 128KB of the file.
 */
export interface ExifData {
  [tag: string]: string | number | undefined;
}

export async function readExif(file: File): Promise<ExifData> {
  // Dynamic import — only loaded when EXIF feature is used
  const ExifReader = (await import('exifreader')).default;
  const buffer = await file.slice(0, 128 * 1024).arrayBuffer();
  const tags = ExifReader.load(buffer);
  const out: ExifData = {};
  for (const [key, val] of Object.entries(tags)) {
    if (val && typeof val === 'object' && 'description' in val) {
      out[key] = (val as { description: string | number }).description;
    }
  }
  return out;
}

export function exifToJson(data: ExifData): string {
  return JSON.stringify(data, null, 2);
}
