#!/usr/bin/env node
/**
 * ConvertMate CLI
 * The spiritual successor to image-processing-utility-cli.
 * Now with: concurrency control, ZIP output, video, documents, EXIF, progress bars.
 */
import { program } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import fg from 'fast-glob';
import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import JSZip from 'jszip';
import { NodeImageEngine } from './engines/node-image-engine.js';
import { extractExifFromFile } from './engines/node-exif-engine.js';
import { SUPPORTED_CONVERSIONS, guessFormat, generateId, type InputFormat, type OutputFormat } from '@convertmate/shared';

const engine = new NodeImageEngine();

program
  .name('cm')
  .description(chalk.cyan('ConvertMate') + ' — batch file conversion platform')
  .version('0.1.0', '-v, --version');

// ─── convert (single file) ───────────────────────────────────────────
program
  .command('convert')
  .description('Convert a single file')
  .requiredOption('-i, --input <path>', 'Input file path')
  .requiredOption('-f, --format <format>', 'Output format (jpg|png|webp|avif|mp4|gif…)')
  .option('-o, --output <path>', 'Output file path (defaults alongside input)')
  .option('-q, --quality <number>', 'Quality 1-100 (default: 92)', '92')
  .option('--no-exif', 'Strip EXIF metadata')
  .action(async (opts) => {
    const inputPath = path.resolve(opts.input);
    if (!fs.existsSync(inputPath)) {
      console.error(chalk.red(`✖ Input not found: ${inputPath}`)); process.exit(1);
    }
    const inputFormat = guessFormat(opts.input) as InputFormat;
    const outputFormat = opts.format.toLowerCase() as OutputFormat;
    const outputPath = opts.output
      ? path.resolve(opts.output)
      : inputPath.replace(/\.[^.]+$/, `.${outputFormat}`);

    const job = {
      id: generateId(), file: { id: '1', name: path.basename(inputPath), size: 0, source: inputPath },
      inputFormat, outputFormat, status: 'pending' as const, progress: 0, resultUrl: outputPath,
    };
    console.log(chalk.dim(`${inputPath} → ${outputPath}`));
    const result = await engine.convert(job, { image: { quality: Number(opts.quality), keepExif: opts.exif !== false } });
    if (result.status === 'done') {
      console.log(chalk.green(`✔ Done: ${result.resultUrl}`));
    } else {
      console.error(chalk.red(`✖ Error: ${result.error}`)); process.exit(1);
    }
  });

// ─── bulk-convert ────────────────────────────────────────────────────
program
  .command('bulk-convert')
  .alias('bc')
  .description('Batch-convert all matching files in a directory (the main feature)')
  .requiredOption('-i, --input <dir>', 'Input directory')
  .requiredOption('--if, --input-format <fmt>', 'Input file format (e.g. webp)')
  .requiredOption('-f, --format <fmt>', 'Output format (e.g. jpg)')
  .option('-o, --output <dir>', 'Output directory (default: input dir)')
  .option('-c, --concurrency <n>', 'Max parallel jobs (default: 4)', '4')
  .option('-q, --quality <n>', 'Quality 1-100 (default: 92)', '92')
  .option('-z, --zip [name]', 'Package output files into a ZIP archive')
  .option('-r, --recursive', 'Search subdirectories recursively', true)
  .option('--no-exif', 'Strip EXIF metadata')
  .action(async (opts) => {
    const inputDir = path.resolve(opts.input);
    if (!fs.existsSync(inputDir)) {
      console.error(chalk.red(`✖ Input directory not found: ${inputDir}`)); process.exit(1);
    }
    const inputFmt = opts.inputFormat.toLowerCase();
    const outputFmt = opts.format.toLowerCase() as OutputFormat;
    const outputDir = opts.output ? path.resolve(opts.output) : inputDir;
    const concurrency = Number(opts.concurrency);
    const quality = Number(opts.quality);
    const useZip = !!opts.zip;

    // Discover files
    const pattern = opts.recursive
      ? `${inputDir.split(path.sep).join('/')}/**/*.${inputFmt}`
      : `${inputDir.split(path.sep).join('/')}/*.${inputFmt}`;
    const files = fg.sync(pattern, { dot: false });

    if (files.length === 0) {
      console.log(chalk.yellow(`⚠ No .${inputFmt} files found in ${inputDir}`)); return;
    }

    console.log(chalk.cyan(`\n ConvertMate Batch Convert`));
    console.log(chalk.dim(`  ${files.length} files  •  ${inputFmt} → ${outputFmt}  •  concurrency ${concurrency}\n`));

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const bar = new cliProgress.SingleBar({
      format: `  ${chalk.cyan('{bar}')} {percentage}% | {value}/{total} | {filename}`,
      barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true,
    });
    bar.start(files.length, 0, { filename: '' });

    const limit = pLimit(concurrency);
    const zip = useZip ? new JSZip() : null;
    const errors: string[] = [];

    await Promise.all(files.map(filePath => limit(async () => {
      const baseName = path.basename(filePath);
      const outName = baseName.replace(/\.[^.]+$/, `.${outputFmt}`);
      const outPath = path.join(outputDir, outName);

      const job = {
        id: generateId(),
        file: { id: generateId(), name: baseName, size: 0, source: filePath },
        inputFormat: inputFmt as InputFormat,
        outputFormat: outputFmt,
        status: 'pending' as const,
        progress: 0,
        resultUrl: outPath,
      };

      try {
        const result = await engine.convert(job, { image: { quality, keepExif: opts.exif !== false } });
        if (zip && result.resultUrl) {
          const data = fs.readFileSync(result.resultUrl);
          zip.file(outName, data);
        }
        bar.increment(1, { filename: baseName });
      } catch (err) {
        errors.push(`${filePath}: ${err}`);
        bar.increment(1, { filename: chalk.red(baseName) });
      }
    })));

    bar.stop();

    if (zip && opts.zip) {
      const zipName = typeof opts.zip === 'string' ? opts.zip : `convertmate-${Date.now()}.zip`;
      const zipPath = path.join(outputDir, zipName);
      const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      fs.writeFileSync(zipPath, content);
      console.log(chalk.green(`\n✔ ZIP saved: ${zipPath}`));
    }

    console.log(chalk.green(`\n✔ Converted ${files.length - errors.length}/${files.length} files`));
    if (errors.length > 0) {
      console.log(chalk.red(`✖ ${errors.length} errors:`));
      errors.forEach(e => console.log(chalk.dim(`  ${e}`)));
    }
  });

// ─── export-exif ─────────────────────────────────────────────────────
program
  .command('export-exif')
  .description('Export EXIF metadata from a single image')
  .requiredOption('-i, --input <path>', 'Input file path')
  .option('-o, --output <path>', 'Output JSON path (stdout if omitted)')
  .action(async (opts) => {
    const inputPath = path.resolve(opts.input);
    if (!fs.existsSync(inputPath)) {
      console.error(chalk.red(`✖ Not found: ${inputPath}`)); process.exit(1);
    }
    const exif = extractExifFromFile(inputPath);
    const json = JSON.stringify(exif, null, 2);
    if (opts.output) {
      fs.writeFileSync(path.resolve(opts.output), json);
      console.log(chalk.green(`✔ EXIF saved: ${opts.output}`));
    } else {
      console.log(json);
    }
  });

// ─── bulk-export-exif ────────────────────────────────────────────────
program
  .command('bulk-export-exif')
  .alias('be')
  .description('Batch export EXIF from all matching files')
  .requiredOption('-i, --input <dir>', 'Input directory')
  .requiredOption('--if, --input-format <fmt>', 'Input file format (e.g. jpg)')
  .option('-o, --output <dir>', 'Output directory for JSON files')
  .option('-c, --concurrency <n>', 'Max parallel jobs', '4')
  .option('-z, --zip [name]', 'Package JSON files into a ZIP')
  .action(async (opts) => {
    const inputDir = path.resolve(opts.input);
    const inputFmt = opts.inputFormat.toLowerCase();
    const pattern = `${inputDir.split(path.sep).join('/')}/**/*.${inputFmt}`;
    const files = fg.sync(pattern);

    if (files.length === 0) {
      console.log(chalk.yellow(`⚠ No .${inputFmt} files found`)); return;
    }

    const outputDir = opts.output ? path.resolve(opts.output) : inputDir;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const bar = new cliProgress.SingleBar({
      format: `  ${chalk.cyan('{bar}')} {percentage}% | {value}/{total}`,
      barCompleteChar: '█', barIncompleteChar: '░',
    });
    bar.start(files.length, 0);
    const limit = pLimit(Number(opts.concurrency ?? 4));
    const zip = opts.zip ? new JSZip() : null;

    await Promise.all(files.map(fp => limit(() => {
      const exif = extractExifFromFile(fp);
      const json = JSON.stringify(exif, null, 2);
      const outName = path.basename(fp).replace(/\.[^.]+$/, '.json');
      fs.writeFileSync(path.join(outputDir, outName), json);
      if (zip) zip.file(outName, json);
      bar.increment();
    })));
    bar.stop();

    if (zip && opts.zip) {
      const zipName = typeof opts.zip === 'string' ? opts.zip : `exif-${Date.now()}.zip`;
      const content = await zip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(path.join(outputDir, zipName), content);
      console.log(chalk.green(`\n✔ ZIP saved: ${path.join(outputDir, zipName)}`));
    }
    console.log(chalk.green(`\n✔ Exported ${files.length} EXIF files`));
  });

// ─── list-conversions ────────────────────────────────────────────────
program
  .command('list')
  .description('List all supported conversions')
  .action(() => {
    console.log(chalk.cyan('\n ConvertMate — Supported Conversions\n'));
    const byType: Record<string, typeof SUPPORTED_CONVERSIONS> = {};
    for (const c of SUPPORTED_CONVERSIONS) {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c);
    }
    for (const [type, conversions] of Object.entries(byType)) {
      console.log(chalk.bold(`  ${type.toUpperCase()}`));
      conversions.forEach(c => console.log(chalk.dim(`    ${c.from.padEnd(6)} → ${c.to}`)));
      console.log();
    }
  });

program.parse(process.argv);
