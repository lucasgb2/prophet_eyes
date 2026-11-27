'use client';
import Modal from '../Modal';

const UNIT: Record<string, string> = { '1m': '1 minuto', '5m': '5 minutos', '15m': '15 minutos', '30m': '30 minutos', '60m': '1 hora', '1d': '1 pregão (dia)', '1wk': '1 semana', '1mo': '1 mês' };

/** Explica os números de reação do preço que aparecem embaixo de cada notícia. */
export default function NewsHelpModal({ timeframe, onClose }: { timeframe: string; onClose: () => void }) {
  return (
    <Modal title="Como ler a reação do preço" onClose={onClose}>
      <h4>Um exemplo</h4>
      <p className="tip"><b>5c +0,1% 0,2× o normal</b></p>
      <ul style={{ marginTop: 8 }}>
        <li><b>5c:</b> 5 candles depois da notícia. No timeframe atual, cada candle é <b>{UNIT[timeframe] ?? timeframe}</b>.</li>
        <li><b>+0,1%:</b> quanto o preço variou no total, desde o último fechamento antes da notícia.</li>
        <li><b>0,2× o normal:</b> o tamanho do movimento comparado ao que o papel costuma andar em 5 candles.</li>
      </ul>

      <h4>O “× o normal”</h4>
      <ul>
        <li><b>Perto de 1×:</b> movimento comum.</li>
        <li><b>Abaixo de 1×:</b> o papel andou menos que o habitual.</li>
        <li><b>2× ou mais</b> (em amarelo): fora do comum, vale investigar.</li>
      </ul>
      <p style={{ marginTop: 6 }}>Ele mede só o tamanho, não a direção. <b>1c, 5c e 15c</b> são acumulados a partir do mesmo ponto.</p>

      <h4>Quando o número engana (marcas em laranja)</h4>
      <ul>
        <li><b>Inclui o gap de abertura</b> (intraday): a notícia saiu com a bolsa fechada, então o “1c” é a noite ou o fim de semana inteiro. Não mostramos o “× o normal”.</li>
        <li><b>Saiu durante o candle</b> (diário, semanal, mensal): a variação inclui o que aconteceu antes de a notícia sair.</li>
        <li><b>Sem hora:</b> a CVM informa só o dia.</li>
      </ul>
      <p style={{ marginTop: 6 }}>Casos de gap e de notícia durante o candle não entram no resumo por assunto.</p>

      <h4>E ainda assim</h4>
      <ul>
        <li><b>Várias notícias juntas</b> recebem o mesmo número, mesmo as que não tiveram efeito.</li>
        <li><b>Coincidência não é causa:</b> o mercado geral, o petróleo ou o dólar podem ter movido o preço.</li>
      </ul>
    </Modal>
  );
}
