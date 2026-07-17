'use client';
/**
 * BatchConverter — core UI component shared by all tool pages.
 * Handles: drag-drop, file queue, per-job progress, ZIP download.
 * All conversion happens in the browser via the injected engine.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import {
  ConversionJob, ConversionFile, OutputFormat, InputFormat,
  generateId, guessFormat,
} from '@convertmate/shared';
import { ConversionQueue } from '@convertmate/core';
import type { ConversionEngine, ConversionOptions } from '@convertmate/shared';
import s from '@/styles/converter.module.css';

export interface BatchConverterProps {
  engine: ConversionEngine;
  acceptedFormats: string[];    // e.g. ['.webp', '.heic']
  outputFormat: OutputFormat;
  options?: ConversionOptions;
  title: string;
  subtitle: string;
  badge: string;
  /** SEO prose rendered below the tool */
  prose?: React.ReactNode;
  /** Link to the universal converter for people with mixed-format batches */
  crossLinkHref?: string;
  crossLinkLabel?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg','jpeg','png','webp','avif','heic','gif'].includes(ext ?? '')) return '🖼️';
  if (['mp4','mov'].includes(ext ?? '')) return '🎬';
  if (ext === 'pdf') return '📄';
  return '📁';
}

export default function BatchConverter({
  engine, acceptedFormats, outputFormat, options = {},
  title, subtitle, badge, prose, crossLinkHref, crossLinkLabel,
}: BatchConverterProps) {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [running, setRunning] = useState(false);
  const [concurrency, setConcurrency] = useState(3);
  const [quality, setQuality] = useState(92);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<ConversionQueue | null>(null);

  const updateJob = useCallback((id: string, patch: Partial<ConversionJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const valid = files.filter(f => {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '');
      return acceptedFormats.includes(ext);
    });
    if (valid.length === 0) return;

    const newJobs: ConversionJob[] = valid.map(file => ({
      id: generateId(),
      file: { id: generateId(), name: file.name, size: file.size, source: file } as ConversionFile,
      inputFormat: (guessFormat(file.name) ?? 'jpg') as InputFormat,
      outputFormat,
      status: 'pending',
      progress: 0,
    }));
    setJobs(prev => [...prev, ...newJobs]);
  }, [acceptedFormats, outputFormat]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const startConversion = useCallback(async () => {
    const pending = jobs.filter(j => j.status === 'pending');
    if (pending.length === 0) return;
    setRunning(true);

    const mergedOptions: ConversionOptions = {
      ...options,
      image: { quality, keepExif: true, ...options.image },
    };

    const queue = new ConversionQueue(engine, concurrency, mergedOptions);
    queueRef.current = queue;
    queue.addMany(pending);

    const unsub = queue.on(({ type, job }) => {
      if (!job) return;
      if (type === 'job:start') updateJob(job.id, { status: 'processing', progress: 0 });
      if (type === 'job:done')  updateJob(job.id, { status: 'done', progress: 100, resultUrl: job.resultUrl });
      if (type === 'job:error') updateJob(job.id, { status: 'error', error: job.error });
    });

    await queue.run();
    unsub();
    setRunning(false);
  }, [jobs, engine, concurrency, quality, options, updateJob]);

  const downloadAll = useCallback(async () => {
    const done = jobs.filter(j => j.status === 'done' && j.resultUrl);
    if (done.length === 0) return;
    if (done.length === 1) {
      const a = document.createElement('a');
      a.href = done[0].resultUrl!;
      a.download = done[0].file.name.replace(/\.[^.]+$/, `.${outputFormat}`);
      a.click();
      return;
    }
    const zip = new JSZip();
    await Promise.all(done.map(async job => {
      const res = await fetch(job.resultUrl!);
      const buf = await res.arrayBuffer();
      const name = job.file.name.replace(/\.[^.]+$/, `.${outputFormat}`);
      zip.file(name, buf);
    }));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convertmate-${outputFormat}-${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [jobs, outputFormat]);

  const clearAll = () => {
    if (running && queueRef.current) queueRef.current.abort();
    // Revoke object URLs
    jobs.forEach(j => { if (j.resultUrl?.startsWith('blob:')) URL.revokeObjectURL(j.resultUrl); });
    setJobs([]);
    setRunning(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { jobs.forEach(j => { if (j.resultUrl?.startsWith('blob:')) URL.revokeObjectURL(j.resultUrl); }); };
  }, []);

  const pendingCount   = jobs.filter(j => j.status === 'pending').length;
  const doneCount      = jobs.filter(j => j.status === 'done').length;
  const errorCount     = jobs.filter(j => j.status === 'error').length;
  const processingCount = jobs.filter(j => j.status === 'processing').length;

  return (
    <div className={s.main}>
      {/* Hero */}
      <section className={s.hero}>
        <div className="container">
          <span className={s.badge}>{badge}</span>
          <h1 className={s.title} dangerouslySetInnerHTML={{ __html: title }} />
          <p className={s.subtitle}>{subtitle}</p>
          {crossLinkHref && (
            <p style={{ marginTop: 12 }}>
              <a href={crossLinkHref} style={{ fontSize: '0.85rem', color: 'var(--indigo-3)' }}>
                {crossLinkLabel ?? 'Have a mix of formats? Try the universal converter →'}
              </a>
            </p>
          )}
        </div>
      </section>

      <div className="container">
        {/* Ad slot top */}
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
          aria-label="Drop files here or click to browse"
        >
          <span className={s.dropIcon}>📂</span>
          <p className={s.dropTitle}>Drop files here</p>
          <p className={s.dropSub}>
            Accepts {acceptedFormats.join(', ')} · Multiple files · Entire folders
          </p>
          <span className={s.browseBtn}>Browse Files</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={acceptedFormats.join(',')}
            className={s['sr-only']}
            style={{ display: 'none' }}
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
        </div>

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
            <div>
              <div className={s.summaryNum}>{jobs.length}</div>
              <div className={s.summaryLabel}>Total</div>
            </div>
            <div>
              <div className={s.summaryNum} style={{ color: '#22c55e' }}>{doneCount}</div>
              <div className={s.summaryLabel}>Done</div>
            </div>
            {processingCount > 0 && (
              <div>
                <div className={s.summaryNum} style={{ color: 'var(--indigo-3)' }}>{processingCount}</div>
                <div className={s.summaryLabel}>Processing</div>
              </div>
            )}
            {errorCount > 0 && (
              <div>
                <div className={s.summaryNum} style={{ color: 'var(--coral)' }}>{errorCount}</div>
                <div className={s.summaryLabel}>Errors</div>
              </div>
            )}
          </div>
        )}

        {/* File list */}
        {jobs.length > 0 && (
          <div className={s.fileList}>
            {jobs.map(job => (
              <div key={job.id}>
                <div className={s.fileRow}>
                  <span className={s.fileIcon}>{fileIcon(job.file.name)}</span>
                  <span className={s.fileName}>{job.file.name}</span>
                  <span className={s.fileSize}>{formatBytes(job.file.size)}</span>

                  <div className={s.progressWrap}>
                    <div
                      className={`${s.progressBar} ${job.status === 'done' ? s.progressBarDone : ''} ${job.status === 'error' ? s.progressBarError : ''}`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>

                  <span className={s[`status${job.status.charAt(0).toUpperCase() + job.status.slice(1)}` as keyof typeof s]}>
                    {job.status === 'pending' && '–'}
                    {job.status === 'processing' && <><span className={s.spinner} /> {job.progress}%</>}
                    {job.status === 'done' && '✔'}
                    {job.status === 'error' && '✖'}
                  </span>

                  {job.status === 'done' && job.resultUrl && (
                    <a
                      href={job.resultUrl}
                      download={job.file.name.replace(/\.[^.]+$/, `.${outputFormat}`)}
                      className={s.dlLink}
                    >
                      Save
                    </a>
                  )}
                </div>
                {job.status === 'error' && job.error && (
                  <p className={s.errorDetail}>{job.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Ad slot bottom */}
        {jobs.length > 0 && (
          <div className={s.adSlot} style={{ marginTop: 32 }} aria-hidden="true">Advertisement</div>
        )}

        {/* SEO prose */}
        {prose && <div className={s.prose}>{prose}</div>}
      </div>
    </div>
  );
}
