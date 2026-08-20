import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import s from '@/styles/home.module.css';

export const metadata: Metadata = {
  title: 'ConvertMate — Private Image & Video Converter',
  description: 'Convert images and videos in bulk, entirely in your browser. No uploads, no account, and no watermarks.',
};

const CONVERTERS = [
  { href: '/image-converter', number: '01', icon: '◫', title: 'Image Converter', description: 'Convert mixed batches of JPG, PNG, WebP, HEIC, AVIF, and GIF files to one output format.', formats: ['JPG', 'PNG', 'WebP', 'HEIC', 'AVIF', 'GIF'], accent: 'violet' },
  { href: '/video-converter', number: '02', icon: '▶', title: 'Video Converter', description: 'Convert MOV and MP4 videos, or turn video clips into GIFs with FFmpeg running locally.', formats: ['MOV', 'MP4', 'GIF'], accent: 'coral' },
] as const;

const BENEFITS = [
  ['Local by design', 'Your files stay on your device. Conversion happens inside the browser.'],
  ['Built for batches', 'Add different source formats together and export the entire queue at once.'],
  ['No friction', 'No account, no upload wait, no watermark, and no server-side file limits.'],
];

export default function HomePage() {
  return (
    <div className={s.page}>
      <Nav />
      <main className={s.main}>
        <section className={s.hero}>
          <div className={`container ${s.heroInner}`}>
            <div>
              <p className={s.eyebrow}><span /> Private browser-based conversion</p>
              <h1 className={s.title}>Convert media.<br /><em>Keep it yours.</em></h1>
              <p className={s.subtitle}>A focused workspace for batch image and video conversion. Nothing is uploaded; every file is processed on your device.</p>
              <div className={s.ctaGroup}>
                <Link href="/image-converter" className={s.ctaPrimary}>Convert images <span>→</span></Link>
                <Link href="/video-converter" className={s.ctaSecondary}>Convert videos</Link>
              </div>
            </div>
            <div className={s.heroVisual} aria-hidden="true">
              <div className={s.fileStack}>
                <span className={s.fileBack}>WEBP</span><span className={s.fileMiddle}>PNG</span><span className={s.fileFront}>JPG</span>
              </div>
              <div className={s.localBadge}><span>●</span> Processed locally</div>
            </div>
          </div>
        </section>

        <section className={s.converterSection} id="converters">
          <div className="container">
            <div className={s.sectionHeading}>
              <div><p className={s.sectionEyebrow}>Choose a workspace</p><h2 className={s.sectionTitle}>Two converters. Every route.</h2></div>
              <p className={s.sectionIntro}>Choose what you are working with, then select the output format inside the converter.</p>
            </div>
            <div className={s.converterGrid}>
              {CONVERTERS.map(converter => (
                <Link key={converter.href} href={converter.href} className={`${s.converterCard} ${s[converter.accent]}`}>
                  <div className={s.cardTop}><span className={s.cardNumber}>{converter.number}</span><span className={s.cardIcon}>{converter.icon}</span></div>
                  <h3>{converter.title}</h3><p>{converter.description}</p>
                  <div className={s.formatList}>{converter.formats.map(format => <span key={format}>{format}</span>)}</div>
                  <div className={s.cardAction}>Open converter <span>↗</span></div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={s.benefits}>
          <div className={`container ${s.benefitGrid}`}>
            {BENEFITS.map(([title, description], index) => (
              <article key={title} className={s.benefit}><span>0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>
            ))}
          </div>
        </section>

        <section className={s.exifSection}>
          <div className={`container ${s.exifInner}`}>
            <div><p className={s.sectionEyebrow}>Metadata utility</p><h2>Need the data behind your photos?</h2><p>Inspect image metadata and export EXIF records from an entire batch as JSON.</p></div>
            <Link href="/export-exif" className={s.exifLink}>Open EXIF Export <span>→</span></Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
