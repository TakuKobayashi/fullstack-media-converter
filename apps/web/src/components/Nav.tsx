'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '@/styles/nav.module.css';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/image-converter', label: 'Image Converter' },
  { href: '/video-converter', label: 'Video Converter' },
  { href: '/export-exif', label: 'EXIF' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className={s.nav}>
      <div className={`container ${s.inner}`}>
        <Link href="/" className={s.logo}>
          <span className={s.logoMark}>⚡</span>
          ConvertMate
        </Link>
        <div className={s.links}>
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`${s.link} ${path === l.href ? s.linkActive : ''}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
