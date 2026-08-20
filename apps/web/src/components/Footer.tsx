import Link from 'next/link';
import s from '@/styles/footer.module.css';

const TOOLS = [
  { href: '/image-converter', label: 'Image Converter' },
  { href: '/video-converter', label: 'Video Converter' },
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
