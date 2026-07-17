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
        outputFormat="pdf"
        badge="Document Converter"
        title="<em>JPG to PDF</em> Converter"
        subtitle="Combine or convert JPG images into PDF documents in your browser."
      />
      <Footer />
    </div>
  );
}
