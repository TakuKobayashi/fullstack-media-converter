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
        acceptedFormats={['.heic','.HEIC']}
        outputFormat="png"
        badge="iPhone Converter"
        crossLinkHref="/image-converter"
        title="<em>HEIC to PNG</em> Converter"
        subtitle="Convert iPhone HEIC photos to PNG with transparency support."
      />
      <Footer />
    </div>
  );
}
