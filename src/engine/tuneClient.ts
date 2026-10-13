// Manda trabalhos ao worker e devolve o resultado como Promise.

import type { detectarBpm, detectarTom } from './analise.ts';
import type { Processamento } from './tune.worker.ts';

let worker: Worker | undefined;
let proximoId = 0;
const esperando = new Map<number, (resultado: unknown) => void>();

function pedir<T>(pedido: Record<string, unknown>, amostras: Float32Array): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./tune.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; resultado: unknown }>) => {
      esperando.get(e.data.id)?.(e.data.resultado);
      esperando.delete(e.data.id);
    };
  }
  const id = proximoId++;
  // Manda uma cópia: o original continua sendo o áudio em uso.
  const copia = amostras.slice();
  return new Promise((ok) => {
    esperando.set(id, ok as (r: unknown) => void);
    worker!.postMessage({ ...pedido, id, amostras: copia }, [copia.buffer]);
  });
}

export const processarEmSegundoPlano = (amostras: Float32Array, taxa: number, opcoes: Processamento) =>
  pedir<Float32Array>({ tipo: 'processar', taxa, opcoes }, amostras);

export interface AnaliseDoBeat {
  bpm: ReturnType<typeof detectarBpm>;
  tom: ReturnType<typeof detectarTom>;
}

export const analisarEmSegundoPlano = (amostras: Float32Array, taxa: number) =>
  pedir<AnaliseDoBeat>({ tipo: 'analisar', taxa }, amostras);
