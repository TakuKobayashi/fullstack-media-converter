'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '@/styles/nav.module.css';
import { useTranslation } from '@/i18n';
import { useLocalizedPath } from '@/hooks/useLocalizedPath';

export default function Nav() {
  const path = usePathname();
  const { t } = useTranslation();
  const localizedPath = useLocalizedPath();
  const links = [
    { href: localizedPath('/'), label: t('nav.home') },
    { href: localizedPath('/image-converter'), label: t('nav.image') },
    { href: localizedPath('/video-converter'), label: t('nav.video') },
    { href: localizedPath('/audio-converter'), label: t('nav.audio') },
    { href: localizedPath('/model3d-converter'), label: t('nav.model3d') },
    { href: localizedPath('/export-exif'), label: t('nav.exif') },
  ];
  return (
    <nav className={s.nav}>
      <div className={`container ${s.inner}`}>
        <Link href={localizedPath('/')} className={s.logo}>
          <span className={s.logoMark}>⚡</span>
          <span className={s.logoText}>Fullstack Media Converter</span>
        </Link>
        <div className={s.links}>
          {links.map((l) => (
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
