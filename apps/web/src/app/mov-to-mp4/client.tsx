'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import BatchConverter from '@/components/BatchConverter';
import { BrowserVideoEngine } from '@convertmate/video';
import s from '@/styles/converter.module.css';

const engine = new BrowserVideoEngine();

export default function MovToMp4Client() {
  return (
    <div className={s.page}>
      <Nav />
      <BatchConverter
        engine={engine}
        acceptedFormats={['.mov', '.MOV']}
        outputFormat="mp4"
        badge="Video Converter"
        crossLinkHref="/video-converter"
        title="<em>MOV to MP4</em> Converter"
        subtitle="Convert QuickTime MOV files to MP4 in your browser using WebAssembly — no upload, no server costs."
        prose={
          <>
            <h2>Why convert MOV to MP4?</h2>
            <p>QuickTime MOV files from iPhones and Macs are not always compatible with Android, Windows, or web platforms. MP4 (H.264) is the universal standard supported everywhere. ConvertMate uses FFmpeg compiled to WebAssembly so conversion happens entirely on your device.</p>
            <ul>
              <li>No upload — your videos stay on your device</li>
              <li>Powered by FFmpeg WebAssembly</li>
              <li>Batch convert multiple videos at once</li>
              <li>Full H.264 + AAC encoding for maximum compatibility</li>
            </ul>
            <p>Note: Video conversion is compute-intensive. Processing happens on your CPU so large files may take a minute. Progress is shown in real-time.</p>
          </>
        }
      />
      <Footer />
    </div>
  );
}
