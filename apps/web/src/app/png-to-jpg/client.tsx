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
        acceptedFormats={['.png']}
        outputFormat="jpg"
        badge="Image Converter"
        crossLinkHref="/image-converter"
        title="<em>PNG to JPG</em> Converter"
        subtitle="Compress PNG files to smaller JPEG format. Batch convert entire folders at once."
      />
      <Footer />
    </div>
  );
}
