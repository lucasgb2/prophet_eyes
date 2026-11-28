'use client';
import { useState } from 'react';

const COLORS = ['#2f81f7', '#8957e5', '#bf4b8a', '#d1622b', '#2da44e', '#1b7c83', '#9e6a03', '#c93c37'];
const initials = (name: string) => {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, words[0].length <= 4 ? 4 : 2) : words[0][0] + words[1][0]).toUpperCase();
};
/** Domínio do veículo; o link do Google Notícias não serve (é do agregador). */
const host = (url: string | null | undefined) => {
  try { const u = new URL(url ?? ''); return u.hostname === 'news.google.com' ? null : u.hostname; } catch { return null; }
};

/** Ícone do veículo (o favicon do próprio site); se não houver, as iniciais num selo colorido. */
export default function SourceLogo({ source, sourceUrl, url }: { source: string | null; sourceUrl?: string | null; url: string }) {
  const name = source ?? host(url) ?? '?';
  const h = host(sourceUrl) ?? host(url);
  const [failed, setFailed] = useState(false);
  if (h && !failed)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="srclogo" src={`https://${h}/favicon.ico`} alt="" title={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return <span className="srclogo initials" style={{ background: color }} title={name} aria-hidden="true">{initials(name)}</span>;
}
