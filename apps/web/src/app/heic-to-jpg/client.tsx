'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BatchConverter from '@/components/BatchConverter';
import { BrowserImageEngine } from '@convertmate/image';
import s from '@/styles/converter.module.css';

const engine = new BrowserImageEngine();

export default function HeicToJpgClient() {
  return (
    <div className={s.page}>
      <Nav />
      <BatchConverter
        engine={engine}
        acceptedFormats={['.heic', '.HEIC']}
        outputFormat="jpg"
        badge="iPhone Photo Converter"
        crossLinkHref="/image-converter"
        title="<em>HEIC to JPG</em> Converter"
        subtitle="Convert batches of iPhone HEIC photos to universally compatible JPG — right in your browser, nothing uploaded."
        prose={
          <>
            <h2>What is HEIC?</h2>
            <p>HEIC (High Efficiency Image Container) is the default photo format on iPhones since iOS 11. It offers better compression than JPEG but is not supported everywhere. Converting to JPG makes your photos universally compatible.</p>
            <ul>
              <li>Export your entire iPhone photo library at once</li>
              <li>Preserve image quality with adjustable compression</li>
              <li>No app install required — runs in any modern browser</li>
              <li>ZIP download for easy file management</li>
            </ul>
          </>
        }
      />
      <Footer />
    </div>
  );
}
