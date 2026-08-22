import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  IMAGE_OUTPUT_FORMATS,
  VIDEO_OUTPUT_FORMATS,
  AUDIO_OUTPUT_FORMATS,
  MODEL3D_OUTPUT_FORMATS,
  type ImageOutputFormat,
  type VideoOutputFormat,
  type AudioOutputFormat,
  type Model3dOutputFormat,
  type Model3dTransparencySettings,
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
  (get) => normalizeImageQuality(get(storedImageQualityAtom)),
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
  (get) => {
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
  (get) => {
    const format = get(storedVideoOutputFormatAtom);
    return isVideoOutputFormat(format) ? format : 'mp4';
  },
  (_get, set, format: VideoOutputFormat) => set(storedVideoOutputFormatAtom, format),
);

function isAudioOutputFormat(value: string): value is AudioOutputFormat {
  return (AUDIO_OUTPUT_FORMATS as readonly string[]).includes(value);
}

const storedAudioOutputFormatAtom = atomWithStorage<string>(
  'fullstack-media-converter:audio-output-format',
  'mp3',
);

export const audioOutputFormatAtom = atom(
  (get) => {
    const format = get(storedAudioOutputFormatAtom);
    return isAudioOutputFormat(format) ? format : 'mp3';
  },
  (_get, set, format: AudioOutputFormat) => set(storedAudioOutputFormatAtom, format),
);

const storedAudioBitrateAtom = atomWithStorage<number>(
  'fullstack-media-converter:audio-bitrate',
  320,
);

const AUDIO_BITRATES = [96, 128, 192, 256, 320] as const;
export const audioBitrateAtom = atom(
  (get) => {
    const bitrate = get(storedAudioBitrateAtom);
    return AUDIO_BITRATES.includes(bitrate as (typeof AUDIO_BITRATES)[number]) ? bitrate : 320;
  },
  (_get, set, bitrate: number) =>
    set(
      storedAudioBitrateAtom,
      AUDIO_BITRATES.includes(bitrate as (typeof AUDIO_BITRATES)[number]) ? bitrate : 320,
    ),
);

function isModel3dOutputFormat(value: string): value is Model3dOutputFormat {
  return (MODEL3D_OUTPUT_FORMATS as readonly string[]).includes(value);
}

const storedModel3dOutputFormatAtom = atomWithStorage<string>(
  'fullstack-media-converter:model3d-output-format',
  'glb',
);

export const model3dOutputFormatAtom = atom(
  (get) => {
    const format = get(storedModel3dOutputFormatAtom);
    return isModel3dOutputFormat(format) ? format : 'glb';
  },
  (_get, set, format: Model3dOutputFormat) => set(storedModel3dOutputFormatAtom, format),
);

export const vrmTransparencyStorageKey = (fileName: string) =>
  `fullstack-media-converter:vrm-transparency:${encodeURIComponent(fileName)}`;

const createVrmTransparencySettingsAtom = (fileName: string) =>
  atomWithStorage<Model3dTransparencySettings | null>(vrmTransparencyStorageKey(fileName), null);
const vrmTransparencySettingsAtoms = new Map<
  string,
  ReturnType<typeof createVrmTransparencySettingsAtom>
>();

/** Per-file VRM settings. RESET removes the corresponding localStorage entry. */
export const vrmTransparencySettingsAtomFamily = (fileName: string) => {
  const cached = vrmTransparencySettingsAtoms.get(fileName);
  if (cached) return cached;
  const settingsAtom = createVrmTransparencySettingsAtom(fileName);
  vrmTransparencySettingsAtoms.set(fileName, settingsAtom);
  return settingsAtom;
};
