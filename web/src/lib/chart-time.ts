/** Rótulos de horário do gráfico. Os candles vêm em epoch (UTC); no intraday mostramos o horário de Brasília. */
const TZ = 'America/Sao_Paulo';
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...o });
const hm = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dm = fmt({ day: '2-digit', month: '2-digit' });
const full = fmt({ day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Intraday = algum par de candles recentes separado por menos de um dia. */
export const isIntraday = (times: number[]) => times.slice(-30).some((t, i, a) => i > 0 && t - a[i - 1] < 86400);

export const crosshairLabel = (t: number) => full.format(t * 1000).replace(',', '');

/** `type` é o TickMarkType da biblioteca: 0 ano, 1 mês, 2 dia, 3 e 4 horário. */
export function tickLabel(t: number, type: number): string {
  const time = hm.format(t * 1000);
  // a biblioteca vira o dia à meia-noite UTC (21h em Brasília): nesse ponto o horário informa mais que a data
  return type >= 3 || Number(time.slice(0, 2)) >= 21 ? time : dm.format(t * 1000);
}
