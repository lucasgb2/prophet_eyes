'use client';
import { useEffect } from 'react';
import { beep } from './useSignalNotifier';
import { alertKey, dedupeByTitle, MAX_PER_MESSAGE, type PendingNews } from '@/lib/news/alert-text';

const SEEN = 'prophet_news_notified';

/** Avisa no navegador (notificação + som) as notícias novas dos papéis com sino. Funciona com o app aberto. */
export function useNewsNotifier() {
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const r = await fetch('/api/news/alerts').catch(() => null);
      if (stop || !r?.ok) return;
      const items: PendingNews[] = (await r.json()).items ?? [];
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(SEEN) ?? '[]'); } catch {}
      const known = new Set(seen);
      const fresh = items.filter((i) => !known.has(alertKey(i)));
      if (stop || !fresh.length) return;
      try { localStorage.setItem(SEEN, JSON.stringify([...seen, ...fresh.map(alertKey)].slice(-500))); } catch {}
      beep(1);
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      for (const i of dedupeByTitle(fresh).slice(0, MAX_PER_MESSAGE)) {
        try {
          const n = new Notification(`📰 ${i.symbol}${i.kind === 'fato' ? ' · CVM' : ''}`, { body: i.title, tag: alertKey(i) });
          n.onclick = () => window.open(i.url, '_blank', 'noopener,noreferrer');
        } catch {}
      }
    };
    check(); const t = setInterval(check, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
}
