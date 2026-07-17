import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { ConversionEngine, ConversionJob, ConversionOptions, InputFormat, OutputFormat, canConvert } from '@convertmate/shared';

export class NodeImageEngine implements ConversionEngine {
  canConvert(inputFormat: InputFormat, outputFormat: OutputFormat): boolean {
    const supported = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'gif'];
    return supported.includes(inputFormat) && supported.includes(outputFormat) && canConvert(inputFormat, outputFormat);
  }

  async convert(job: ConversionJob, options: ConversionOptions = {}): Promise<ConversionJob> {
    const { quality = 92, keepExif = true } = options.image ?? {};
    const inputPath = job.file.source as string;
    const outputPath = job.resultUrl ?? this.deriveOutputPath(inputPath, job.outputFormat);

    let pipeline = sharp(inputPath);
    if (keepExif) pipeline = pipeline.keepExif();

    const fmt = job.outputFormat === 'jpg' ? 'jpeg' : job.outputFormat;
    await (pipeline as any).toFormat(fmt, { quality }).toFile(outputPath);

    return { ...job, resultUrl: outputPath, status: 'done', progress: 100 };
  }

  private deriveOutputPath(inputPath: string, fmt: string): string {
    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    return path.join(dir, `${base}.${fmt}`);
  }
}
