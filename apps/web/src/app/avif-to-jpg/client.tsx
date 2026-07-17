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
        acceptedFormats={['.avif']}
        outputFormat="jpg"
        badge="Image Converter"
        crossLinkHref="/image-converter"
        title="<em>AVIF to JPG</em> Converter"
        subtitle="Convert modern AVIF images to widely-supported JPEG in bulk."
      />
      <Footer />
    </div>
  );
}
