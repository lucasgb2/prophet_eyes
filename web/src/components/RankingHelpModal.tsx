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
        <li>O app testa cada indicador no histórico de <b>{symbol}</b>, no timeframe <b>{timeframe}</b>, e acha todas as vezes em que ele deu sinal.</li>
        <li>Para cada sinal, mede quanto o preço andou na direção do sinal {HORIZONS.join(', ')} candles depois, e desconta {cost} de custo (corretagem e taxas).</li>
        <li>Cada indicador recebe uma nota, e os cartões vão da maior para a menor. Ao trocar de papel ou timeframe, ou quando um candle fecha, tudo é recalculado.</li>
      </ol>

      <h4>Exemplo animado (preços fictícios)</h4>
      <p style={{ marginBottom: 8 }}>Usando a <b>Média móvel 20</b>: há sinal de compra quando o preço fecha acima da média.</p>
      <SignalExample />
      <p className="muted small">O exemplo deu certo; muitos sinais reais dão errado. Por isso o app olha todos eles.</p>

      <h4>Como escolher um indicador para apoiar a decisão</h4>
      <ol>
        <li><b>Comece pelo “Ret. líq.”:</b> é o ganho médio por sinal. Se for negativo ou perto de zero, descarte.</li>
        <li><b>Confira “Sinais”:</b> quanto mais, mais confiável. Como regra prática, abaixo de 10 pode ser pura sorte.</li>
        <li><b>Veja o “Acerto”:</b> de preferência acima de 50%. Acerto baixo com retorno alto significa que poucos sinais carregam o resultado.</li>
        <li><b>Compare a 1ª e a 2ª metade:</b> prefira números parecidos e sem o aviso “Resultado instável”.</li>
        <li><b>Antes de agir:</b> teste no painel de Simulação, que mostra as operações uma a uma, e veja se o indicador também se sustenta em outro timeframe.</li>
      </ol>
      <p className="tip">Exemplo: <b>A</b> com Ret. líq. 3% em 5 sinais e <b>B</b> com Ret. líq. 1,2% em 40 sinais. Apesar do número menor, <b>B</b> costuma ser o apoio mais confiável.</p>

      <h4>O que cada número significa</h4>
      <p><b>Sinais:</b> quantas vezes o indicador deu sinal, de compra ou de venda.</p>
      <p style={{ marginTop: 6 }}><b>Acerto:</b> em quantos desses sinais o preço andou a favor 5 candles depois, por mais que o custo de {cost}.</p>
      <p style={{ marginTop: 6 }}><b>Ret. líq.:</b> o ganho ou a perda média por sinal aos 5 candles, já descontado o custo.</p>
      <p style={{ marginTop: 6 }}><b>1ª e 2ª metade:</b> o acerto calculado separadamente em cada metade do histórico.</p>

      <h4>Por que a ordem nem sempre segue o “Ret. líq.” ou o “Acerto”</h4>
      <p>A nota usa a média dos prazos de {HORIZONS.join(', ')} candles (o cartão mostra só o de 5), dá peso maior ao retorno e tira pontos de quem tem poucos sinais ou resultado instável.</p>

      <h4>“Compra/Venda se fechar acima ou abaixo de …”</h4>
      <p>É o preço de fechamento do candle atual que faria o indicador marcar sinal. Exemplo: “Compra se fechar acima de 61.953,65”. O app só procura numa faixa de ±15% do preço atual; fora dela aparece “Sem gatilho”.</p>

      <h4>Cuidados</h4>
      <ul>
        <li>O primeiro da lista pode ter retorno negativo, se todos foram mal.</li>
        <li>Indicador com menos de 5 sinais fica fora do ranking.</li>
        <li>Num sinal de venda, a queda conta como acerto. No mercado à vista isso é ter saído a tempo, não lucro.</li>
        <li>Cada sinal é avaliado sozinho: não há stop, capital nem operações sobrepostas.</li>
        <li>Escolher o melhor entre vários no mesmo histórico tende a exagerar o resultado.</li>
        <li>O passado não garante o futuro. Isto não é recomendação de compra ou venda.</li>
      </ul>
    </Modal>
  );
}
