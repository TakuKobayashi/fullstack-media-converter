import { ConversionEngine, ConversionJob, ConversionOptions, InputFormat, OutputFormat, canConvert } from '@convertmate/shared';

/**
 * Browser video conversion engine using @ffmpeg/ffmpeg (WASM).
 * Loaded lazily — only when a video conversion is triggered.
 *
 * Loads the single-thread ffmpeg-core build from a CDN (unpkg). The
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

  canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
    const videoFormats = ['mp4', 'mov', 'gif'] as const;
    return (videoFormats as readonly string[]).includes(inputFormat) &&
           (videoFormats as readonly string[]).includes(outputFormat) &&
           canConvert(inputFormat, outputFormat);
  }

  private async load(onProgress?: (p: number) => void): Promise<void> {
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
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

      let coreURL: string;
      let wasmURL: string;
      try {
        coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
        wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      } catch (e) {
        throw new Error(
          `Could not download the video engine from ${baseURL}. ` +
          `Check your internet connection and try again. (${e instanceof Error ? e.message : e})`
        );
      }

      await ffmpeg.load({ coreURL, wasmURL });

      if (onProgress) {
        ffmpeg.on('progress', ({ progress }: { progress: number }) => {
          // ffmpeg reports 0-1, occasionally >1 or NaN on some codecs — clamp defensively
          const pct = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress * 100)) : 0;
          onProgress(pct);
        });
      }
      ffmpeg.on('log', ({ message }: { message: string }) => {
        // eslint-disable-next-line no-console
        console.debug('[ffmpeg]', message);
      });

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
      await this.load((p) => { job.progress = p; });
    } catch (e) {
      return {
        ...job,
        status: 'error',
        error: e instanceof Error ? e.message : 'Failed to load video engine',
      };
    }

    const inputName = `input_${job.id}.${job.inputFormat}`;
    const outputName = `output_${job.id}.${job.outputFormat}`;

    try {
      const source = job.file.source;
      const data = source instanceof File
        ? await this._fetchFile(source)
        : new Uint8Array(source as ArrayBuffer);

      await this.ffmpeg.writeFile(inputName, data);

      const args = this.buildArgs(job.outputFormat, inputName, outputName);
      const exitCode = await this.ffmpeg.exec(args);

      if (exitCode !== 0) {
        throw new Error(`ffmpeg exited with code ${exitCode}. Check console for [ffmpeg] logs.`);
      }

      const result: Uint8Array = await this.ffmpeg.readFile(outputName);
      if (!result || result.byteLength === 0) {
        throw new Error('Conversion produced an empty file — the input may be unsupported or corrupted.');
      }

      const mime = job.outputFormat === 'gif' ? 'image/gif'
                   : job.outputFormat === 'mov' ? 'video/quicktime'
                   : 'video/mp4';
      const blob = new Blob([result.buffer], { type: mime });
      const resultUrl = URL.createObjectURL(blob);

      return { ...job, resultUrl, status: 'done', progress: 100 };
    } catch (err) {
      return {
        ...job,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Best-effort cleanup — ignore errors (file may not have been created)
      try { await this.ffmpeg.deleteFile(inputName); } catch { /* noop */ }
      try { await this.ffmpeg.deleteFile(outputName); } catch { /* noop */ }
    }
  }

  private buildArgs(output: string, inputName: string, outputName: string): string[] {
    if (output === 'gif') {
      return [
        '-i', inputName,
        '-vf', 'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
        '-loop', '0',
        outputName,
      ];
    }
    if (output === 'mp4') {
      return ['-i', inputName, '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-c:a', 'aac', outputName];
    }
    if (output === 'mov') {
      return ['-i', inputName, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', outputName];
    }
    return ['-i', inputName, outputName];
  }
}
