'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BatchConverter from '@/components/BatchConverter';
import { BrowserImageEngine } from '@convertmate/image';
const engine = new BrowserImageEngine();
import s from '@/styles/converter.module.css';

export default function ToolClient() {
  return (
    <div className={s.page}>
      <Nav />
      <BatchConverter
        engine={engine}
        acceptedFormats={['.jpg','.jpeg']}
        outputFormat="png"
        badge="Image Converter"
        crossLinkHref="/image-converter"
        title="<em>JPG to PNG</em> Converter"
        subtitle="Convert JPEG photos to lossless PNG. Entire folders, nothing uploaded."
      />
      <Footer />
    </div>
  );
}
