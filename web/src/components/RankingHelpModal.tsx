'use client';
import { COST, HORIZONS } from '@/lib/suggest';
import Modal from './Modal';

/** Explica o ranking de "Indicadores sugeridos" e os níveis de gatilho dos cartões. */
export default function RankingHelpModal({ symbol, timeframe, onClose }: { symbol: string; timeframe: string; onClose: () => void }) {
  const cost = `${(COST * 100).toFixed(1).replace('.', ',')}%`;
  return (
    <Modal title="Como ler os indicadores sugeridos" onClose={onClose}>
      <h4>O que é o ranking</h4>
      <p>O app olha o histórico de <b>{symbol}</b> no timeframe <b>{timeframe}</b> e acha todas as vezes em que cada indicador deu sinal, de compra ou de venda. Depois confere o que o preço fez nos candles seguintes. Os indicadores que “teriam funcionado melhor” neste papel ficam no topo. Se você trocar de papel ou de timeframe, o ranking muda.</p>

      <h4>O que cada número significa</h4>
      <p><b>Sinais:</b> quantas vezes o indicador deu sinal no histórico. Poucos sinais = resultado menos confiável.</p>
      <p style={{ marginTop: 6 }}><b>Acerto:</b> em quantos desses sinais o preço andou a favor, 5 candles depois. No sinal de compra, subir é acerto; no de venda, cair é acerto. O custo já entra na conta: o movimento precisa superar {cost} para contar.</p>
      <p style={{ marginTop: 6 }}><b>Ret. líq.:</b> o ganho ou a perda média por sinal, também aos 5 candles, já descontado o custo.</p>
      <p style={{ marginTop: 6 }}><b>1ª e 2ª metade:</b> o mesmo acerto, calculado separadamente para a primeira e para a segunda metade do histórico. Se forem muito diferentes, aparece “Resultado instável”: o indicador funcionou numa época e não na outra.</p>
      <p style={{ marginTop: 6 }}><b>Ordem dos cartões:</b> é a média dos prazos de {HORIZONS.join(', ')} candles, com desconto para poucos sinais e para resultado instável.</p>

      <h4>Custo de {cost}</h4>
      <p>De cada sinal o app tira {cost} para simular corretagem e taxas. Sem isso, o resultado pareceria melhor do que seria na prática.</p>

      <h4>“Compra/Venda se fechar acima ou abaixo de …”</h4>
      <p>É o preço de fechamento do candle atual que faria a regra do indicador marcar sinal. Exemplo: “Compra se fechar acima de 61.953,65” quer dizer que, se o candle fechar acima desse valor, o indicador marcaria compra. O app só procura numa faixa de ±15% do preço atual; fora dela aparece “Sem gatilho”.</p>

      <h4>Cuidado</h4>
      <p>O que funcionou no passado não garante o futuro, e poucos sinais podem ser sorte. Esses números descrevem a regra dos indicadores e o histórico; não são recomendação de compra ou venda.</p>
    </Modal>
  );
}
