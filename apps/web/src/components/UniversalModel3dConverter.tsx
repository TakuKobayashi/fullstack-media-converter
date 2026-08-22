'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDefaultStore, useAtom, useAtomValue } from 'jotai';
import { RESET } from 'jotai/utils';
import {
  MODEL3D_AUXILIARY_EXTENSIONS,
  MODEL3D_INPUT_EXTENSIONS,
  MODEL3D_INPUT_FORMAT_LABELS,
  MODEL3D_OUTPUT_FORMATS,
  MODEL3D_RELATED_FILE_EXTENSIONS,
  canConvert,
  generateId,
  guessFormat,
  isModel3dOutputCandidate,
  model3dFormatMayContainAnimations,
  model3dFormatMayContainBones,
  model3dOutputSupportsAnimations,
  model3dOutputSupportsBones,
  type ConversionFile,
  type ConversionJob,
  type InputFormat,
  type Model3dFormat,
  type Model3dOutputFormat,
  type Model3dTransparencySettings,
} from '@convertmate/shared';
import { ConversionQueue } from '@convertmate/core';
import { BrowserModel3dEngine, MMD_TRANSPARENCY_THRESHOLDS } from '@convertmate/model3d';
import { model3dOutputFormatAtom, vrmTransparencySettingsAtomFamily } from '@/state/preferences';
import VrmTransparencyPreviewModal from '@/components/VrmTransparencyPreviewModal';
import { useBatchDownload } from '@/hooks/useBatchDownload';
import { useTranslation } from '@/i18n';
import s from '@/styles/converter.module.css';

const engine = new BrowserModel3dEngine();
const jotaiStore = getDefaultStore();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeRelatedPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function relatedBasename(path: string): string {
  return path.split('/').pop() ?? path;
}

function matchReferencedFiles(referencedPaths: string[], files: File[]): File[] {
  const references = new Set(referencedPaths.map(normalizeRelatedPath));
  const basenames = new Set([...references].map(relatedBasename));
  return files.filter((file) => {
    const path = normalizeRelatedPath(file.webkitRelativePath || file.name);
    return references.has(path) || basenames.has(relatedBasename(path));
  });
}

function relatedExtensionsFor(format: InputFormat): readonly string[] {
  return (
    MODEL3D_RELATED_FILE_EXTENSIONS[
      format as keyof typeof MODEL3D_RELATED_FILE_EXTENSIONS
    ] ?? []
  );
}

function revokeJobOutputs(job: ConversionJob): void {
  const urls = new Set(job.outputs?.map((output) => output.url) ?? []);
  if (job.resultUrl) urls.add(job.resultUrl);
  urls.forEach((url) => URL.revokeObjectURL(url));
}

const TRANSPARENCY_PREVIEW_OUTPUTS = new Set<Model3dOutputFormat>(['glb', 'gltf', 'vrm']);

type VrmValidation = {
  signature: string;
  status: 'checking' | 'valid' | 'invalid';
  error?: string;
};

function Model3dTransparencySummary({
  fileName,
  outputFormat,
  onPreview,
  disabled,
}: {
  fileName: string;
  outputFormat: Model3dOutputFormat;
  onPreview: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const stored = useAtomValue(vrmTransparencySettingsAtomFamily(fileName));
  const settings = stored ?? MMD_TRANSPARENCY_THRESHOLDS;
  return (
    <div className={s.vrmSettingsSummary}>
      <span>
        {t(
          outputFormat === 'vrm'
            ? 'model3d.currentTransparency'
            : 'model3d.currentTransparencyPortable',
          {
          transparent: settings.textureTransparentMaxAlphaByte,
          opaque: settings.textureOpaqueMinAlphaByte,
          cutout: Math.round(settings.cutoutMaxIntermediateAlphaRatio * 100),
          zwrite: Math.round(settings.blendZWriteMinExtremeAlphaRatio * 100),
          },
        )}
      </span>
      {!stored && <small>{t('model3d.defaultTransparency')}</small>}
      <button type="button" onClick={onPreview} disabled={disabled}>
        {t('model3d.previewAdjust')}
      </button>
    </div>
  );
}

export default function UniversalModel3dConverter() {
  const { t, locale } = useTranslation();
  const [targetFormat, setTargetFormat] = useAtom(model3dOutputFormatAtom);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [auxiliaryFiles, setAuxiliaryFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewJob, setPreviewJob] = useState<ConversionJob>();
  const [previewFailures, setPreviewFailures] = useState<Record<string, string>>({});
  const [textureReferences, setTextureReferences] = useState<Record<string, string[]>>({});
  const [relatedDraggingJobId, setRelatedDraggingJobId] = useState<string>();
  const [appliedTransparencySettings, setAppliedTransparencySettings] = useState<
    Record<string, Model3dTransparencySettings>
  >({});
  const [vrmValidations, setVrmValidations] = useState<Record<string, VrmValidation>>({});
  const vrmValidationsRef = useRef<Record<string, VrmValidation>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<ConversionQueue | null>(null);
  const inputFormats = MODEL3D_INPUT_FORMAT_LABELS.join(locale === 'ja' ? '・' : ' · ');
  const outputFormats = MODEL3D_OUTPUT_FORMATS.map((format) => format.toUpperCase()).join(
    locale === 'ja' ? '・' : ' · ',
  );
  const batchDownloadJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !(
            job.outputFormat === 'vrm' && vrmValidations[job.id]?.status === 'invalid'
          ),
      ),
    [jobs, vrmValidations],
  );
  const { downloadAll, isAllComplete, isPackaging, packageProgress, packageError } =
    useBatchDownload(batchDownloadJobs, 'FullstackMediaConverter-model3d');
  const completedBatchDownloadCount = batchDownloadJobs
    .filter((job) => job.status === 'done')
    .reduce((count, job) => count + (job.outputs?.length ?? (job.resultUrl ? 1 : 0)), 0);
  const relatedFilesByJobId = useMemo(
    () =>
      Object.fromEntries(
        jobs.map((job) => [
          job.id,
          relatedExtensionsFor(job.inputFormat).length > 0
            ? matchReferencedFiles(textureReferences[job.id] ?? [], auxiliaryFiles)
            : [],
        ]),
      ) as Record<string, File[]>,
    [auxiliaryFiles, jobs, textureReferences],
  );

  const addRelatedFiles = useCallback((list: FileList | File[]) => {
    const related = Array.from(list).filter((file) => {
      const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
      return (MODEL3D_AUXILIARY_EXTENSIONS as readonly string[]).includes(extension);
    });
    setAuxiliaryFiles((current) => {
      const merged = new Map(
        [...current, ...related].map((file) => [file.webkitRelativePath || file.name, file]),
      );
      return [...merged.values()];
    });
  }, []);

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
      addRelatedFiles(auxiliary);
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
    [addRelatedFiles, targetFormat],
  );

  useEffect(() => {
    let cancelled = false;
    const candidates = jobs.filter(
      (job) => relatedExtensionsFor(job.inputFormat).length > 0,
    );
    if (!candidates.length) return;
    void Promise.all(
      candidates.map(async (job) => {
        try {
          if (typeof job.file.source === 'string') return [job.id, []] as const;
          const paths = await engine.getReferencedRelatedPaths(
            job.file.source,
            job.inputFormat,
            auxiliaryFiles,
          );
          return [job.id, paths] as const;
        } catch {
          return [job.id, []] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setTextureReferences((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [auxiliaryFiles, jobs]);

  const changeTarget = (format: Model3dOutputFormat) => {
    setPreviewJob(undefined);
    setTargetFormat(format);
    setJobs((current) => {
      current.forEach((job) => {
        if (job.status !== 'pending') revokeJobOutputs(job);
      });
      return current
        .filter((job) => job.status === 'pending')
        .map((job) => ({ ...job, outputFormat: format }));
    });
  };

  const incompatible = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.status === 'pending' &&
          !isModel3dOutputCandidate(job.inputFormat as Model3dFormat, targetFormat),
      ).length,
    [jobs, targetFormat],
  );
  const bonesWillBeRemoved = useMemo(
    () =>
      jobs.some((job) => model3dFormatMayContainBones(job.inputFormat as Model3dFormat)) &&
      !model3dOutputSupportsBones(targetFormat),
    [jobs, targetFormat],
  );
  const animationsWillBeRemoved = useMemo(
    () =>
      jobs.some((job) =>
        model3dFormatMayContainAnimations(job.inputFormat as Model3dFormat),
      ) && !model3dOutputSupportsAnimations(targetFormat),
    [jobs, targetFormat],
  );
  useEffect(() => {
    if (targetFormat !== 'vrm') return;
    let cancelled = false;
    const candidates = jobs.filter((job) => job.status === 'pending');
    const pendingChecks = candidates.flatMap((job) => {
      const jobAuxiliaryFiles = relatedFilesByJobId[job.id] ?? [];
      const auxiliarySignature = jobAuxiliaryFiles
        .map((file) => `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`)
        .sort()
        .join('|');
      const source = job.file.source;
      const sourceVersion =
        source instanceof File ? `${source.size}:${source.lastModified}` : job.file.size;
      const signature = `${job.id}:${sourceVersion}:${auxiliarySignature}`;
      if (vrmValidationsRef.current[job.id]?.signature === signature) return [];
      return [{ job, signature, jobAuxiliaryFiles }];
    });
    if (!pendingChecks.length) return;
    setVrmValidations((current) => {
      const next = { ...current };
      for (const { job, signature } of pendingChecks) {
        next[job.id] = isModel3dOutputCandidate(job.inputFormat as Model3dFormat, 'vrm')
          ? { signature, status: 'checking' }
          : { signature, status: 'invalid' };
      }
      vrmValidationsRef.current = next;
      return next;
    });
    void (async () => {
      for (const { job, signature, jobAuxiliaryFiles } of pendingChecks) {
        if (cancelled || !isModel3dOutputCandidate(job.inputFormat as Model3dFormat, 'vrm')) continue;
        const settings =
          appliedTransparencySettings[job.id] ??
          jotaiStore.get(vrmTransparencySettingsAtomFamily(job.file.name)) ??
          MMD_TRANSPARENCY_THRESHOLDS;
        const result = await engine.validateVrmConversion(job, jobAuxiliaryFiles, settings);
        if (cancelled) return;
        setVrmValidations((current) => {
          const next = {
            ...current,
            [job.id]: {
              signature,
              status: result.valid ? 'valid' : 'invalid',
              error: result.error,
            },
          } satisfies Record<string, VrmValidation>;
          vrmValidationsRef.current = next;
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
      for (const { job, signature } of pendingChecks) {
        const current = vrmValidationsRef.current[job.id];
        if (current?.signature === signature && current.status === 'checking') {
          const next = { ...vrmValidationsRef.current };
          delete next[job.id];
          vrmValidationsRef.current = next;
        }
      }
    };
  }, [appliedTransparencySettings, jobs, relatedFilesByJobId, targetFormat]);

  const convert = useCallback(async () => {
    const pending = jobs.filter(
      (job) =>
        job.status === 'pending' &&
        canConvert(job.inputFormat, targetFormat) &&
        (targetFormat !== 'vrm' || vrmValidations[job.id]?.status === 'valid'),
    );
    if (!pending.length) return;
    setPreviewJob(undefined);
    setRunning(true);
    const transparencyByFileName = Object.fromEntries(
      pending.map((job) => [
        job.file.name,
        appliedTransparencySettings[job.id] ??
          jotaiStore.get(vrmTransparencySettingsAtomFamily(job.file.name)) ??
          MMD_TRANSPARENCY_THRESHOLDS,
      ]),
    );
    const queue = new ConversionQueue(engine, 1, {
      model3d: { auxiliaryFiles, auxiliaryFilesByJobId: relatedFilesByJobId, transparencyByFileName },
    });
    queueRef.current = queue;
    queue.addMany(pending);
    const unsubscribe = queue.on(({ type, job }) => {
      if (!job) return;
      const patch: Partial<ConversionJob> = {};
      if (type === 'job:start') Object.assign(patch, { status: 'processing', progress: 0 });
      if (type === 'job:progress') patch.progress = job.progress;
      if (type === 'job:done') {
        Object.assign(patch, {
          status: 'done',
          progress: 100,
          resultUrl: job.resultUrl,
          outputs: job.outputs,
        });
        jotaiStore.set(vrmTransparencySettingsAtomFamily(job.file.name), RESET);
        setAppliedTransparencySettings((current) => {
          const next = { ...current };
          delete next[job.id];
          return next;
        });
      }
      if (type === 'job:error')
        Object.assign(patch, { status: 'error', progress: 0, error: job.error });
      setJobs((current) =>
        current.map((item) => (item.id === job.id ? { ...item, ...patch } : item)),
      );
    });
    await queue.run();
    unsubscribe();
    setRunning(false);
  }, [appliedTransparencySettings, auxiliaryFiles, jobs, relatedFilesByJobId, targetFormat, vrmValidations]);

  const clear = () => {
    if (running) queueRef.current?.abort();
    jobs.forEach(revokeJobOutputs);
    setJobs([]);
    setAuxiliaryFiles([]);
    setPreviewFailures({});
    setAppliedTransparencySettings({});
    setVrmValidations({});
    setTextureReferences({});
    vrmValidationsRef.current = {};
    setPreviewJob(undefined);
    setRunning(false);
  };

  const pending = jobs.filter(
    (job) =>
      job.status === 'pending' &&
      canConvert(job.inputFormat, targetFormat) &&
      (targetFormat !== 'vrm' || vrmValidations[job.id]?.status === 'valid'),
  ).length;
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
        <aside className={s.betaNotice} role="note" aria-label={t('model3d.betaTitle')}>
          <span className={s.betaNoticeIcon} aria-hidden="true">
            ⚠
          </span>
          <div>
            <strong>{t('model3d.betaTitle')}</strong>
            <p>{t('model3d.betaNotice')}</p>
          </div>
        </aside>
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
        {bonesWillBeRemoved && (
          <p className={s.boneWarning}>⚠ {t('model3d.bonesRemovedWarning')}</p>
        )}
        {animationsWillBeRemoved && (
          <p className={s.boneWarning}>⚠ {t('model3d.animationsRemovedWarning')}</p>
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
                : t(completedBatchDownloadCount > 1 ? 'common.downloadZip' : 'common.download')}
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
              <div key={job.id} className={s.modelFileGroup}>
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
                  {job.status === 'done' &&
                    (job.outputs?.length
                      ? job.outputs
                      : job.resultUrl
                        ? [{
                            name: job.file.name.replace(/\.[^.]+$/, `.${job.outputFormat}`),
                            url: job.resultUrl,
                          }]
                        : []
                    ).map((output) => (
                      <a
                        key={output.name}
                        className={s.dlLink}
                        href={output.url}
                        download={output.name}
                      >
                        {output.name}
                      </a>
                    ))}
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
                {relatedExtensionsFor(job.inputFormat).length > 0 && (
                  <div className={s.relatedFilesPanel}>
                    <div className={s.relatedFilesHeader}>
                      <strong>{t('model3d.linkedTextures')}</strong>
                      <span>
                        {t('model3d.linkedTextureCount', {
                          count: relatedFilesByJobId[job.id]?.length ?? 0,
                        })}
                      </span>
                    </div>
                    {(relatedFilesByJobId[job.id]?.length ?? 0) > 0 && (
                      <ul className={s.relatedFilesList}>
                        {relatedFilesByJobId[job.id].map((file) => (
                          <li key={file.webkitRelativePath || file.name}>
                            <span>{file.webkitRelativePath || file.name}</span>
                            <small>{formatBytes(file.size)}</small>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label
                      className={`${s.relatedDropZone} ${
                        relatedDraggingJobId === job.id ? s.relatedDropZoneActive : ''
                      }`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setRelatedDraggingJobId(job.id);
                      }}
                      onDragLeave={() => setRelatedDraggingJobId(undefined)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setRelatedDraggingJobId(undefined);
                        addRelatedFiles(event.dataTransfer.files);
                      }}
                    >
                      <span>{t('model3d.dropRelatedForModel')}</span>
                      <span className={s.browseBtn}>{t('model3d.addRelated')}</span>
                      <input
                        type="file"
                        multiple
                        accept={relatedExtensionsFor(job.inputFormat).join(',')}
                        hidden
                        disabled={running}
                        onChange={(event) => {
                          if (event.target.files) addRelatedFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                )}
                {job.error && <p className={s.errorDetail}>{job.error}</p>}
                {job.outputFormat === 'vrm' && vrmValidations[job.id]?.status === 'checking' && (
                  <p className={s.mixedHint}>{t('model3d.checkingVrmCompatibility')}</p>
                )}
                {job.outputFormat === 'vrm' && vrmValidations[job.id]?.status === 'invalid' && (
                  <p className={s.errorDetail}>
                    {t('model3d.vrmPreviewIncompatible', {
                      error: vrmValidations[job.id]?.error ?? '',
                    })}
                  </p>
                )}
                {previewFailures[`${job.id}:${job.outputFormat}`] && (
                  <p className={s.errorDetail}>
                    {t('model3d.previewFailed')} {previewFailures[`${job.id}:${job.outputFormat}`]}
                  </p>
                )}
                {(job.inputFormat === 'pmx' || job.inputFormat === 'pmd') &&
                  TRANSPARENCY_PREVIEW_OUTPUTS.has(job.outputFormat as Model3dOutputFormat) &&
                  job.status === 'pending' &&
                  !running &&
                  (job.outputFormat !== 'vrm' ||
                    vrmValidations[job.id]?.status === 'valid') &&
                  !previewFailures[`${job.id}:${job.outputFormat}`] && (
                    <Model3dTransparencySummary
                      fileName={job.file.name}
                      outputFormat={job.outputFormat as Model3dOutputFormat}
                      onPreview={() => setPreviewJob(job)}
                      disabled={running}
                    />
                  )}
              </div>
            ))}
          </div>
        )}

        {previewJob && (
          <VrmTransparencyPreviewModal
            key={previewJob.id}
            job={previewJob}
            auxiliaryFiles={relatedFilesByJobId[previewJob.id] ?? []}
            onClose={() => setPreviewJob(undefined)}
            onApply={(settings) => {
              setAppliedTransparencySettings((current) => ({
                ...current,
                [previewJob.id]: settings,
              }));
            }}
            onLoadFailure={(error) => {
              setPreviewFailures((current) => ({
                ...current,
                [`${previewJob.id}:${previewJob.outputFormat}`]: error,
              }));
              setPreviewJob(undefined);
            }}
          />
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
