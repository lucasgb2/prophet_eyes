/** Saúde do sistema: o que parou de funcionar. Funções puras, usadas pelo vigia e pela tela. */
const MIN = 60_000;

export const TASKS = {
  alertas: { label: 'Alertas de preço e RSI', maxMs: 10 * MIN },
  sinais: { label: 'Sinos de indicadores', maxMs: 10 * MIN },
  robos: { label: 'Robôs de teste', maxMs: 10 * MIN },
  diario: { label: 'Diário e teste de mesa', maxMs: 10 * MIN },
  dados: { label: 'Atualização dos candles', maxMs: 30 * MIN },
  backup: { label: 'Backup do banco', maxMs: 36 * 60 * MIN },
} as const;

export type TaskName = keyof typeof TASKS;
export type Beat = { name: string; okAt: number | null };
export type Problem = { name: TaskName; label: string; okAt: number | null };

/**
 * Tarefas que passaram do prazo sem dar certo. `since` é quando começamos a observar: uma tarefa sem nenhum
 * registro só vira problema depois do prazo contado a partir daí.
 */
export function assess(beats: Beat[], now: number, since: number): Problem[] {
  const at = new Map(beats.map((b) => [b.name, b.okAt]));
  return (Object.keys(TASKS) as TaskName[]).flatMap((name) => {
    const okAt = at.get(name) ?? null;
    return now - (okAt ?? since) > TASKS[name].maxMs ? [{ name, label: TASKS[name].label, okAt }] : [];
  });
}

export const when = (ms: number | null) => (ms == null ? 'sem registro'
  : new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
