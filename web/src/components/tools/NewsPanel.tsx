'use client';
import { useEffect, useState } from 'react';
import { CATEGORIES, type Category } from '@/lib/news/parse';
import type { Caveat, Move } from '@/lib/news/reaction';
import type { NewsItem, NewsResponse } from '@/lib/news/types';
import type { ToolCtx } from './registry';
import SourceLogo from './SourceLogo';
import NewsBell from './NewsBell';
import NewsHelpModal from './NewsHelpModal';
import { dateLabel, relativeTime } from '@/lib/news/time';

const label = (c: string) => CATEGORIES[c as Category] ?? c;
const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`;
const times = (v: number) => `${v.toFixed(1).replace('.', ',')}× o normal`;

function Moves({ moves, caveat, dateOnly, onHelp }: { moves: Move[]; caveat: Caveat; dateOnly: boolean; onHelp: () => void }) {
  if (!moves.length) return <div className="muted newsmove">Ainda sem candle depois da notícia.</div>;
  return (
    <div className="newsmove">
      {moves.map((m) => (
        <span key={m.h} title={m.times == null ? (caveat === 'gap' ? 'Sem comparação: inclui o gap de abertura' : 'Sem histórico suficiente para comparar') : `Variação ${times(m.times)} para ${m.h} candle(s) neste papel`}>
          {m.h}c <b style={{ color: m.pct >= 0 ? '#26a69a' : '#ef5350' }}>{pct(m.pct)}</b>{m.times != null && <span className={m.times >= 2 ? 'hot' : 'muted'}> {times(m.times)}</span>}
        </span>))}
      {caveat === 'gap' && <span className="newswarn" title="A bolsa ficou fechada entre a referência e o candle seguinte: a variação é a da noite ou do fim de semana">inclui o gap de abertura</span>}
      {caveat === 'durante' && <span className="newswarn" title="A notícia saiu com o candle em andamento: a variação inclui o que aconteceu antes dela">saiu durante o candle: inclui o antes</span>}
      {!caveat && dateOnly && <span className="newswarn" title="A CVM informa só o dia: pode ter saído antes, durante ou depois do pregão">sem hora</span>}
      <button className="newshelp" aria-label="O que significam estes números" title="O que significam estes números" onClick={onHelp}>?</button>
    </div>
  );
}

export default function NewsPanel({ ctx }: { ctx: ToolCtx }) {
  const [tab, setTab] = useState<'symbol' | 'market'>('symbol');
  const [data, setData] = useState<NewsResponse | null>(null);
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(false);
  const [, setMinute] = useState(0); // redesenha a cada minuto para a hora relativa andar
  useEffect(() => { const t = setInterval(() => setMinute((m) => m + 1), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    setData(null); setErr('');
    let stop = false;
    const load = async () => {
      const r = await fetch(`/api/news?market=${ctx.market}&symbol=${ctx.symbol}&tf=${ctx.timeframe}`).catch(() => null);
      const body = await r?.json().catch(() => null);
      if (stop) return;
      if (r?.ok && body) { setData(body); setErr(''); } else setErr(body?.error ?? 'Não foi possível carregar as notícias.');
    };
    load(); const t = setInterval(load, 5 * 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [ctx.market, ctx.symbol, ctx.timeframe]);

  const list = data ? data[tab] : [];
  return (
    <div className="stack">
      <div className="row">
        <button className={tab === 'symbol' ? 'on' : ''} onClick={() => setTab('symbol')}>{ctx.symbol}</button>
        <button className={tab === 'market' ? 'on' : ''} onClick={() => setTab('market')}>Mercado</button>
      </div>
      {tab === 'symbol' && <NewsBell market={ctx.market} symbol={ctx.symbol} />}
      {err && <p className="warn">{err}</p>}
      {!data && !err && <p className="muted">Buscando notícias…</p>}
      {data?.errors.length ? <p className="muted">Fontes com falha agora: {data.errors.join('; ')}</p> : null}

      {tab === 'symbol' && data && data.stats.length === 0 && data.symbol.length > 0 && (
        <p className="muted">Sem resumo por assunto neste timeframe: nenhuma reação limpa (as que atravessam o fechamento ou saem no meio do candle ficam de fora).{ctx.market === 'binance' ? ' Em cripto, use um timeframe intraday.' : ''}</p>
      )}
      {tab === 'symbol' && data && data.stats.length > 0 && (
        <section>
          <h4>O que costuma acontecer no candle seguinte ({ctx.timeframe})</h4>
          <table>
            <thead><tr><th>Assunto</th><th>Casos</th><th>Média</th><th>Subiu</th></tr></thead>
            <tbody>{data.stats.map((s) => (
              <tr key={s.category} className={s.events < 10 ? 'muted' : undefined}>
                <td>{label(s.category)}</td><td>{s.events}{s.events < 10 ? '*' : ''}</td>
                <td>{pct(s.avgPct)}{s.avgTimes != null && <div className="muted">{times(s.avgTimes)}</div>}</td><td>{s.up}/{s.events}</td>
              </tr>))}</tbody>
          </table>
          <p className="muted">* Menos de 10 casos: pouco para tirar conclusão. O histórico cresce à medida que o app coleta. Ficam de fora as reações com gap ou com a notícia no meio do candle. Movimento depois de uma notícia não prova que ela foi a causa.</p>
        </section>
      )}

      <section>
        {data && !list.length && <p className="muted">Nenhuma notícia encontrada.</p>}
        {list.map((n) => (
          <article className="newsitem" key={n.url}>
            <div className="newshead">
              <SourceLogo source={n.source} sourceUrl={n.sourceUrl} url={n.url} />
              <span className="newssource">{n.source}</span>
              <time className="newstime" dateTime={new Date(n.publishedAt * 1000).toISOString()} title={n.dateOnly ? 'A CVM informa só a data' : undefined}>
                <b>{relativeTime(n.publishedAt, n.dateOnly)}</b> · {dateLabel(n.publishedAt, n.dateOnly)}
              </time>
            </div>
            <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
            <div className="muted newsmeta">
              {n.kind !== 'noticia' && <span className="newstag">{n.kind === 'fato' ? 'CVM' : 'Oficial'}</span>}
              {label(n.category)}{n.reaction?.trend ? ` · antes: tendência de ${n.reaction.trend}` : ''}
            </div>
            {tab === 'symbol' && n.reaction && <Moves moves={n.reaction.moves} caveat={n.reaction.caveat} dateOnly={n.dateOnly} onHelp={() => setHelp(true)} />}
          </article>))}
      </section>

      <p className="muted">{tab === 'symbol'
        ? `Reação: variação a partir do último candle fechado antes da notícia, 1, 5 e 15 candles depois; “× o normal” compara com o movimento típico do papel. Fatos da CVM trazem só a data e o arquivo é atualizado uma vez por semana.`
        : 'Notícias gerais; a reação do preço aparece na aba do papel.'}</p>
      {help && <NewsHelpModal timeframe={ctx.timeframe} onClose={() => setHelp(false)} />}
    </div>
  );
}
