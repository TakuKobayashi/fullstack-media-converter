'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import {
  MODEL3D_AUXILIARY_EXTENSIONS,
  MODEL3D_INPUT_EXTENSIONS,
  MODEL3D_INPUT_FORMAT_LABELS,
  MODEL3D_OUTPUT_FORMATS,
  canConvert,
  generateId,
  guessFormat,
  type ConversionFile,
  type ConversionJob,
  type InputFormat,
  type Model3dOutputFormat,
} from '@convertmate/shared';
import { ConversionQueue } from '@convertmate/core';
import { BrowserModel3dEngine } from '@convertmate/model3d';
import { model3dOutputFormatAtom } from '@/state/preferences';
import { useBatchDownload } from '@/hooks/useBatchDownload';
import { useTranslation } from '@/i18n';
import s from '@/styles/converter.module.css';

const engine = new BrowserModel3dEngine();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UniversalModel3dConverter() {
  const { t, locale } = useTranslation();
  const [targetFormat, setTargetFormat] = useAtom(model3dOutputFormatAtom);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [auxiliaryFiles, setAuxiliaryFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<ConversionQueue | null>(null);
  const inputFormats = MODEL3D_INPUT_FORMAT_LABELS.join(locale === 'ja' ? '・' : ' · ');
  const outputFormats = MODEL3D_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join(
    locale === 'ja' ? '・' : ' · ',
  );
  const { downloadAll, isAllComplete, isPackaging, packageProgress, packageError } =
    useBatchDownload(jobs, 'FullstackMediaConverter-model3d');

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const files = Array.from(list);
      const primary = files.filter((file) => {
        const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
        return (MODEL3D_INPUT_EXTENSIONS as readonly string[]).includes(extension);
      });
      const auxiliary = files.filter((file) => {
        const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
        return (MODEL3D_AUXILIARY_EXTENSIONS as readonly string[]).includes(extension);
      });
      setAuxiliaryFiles((current) => {
        const merged = new Map([...current, ...auxiliary].map((file) => [file.name, file]));
        return [...merged.values()];
      });
      setJobs((current) => [
        ...current,
        ...primary.map((file) => ({
          id: generateId(),
          file: {
            id: generateId(),
            name: file.name,
            size: file.size,
            source: file,
          } as ConversionFile,
          inputFormat: (guessFormat(file.name) ?? 'glb') as InputFormat,
          outputFormat: targetFormat,
          status: 'pending' as const,
          progress: 0,
        })),
      ]);
    },
    [targetFormat],
  );

  const changeTarget = (format: Model3dOutputFormat) => {
    setTargetFormat(format);
    setJobs((current) =>
      current.map((job) => (job.status === 'pending' ? { ...job, outputFormat: format } : job)),
    );
  };

  const incompatible = useMemo(
    () =>
      jobs.filter((job) => job.status === 'pending' && !canConvert(job.inputFormat, targetFormat))
        .length,
    [jobs, targetFormat],
  );

  const convert = useCallback(async () => {
    const pending = jobs.filter(
      (job) => job.status === 'pending' && canConvert(job.inputFormat, targetFormat),
    );
    if (!pending.length) return;
    setRunning(true);
    const queue = new ConversionQueue(engine, 1, { model3d: { auxiliaryFiles } });
    queueRef.current = queue;
    queue.addMany(pending);
    const unsubscribe = queue.on(({ type, job }) => {
      if (!job) return;
      const patch: Partial<ConversionJob> = {};
      if (type === 'job:start') Object.assign(patch, { status: 'processing', progress: 0 });
      if (type === 'job:progress') patch.progress = job.progress;
      if (type === 'job:done')
        Object.assign(patch, { status: 'done', progress: 100, resultUrl: job.resultUrl });
      if (type === 'job:error')
        Object.assign(patch, { status: 'error', progress: 0, error: job.error });
      setJobs((current) =>
        current.map((item) => (item.id === job.id ? { ...item, ...patch } : item)),
      );
    });
    await queue.run();
    unsubscribe();
    setRunning(false);
  }, [auxiliaryFiles, jobs, targetFormat]);

  const clear = () => {
    if (running) queueRef.current?.abort();
    jobs.forEach((job) => job.resultUrl && URL.revokeObjectURL(job.resultUrl));
    setJobs([]);
    setAuxiliaryFiles([]);
    setRunning(false);
  };

  const pending = jobs.filter((job) => job.status === 'pending').length;
  const done = jobs.filter((job) => job.status === 'done').length;
  const errors = jobs.filter((job) => job.status === 'error').length;

  return (
    <div className={s.main}>
      <section className={s.hero}>
        <div className="container">
          <span className={s.badge}>{t('model3d.badge')}</span>
          <h1 className={s.title}>
            <em>{t('model3d.title')}</em> {t('model3d.suffix')}
          </h1>
          <p className={s.subtitle}>
            {t('model3d.subtitle', { inputs: inputFormats, outputs: outputFormats })}
          </p>
        </div>
      </section>
      <div className="container">
        <div className={s.adSlot} aria-hidden="true">
          {t('common.ad')}
        </div>
        <div
          className={`${s.dropZone} ${dragging ? s.dropZoneActive : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => event.key === 'Enter' && inputRef.current?.click()}
        >
          <span className={s.dropIcon}>◇</span>
          <p className={s.dropTitle}>{t('model3d.drop')}</p>
          <p className={s.dropSub}>{t('model3d.dropSub', { formats: inputFormats })}</p>
          <span className={s.browseBtn}>{t('common.browse')}</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={[...MODEL3D_INPUT_EXTENSIONS, ...MODEL3D_AUXILIARY_EXTENSIONS].join(',')}
            hidden
            onChange={(event) => event.target.files && addFiles(event.target.files)}
          />
        </div>

        {auxiliaryFiles.length > 0 && (
          <p className={s.mixedHint}>{t('model3d.auxiliary', { count: auxiliaryFiles.length })}</p>
        )}

        <div className={s.formatBar}>
          <span className={s.formatBarLabel}>{t('model3d.to')}</span>
          <span className={s.formatArrowIcon}>→</span>
          <select
            className={s.formatSelect}
            value={targetFormat}
            onChange={(event) => changeTarget(event.target.value as Model3dOutputFormat)}
            disabled={running}
          >
            {MODEL3D_OUTPUT_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        {incompatible > 0 && (
          <p className={s.mixedHint}>
            ⚠{' '}
            {t('model3d.incompatible', { count: incompatible, format: targetFormat.toUpperCase() })}
          </p>
        )}

        {jobs.length > 0 && (
          <div className={s.controls}>
            <button className={s.convertBtn} onClick={convert} disabled={running || pending === 0}>
              {running ? t('common.converting') : t('common.convertCount', { count: pending })}
            </button>
            <button
              className={s.downloadAllBtn}
              onClick={downloadAll}
              disabled={!isAllComplete || isPackaging}
            >
              {isPackaging
                ? t('common.zipProgress', { progress: packageProgress })
                : t(jobs.length > 1 ? 'common.downloadZip' : 'common.download')}
            </button>
            <button
              onClick={clear}
              disabled={isPackaging}
              style={{ marginLeft: 'auto', background: 'none', color: 'var(--muted)' }}
            >
              {t('common.clear')}
            </button>
          </div>
        )}
        {packageError && (
          <p className={s.errorDetail}>{t('common.zipError', { error: packageError })}</p>
        )}

        {jobs.length > 0 && (
          <div className={s.summary}>
            <div>
              <div className={s.summaryNum}>{jobs.length}</div>
              <div className={s.summaryLabel}>{t('common.total')}</div>
            </div>
            <div>
              <div className={s.summaryNum} style={{ color: '#22c55e' }}>
                {done}
              </div>
              <div className={s.summaryLabel}>{t('common.done')}</div>
            </div>
            {errors > 0 && (
              <div>
                <div className={s.summaryNum} style={{ color: 'var(--coral)' }}>
                  {errors}
                </div>
                <div className={s.summaryLabel}>{t('common.errors')}</div>
              </div>
            )}
          </div>
        )}

        {jobs.length > 0 && (
          <div className={s.fileList}>
            {jobs.map((job) => (
              <div key={job.id}>
                <div className={s.fileRow}>
                  <span className={s.fileIcon}>◇</span>
                  <span className={s.fileName}>{job.file.name}</span>
                  <span className={s.detectedBadge}>{job.inputFormat}</span>
                  <span>→</span>
                  <span className={s.detectedBadge}>{job.outputFormat}</span>
                  <span className={s.fileSize}>{formatBytes(job.file.size)}</span>
                  <div className={s.progressWrap}>
                    <div
                      className={`${s.progressBar} ${job.status === 'done' ? s.progressBarDone : ''} ${job.status === 'error' ? s.progressBarError : ''}`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  {job.status === 'done' && job.resultUrl && (
                    <a
                      className={s.dlLink}
                      href={job.resultUrl}
                      download={job.file.name.replace(/\.[^.]+$/, `.${job.outputFormat}`)}
                    >
                      {t('common.save')}
                    </a>
                  )}
                  {job.status === 'pending' && (
                    <button
                      onClick={() =>
                        setJobs((current) => current.filter((item) => item.id !== job.id))
                      }
                      style={{ background: 'none', color: 'var(--muted)' }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {job.error && <p className={s.errorDetail}>{job.error}</p>}
              </div>
            ))}
          </div>
        )}

        <div className={s.prose}>
          <h2>{t('model3d.proseTitle')}</h2>
          <p>{t('model3d.prose')}</p>
          <ul>
            {(
              t('model3d.bullets', {
                returnObjects: true,
                inputs: inputFormats,
                outputs: outputFormats,
              }) as unknown as string[]
            ).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
