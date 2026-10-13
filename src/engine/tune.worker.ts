// Trabalhos pesados fora da thread da tela, para a interface não travar:
// processar um take (limpeza e afinação) e analisar um beat importado.

import { detectarBpm, detectarTom } from './analise.ts';
import { deEsser, gate, nivelar, reduzirRuido } from './limpeza.ts';
import { desafinacao, esticar } from './tempo-e-fatias.ts';
import { afinar, type OpcoesTune } from './tune.ts';

/** O que fazer com o take, na ordem: ruído → gate → nivelamento → de-esser → afinação. */
export interface Processamento {
  /** Limiar do gate em dB; 0 = desligado. */
  gate: number;
  /** Força do de-esser, de 0 a 1. */
  deEsser: number;
  /** Redução de ruído, de 0 a 1. */
  ruido?: number;
  /** Nivelamento por frase, de 0 a 1. */
  nivelar?: number;
  /** Afinação e mudança de altura; ausente = não mexer na altura. */
  tune?: OpcoesTune;
}

type Pedido =
  | { id: number; tipo: 'processar'; amostras: Float32Array; taxa: number; opcoes: Processamento }
  | { id: number; tipo: 'analisar'; amostras: Float32Array; taxa: number }
  | { id: number; tipo: 'esticar'; amostras: Float32Array; taxa: number; canais: Float32Array[]; fator: number };

self.onmessage = (e: MessageEvent<Pedido>) => {
  const pedido = e.data;
  const responder = (self as unknown as Worker).postMessage.bind(self);
  if (pedido.tipo === 'processar') {
    const { opcoes, taxa } = pedido;
    let x = pedido.amostras;
    // Limpar primeiro: o tune detecta melhor a nota sem chiado no meio.
    if (opcoes.ruido) x = reduzirRuido(x, taxa, opcoes.ruido);
    if (opcoes.gate < 0) x = gate(x, taxa, opcoes.gate);
    if (opcoes.nivelar) x = nivelar(x, taxa, opcoes.nivelar);
    if (opcoes.deEsser > 0) x = deEsser(x, taxa, opcoes.deEsser);
    if (opcoes.tune) x = afinar(x, taxa, opcoes.tune);
    responder({ id: pedido.id, resultado: x }, [x.buffer]);
  } else if (pedido.tipo === 'esticar') {
    const saida = esticar(pedido.canais, pedido.taxa, pedido.fator).map((c) => c.slice());
    responder({ id: pedido.id, resultado: saida }, saida.map((c) => c.buffer));
  } else {
    responder({ id: pedido.id, resultado: { bpm: detectarBpm(pedido.amostras, pedido.taxa), tom: detectarTom(pedido.amostras, pedido.taxa), cents: desafinacao(pedido.amostras, pedido.taxa) } });
  }
};
