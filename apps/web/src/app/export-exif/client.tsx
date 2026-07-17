'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BatchConverter from '@/components/BatchConverter';
import { BrowserImageEngine } from '@convertmate/image';
import s from '@/styles/converter.module.css';

// For EXIF export we use a pass-through "engine" that reads exif and returns JSON
import type { ConversionEngine, ConversionJob, ConversionOptions, InputFormat, OutputFormat } from '@convertmate/shared';
import { readExif } from '@convertmate/image';

class ExifExportEngine implements ConversionEngine {
  canConvert(_i: InputFormat, _o: OutputFormat) { return true; }
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
  return (
    <div className={s.page}>
      <Nav />
      <BatchConverter
        engine={engine}
        acceptedFormats={['.jpg', '.jpeg', '.png', '.webp', '.heic', '.avif']}
        outputFormat={'json' as OutputFormat}
        badge="Metadata Tool"
        title="<em>EXIF</em> Data Viewer & Bulk Export"
        subtitle="Drop any number of photos to extract and export EXIF metadata as JSON files — camera settings, GPS, timestamps and more."
        prose={
          <>
            <h2>What is EXIF data?</h2>
            <p>EXIF (Exchangeable Image File Format) stores metadata embedded in photo files: camera model, lens, aperture, shutter speed, ISO, GPS coordinates, and more. ConvertMate extracts this data from multiple photos at once and exports it as structured JSON.</p>
            <ul>
              <li>Bulk extract metadata from entire photo libraries</li>
              <li>Export as clean JSON for further processing</li>
              <li>GPS coordinates, timestamp, camera model, and more</li>
              <li>Fully private — processed in your browser</li>
            </ul>
          </>
        }
      />
      <Footer />
    </div>
  );
}
