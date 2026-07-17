export interface ExifTag {
  id?: number;
  value?: unknown;
  description?: string | number;
}

export type ExifTags = Record<string, ExifTag>;

export interface FlatExif {
  [key: string]: string | number | null;
}

export async function extractExif(source: File | ArrayBuffer): Promise<FlatExif> {
  const ExifReader = (await import('exifreader')).default;
  const buffer = source instanceof File
    ? await source.slice(0, 256 * 1024).arrayBuffer()
    : source;
  const tags: ExifTags = ExifReader.load(buffer);
  const flat: FlatExif = {};
  for (const [key, tag] of Object.entries(tags)) {
    if (tag && typeof tag === 'object' && 'description' in tag) {
      flat[key] = tag.description as string | number;
    }
  }
  return flat;
}

export async function bulkExtractExif(files: File[]): Promise<Array<{ name: string; exif: FlatExif }>> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      exif: await extractExif(file),
    })),
  );
}
