import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  IMAGE_OUTPUT_FORMATS,
  VIDEO_OUTPUT_FORMATS,
  type ImageOutputFormat,
  type VideoOutputFormat,
} from '@convertmate/shared';

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

function isImageOutputFormat(value: string): value is ImageOutputFormat {
  return (IMAGE_OUTPUT_FORMATS as readonly string[]).includes(value);
}

function isVideoOutputFormat(value: string): value is VideoOutputFormat {
  return (VIDEO_OUTPUT_FORMATS as readonly string[]).includes(value);
}

const storedImageOutputFormatAtom = atomWithStorage<string>(
  'fullstack-media-converter:image-output-format',
  'jpg',
);

export const imageOutputFormatAtom = atom(
  get => {
    const format = get(storedImageOutputFormatAtom);
    return isImageOutputFormat(format) ? format : 'jpg';
  },
  (_get, set, format: ImageOutputFormat) => set(storedImageOutputFormatAtom, format),
);

const storedVideoOutputFormatAtom = atomWithStorage<string>(
  'fullstack-media-converter:video-output-format',
  'mp4',
);

export const videoOutputFormatAtom = atom(
  get => {
    const format = get(storedVideoOutputFormatAtom);
    return isVideoOutputFormat(format) ? format : 'mp4';
  },
  (_get, set, format: VideoOutputFormat) => set(storedVideoOutputFormatAtom, format),
);
