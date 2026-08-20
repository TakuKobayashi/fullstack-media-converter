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
    const imageFormats = [
      'jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif',
      'bmp', 'svg', 'ico', 'tif', 'tiff', 'psd',
    ] as const;
    const isImageInput = (imageFormats as readonly string[]).includes(inputFormat);
    const isImageOutput = (imageFormats as readonly string[]).includes(outputFormat);
    return isImageInput && isImageOutput && canConvert(inputFormat, outputFormat);
  }

  async convert(job: ConversionJob, options: ConversionOptions = {}): Promise<ConversionJob> {
    try {
      const { quality = 100, keepExif: _keepExif = true } = options.image ?? {};
      const source = job.file.source;
      const inputFormat = job.inputFormat;
      const outputMime = getMimeType(job.outputFormat);

      let imageBlob: Blob;

      if (inputFormat === 'heic') {
        imageBlob = await this.convertFromHeic(source, job.outputFormat, quality);
      } else if (inputFormat === 'tif' || inputFormat === 'tiff') {
        imageBlob = await this.convertDecodedPixels(
          await this.decodeTiff(source), outputMime, quality,
        );
      } else if (inputFormat === 'psd') {
        imageBlob = await this.convertDecodedPixels(
          await this.decodePsd(source), outputMime, quality,
        );
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

  private async sourceToArrayBuffer(source: File | ArrayBuffer | string): Promise<ArrayBuffer> {
    if (source instanceof ArrayBuffer) return source;
    if (source instanceof Blob) return source.arrayBuffer();
    throw new Error('Browser conversion requires a File or ArrayBuffer source.');
  }

  private async decodeTiff(source: File | ArrayBuffer | string): Promise<ImageData> {
    const UTIF = await import('utif');
    const buffer = await this.sourceToArrayBuffer(source);
    const pages = UTIF.decode(buffer);
    if (!pages.length) throw new Error('No image was found in this TIFF file.');
    UTIF.decodeImage(buffer, pages[0]);
    const rgba = UTIF.toRGBA8(pages[0]);
    return new ImageData(new Uint8ClampedArray(rgba), pages[0].width, pages[0].height);
  }

  private async decodePsd(source: File | ArrayBuffer | string): Promise<ImageData> {
    const { readPsd } = await import('ag-psd');
    const buffer = await this.sourceToArrayBuffer(source);
    const psd = readPsd(buffer, {
      skipLayerImageData: true,
      skipThumbnail: true,
      useImageData: true,
    });
    if (!psd.imageData) throw new Error('This PSD file has no composite image preview.');
    return new ImageData(
      new Uint8ClampedArray(psd.imageData.data),
      psd.imageData.width,
      psd.imageData.height,
    );
  }

  private async convertDecodedPixels(
    imageData: ImageData,
    outputMime: string,
    quality: number,
  ): Promise<Blob> {
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable in this browser.');
    ctx.putImageData(imageData, 0, 0);
    return this.encodeCanvas(canvas, outputMime, quality);
  }

  private async encodeCanvas(
    canvas: OffscreenCanvas,
    outputMime: string,
    quality: number,
  ): Promise<Blob> {
    if (outputMime === 'image/avif') {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable in this browser.');
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { default: encode } = await import('@jsquash/avif/encode.js');
      const encoded = await encode(pixels, {
        quality,
        qualityAlpha: quality,
        lossless: quality === 100,
      });
      return new Blob([encoded], { type: outputMime });
    }

    if (outputMime === 'image/svg+xml') {
      const png = await canvas.convertToBlob({ type: 'image/png' });
      const dataUrl = await this.blobToDataUrl(png);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="100%" height="100%" href="${dataUrl}"/></svg>`;
      return new Blob([svg], { type: outputMime });
    }

    return canvas.convertToBlob({ type: outputMime, quality: quality / 100 });
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('Could not encode the SVG image.'));
      reader.readAsDataURL(blob);
    });
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

    const result = await this.encodeCanvas(canvas, outputMime, quality);
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
