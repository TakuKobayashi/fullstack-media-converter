'use client';
import { useEffect } from 'react';

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'development') {
      // A service worker previously registered on localhost survives dev
      // server restarts and can serve stale Next.js chunks. Those old chunks
      // contained the SharedArrayBuffer/COOP/COEP guard, even though the
      // current single-thread ffmpeg core does not require it.
      const clearLocalDevWorker = async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys.filter((key) => key.startsWith('convertmate-')).map((key) => caches.delete(key)),
          );
        }
      };

      void clearLocalDevWorker().catch(console.error);
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }, []);
  return null;
}
