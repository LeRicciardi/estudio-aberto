// Trabalhos pesados fora da thread da tela, para a interface não travar:
// afinar um take e analisar um beat importado.

import { detectarBpm, detectarTom } from './analise.ts';
import { afinar, type OpcoesTune } from './tune.ts';

type Pedido =
  | { id: number; tipo: 'afinar'; amostras: Float32Array; taxa: number; opcoes: OpcoesTune }
  | { id: number; tipo: 'analisar'; amostras: Float32Array; taxa: number };

self.onmessage = (e: MessageEvent<Pedido>) => {
  const pedido = e.data;
  const responder = (self as unknown as Worker).postMessage.bind(self);
  if (pedido.tipo === 'afinar') {
    const saida = afinar(pedido.amostras, pedido.taxa, pedido.opcoes);
    responder({ id: pedido.id, resultado: saida }, [saida.buffer]);
  } else {
    responder({ id: pedido.id, resultado: { bpm: detectarBpm(pedido.amostras, pedido.taxa), tom: detectarTom(pedido.amostras, pedido.taxa) } });
  }
};
