'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BatchConverter from '@/components/BatchConverter';
import { BrowserVideoEngine } from '@convertmate/video';
const engine = new BrowserVideoEngine();
import s from '@/styles/converter.module.css';

export default function ToolClient() {
  return (
    <div className={s.page}>
      <Nav />
      <BatchConverter
        engine={engine}
        acceptedFormats={['.mp4','.MP4']}
        outputFormat="gif"
        badge="Video Converter"
        crossLinkHref="/video-converter"
        title="<em>MP4 to GIF</em> Converter"
        subtitle="Create optimised animated GIFs from MP4 video clips using FFmpeg WebAssembly."
      />
      <Footer />
    </div>
  );
}
