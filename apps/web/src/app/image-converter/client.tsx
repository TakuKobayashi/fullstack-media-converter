'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import UniversalImageConverter from '@/components/UniversalImageConverter';
import s from '@/styles/converter.module.css';

export default function ImageConverterClient() {
  return (
    <div className={s.page}>
      <Nav />
      <UniversalImageConverter />
      <Footer />
    </div>
  );
}
