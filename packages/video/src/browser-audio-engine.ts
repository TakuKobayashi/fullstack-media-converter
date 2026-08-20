import {
  AUDIO_INPUT_EXTENSIONS,
  AUDIO_OUTPUT_FORMATS,
  type AudioOutputFormat,
  type ConversionEngine,
  type ConversionJob,
  type ConversionOptions,
  type InputFormat,
  type OutputFormat,
  canConvert,
  getMimeType,
} from '@convertmate/shared';

/** Browser-only audio transcoder backed by the single-thread FFmpeg WASM core. */
export class BrowserAudioEngine implements ConversionEngine {
  private ffmpeg: any = null;
  private loadPromise: Promise<void> | null = null;
  private fetchFile: any = null;

  canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
    return (
      (AUDIO_INPUT_EXTENSIONS as readonly string[]).includes(`.${inputFormat}`) &&
      (AUDIO_OUTPUT_FORMATS as readonly string[]).includes(outputFormat) &&
      canConvert(inputFormat, outputFormat)
    );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async load(): Promise<void> {
    if (this.ffmpeg) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
      this.fetchFile = fetchFile;
      const ffmpeg = new FFmpeg();
      const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      ffmpeg.on('log', ({ message }: { message: string }) =>
        console.debug('[ffmpeg:audio]', message),
      );
      await ffmpeg.load({ coreURL, wasmURL });
      this.ffmpeg = ffmpeg;
    })();
    try {
      await this.loadPromise;
    } catch (error) {
      throw new Error(`Could not initialize the audio engine: ${this.message(error)}`);
    } finally {
      this.loadPromise = null;
    }
  }

  async convert(job: ConversionJob, options: ConversionOptions = {}): Promise<ConversionJob> {
    try {
      await this.load();
    } catch (error) {
      return { ...job, status: 'error', error: this.message(error) };
    }

    const inputName = `audio_input_${job.id}.${job.inputFormat}`;
    const outputName = `audio_output_${job.id}.${job.outputFormat}`;
    const handleProgress = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress)) options.onProgress?.(Math.min(99, Math.max(0, progress * 99)));
    };
    this.ffmpeg.on('progress', handleProgress);

    try {
      const source = job.file.source;
      const data =
        source instanceof File
          ? await this.fetchFile(source)
          : new Uint8Array(source as ArrayBuffer);
      await this.ffmpeg.writeFile(inputName, data);
      const args = this.buildArgs(
        job.outputFormat as AudioOutputFormat,
        inputName,
        outputName,
        options.audio?.bitrate ?? 320,
        options.audio?.sampleRate,
      );
      const exitCode = await this.ffmpeg.exec(args);
      if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}.`);
      const result: Uint8Array = await this.ffmpeg.readFile(outputName);
      if (!result?.byteLength) throw new Error('Conversion produced an empty audio file.');
      const blob = new Blob([Uint8Array.from(result)], { type: getMimeType(job.outputFormat) });
      return { ...job, resultUrl: URL.createObjectURL(blob), status: 'done', progress: 100 };
    } catch (error) {
      return { ...job, status: 'error', error: this.message(error) };
    } finally {
      this.ffmpeg.off('progress', handleProgress);
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

  private buildArgs(
    output: AudioOutputFormat,
    input: string,
    destination: string,
    bitrate: number,
    sampleRate?: number,
  ): string[] {
    const common = ['-i', input, '-vn'];
    if (sampleRate) common.push('-ar', String(sampleRate));
    const bitrateArg = `${bitrate}k`;
    const codecs: Record<AudioOutputFormat, string[]> = {
      mp3: ['-c:a', 'libmp3lame', '-b:a', bitrateArg],
      wav: ['-c:a', 'pcm_s16le'],
      aac: ['-c:a', 'aac', '-b:a', bitrateArg],
      m4a: ['-c:a', 'aac', '-b:a', bitrateArg],
      flac: ['-c:a', 'flac'],
      ogg: ['-c:a', 'libvorbis', '-b:a', bitrateArg],
      opus: ['-c:a', 'libopus', '-b:a', bitrateArg],
    };
    return [...common, ...codecs[output], destination];
  }
}
