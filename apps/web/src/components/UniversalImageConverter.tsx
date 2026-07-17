'use client';
/**
 * UniversalImageConverter — one page, any image format in, any format out.
 *
 * Unlike BatchConverter (which is locked to a single input→output route
 * for SEO landing pages), this component:
 *  - accepts any supported image format in a single drop zone
 *  - detects each file's format from its extension
 *  - lets the user pick ONE target format from a dropdown
 *  - converts every file in the batch to that one target format
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import {
  ConversionJob, ConversionFile, OutputFormat, InputFormat,
  generateId, guessFormat, IMAGE_OUTPUT_FORMATS, IMAGE_INPUT_EXTENSIONS,
  canConvert,
} from '@convertmate/shared';
import { ConversionQueue } from '@convertmate/core';
import { BrowserImageEngine } from '@convertmate/image';
import s from '@/styles/converter.module.css';

const engine = new BrowserImageEngine();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UniversalImageConverter() {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [targetFormat, setTargetFormat] = useState<OutputFormat>('jpg');
  const [running, setRunning] = useState(false);
  const [concurrency, setConcurrency] = useState(3);
  const [quality, setQuality] = useState(92);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<ConversionQueue | null>(null);

  const updateJob = useCallback((id: string, patch: Partial<ConversionJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }, []);

  // Detect input format per file, tag the job with the currently-selected
  // target format. If the user later changes the dropdown, pending jobs'
  // outputFormat is updated too (see the effect below).
  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const valid = files.filter(f => {
      const ext = '.' + (f.name.split('.').pop() ?? '');
      return IMAGE_INPUT_EXTENSIONS.some(e => e.toLowerCase() === ext.toLowerCase());
    });
    if (valid.length === 0) return;

    setJobs(prev => {
      const newJobs: ConversionJob[] = valid.map(file => ({
        id: generateId(),
        file: { id: generateId(), name: file.name, size: file.size, source: file } as ConversionFile,
        inputFormat: (guessFormat(file.name) ?? 'jpg') as InputFormat,
        outputFormat: targetFormat,
        status: 'pending',
        progress: 0,
      }));
      return [...prev, ...newJobs];
    });
  }, [targetFormat]);

  // Keep pending jobs' outputFormat in sync with the dropdown
  const handleTargetFormatChange = useCallback((fmt: OutputFormat) => {
    setTargetFormat(fmt);
    setJobs(prev => prev.map(j => j.status === 'pending' ? { ...j, outputFormat: fmt } : j));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // Warn (not block) when some pending files can't reach the chosen target
  const incompatibleCount = useMemo(() => {
    return jobs.filter(j => j.status === 'pending' && !canConvert(j.inputFormat, targetFormat)).length;
  }, [jobs, targetFormat]);

  const startConversion = useCallback(async () => {
    const pending = jobs.filter(j => j.status === 'pending');
    if (pending.length === 0) return;
    setRunning(true);

    const queue = new ConversionQueue(engine, concurrency, { image: { quality, keepExif: true } });
    queueRef.current = queue;
    queue.addMany(pending);

    const unsub = queue.on(({ type, job }) => {
      if (!job) return;
      if (type === 'job:start') updateJob(job.id, { status: 'processing', progress: 0 });
      if (type === 'job:done')  updateJob(job.id, { status: 'done', progress: 100, resultUrl: job.resultUrl });
      if (type === 'job:error') updateJob(job.id, { status: 'error', error: job.error, progress: 0 });
    });

    await queue.run();
    unsub();
    setRunning(false);
  }, [jobs, concurrency, quality, updateJob]);

  const downloadAll = useCallback(async () => {
    const done = jobs.filter(j => j.status === 'done' && j.resultUrl);
    if (done.length === 0) return;
    if (done.length === 1) {
      const a = document.createElement('a');
      a.href = done[0].resultUrl!;
      a.download = done[0].file.name.replace(/\.[^.]+$/, `.${done[0].outputFormat}`);
      a.click();
      return;
    }
    const zip = new JSZip();
    await Promise.all(done.map(async job => {
      const res = await fetch(job.resultUrl!);
      const buf = await res.arrayBuffer();
      const name = job.file.name.replace(/\.[^.]+$/, `.${job.outputFormat}`);
      zip.file(name, buf);
    }));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convertmate-images-${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [jobs]);

  const clearAll = () => {
    if (running && queueRef.current) queueRef.current.abort();
    jobs.forEach(j => { if (j.resultUrl?.startsWith('blob:')) URL.revokeObjectURL(j.resultUrl); });
    setJobs([]);
    setRunning(false);
  };

  const removeJob = (id: string) => setJobs(prev => prev.filter(j => j.id !== id));

  useEffect(() => {
    return () => { jobs.forEach(j => { if (j.resultUrl?.startsWith('blob:')) URL.revokeObjectURL(j.resultUrl); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCount    = jobs.filter(j => j.status === 'pending').length;
  const doneCount       = jobs.filter(j => j.status === 'done').length;
  const errorCount      = jobs.filter(j => j.status === 'error').length;
  const processingCount = jobs.filter(j => j.status === 'processing').length;

  return (
    <div className={s.main}>
      {/* Hero */}
      <section className={s.hero}>
        <div className="container">
          <span className={s.badge}>Image Converter</span>
          <h1 className={s.title}>
            <em>Universal Image</em> Converter
          </h1>
          <p className={s.subtitle}>
            Drop any mix of JPG, PNG, WebP, HEIC, AVIF or GIF files — pick one output format, convert them all at once.
          </p>
        </div>
      </section>

      <div className="container">
        <div className={s.adSlot} aria-hidden="true">Advertisement</div>

        {/* Drop zone */}
        <div
          className={`${s.dropZone} ${isDragOver ? s.dropZoneActive : ''}`}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
          aria-label="Drop image files here or click to browse"
        >
          <span className={s.dropIcon}>📂</span>
          <p className={s.dropTitle}>Drop images here</p>
          <p className={s.dropSub}>JPG · PNG · WebP · HEIC · AVIF · GIF — any mix, any number of files</p>
          <span className={s.browseBtn}>Browse Files</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={IMAGE_INPUT_EXTENSIONS.join(',')}
            style={{ display: 'none' }}
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* Output format selector — the core of this page */}
        <div className={s.formatBar}>
          <span className={s.formatBarLabel}>Convert everything to</span>
          <span className={s.formatArrowIcon}>→</span>
          <select
            className={s.formatSelect}
            value={targetFormat}
            onChange={e => handleTargetFormatChange(e.target.value as OutputFormat)}
            disabled={running}
          >
            {IMAGE_OUTPUT_FORMATS.map(fmt => (
              <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
            ))}
          </select>

          {jobs.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--muted)' }}>
              {jobs.length} file{jobs.length !== 1 ? 's' : ''} queued
            </span>
          )}
        </div>

        {incompatibleCount > 0 && (
          <p className={s.mixedHint}>
            ⚠ {incompatibleCount} file{incompatibleCount !== 1 ? 's' : ''} can&apos;t convert to {targetFormat.toUpperCase()} and will be skipped — pick a different format or remove them.
          </p>
        )}

        {/* Controls */}
        {jobs.length > 0 && (
          <div className={s.controls}>
            <span className={s.controlLabel}>Quality</span>
            <input
              type="range" min={60} max={100} value={quality}
              onChange={e => setQuality(Number(e.target.value))}
              disabled={running}
              style={{ width: 100, accentColor: 'var(--indigo)' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', minWidth: 28 }}>{quality}</span>

            <span className={s.controlLabel} style={{ marginLeft: 12 }}>Threads</span>
            <select
              className={s.select} value={concurrency}
              onChange={e => setConcurrency(Number(e.target.value))}
              disabled={running}
            >
              {[1,2,3,4,6,8].map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            <button className={s.convertBtn} onClick={startConversion} disabled={running || pendingCount === 0}>
              {running ? <><span className={s.spinner} /> Converting…</> : `Convert ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
            </button>

            {doneCount > 0 && (
              <button className={s.downloadAllBtn} onClick={downloadAll}>
                ⬇ Download {doneCount > 1 ? `All as ZIP` : ''}
              </button>
            )}

            <button
              onClick={clearAll}
              style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--muted)', background: 'none', padding: '6px 8px' }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Summary */}
        {jobs.length > 0 && (
          <div className={s.summary}>
            <div><div className={s.summaryNum}>{jobs.length}</div><div className={s.summaryLabel}>Total</div></div>
            <div><div className={s.summaryNum} style={{ color: '#22c55e' }}>{doneCount}</div><div className={s.summaryLabel}>Done</div></div>
            {processingCount > 0 && (
              <div><div className={s.summaryNum} style={{ color: 'var(--indigo-3)' }}>{processingCount}</div><div className={s.summaryLabel}>Processing</div></div>
            )}
            {errorCount > 0 && (
              <div><div className={s.summaryNum} style={{ color: 'var(--coral)' }}>{errorCount}</div><div className={s.summaryLabel}>Errors</div></div>
            )}
          </div>
        )}

        {/* File list */}
        {jobs.length > 0 && (
          <div className={s.fileList}>
            {jobs.map(job => (
              <div key={job.id}>
                <div className={s.fileRow}>
                  <span className={s.fileIcon}>🖼️</span>
                  <span className={s.fileName}>{job.file.name}</span>
                  <span className={s.detectedBadge}>{job.inputFormat}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>→</span>
                  <span className={s.detectedBadge}>{job.outputFormat}</span>
                  <span className={s.fileSize}>{formatBytes(job.file.size)}</span>

                  <div className={s.progressWrap}>
                    <div
                      className={`${s.progressBar} ${job.status === 'done' ? s.progressBarDone : ''} ${job.status === 'error' ? s.progressBarError : ''}`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>

                  <span className={
                    job.status === 'pending' ? s.statusPending :
                    job.status === 'processing' ? s.statusProcessing :
                    job.status === 'done' ? s.statusDone : s.statusError
                  }>
                    {job.status === 'pending' && '–'}
                    {job.status === 'processing' && <><span className={s.spinner} /> {job.progress}%</>}
                    {job.status === 'done' && '✔'}
                    {job.status === 'error' && '✖'}
                  </span>

                  {job.status === 'done' && job.resultUrl && (
                    <a
                      href={job.resultUrl}
                      download={job.file.name.replace(/\.[^.]+$/, `.${job.outputFormat}`)}
                      className={s.dlLink}
                    >
                      Save
                    </a>
                  )}

                  {job.status === 'pending' && (
                    <button
                      onClick={() => removeJob(job.id)}
                      style={{ background: 'none', color: 'var(--muted)', fontSize: '0.9rem', padding: '2px 8px' }}
                      aria-label={`Remove ${job.file.name}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {job.status === 'error' && job.error && (
                  <p className={s.errorDetail}>{job.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {jobs.length > 0 && (
          <div className={s.adSlot} style={{ marginTop: 32 }} aria-hidden="true">Advertisement</div>
        )}

        <div className={s.prose}>
          <h2>One page, every image format</h2>
          <p>
            Most converters make you pick a specific tool for WebP→JPG, another for HEIC→PNG, and so on.
            This page detects each file&apos;s format automatically and lets you pick a single destination
            format from the dropdown — convert a mixed folder of JPGs, PNGs, HEICs and WebPs to WebP in one batch.
          </p>
          <ul>
            <li>Auto-detects input format from each file&apos;s extension</li>
            <li>One dropdown controls the output format for the whole batch</li>
            <li>Mixed-format folders are fully supported</li>
            <li>100% browser-side — nothing is uploaded</li>
            <li>Download individually or as a single ZIP</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
