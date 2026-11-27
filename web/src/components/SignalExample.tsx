'use client';
import { useEffect, useState } from 'react';
import { INDICATORS, sma } from '@/lib/indicators';
import { COST } from '@/lib/suggest';

// Preços FICTÍCIOS: 20 candles escondidos (só para a média de 20 existir) + o trecho mostrado
const WARMUP = [108, 107.5, 106.8, 107, 106, 105.2, 105.5, 104.6, 104, 103.2, 103.5, 102.6, 102, 101.4, 101.8, 101, 100.2, 99.6, 99.9, 99.1];
const SHOWN = [98.4, 97.8, 98.2, 97.5, 97.9, 98.6, 102.5, 103.4, 102.8, 104.1, 103.6, 105.2, 104.7, 105.9, 105.1, 106.4, 107];
const CLOSES = [...WARMUP, ...SHOWN];
const CANDLES = CLOSES.map((close, i) => { const open = CLOSES[i - 1] ?? close; return { time: i, open, close, high: Math.max(open, close) + 0.5, low: Math.min(open, close) - 0.5, volume: 1 }; });
// a mesma regra que o app usa para a Média móvel 20
const SIGNAL = INDICATORS.sma20.signals(CANDLES).findIndex((s, i) => i >= WARMUP.length && s === 1) - WARMUP.length;
const MA = sma(CLOSES, 20).slice(WARMUP.length) as number[];
const VIEW = CANDLES.slice(WARMUP.length);
const MARKS = [3, 5, 10].map((h) => ({ h, i: SIGNAL + h, ret: ((VIEW[SIGNAL + h].close - VIEW[SIGNAL].close) / VIEW[SIGNAL].close - COST) * 100 }));

const W = 480, H = 230, STEP = W / VIEW.length;
const LO = Math.min(...VIEW.map((c) => c.low)) - 2.5, HI = Math.max(...VIEW.map((c) => c.high)) + 1.5;
const x = (i: number) => i * STEP + STEP / 2;
const y = (v: number) => 8 + (1 - (v - LO) / (HI - LO)) * (H - 16);
const num = (v: number) => v.toFixed(2).replace('.', ',');

/** Animação de um sinal de compra: candle a candle, o cruzamento da média e o resultado 3, 5 e 10 candles depois. */
export default function SignalExample() {
  const last = VIEW.length - 1, hold = 6; // pausa no final antes de recomeçar
  const [step, setStep] = useState(SIGNAL - 1);
  const [playing, setPlaying] = useState(true);
  useEffect(() => { if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPlaying(false); setStep(last); } }, [last]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setStep((s) => (s >= last + hold ? 0 : s + 1)), 600);
    return () => clearInterval(t);
  }, [playing, last]);
  const upTo = Math.min(step, last);
  const reached = MARKS.filter((m) => upTo >= m.i);
  const caption = upTo < SIGNAL ? '1) O preço está abaixo da média (linha amarela). Ainda não há sinal.'
    : upTo === SIGNAL ? '2) O candle fechou ACIMA da média: sinal de compra 🔔'
    : !reached.length ? '3) O app acompanha o que o preço faz depois do sinal…'
    : reached.length < MARKS.length ? `4) Mede o resultado ${reached.map((m) => `${m.h}`).join(' e ')} candles depois, já sem o custo.`
    : `5) Este sinal conta como acerto: aos 5 candles rendeu +${num(MARKS[1].ret)}% líquidos.`;
  return (
    <figure className="example">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Exemplo animado: o preço cruza a média móvel para cima, gera sinal de compra e o resultado é medido 3, 5 e 10 candles depois">
        <polyline fill="none" stroke="#e3b341" strokeWidth="2" points={MA.slice(0, upTo + 1).map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        {VIEW.slice(0, upTo + 1).map((c, i) => {
          const color = c.close >= c.open ? '#26a69a' : '#ef5350';
          return (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} />
              <rect x={x(i) - STEP * 0.32} width={STEP * 0.64} y={y(Math.max(c.open, c.close))} height={Math.max(2, Math.abs(y(c.open) - y(c.close)))} fill={color} />
            </g>
          );
        })}
        {upTo >= SIGNAL && (
          <g>
            <line x1={0} x2={W} y1={y(VIEW[SIGNAL].close)} y2={y(VIEW[SIGNAL].close)} stroke="#8b949e" strokeDasharray="4 4" />
            <text x={x(SIGNAL)} y={y(VIEW[SIGNAL].low) + 14} textAnchor="middle" fill="#26a69a" fontSize="13">▲</text>
            <text x={x(SIGNAL)} y={y(VIEW[SIGNAL].low) + 28} textAnchor="middle" fontSize="13">🔔</text>
            <text x={x(SIGNAL) + STEP * 0.6} y={y(VIEW[SIGNAL].close) + 14} textAnchor="start" fill="#8b949e" fontSize="11">preço do sinal {num(VIEW[SIGNAL].close)}</text>
          </g>
        )}
        {reached.map((m) => (
          <g key={m.h}>
            <circle cx={x(m.i)} cy={y(VIEW[m.i].close)} r="4" fill="#fff" />
            <text x={Math.min(x(m.i), W - 32)} y={y(VIEW[m.i].high) - 18} textAnchor="middle" fill="#e6edf3" fontSize="11">{m.h} candles</text>
            <text x={Math.min(x(m.i), W - 32)} y={y(VIEW[m.i].high) - 6} textAnchor="middle" fill={m.ret >= 0 ? '#26a69a' : '#ef5350'} fontSize="11" fontWeight="700">{m.ret >= 0 ? '+' : ''}{num(m.ret)}%</text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span aria-live="off">{caption}</span>
        <button onClick={() => { if (!playing && step >= last) setStep(0); setPlaying(!playing); }}>{playing ? 'Pausar' : 'Reproduzir'}</button>
      </figcaption>
    </figure>
  );
}
