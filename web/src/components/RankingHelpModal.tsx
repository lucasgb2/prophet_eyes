'use client';
import { COST, HORIZONS } from '@/lib/suggest';
import Modal from './Modal';
import SignalExample from './SignalExample';

/** Explica o ranking de "Indicadores sugeridos" e os níveis de gatilho dos cartões. */
export default function RankingHelpModal({ symbol, timeframe, onClose }: { symbol: string; timeframe: string; onClose: () => void }) {
  const cost = `${(COST * 100).toFixed(1).replace('.', ',')}%`;
  return (
    <Modal title="Como ler os indicadores sugeridos" onClose={onClose}>
      <h4>Como funciona</h4>
      <ol>
        <li>O app testa cada indicador no histórico de <b>{symbol}</b>, no timeframe <b>{timeframe}</b>, e acha todas as vezes em que ele deu sinal de <b>compra</b>.</li>
        <li>O sinal só existe quando o candle fecha, então a entrada é na <b>abertura do candle seguinte</b>. O resultado é medido {HORIZONS.join(', ')} candles depois do sinal, descontando {cost} de custo.</li>
        <li>O mesmo cálculo é feito comprando em <b>um candle qualquer</b>. Essa é a <b>régua</b>: o que o papel rendeu sem indicador nenhum.</li>
        <li>Os cartões vão do indicador que mais superou a régua ao que menos superou. Ao trocar de papel ou timeframe, ou quando um candle fecha, tudo é recalculado.</li>
      </ol>

      <h4>Exemplo animado (preços fictícios)</h4>
      <p style={{ marginBottom: 8 }}>Usando a <b>Média móvel 20</b>: há sinal de compra quando o preço fecha acima da média.</p>
      <SignalExample />
      <p className="muted small">O exemplo deu certo; muitos sinais reais dão errado. Por isso o app olha todos eles.</p>

      <h4>Como escolher um indicador para apoiar a decisão</h4>
      <ol>
        <li><b>Comece pela “Vantagem”:</b> se for negativa ou perto de zero, o indicador não ajudou. Descarte.</li>
        <li><b>Confira “Compras”:</b> quanto mais, mais confiável. Como regra prática, abaixo de 10 pode ser pura sorte.</li>
        <li><b>Compare a 1ª e a 2ª metade:</b> prefira vantagem positiva nas duas.</li>
        <li><b>Veja o “Ret. líq.”:</b> superar a régua não basta se o retorno for negativo (perdeu menos, mas perdeu).</li>
        <li><b>Antes de agir:</b> teste no painel de Simulação, que mostra as operações uma a uma, e veja se o indicador também se sustenta em outro timeframe.</li>
      </ol>
      <p className="tip">Exemplo: um indicador com Ret. líq. +1% parece bom. Mas se a régua é +1,2%, comprar sem olhar para ele teria rendido mais.</p>

      <h4>O que cada número significa</h4>
      <p><b>Compras:</b> quantas vezes o indicador deu sinal de compra.</p>
      <p style={{ marginTop: 6 }}><b>Acerto:</b> em quantas dessas compras o preço, 5 candles depois, estava acima da entrada mais o custo de {cost}.</p>
      <p style={{ marginTop: 6 }}><b>Ret. líq.:</b> o ganho ou a perda média por compra aos 5 candles, já descontado o custo.</p>
      <p style={{ marginTop: 6 }}><b>Régua:</b> o acerto e o retorno de comprar em um candle qualquer do mesmo histórico.</p>
      <p style={{ marginTop: 6 }}><b>Vantagem:</b> o Ret. líq. menos o da régua, em pontos percentuais (p.p.). As metades usam a régua de cada metade.</p>
      <p style={{ marginTop: 6 }}><b>Vendas:</b> em quantas o preço caiu depois do sinal, comparado com um candle qualquer. Serve para avaliar o aviso de saída e não entra na ordem.</p>

      <h4>Por que a ordem nem sempre segue a “Vantagem”</h4>
      <p>A nota usa a média dos prazos de {HORIZONS.join(', ')} candles (o cartão mostra só o de 5), considera acerto e retorno acima da régua e tira pontos de quem tem poucos sinais ou resultado instável.</p>

      <h4>“Compra/Venda se fechar acima ou abaixo de …”</h4>
      <p>É o preço de fechamento do candle atual que faria o indicador marcar sinal. Exemplo: “Compra se fechar acima de 61.953,65”. O app só procura numa faixa de ±15% do preço atual; fora dela aparece “Sem gatilho”.</p>

      <h4>Cuidados</h4>
      <ul>
        <li>O primeiro da lista pode não superar a régua, se todos foram mal.</li>
        <li>Indicador com menos de 5 compras fica fora do ranking.</li>
        <li>Cada compra é avaliada sozinha: não há stop, capital nem operações sobrepostas.</li>
        <li>Escolher o melhor entre vários no mesmo histórico tende a exagerar o resultado.</li>
        <li>O passado não garante o futuro. Isto não é recomendação de compra ou venda.</li>
      </ul>
    </Modal>
  );
}
