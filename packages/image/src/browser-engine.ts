import {
  ConversionEngine,
  ConversionJob,
  ConversionOptions,
  InputFormat,
  OutputFormat,
  getMimeType,
  canConvert,
} from '@convertmate/shared';

/**
 * Browser image conversion engine.
 * Uses Canvas API for standard formats, heic2any for HEIC.
 * No server upload — all processing in-browser.
 */
export class BrowserImageEngine implements ConversionEngine {
  canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
    const imageFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif'] as const;
    const isImageInput = (imageFormats as readonly string[]).includes(inputFormat);
    const isImageOutput = (imageFormats as readonly string[]).includes(outputFormat);
    return isImageInput && isImageOutput && canConvert(inputFormat, outputFormat);
  }

  async convert(job: ConversionJob, options: ConversionOptions = {}): Promise<ConversionJob> {
    try {
      const { quality = 92, keepExif: _keepExif = true } = options.image ?? {};
      const source = job.file.source;
      const inputFormat = job.inputFormat;
      const outputMime = getMimeType(job.outputFormat);

      let imageBlob: Blob;

      if (inputFormat === 'heic') {
        imageBlob = await this.convertFromHeic(source, job.outputFormat, quality);
      } else {
        imageBlob = await this.convertViaCanvas(source, outputMime, quality);
      }

      if (!imageBlob || imageBlob.size === 0) {
        throw new Error('Conversion produced an empty image — the source file may be corrupted or unsupported.');
      }

      const resultUrl = URL.createObjectURL(imageBlob);
      return { ...job, resultUrl, status: 'done', progress: 100 };
    } catch (err) {
      return {
        ...job,
        status: 'error',
        error: this.describeError(err, job.inputFormat),
      };
    }
  }

  private async convertFromHeic(
    source: File | ArrayBuffer | string,
    outputFormat: OutputFormat,
    quality: number,
  ): Promise<Blob> {
    // Dynamic import to avoid loading heic2any on every page
    const heic2any = (await import('heic2any')).default;
    const inputBlob = source instanceof File
      ? source
      : new Blob([source as ArrayBuffer]);

    // heic2any only encodes to jpeg or png — map any other requested
    // output through jpeg first, then re-encode via Canvas if needed.
    const intermediateType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
    const result = await heic2any({
      blob: inputBlob,
      toType: intermediateType,
      quality: quality / 100,
    });
    const heicResult = Array.isArray(result) ? result[0] : result;

    if (outputFormat === 'png' || outputFormat === 'jpg' || outputFormat === 'jpeg') {
      return heicResult;
    }
    // Re-encode the intermediate JPEG/PNG into the actually requested format
    return this.convertViaCanvas(heicResult, getMimeType(outputFormat), quality);
  }

  private async convertViaCanvas(
    source: File | ArrayBuffer | string | Blob,
    outputMime: string,
    quality: number,
  ): Promise<Blob> {
    const blob = source instanceof Blob
      ? source
      : source instanceof File
        ? source
        : new Blob([source as ArrayBuffer]);

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch (e) {
      throw new Error(
        `Your browser could not decode this image. AVIF and some WebP variants aren't supported in every browser. (${e instanceof Error ? e.message : e})`
      );
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable in this browser.');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const result = await canvas.convertToBlob({ type: outputMime, quality: quality / 100 });
    if (!result) throw new Error(`This browser cannot encode ${outputMime} images.`);
    return result;
  }

  private describeError(err: unknown, inputFormat: string): string {
    const base = err instanceof Error ? err.message : String(err);
    if (inputFormat === 'avif' && /decode/i.test(base)) {
      return 'AVIF decoding failed. Some browsers (notably Safari on older versions) do not support AVIF — try Chrome or Firefox.';
    }
    return base;
  }
}
