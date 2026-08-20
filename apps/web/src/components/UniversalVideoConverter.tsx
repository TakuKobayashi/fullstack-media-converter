'use client';
/**
 * UniversalVideoConverter — same pattern as UniversalImageConverter,
 * for MOV/MP4 ↔ MP4/MOV/GIF.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import {
  ConversionJob, ConversionFile, OutputFormat, InputFormat,
  generateId, guessFormat, canConvert,
} from '@convertmate/shared';
import { ConversionQueue } from '@convertmate/core';
import { BrowserVideoEngine } from '@convertmate/video';
import s from '@/styles/converter.module.css';
import { useTranslation } from '@/i18n';

const engine = new BrowserVideoEngine();
const VIDEO_INPUT_EXTENSIONS = ['.mp4', '.MP4', '.mov', '.MOV'];
const VIDEO_OUTPUT_FORMATS: OutputFormat[] = ['mp4', 'mov', 'gif'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UniversalVideoConverter() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [targetFormat, setTargetFormat] = useState<OutputFormat>('mp4');
  const [running, setRunning] = useState(false);
  // Video transcoding is CPU-heavy and ffmpeg.wasm is single-threaded per
  // instance — keep concurrency low by default to avoid tab freezes.
  const [concurrency, setConcurrency] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<ConversionQueue | null>(null);

  const updateJob = useCallback((id: string, patch: Partial<ConversionJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const valid = files.filter(f => {
      const ext = '.' + (f.name.split('.').pop() ?? '');
      return VIDEO_INPUT_EXTENSIONS.some(e => e.toLowerCase() === ext.toLowerCase());
    });
    if (valid.length === 0) return;

    setJobs(prev => {
      const newJobs: ConversionJob[] = valid.map(file => ({
        id: generateId(),
        file: { id: generateId(), name: file.name, size: file.size, source: file } as ConversionFile,
        inputFormat: (guessFormat(file.name) ?? 'mp4') as InputFormat,
        outputFormat: targetFormat,
        status: 'pending',
        progress: 0,
      }));
      return [...prev, ...newJobs];
    });
  }, [targetFormat]);

  const handleTargetFormatChange = useCallback((fmt: OutputFormat) => {
    setTargetFormat(fmt);
    setJobs(prev => prev.map(j => j.status === 'pending' ? { ...j, outputFormat: fmt } : j));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const incompatibleCount = useMemo(() => {
    return jobs.filter(j => j.status === 'pending' && !canConvert(j.inputFormat, targetFormat)).length;
  }, [jobs, targetFormat]);

  const startConversion = useCallback(async () => {
    const pending = jobs.filter(j => j.status === 'pending');
    if (pending.length === 0) return;
    setRunning(true);

    const queue = new ConversionQueue(engine, concurrency, {});
    queueRef.current = queue;
    queue.addMany(pending);

    const unsub = queue.on(({ type, job }) => {
      if (!job) return;
      if (type === 'job:start') updateJob(job.id, { status: 'processing', progress: 0 });
      if (type === 'job:progress') updateJob(job.id, { progress: job.progress });
      if (type === 'job:done')  updateJob(job.id, { status: 'done', progress: 100, resultUrl: job.resultUrl });
      if (type === 'job:error') updateJob(job.id, { status: 'error', error: job.error, progress: 0 });
    });

    await queue.run();
    unsub();
    setRunning(false);
  }, [jobs, concurrency, updateJob]);

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
    a.download = `FullstackMediaConverter-videos-${Date.now()}.zip`;
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
      <section className={s.hero}>
        <div className="container">
          <span className={s.badge}>{t('video.badge')}</span>
          <h1 className={s.title}><em>{t('video.title')}</em> {t('video.suffix')}</h1>
          <p className={s.subtitle}>{t('video.subtitle')}</p>
        </div>
      </section>

      <div className="container">
        <div className={s.adSlot} aria-hidden="true">{t('common.ad')}</div>

        <div
          className={`${s.dropZone} ${isDragOver ? s.dropZoneActive : ''}`}
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
          aria-label={t('video.dropAria')}
        >
          <span className={s.dropIcon}>🎬</span>
          <p className={s.dropTitle}>{t('video.drop')}</p>
          <p className={s.dropSub}>{t('video.dropSub')}</p>
          <span className={s.browseBtn}>{t('common.browse')}</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={VIDEO_INPUT_EXTENSIONS.join(',')}
            style={{ display: 'none' }}
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
        </div>

        <div className={s.formatBar}>
          <span className={s.formatBarLabel}>{t('video.to')}</span>
          <span className={s.formatArrowIcon}>→</span>
          <select
            className={s.formatSelect}
            value={targetFormat}
            onChange={e => handleTargetFormatChange(e.target.value as OutputFormat)}
            disabled={running}
          >
            {VIDEO_OUTPUT_FORMATS.map(fmt => (
              <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
            ))}
          </select>
          {jobs.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--muted)' }}>
              {t('video.queued', { count: jobs.length })}
            </span>
          )}
        </div>

        {incompatibleCount > 0 && (
          <p className={s.mixedHint}>
            ⚠ {t('video.incompatible', { count: incompatibleCount, format: targetFormat.toUpperCase() })}
          </p>
        )}

        {jobs.length > 0 && (
          <div className={s.controls}>
            <span className={s.controlLabel}>{t('common.threads')}</span>
            <select
              className={s.select} value={concurrency}
              onChange={e => setConcurrency(Number(e.target.value))}
              disabled={running}
            >
              {[1, 2].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {t('video.cpu')}
            </span>

            <button className={s.convertBtn} onClick={startConversion} disabled={running || pendingCount === 0}>
              {running ? <><span className={s.spinner} /> {t('common.converting')}</> : t('common.convertCount', { count: pendingCount })}
            </button>

            {doneCount > 0 && (
              <button className={s.downloadAllBtn} onClick={downloadAll}>
                ⬇ {t(doneCount > 1 ? 'common.downloadZip' : 'common.download')}
              </button>
            )}

            <button
              onClick={clearAll}
              style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--muted)', background: 'none', padding: '6px 8px' }}
            >
              {t('common.clear')}
            </button>
          </div>
        )}

        {jobs.length > 0 && (
          <div className={s.summary}>
            <div><div className={s.summaryNum}>{jobs.length}</div><div className={s.summaryLabel}>{t('common.total')}</div></div>
            <div><div className={s.summaryNum} style={{ color: '#22c55e' }}>{doneCount}</div><div className={s.summaryLabel}>{t('common.done')}</div></div>
            {processingCount > 0 && (
              <div><div className={s.summaryNum} style={{ color: 'var(--indigo-3)' }}>{processingCount}</div><div className={s.summaryLabel}>{t('common.processing')}</div></div>
            )}
            {errorCount > 0 && (
              <div><div className={s.summaryNum} style={{ color: 'var(--coral)' }}>{errorCount}</div><div className={s.summaryLabel}>{t('common.errors')}</div></div>
            )}
          </div>
        )}

        {jobs.length > 0 && (
          <div className={s.fileList}>
            {jobs.map(job => (
              <div key={job.id}>
                <div className={s.fileRow}>
                  <span className={s.fileIcon}>🎬</span>
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
                      {t('common.save')}
                    </a>
                  )}

                  {job.status === 'pending' && (
                    <button
                      onClick={() => removeJob(job.id)}
                      style={{ background: 'none', color: 'var(--muted)', fontSize: '0.9rem', padding: '2px 8px' }}
                      aria-label={t('common.remove', { name: job.file.name })}
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
          <div className={s.adSlot} style={{ marginTop: 32 }} aria-hidden="true">{t('common.ad')}</div>
        )}

        <div className={s.prose}>
          <h2>{t('video.proseTitle')}</h2>
          <p>{t('video.prose')}</p>
          <ul>
            {(t('video.bullets', { returnObjects: true }) as unknown as string[]).map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
