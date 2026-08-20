'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import UniversalAudioConverter from '@/components/UniversalAudioConverter';
import s from '@/styles/converter.module.css';

export default function AudioConverterClient() {
  return (
    <div className={s.page}>
      <Nav />
      <UniversalAudioConverter />
      <Footer />
    </div>
  );
}
