/** Sino de notícias por papel: quais notícias novas cada usuário ainda precisa receber. */
import { pool } from '../db';
import type { PendingNews } from './alert-text';

/**
 * Só o que chegou DEPOIS de o sino ser ligado. Notícias valem por 24 h; fatos da CVM por 10 dias,
 * porque o arquivo oficial é semanal.
 */
export async function pendingNews(userId: number): Promise<PendingNews[]> {
  const { rows } = await pool.query(
    `SELECT n.market, n.symbol, n.url, n.title, n.source, n.kind, n.category
       FROM news_bells b JOIN news n ON n.market=b.market AND n.symbol=b.symbol
      WHERE b.user_id=$1 AND n.fetched_at > b.since AND (
        (n.kind='fato' AND (b.facts OR b.categories ? n.category) AND n.published_at > now() - interval '10 days') OR
        (n.kind<>'fato' AND b.categories ? n.category AND n.published_at > now() - interval '24 hours'))
      ORDER BY n.published_at DESC LIMIT 100`, [userId]);
  return rows;
}
