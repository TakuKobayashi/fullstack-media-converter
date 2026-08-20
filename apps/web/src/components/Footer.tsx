'use client';

import Link from 'next/link';
import s from '@/styles/footer.module.css';
import { useTranslation } from '@/i18n';
import { useLocalizedPath } from '@/hooks/useLocalizedPath';

export default function Footer() {
  const { t } = useTranslation();
  const localizedPath = useLocalizedPath();
  const tools = [
    { href: localizedPath('/image-converter'), label: t('footer.image') },
    { href: localizedPath('/video-converter'), label: t('footer.video') },
    { href: localizedPath('/audio-converter'), label: t('footer.audio') },
    { href: localizedPath('/export-exif'), label: t('footer.exif') },
  ];
  return (
    <footer className={s.footer}>
      <div className={`container ${s.inner}`}>
        <p className={s.copy}>
          © {new Date().getFullYear()} Fullstack Media Converter · {t('footer.privacy')}
        </p>
        <div className={s.tools}>
          {tools.map((t) => (
            <Link key={t.href} href={t.href} className={s.toolLink}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
