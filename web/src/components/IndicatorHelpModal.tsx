'use client';
import { INDICATORS, type IndicatorId } from '@/lib/indicators';
import { INDICATOR_HELP } from '@/lib/indicator-help';
import Modal from './Modal';

/** Explica um indicador em linguagem direta. */
export default function IndicatorHelpModal({ id, onClose }: { id: IndicatorId; onClose: () => void }) {
  const h = INDICATOR_HELP[id];
  return (
    <Modal title={INDICATORS[id].label} onClose={onClose}>
      <h4>O que é</h4><p>{h.what}</p>
      <h4>Como ler</h4><p>{h.read}</p>
      <h4>Quando o app marca um sinal</h4><p>{h.signal}</p>
      <h4>Cuidado</h4><p>{h.care}</p>
      <p className="muted small">Material educativo: descreve a regra do indicador e não é recomendação de compra ou venda.</p>
    </Modal>
  );
}
