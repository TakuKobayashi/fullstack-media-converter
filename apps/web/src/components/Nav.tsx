'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '@/styles/nav.module.css';
import { useTranslation } from '@/i18n';

export default function Nav() {
  const path = usePathname();
  const { t } = useTranslation();
  const links = [
    { href: '/', label: t('nav.home') },
    { href: '/image-converter', label: t('nav.image') },
    { href: '/video-converter', label: t('nav.video') },
    { href: '/export-exif', label: t('nav.exif') },
  ];
  return (
    <nav className={s.nav}>
      <div className={`container ${s.inner}`}>
        <Link href="/" className={s.logo}>
          <span className={s.logoMark}>⚡</span>
          <span className={s.logoText}>Fullstack Media Converter</span>
        </Link>
        <div className={s.links}>
          {links.map(l => (
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
