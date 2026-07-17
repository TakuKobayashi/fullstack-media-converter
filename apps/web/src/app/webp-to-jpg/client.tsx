'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BatchConverter from '@/components/BatchConverter';
import { BrowserImageEngine } from '@convertmate/image';
import s from '@/styles/converter.module.css';

const engine = new BrowserImageEngine();

export default function WebpToJpgClient() {
  return (
    <div className={s.page}>
      <Nav />
      <BatchConverter
        engine={engine}
        acceptedFormats={['.webp']}
        outputFormat="jpg"
        badge="Image Converter"
        crossLinkHref="/image-converter"
        title="<em>WebP to JPG</em> Converter"
        subtitle="Drag in any number of WebP files — convert them all to JPG in seconds, directly in your browser."
        prose={
          <>
            <h2>Why convert WebP to JPG?</h2>
            <p>WebP is a modern format optimized for web delivery, but many apps, printers, and platforms still prefer JPEG. ConvertMate converts entire folders of WebP images at once with no size limits and no uploads.</p>
            <ul>
              <li>Fully private — files never leave your device</li>
              <li>Batch convert hundreds of files at once</li>
              <li>Download individually or as a single ZIP</li>
              <li>Adjust quality per conversion run</li>
              <li>Works offline after first visit (PWA)</li>
            </ul>
            <h2>How to convert WebP to JPG</h2>
            <p>Drop your WebP files into the box above (or click Browse). Set your quality level, then click Convert. Each file is processed in parallel in your browser using the Canvas API. When complete, save files individually or click "Download All as ZIP."</p>
          </>
        }
      />
      <Footer />
    </div>
  );
}
