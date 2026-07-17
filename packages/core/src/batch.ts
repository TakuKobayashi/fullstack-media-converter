import { ConversionJob, ConversionFile, InputFormat, OutputFormat, generateId, guessFormat } from '@convertmate/shared';

/**
 * Build a list of ConversionJobs from a flat array of files.
 * Works with browser File objects or Node paths (passed as string source).
 */
export function buildJobs(
  files: ConversionFile[],
  outputFormat: OutputFormat,
): ConversionJob[] {
  return files.map(file => {
    const inputFormat = (guessFormat(file.name) ?? 'jpg') as InputFormat;
    return {
      id: generateId(),
      file,
      inputFormat,
      outputFormat,
      status: 'pending',
      progress: 0,
    };
  });
}

export function outputFilename(originalName: string, outputFormat: OutputFormat): string {
  const base = originalName.replace(/\.[^.]+$/, '');
  return `${base}.${outputFormat}`;
}
