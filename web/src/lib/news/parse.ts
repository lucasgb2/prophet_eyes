/** Leitura de feeds RSS/Atom e classificação por assunto. Funções puras, sem rede. */
export type FeedItem = { title: string; url: string; source: string | null; publishedAt: number; tags?: string[]; sourceUrl?: string };

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});

const text = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  const raw = m[1].trim(), cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return decodeEntities(cdata ? cdata[1] : raw).replace(/[​﻿]/g, '').trim();
};

export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const b = m[2];
    let title = text(b, 'title');
    const url = text(b, 'link') || decodeEntities(b.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] ?? '');
    const date = Date.parse(text(b, 'pubDate') || text(b, 'updated') || text(b, 'published'));
    const source = text(b, 'source') || null;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)); // Google Notícias repete o veículo no título
    if (!title || !/^https?:\/\//i.test(url) || !Number.isFinite(date)) continue; // só links http(s)
    const tags = [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((c) => decodeEntities(c[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')).trim());
    const sourceUrl = decodeEntities(b.match(/<source\b[^>]*url="(https?:\/\/[^"]+)"/i)?.[1] ?? ''); // site do veículo (para o ícone)
    out.push({ ...(sourceUrl ? { sourceUrl } : {}), title: title.slice(0, 300), url, source, publishedAt: Math.floor(date / 1000), ...(tags.length ? { tags } : {}) });
  }
  return out;
}

export const CATEGORIES = {
  resultados: 'Resultados', dividendos: 'Dividendos e recompra', fusoes: 'Fusões e aquisições', macro: 'Juros, inflação e câmbio',
  gestao: 'Gestão e governança', operacao: 'Operação e investimentos', juridico: 'Justiça e regulação', outros: 'Outros',
} as const;
export type Category = keyof typeof CATEGORIES;

// a ordem importa: "juros sobre capital próprio" é dividendo, não juros
const RULES: [Category, RegExp][] = [
  ['dividendos', /dividendo|\bjcp\b|juros sobre (o )?capital|provento|remunera[cç][aã]o aos acionistas|recompra|dividend|buyback/i],
  ['resultados', /resultado|\blucro|preju[ií]zo|balan[cç]o|trimestr|\b[1-4]T\d{2}\b|ebitda|earnings/i],
  ['fusoes', /fus[aã]o|aquisi[cç]|incorpora[cç]|venda de (ativo|participa)|\bopa\b|merger|acqui/i],
  ['macro', /copom|selic|\bjuros\b|infla[cç][aã]o|\bipca\b|\bfed\b|d[oó]lar|c[aâ]mbio|\bpib\b|desocupa|interest rate|inflation/i],
  ['juridico', /processo|justi[cç]a|\bmulta|investiga|regula|\bcade\b|\bsec\b|tribunal|lawsuit|court/i],
  ['gestao', /\bceo\b|presidente|diretor|conselho de administra|assembleia|governan/i],
  ['operacao', /produ[cç][aã]o|vendas|contrato|descoberta|investiment|plano estrat|leil[aã]o|projeto/i],
];
export const classify = (title: string): Category => RULES.find(([, re]) => re.test(title))?.[0] ?? 'outros';
