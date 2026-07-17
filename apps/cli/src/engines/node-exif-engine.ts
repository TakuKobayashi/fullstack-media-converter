import ExifReader from 'exifreader';
import fs from 'node:fs';

export interface FlatExif {
  [key: string]: string | number | null;
}

export function extractExifFromFile(filePath: string): FlatExif {
  const buf = fs.readFileSync(filePath);
  const tags = ExifReader.load(buf.buffer);
  const flat: FlatExif = {};
  for (const [key, tag] of Object.entries(tags)) {
    if (tag && typeof tag === 'object' && 'description' in (tag as object)) {
      flat[key] = (tag as { description: string | number }).description;
    }
  }
  return flat;
}
