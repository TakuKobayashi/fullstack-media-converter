'use client';

import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import s from '@/styles/home.module.css';
import { useTranslation } from '@/i18n';
import { useLocalizedPath } from '@/hooks/useLocalizedPath';
import {
  AUDIO_INPUT_FORMAT_LABELS,
  IMAGE_INPUT_FORMAT_LABELS,
  MODEL3D_INPUT_FORMAT_LABELS,
  VIDEO_INPUT_FORMAT_LABELS,
} from '@convertmate/shared';

export default function HomePage() {
  const { t, locale } = useTranslation();
  const localizedPath = useLocalizedPath();
  const converters = [
    {
      href: '/image-converter',
      number: '01',
      icon: '◫',
      formats: IMAGE_INPUT_FORMAT_LABELS,
      accent: 'violet',
      beta: false,
    },
    {
      href: '/video-converter',
      number: '02',
      icon: '▶',
      formats: VIDEO_INPUT_FORMAT_LABELS,
      accent: 'coral',
      beta: false,
    },
    {
      href: '/audio-converter',
      number: '03',
      icon: '♫',
      formats: AUDIO_INPUT_FORMAT_LABELS,
      accent: 'violet',
      beta: false,
    },
    {
      href: '/model3d-converter',
      number: '04',
      icon: '◇',
      formats: MODEL3D_INPUT_FORMAT_LABELS,
      accent: 'coral',
      beta: true,
    },
  ] as const;
  return (
    <div className={s.page}>
      <Nav />
      <main className={s.main}>
        <section className={s.hero}>
          <div className={`container ${s.heroInner}`}>
            <div>
              <p className={s.eyebrow}>
                <span /> {t('home.eyebrow')}
              </p>
              <h1 className={s.title}>
                <span className={s.titleLine}>{t('home.title')}</span>
                <em className={s.titleLine}>{t('home.titleAccent')}</em>
              </h1>
              <p className={s.subtitle}>{t('home.subtitle')}</p>
              <div className={s.ctaGroup}>
                <Link href={localizedPath('/image-converter')} className={s.ctaPrimary}>
                  {t('home.imageCta')} <span>→</span>
                </Link>
                <Link href={localizedPath('/video-converter')} className={s.ctaSecondary}>
                  {t('home.videoCta')}
                </Link>
                <Link href={localizedPath('/audio-converter')} className={s.ctaSecondary}>
                  {t('home.audioCta')}
                </Link>
                <Link href={localizedPath('/model3d-converter')} className={s.ctaSecondary}>
                  {t('home.model3dCta')}
                  <span className={s.ctaBeta}>{t('home.beta')}</span>
                </Link>
              </div>
            </div>
            <div className={s.heroVisual} aria-hidden="true">
              <div className={s.fileStack}>
                <span className={s.fileBack}>WEBP</span>
                <span className={s.fileMiddle}>PNG</span>
                <span className={s.fileFront}>JPG</span>
              </div>
              <div className={s.localBadge}>
                <span>●</span> {t('home.local')}
              </div>
            </div>
          </div>
        </section>

        <section className={s.converterSection} id="converters">
          <div className="container">
            <div className={s.sectionHeading}>
              <div>
                <p className={s.sectionEyebrow}>{t('home.sectionEyebrow')}</p>
                <h2 className={s.sectionTitle}>{t('home.sectionTitle')}</h2>
              </div>
              <p className={s.sectionIntro}>{t('home.sectionIntro')}</p>
            </div>
            <div className={s.converterGrid}>
              {converters.map((converter, index) => (
                <Link
                  key={converter.href}
                  href={localizedPath(converter.href)}
                  className={`${s.converterCard} ${s[converter.accent]}`}
                >
                  <div className={s.cardTop}>
                    <span className={s.cardNumber}>{converter.number}</span>
                    <span className={s.cardIcon}>{converter.icon}</span>
                  </div>
                  <h3>
                    {t(`home.converters.${index}.title`)}
                    {converter.beta && <span className={s.cardBeta}>{t('home.beta')}</span>}
                  </h3>
                  <p>
                    {t(`home.converters.${index}.description`, {
                      formats: converter.formats.join(locale === 'ja' ? '・' : ', '),
                    })}
                  </p>
                  <div className={s.formatList}>
                    {converter.formats.map((format) => (
                      <span key={format}>{format}</span>
                    ))}
                  </div>
                  <div className={s.cardAction}>
                    {t('home.open')} <span>↗</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={s.benefits}>
          <div className={`container ${s.benefitGrid}`}>
            {[0, 1, 2].map((index) => (
              <article key={index} className={s.benefit}>
                <span>0{index + 1}</span>
                <h3>{t(`home.benefits.${index}.title`)}</h3>
                <p>{t(`home.benefits.${index}.description`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={s.exifSection}>
          <div className={`container ${s.exifInner}`}>
            <div>
              <p className={s.sectionEyebrow}>{t('home.metadata')}</p>
              <h2>{t('home.exifTitle')}</h2>
              <p>{t('home.exifText')}</p>
            </div>
            <Link href={localizedPath('/export-exif')} className={s.exifLink}>
              {t('home.exifLink')} <span>→</span>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
