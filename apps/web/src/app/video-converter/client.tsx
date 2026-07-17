'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import UniversalVideoConverter from '@/components/UniversalVideoConverter';
import s from '@/styles/converter.module.css';

export default function VideoConverterClient() {
  return (
    <div className={s.page}>
      <Nav />
      <UniversalVideoConverter />
      <Footer />
    </div>
  );
}
