import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

const MIN_IMAGE_QUALITY = 60;
const MAX_IMAGE_QUALITY = 100;

function normalizeImageQuality(value: number): number {
  if (!Number.isFinite(value)) return MAX_IMAGE_QUALITY;
  return Math.min(MAX_IMAGE_QUALITY, Math.max(MIN_IMAGE_QUALITY, Math.round(value)));
}

const storedImageQualityAtom = atomWithStorage<number>(
  'fullstack-media-converter:image-quality',
  MAX_IMAGE_QUALITY,
);

/** Shared image quality preference, persisted in localStorage by Jotai. */
export const imageQualityAtom = atom(
  get => normalizeImageQuality(get(storedImageQualityAtom)),
  (_get, set, quality: number) => set(storedImageQualityAtom, normalizeImageQuality(quality)),
);
