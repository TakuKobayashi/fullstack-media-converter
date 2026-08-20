import {
  ConversionEngine,
  ConversionJob,
  ConversionOptions,
  InputFormat,
  OutputFormat,
  VIDEO_INPUT_FORMATS,
  VIDEO_OUTPUT_FORMATS,
  canConvert,
  getMimeType,
} from '@convertmate/shared';

/**
 * Browser video conversion engine using @ffmpeg/ffmpeg (WASM).
 * Loaded lazily — only when a video conversion is triggered.
 *
 * Loads the single-thread ffmpeg-core build from a CDN. The
 * single-thread build does not need SharedArrayBuffer, so it works
 * without COOP/COEP headers or same-origin hosting — it's slightly
 * slower than the multi-thread build, which is an acceptable tradeoff
 * for a static site with no server-side control over response headers
 * (this app deploys as a plain static site via Cloudflare Workers Assets).
 */
export class BrowserVideoEngine implements ConversionEngine {
  private ffmpeg: any = null;
  private loadPromise: Promise<void> | null = null;
  private _fetchFile: any = null;

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return String(error);
  }

  canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
    const inputFormats: readonly string[] = VIDEO_INPUT_FORMATS.flatMap(({ extensions }) =>
      extensions.map((extension) => extension.slice(1)),
    );
    return (
      inputFormats.includes(inputFormat) &&
      (VIDEO_OUTPUT_FORMATS as readonly string[]).includes(outputFormat) &&
      canConvert(inputFormat, outputFormat)
    );
  }

  private async load(): Promise<void> {
    if (this.ffmpeg) return;
    // Avoid double-loading if multiple jobs start concurrently
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
      this._fetchFile = fetchFile;

      const ffmpeg = new FFmpeg();
      // Single-thread build from CDN — no SharedArrayBuffer, no COOP/COEP,
      // no same-origin hosting required. First load takes a few seconds
      // while the ~25MB wasm binary downloads; that's expected.
      // Next.js uses webpack, so use the UMD core. The ESM build is intended
      // for Vite and can fail when dynamically imported inside ffmpeg's
      // webpack-generated module worker.
      // Keep this on @ffmpeg/core (not @ffmpeg/core-mt): only the latter
      // requires cross-origin isolation and SharedArrayBuffer.
      const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

      let coreURL: string;
      let wasmURL: string;
      try {
        coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      } catch (e) {
        throw new Error(
          `Could not download the video engine from ${baseURL}. ` +
            `Check your internet connection and try again. (${this.errorMessage(e)})`,
        );
      }

      ffmpeg.on('log', ({ message }: { message: string }) => {
        // eslint-disable-next-line no-console
        console.debug('[ffmpeg]', message);
      });

      try {
        await ffmpeg.load({ coreURL, wasmURL });
      } catch (error) {
        throw new Error(`Could not initialize the video engine: ${this.errorMessage(error)}`);
      }

      this.ffmpeg = ffmpeg;
    })();

    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  async convert(job: ConversionJob, options: ConversionOptions = {}): Promise<ConversionJob> {
    try {
      await this.load();
    } catch (e) {
      return {
        ...job,
        status: 'error',
        error: this.errorMessage(e),
      };
    }

    const inputName = `input_${job.id}.${job.inputFormat}`;
    const outputName = `output_${job.id}.${job.outputFormat}`;
    let progressStart = 0;
    let progressSpan = 99;
    const handleProgress = ({ progress }: { progress: number }) => {
      if (!Number.isFinite(progress)) return;
      const fraction = Math.min(1, Math.max(0, progress));
      options.onProgress?.(progressStart + fraction * progressSpan);
    };

    this.ffmpeg.on('progress', handleProgress);

    try {
      const source = job.file.source;
      const data =
        source instanceof File
          ? await this._fetchFile(source)
          : new Uint8Array(source as ArrayBuffer);

      await this.ffmpeg.writeFile(inputName, data);

      let exitCode: number;
      if (job.inputFormat === 'mov' && job.outputFormat === 'mp4') {
        // Most MOV files already contain streams that MP4 can carry. Copying
        // them into a new container is dramatically faster than re-encoding.
        // Reserve a small progress segment for this quick compatibility try.
        progressSpan = 10;
        exitCode = await this.ffmpeg.exec(this.buildRemuxArgs(inputName, outputName));

        if (exitCode !== 0) {
          // A partial output may remain after a failed mux. Remove it before
          // falling back to the broadly compatible H.264/AAC encode.
          try {
            await this.ffmpeg.deleteFile(outputName);
          } catch {
            /* noop */
          }
          progressStart = 10;
          progressSpan = 89;
          options.onProgress?.(progressStart);
          exitCode = await this.ffmpeg.exec(
            this.buildArgs(job.outputFormat, inputName, outputName),
          );
        }
      } else {
        exitCode = await this.ffmpeg.exec(this.buildArgs(job.outputFormat, inputName, outputName));
      }

      if (exitCode !== 0) {
        throw new Error(`ffmpeg exited with code ${exitCode}. Check console for [ffmpeg] logs.`);
      }

      const result: Uint8Array = await this.ffmpeg.readFile(outputName);
      if (!result || result.byteLength === 0) {
        throw new Error(
          'Conversion produced an empty file — the input may be unsupported or corrupted.',
        );
      }

      const mime = getMimeType(job.outputFormat);
      // `readFile` may expose an ArrayBufferLike (including SharedArrayBuffer
      // in its type). Copy into an ordinary ArrayBuffer-backed view so Blob
      // construction is portable and type-safe in browsers.
      const outputBytes = Uint8Array.from(result);
      const blob = new Blob([outputBytes], { type: mime });
      const resultUrl = URL.createObjectURL(blob);

      return { ...job, resultUrl, status: 'done', progress: 100 };
    } catch (err) {
      return {
        ...job,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.ffmpeg.off('progress', handleProgress);
      // Best-effort cleanup — ignore errors (file may not have been created)
      try {
        await this.ffmpeg.deleteFile(inputName);
      } catch {
        /* noop */
      }
      try {
        await this.ffmpeg.deleteFile(outputName);
      } catch {
        /* noop */
      }
    }
  }

  private buildRemuxArgs(inputName: string, outputName: string): string[] {
    return [
      '-i',
      inputName,
      // Copy the playable streams and omit MOV-only data/timecode tracks
      // which commonly make an otherwise valid MP4 mux fail.
      '-map',
      '0:v?',
      '-map',
      '0:a?',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputName,
    ];
  }

  private buildArgs(output: string, inputName: string, outputName: string): string[] {
    if (output === 'gif') {
      return [
        '-i',
        inputName,
        '-vf',
        'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
        '-loop',
        '0',
        outputName,
      ];
    }
    if (output === 'mp4') {
      return [
        '-i',
        inputName,
        '-c:v',
        'libx264',
        '-crf',
        '23',
        '-preset',
        'fast',
        '-c:a',
        'aac',
        outputName,
      ];
    }
    if (output === 'mov') {
      return [
        '-i',
        inputName,
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputName,
      ];
    }
    if (output === 'webm') {
      return [
        '-i',
        inputName,
        '-c:v',
        'libvpx-vp9',
        '-crf',
        '32',
        '-b:v',
        '0',
        '-c:a',
        'libopus',
        outputName,
      ];
    }
    if (output === 'mkv') {
      return [
        '-i',
        inputName,
        '-c:v',
        'libx264',
        '-crf',
        '23',
        '-preset',
        'fast',
        '-c:a',
        'aac',
        outputName,
      ];
    }
    if (output === 'avi') {
      return ['-i', inputName, '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame', outputName];
    }
    return ['-i', inputName, outputName];
  }
}
