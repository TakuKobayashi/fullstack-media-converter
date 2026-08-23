'use client';

import { useEffect, useRef, useState } from 'react';
import s from '@/styles/converter.module.css';

const WIDGET_WIDTH = 468;
const WIDGET_HEIGHT = 160;
const WIDGET_DOCUMENT = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=468" />
    <style>html,body{width:468px;height:160px;margin:0;overflow:hidden;background:transparent}</style>
  </head>
  <body>
    <script type="text/javascript">
      rakuten_design="slide";
      rakuten_affiliateId="1583c1be.a2524a4d.1583c1bf.50d63d09";
      rakuten_items="ctsmatch";
      rakuten_genreId="0";
      rakuten_size="468x160";
      rakuten_target="_blank";
      rakuten_theme="gray";
      rakuten_border="off";
      rakuten_auto_mode="on";
      rakuten_genre_title="off";
      rakuten_recommend="on";
      rakuten_ts="1787512041582";
    <\/script>
    <script type="text/javascript" src="https://xml.affiliate.rakuten.co.jp/widget/js/rakuten_widget.js?20230106"><\/script>
  </body>
</html>`;

export default function RakutenMotionAd() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateScale = () => setScale(Math.min(1, host.clientWidth / WIDGET_WIDTH));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={s.adSlot}
      ref={hostRef}
      style={{ minHeight: WIDGET_HEIGHT * scale + 24 }}
    >
      <span className={s.adLabel}>広告</span>
      <div
        className={s.rakutenAdViewport}
        style={{ width: WIDGET_WIDTH * scale, height: WIDGET_HEIGHT * scale }}
      >
        <iframe
          className={s.rakutenAdFrame}
          title="楽天市場の商品広告"
          srcDoc={WIDGET_DOCUMENT}
          width={WIDGET_WIDTH}
          height={WIDGET_HEIGHT}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          style={{ transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}
