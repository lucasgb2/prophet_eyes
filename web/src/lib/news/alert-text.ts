/** Texto dos avisos de notícia. Funções puras (usadas no navegador e no worker). */
export type PendingNews = { market: string; symbol: string; url: string; title: string; source: string | null; kind: string; category: string };

export const alertKey = (n: PendingNews) => `news|${n.market}|${n.symbol}|${n.url}`;

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
/** Vários veículos publicam o mesmo título: avisa uma vez, mas todos os repetidos contam como avisados. */
export function dedupeByTitle<T extends PendingNews>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => { const k = `${i.symbol}|${norm(i.title)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const MAX_PER_MESSAGE = 5;
/** Uma mensagem por papel, para não virar enxurrada. */
export function groupMessage(symbol: string, items: PendingNews[]): string {
  const lines = items.slice(0, MAX_PER_MESSAGE).map((i) => `• ${i.kind === 'fato' ? '[CVM] ' : ''}${i.title}${i.source && i.kind !== 'fato' ? ` (${i.source})` : ''}\n${i.url}`);
  const rest = items.length - MAX_PER_MESSAGE;
  return `📰 ${symbol}: ${items.length === 1 ? 'notícia nova' : `${items.length} notícias novas`}\n\n${lines.join('\n\n')}${rest > 0 ? `\n\n…e mais ${rest} no painel Notícias.` : ''}`;
}
