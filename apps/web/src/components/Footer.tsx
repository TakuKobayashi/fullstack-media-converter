import Link from 'next/link';
import s from '@/styles/footer.module.css';

const TOOLS = [
  { href: '/image-converter', label: 'Universal Image Converter' },
  { href: '/video-converter', label: 'Universal Video Converter' },
  { href: '/webp-to-jpg', label: 'WebP to JPG' },
  { href: '/webp-to-png', label: 'WebP to PNG' },
  { href: '/heic-to-jpg', label: 'HEIC to JPG' },
  { href: '/heic-to-png', label: 'HEIC to PNG' },
  { href: '/png-to-jpg', label: 'PNG to JPG' },
  { href: '/jpg-to-png', label: 'JPG to PNG' },
  { href: '/avif-to-jpg', label: 'AVIF to JPG' },
  { href: '/mov-to-mp4', label: 'MOV to MP4' },
  { href: '/mp4-to-gif', label: 'MP4 to GIF' },
  { href: '/jpg-to-pdf', label: 'JPG to PDF' },
  { href: '/export-exif', label: 'Export EXIF' },
];

export default function Footer() {
  return (
    <footer className={s.footer}>
      <div className={`container ${s.inner}`}>
        <p className={s.copy}>
          © {new Date().getFullYear()} ConvertMate · All processing happens in your browser · No uploads
        </p>
        <div className={s.tools}>
          {TOOLS.map(t => (
            <Link key={t.href} href={t.href} className={s.toolLink}>{t.label}</Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
