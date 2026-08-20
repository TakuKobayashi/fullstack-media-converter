'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BatchConverter from '@/components/BatchConverter';
import { BrowserImageEngine } from '@convertmate/image';
import s from '@/styles/converter.module.css';

// For EXIF export we use a pass-through "engine" that reads exif and returns JSON
import type {
  ConversionEngine,
  ConversionJob,
  ConversionOptions,
  InputFormat,
  OutputFormat,
} from '@convertmate/shared';
import { readExif } from '@convertmate/image';
import { useTranslation } from '@/i18n';

class ExifExportEngine implements ConversionEngine {
  canConvert(_i: InputFormat, _o: OutputFormat) {
    return true;
  }
  async convert(job: ConversionJob): Promise<ConversionJob> {
    const file = job.file.source as File;
    const exif = await readExif(file);
    const json = JSON.stringify(exif, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    return { ...job, resultUrl: URL.createObjectURL(blob), status: 'done', progress: 100 };
  }
}

const engine = new ExifExportEngine();

export default function ExifClient() {
  const { t } = useTranslation();
  return (
    <div className={s.page}>
      <Nav />
      <BatchConverter
        engine={engine}
        acceptedFormats={['.jpg', '.jpeg', '.png', '.webp', '.heic', '.avif']}
        outputFormat={'json' as OutputFormat}
        badge={t('exif.badge')}
        title={t('exif.title')}
        subtitle={t('exif.subtitle')}
        prose={
          <>
            <h2>{t('exif.heading')}</h2>
            <p>{t('exif.description')}</p>
            <ul>
              {(t('exif.bullets', { returnObjects: true }) as unknown as string[]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        }
      />
      <Footer />
    </div>
  );
}
