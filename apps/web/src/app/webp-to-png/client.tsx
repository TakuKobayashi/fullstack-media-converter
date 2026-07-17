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
        acceptedFormats={['.webp']}
        outputFormat="png"
        badge="Image Converter"
        crossLinkHref="/image-converter"
        title="<em>WebP to PNG</em> Converter"
        subtitle="Convert WebP images to lossless PNG in bulk — perfect for images that need transparency."
      />
      <Footer />
    </div>
  );
}
