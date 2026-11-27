import type { CategoryStat, Reaction } from './reaction';
export type NewsItem = { url: string; title: string; source: string | null; sourceUrl?: string | null; kind: 'noticia' | 'fato' | 'oficial'; category: string; dateOnly: boolean; publishedAt: number; reaction?: Reaction | null };
export type NewsResponse = { market: NewsItem[]; symbol: NewsItem[]; stats: CategoryStat[]; total: number; errors: string[] };
