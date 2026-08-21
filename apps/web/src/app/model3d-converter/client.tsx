'use client';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import UniversalModel3dConverter from '@/components/UniversalModel3dConverter';
import s from '@/styles/converter.module.css';

export default function Model3dConverterClient() {
  return (
    <div className={s.page}>
      <Nav />
      <UniversalModel3dConverter />
      <Footer />
    </div>
  );
}
