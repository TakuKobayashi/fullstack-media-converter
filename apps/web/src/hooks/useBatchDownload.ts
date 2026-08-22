'use client';

import { useCallback, useMemo, useState } from 'react';
import JSZip from 'jszip';
import type { ConversionJob } from '@convertmate/shared';

export function useBatchDownload(jobs: ConversionJob[], archivePrefix: string) {
  const [isPackaging, setIsPackaging] = useState(false);
  const [packageProgress, setPackageProgress] = useState(0);
  const [packageError, setPackageError] = useState<string | null>(null);
  const completed = useMemo(
    () => jobs.filter((job) => job.status === 'done' && (job.outputs?.length || job.resultUrl)),
    [jobs],
  );
  const hasUnfinishedJobs = jobs.some(
    (job) => job.status === 'pending' || job.status === 'processing',
  );
  // Failed jobs are terminal and cannot contribute a downloadable result.
  // Allow users to package every successful conversion instead of blocking the
  // whole batch because one input failed.
  const isAllComplete = completed.length > 0 && !hasUnfinishedJobs;

  const downloadAll = useCallback(async () => {
    if (!isAllComplete || isPackaging) return;
    const outputs = completed.flatMap((job) =>
      job.outputs?.length
        ? job.outputs
        : job.resultUrl
          ? [{
              name: job.file.name.replace(/\.[^.]+$/, `.${job.outputFormat}`),
              url: job.resultUrl,
            }]
          : [],
    );
    if (outputs.length === 1) {
      const anchor = document.createElement('a');
      anchor.href = outputs[0].url;
      anchor.download = outputs[0].name;
      anchor.click();
      return;
    }

    setIsPackaging(true);
    setPackageProgress(0);
    setPackageError(null);
    try {
      const zip = new JSZip();
      for (let index = 0; index < outputs.length; index += 1) {
        const output = outputs[index];
        const data = await fetch(output.url).then((response) => {
          if (!response.ok) throw new Error(`Could not read ${output.name}.`);
          return response.arrayBuffer();
        });
        zip.file(output.name, data);
        setPackageProgress(Math.round(((index + 1) / outputs.length) * 50));
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
