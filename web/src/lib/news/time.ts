/** Quando a notícia saiu: "há 1 h" mais a data. A CVM informa só o dia (publishedAt ao meio-dia de Brasília). */
const TZ = 'America/Sao_Paulo';
const dm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayNumber = (s: number) => Math.floor((s - 3 * 3600) / 86400); // dia no relógio de Brasília

export function relativeTime(publishedAt: number, dateOnly: boolean, nowS = Date.now() / 1000): string {
  const days = dayNumber(nowS) - dayNumber(publishedAt);
  if (dateOnly) return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  const s = Math.max(0, nowS - publishedAt);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

export const dateLabel = (publishedAt: number, dateOnly: boolean) =>
  dateOnly ? dm.format(publishedAt * 1000) : `${dm.format(publishedAt * 1000)} - ${hm.format(publishedAt * 1000)}`;
