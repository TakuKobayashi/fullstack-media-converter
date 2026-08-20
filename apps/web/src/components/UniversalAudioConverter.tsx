'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import {
  AUDIO_INPUT_EXTENSIONS,
  AUDIO_INPUT_FORMAT_LABELS,
  AUDIO_OUTPUT_FORMATS,
  type AudioOutputFormat,
  type ConversionFile,
  type ConversionJob,
  type InputFormat,
  canConvert,
  generateId,
  guessFormat,
} from '@convertmate/shared';
import { ConversionQueue } from '@convertmate/core';
import { BrowserAudioEngine } from '@convertmate/video';
import { audioBitrateAtom, audioOutputFormatAtom } from '@/state/preferences';
import { useTranslation } from '@/i18n';
import { useBatchDownload } from '@/hooks/useBatchDownload';
import s from '@/styles/converter.module.css';

const engine = new BrowserAudioEngine();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UniversalAudioConverter() {
  const { t, locale } = useTranslation();
  const [targetFormat, setTargetFormat] = useAtom(audioOutputFormatAtom);
  const [bitrate, setBitrate] = useAtom(audioBitrateAtom);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<ConversionQueue | null>(null);
  const inputs = AUDIO_INPUT_FORMAT_LABELS.join(locale === 'ja' ? '・' : ' · ');
  const outputs = AUDIO_OUTPUT_FORMATS.map(value => value.toUpperCase()).join(locale === 'ja' ? '・' : ' · ');

  const updateJob = useCallback((id: string, patch: Partial<ConversionJob>) => {
    setJobs(current => current.map(job => job.id === id ? { ...job, ...patch } : job));
  }, []);

  const addFiles = useCallback((list: FileList | File[]) => {
    const accepted = Array.from(list).filter(file => {
      const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
      return (AUDIO_INPUT_EXTENSIONS as readonly string[]).includes(extension);
    });
    setJobs(current => [...current, ...accepted.map(file => ({
      id: generateId(),
      file: { id: generateId(), name: file.name, size: file.size, source: file } as ConversionFile,
      inputFormat: (guessFormat(file.name) ?? 'mp3') as InputFormat,
      outputFormat: targetFormat,
      status: 'pending' as const,
      progress: 0,
    }))]);
  }, [targetFormat]);

  const changeTarget = useCallback((format: AudioOutputFormat) => {
    setTargetFormat(format);
    setJobs(current => current.map(job => job.status === 'pending' ? { ...job, outputFormat: format } : job));
  }, [setTargetFormat]);

  const incompatible = useMemo(() => jobs.filter(
    job => job.status === 'pending' && !canConvert(job.inputFormat, targetFormat)
  ).length, [jobs, targetFormat]);

  const convert = useCallback(async () => {
    const pending = jobs.filter(job => job.status === 'pending' && canConvert(job.inputFormat, targetFormat));
    if (!pending.length) return;
    setRunning(true);
    const queue = new ConversionQueue(engine, 1, { audio: { bitrate } });
    queueRef.current = queue;
    queue.addMany(pending);
    const unsubscribe = queue.on(({ type, job }) => {
      if (!job) return;
      if (type === 'job:start') updateJob(job.id, { status: 'processing', progress: 0 });
      if (type === 'job:progress') updateJob(job.id, { progress: job.progress });
      if (type === 'job:done') updateJob(job.id, { status: 'done', progress: 100, resultUrl: job.resultUrl });
      if (type === 'job:error') updateJob(job.id, { status: 'error', progress: 0, error: job.error });
    });
    await queue.run();
    unsubscribe();
    setRunning(false);
  }, [bitrate, jobs, targetFormat, updateJob]);

  const { downloadAll, isAllComplete, isPackaging, packageProgress, packageError } =
    useBatchDownload(jobs, 'FullstackMediaConverter-audio');

  const clear = () => {
    if (running) queueRef.current?.abort();
    jobs.forEach(job => job.resultUrl && URL.revokeObjectURL(job.resultUrl));
    setJobs([]);
    setRunning(false);
  };

  const pending = jobs.filter(job => job.status === 'pending').length;
  const done = jobs.filter(job => job.status === 'done').length;
  const errors = jobs.filter(job => job.status === 'error').length;

  return (
    <div className={s.main}>
      <section className={s.hero}><div className="container">
        <span className={s.badge}>{t('audio.badge')}</span>
        <h1 className={s.title}><em>{t('audio.title')}</em> {t('audio.suffix')}</h1>
        <p className={s.subtitle}>{t('audio.subtitle', { inputs, outputs })}</p>
      </div></section>
      <div className="container">
        <div className={s.adSlot} aria-hidden="true">{t('common.ad')}</div>
        <div
          className={`${s.dropZone} ${dragging ? s.dropZoneActive : ''}`}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={event => event.key === 'Enter' && inputRef.current?.click()}
          aria-label={t('audio.dropAria')}
        >
          <span className={s.dropIcon}>♫</span>
          <p className={s.dropTitle}>{t('audio.drop')}</p>
          <p className={s.dropSub}>{inputs}</p>
          <span className={s.browseBtn}>{t('common.browse')}</span>
          <input ref={inputRef} type="file" multiple accept={AUDIO_INPUT_EXTENSIONS.join(',')} hidden onChange={event => event.target.files && addFiles(event.target.files)} />
        </div>

        <div className={s.formatBar}>
          <span className={s.formatBarLabel}>{t('audio.to')}</span>
          <span className={s.formatArrowIcon}>→</span>
          <select className={s.formatSelect} value={targetFormat} onChange={event => changeTarget(event.target.value as AudioOutputFormat)} disabled={running}>
            {AUDIO_OUTPUT_FORMATS.map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}
          </select>
        </div>

        {incompatible > 0 && <p className={s.mixedHint}>⚠ {t('audio.incompatible', { count: incompatible, format: targetFormat.toUpperCase() })}</p>}

        {jobs.length > 0 && <div className={s.controls}>
          <span className={s.controlLabel}>{t('audio.bitrate')}</span>
          <select className={s.select} value={bitrate} onChange={event => setBitrate(Number(event.target.value))} disabled={running}>
            {[96, 128, 192, 256, 320].map(value => <option key={value} value={value}>{value} kbps</option>)}
          </select>
          {['wav', 'flac'].includes(targetFormat) && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{t('audio.losslessBitrate')}</span>}
          <button className={s.convertBtn} onClick={convert} disabled={running || pending === 0}>{running ? t('common.converting') : t('common.convertCount', { count: pending })}</button>
          <button className={s.downloadAllBtn} onClick={downloadAll} disabled={!isAllComplete || isPackaging}>{isPackaging ? t('common.zipProgress', { progress: packageProgress }) : t(jobs.length > 1 ? 'common.downloadZip' : 'common.download')}</button>
          <button onClick={clear} disabled={isPackaging} style={{ marginLeft: 'auto', background: 'none', color: 'var(--muted)' }}>{t('common.clear')}</button>
        </div>}

        {packageError && <p className={s.errorDetail}>{t('common.zipError', { error: packageError })}</p>}

        {jobs.length > 0 && <div className={s.summary}>
          <div><div className={s.summaryNum}>{jobs.length}</div><div className={s.summaryLabel}>{t('common.total')}</div></div>
          <div><div className={s.summaryNum} style={{ color: '#22c55e' }}>{done}</div><div className={s.summaryLabel}>{t('common.done')}</div></div>
          {errors > 0 && <div><div className={s.summaryNum} style={{ color: 'var(--coral)' }}>{errors}</div><div className={s.summaryLabel}>{t('common.errors')}</div></div>}
        </div>}

        {jobs.length > 0 && <div className={s.fileList}>{jobs.map(job => <div key={job.id}>
          <div className={s.fileRow}>
            <span className={s.fileIcon}>♫</span><span className={s.fileName}>{job.file.name}</span>
            <span className={s.detectedBadge}>{job.inputFormat}</span><span>→</span><span className={s.detectedBadge}>{job.outputFormat}</span>
            <span className={s.fileSize}>{formatBytes(job.file.size)}</span>
            <div className={s.progressWrap}><div className={`${s.progressBar} ${job.status === 'done' ? s.progressBarDone : ''} ${job.status === 'error' ? s.progressBarError : ''}`} style={{ width: `${job.progress}%` }} /></div>
            {job.status === 'done' && job.resultUrl && <a className={s.dlLink} href={job.resultUrl} download={job.file.name.replace(/\.[^.]+$/, `.${job.outputFormat}`)}>{t('common.save')}</a>}
            {job.status === 'pending' && <button onClick={() => setJobs(current => current.filter(item => item.id !== job.id))} style={{ background: 'none', color: 'var(--muted)' }}>×</button>}
          </div>
          {job.error && <p className={s.errorDetail}>{job.error}</p>}
        </div>)}</div>}

        <div className={s.prose}><h2>{t('audio.proseTitle')}</h2><p>{t('audio.prose')}</p><ul>
          {(t('audio.bullets', { returnObjects: true, inputs, outputs }) as unknown as string[]).map(item => <li key={item}>{item}</li>)}
        </ul></div>
      </div>
    </div>
  );
}
