// Pede o tune ao worker e devolve o resultado como Promise.

import type { OpcoesTune } from './tune.ts';

let worker: Worker | undefined;
let proximoId = 0;
const esperando = new Map<number, (saida: Float32Array) => void>();

export function afinarEmSegundoPlano(amostras: Float32Array, taxa: number, opcoes: OpcoesTune): Promise<Float32Array> {
  if (!worker) {
    worker = new Worker(new URL('./tune.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; saida: Float32Array }>) => {
      esperando.get(e.data.id)?.(e.data.saida);
      esperando.delete(e.data.id);
    };
  }
  const id = proximoId++;
  // Manda uma cópia: o original continua sendo o áudio do take.
  const copia = amostras.slice();
  return new Promise((ok) => {
    esperando.set(id, ok);
    worker!.postMessage({ id, amostras: copia, taxa, opcoes }, [copia.buffer]);
  });
}
