'use client';

import { useCallback, useMemo, useState } from 'react';
import JSZip from 'jszip';
import type { ConversionJob } from '@convertmate/shared';

export function useBatchDownload(jobs: ConversionJob[], archivePrefix: string) {
  const [isPackaging, setIsPackaging] = useState(false);
  const [packageProgress, setPackageProgress] = useState(0);
  const [packageError, setPackageError] = useState<string | null>(null);
  const completed = useMemo(
    () => jobs.filter((job) => job.status === 'done' && job.resultUrl),
    [jobs],
  );
  const isAllComplete = jobs.length > 0 && completed.length === jobs.length;

  const downloadAll = useCallback(async () => {
    if (!isAllComplete || isPackaging) return;
    if (completed.length === 1) {
      const anchor = document.createElement('a');
      anchor.href = completed[0].resultUrl!;
      anchor.download = completed[0].file.name.replace(/\.[^.]+$/, `.${completed[0].outputFormat}`);
      anchor.click();
      return;
    }

    setIsPackaging(true);
    setPackageProgress(0);
    setPackageError(null);
    try {
      const zip = new JSZip();
      for (let index = 0; index < completed.length; index += 1) {
        const job = completed[index];
        const data = await fetch(job.resultUrl!).then((response) => {
          if (!response.ok) throw new Error(`Could not read ${job.file.name}.`);
          return response.arrayBuffer();
        });
        zip.file(job.file.name.replace(/\.[^.]+$/, `.${job.outputFormat}`), data);
        setPackageProgress(Math.round(((index + 1) / completed.length) * 50));
      }
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (metadata) => setPackageProgress(50 + Math.round(metadata.percent / 2)),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${archivePrefix}-${Date.now()}.zip`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setPackageProgress(100);
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPackaging(false);
    }
  }, [archivePrefix, completed, isAllComplete, isPackaging]);

  return { downloadAll, isAllComplete, isPackaging, packageProgress, packageError };
}
