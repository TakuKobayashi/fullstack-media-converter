import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import s from '@/styles/home.module.css';

export const metadata: Metadata = {
  title: 'ConvertMate — Bulk File Converter. No Uploads. 100% Private.',
  description: 'Convert hundreds of images, videos, and documents at once. WebP, HEIC, AVIF, MOV, MP4, PDF. All processing in your browser.',
};

const FEATURED_TOOLS = [
  { href: '/image-converter', icon: '🖼️', title: 'Image Converter', desc: 'Any format in, any format out. Auto-detects each file, pick one output, convert the whole batch.' },
  { href: '/video-converter', icon: '🎬', title: 'Video Converter', desc: 'MOV, MP4, GIF — mix formats freely, pick one target, convert everything at once.' },
];

const TOOLS = [
  { href: '/webp-to-jpg', icon: '🖼️', title: 'WebP → JPG',   desc: 'Bulk convert WebP images to JPEG with quality control.' },
  { href: '/webp-to-png', icon: '🖼️', title: 'WebP → PNG',   desc: 'Lossless conversion from WebP to transparent PNG.' },
  { href: '/heic-to-jpg', icon: '📱', title: 'HEIC → JPG',   desc: 'Convert iPhone HEIC photos to universally-compatible JPG.' },
  { href: '/heic-to-png', icon: '📱', title: 'HEIC → PNG',   desc: 'HEIC to PNG with full transparency support.' },
  { href: '/png-to-jpg',  icon: '🎨', title: 'PNG → JPG',    desc: 'Compress PNG files to smaller JPEG format.' },
  { href: '/jpg-to-png',  icon: '🎨', title: 'JPG → PNG',    desc: 'Convert JPEGs to lossless PNG.' },
  { href: '/avif-to-jpg', icon: '⚡', title: 'AVIF → JPG',   desc: 'Modern AVIF images to widely-supported JPEG.' },
  { href: '/mov-to-mp4',  icon: '🎬', title: 'MOV → MP4',    desc: 'QuickTime to MP4 via FFmpeg WebAssembly — no upload.' },
  { href: '/mp4-to-gif',  icon: '🎞️', title: 'MP4 → GIF',    desc: 'Create optimised GIFs from MP4 video clips.' },
  { href: '/jpg-to-pdf',  icon: '📄', title: 'JPG → PDF',    desc: 'Combine or convert JPGs into PDF documents.' },
  { href: '/export-exif', icon: '🔍', title: 'EXIF Export',  desc: 'Bulk extract photo metadata and download as JSON.' },
];

const FEATURES = [
  { icon: '🔒', title: 'Zero Upload',       desc: 'Files are processed in your browser. Nothing is sent to any server.' },
  { icon: '⚡', title: 'Batch First',       desc: 'Built for hundreds of files at once — not just one at a time.' },
  { icon: '📦', title: 'ZIP Download',      desc: 'Download all converted files in a single ZIP archive.' },
  { icon: '🎛️', title: 'Queue Control',     desc: 'Control concurrency and quality per batch.' },
  { icon: '📶', title: 'Works Offline',     desc: 'Install as a PWA and convert files with no internet connection.' },
  { icon: '🆓', title: 'Free Forever',      desc: 'No account required. No file size limits. No watermarks.' },
];

export default function HomePage() {
  return (
    <div className={s.page}>
      <Nav />
      <main className={s.main}>

        {/* Hero */}
        <section className={s.hero}>
          <div className="container">
            <div className={s.eyebrow}>⚡ 100% In-Browser Processing</div>
            <h1 className={s.title}>
              Bulk file conversion<br />
              <em>without the upload</em>
            </h1>
            <p className={s.subtitle}>
              Convert hundreds of images, videos, and documents at once.
              Everything runs in your browser — fast, private, and free.
            </p>
            <div className={s.ctaGroup}>
              <Link href="/image-converter" className={s.ctaPrimary}>Start Converting</Link>
              <Link href="#tools" className={s.ctaSecondary}>Browse all tools →</Link>
            </div>
            <div className={s.boltRow}>
              <span className={s.boltChip}>WebP</span>
              <span className={s.boltArrow} aria-hidden="true" />
              <span className={s.boltChip}>JPG</span>
              <span className={s.boltArrow} aria-hidden="true" />
              <span className={s.boltChip}>×500 files</span>
              <span className={s.boltArrow} aria-hidden="true" />
              <span className={s.boltChip}>ZIP</span>
            </div>
          </div>
        </section>

        {/* Featured universal converters */}
        <section className={s.toolsSection} style={{ paddingBottom: 0 }}>
          <div className="container">
            <p className={s.sectionEyebrow}>Start Here</p>
            <h2 className={s.sectionTitle}>Any format in, one format out</h2>
            <div className={s.grid}>
              {FEATURED_TOOLS.map((tool, i) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={s.toolCard}
                  style={{ animationDelay: `${i * 40}ms`, borderColor: 'rgba(110,64,201,0.4)' }}
                >
                  <div className={s.toolCardIcon}>{tool.icon}</div>
                  <div className={s.toolCardTitle}>{tool.title}</div>
                  <div className={s.toolCardDesc}>{tool.desc}</div>
                  <span className={s.toolCardArrow}>Open tool →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Tools grid */}
        <section className={s.toolsSection} id="tools">
          <div className="container">
            <p className={s.sectionEyebrow}>Specific Conversions</p>
            <h2 className={s.sectionTitle}>Or pick an exact route</h2>
            <div className={s.grid}>
              {TOOLS.map((tool, i) => (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className={s.toolCard}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className={s.toolCardIcon}>{tool.icon}</div>
                  <div className={s.toolCardTitle}>{tool.title}</div>
                  <div className={s.toolCardDesc}>{tool.desc}</div>
                  <span className={s.toolCardArrow}>Open tool →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className={s.features}>
          <div className="container">
            <p className={s.sectionEyebrow}>Why ConvertMate</p>
            <h2 className={s.sectionTitle}>Built for batch. Not for one.</h2>
            <div className={s.featureGrid}>
              {FEATURES.map(f => (
                <div key={f.title} className={s.featureItem}>
                  <div className={s.featureIcon}>{f.icon}</div>
                  <div className={s.featureTitle}>{f.title}</div>
                  <div className={s.featureDesc}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
